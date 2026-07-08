use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use uxfd_golden_harness::RgbaFrame;
use uxfd_native_wgpu_renderer::NativeWgpuRenderer;
#[cfg(unix)]
use uxfd_shared_memory_spike::PosixSharedRing;

use crate::sessions::{DecodeSession, EncodeSession};

/// Shared state for the in-progress PSD pixel blob write.
/// `None` = no write pending; `Some(Ok(path))` = done; `Some(Err(msg))` = failed.
pub(crate) type BlobWriteResult = Arc<Mutex<Option<Result<String, String>>>>;

#[derive(Default)]
pub(crate) struct BackendState {
    pub(crate) decode_sessions: HashMap<String, DecodeSession>,
    pub(crate) encode_sessions: HashMap<String, EncodeSession>,
    pub(crate) psd_overlay_cache: HashMap<String, PsdOverlayCacheEntry>,
    #[cfg(unix)]
    pub(crate) native_render_outputs: HashMap<String, PosixSharedRing>,
    pub(crate) native_wgpu_renderer: Option<NativeWgpuRenderer>,
    /// Background blob writer: set by psd.parse, drained by psd.await_blob.
    pub(crate) psd_blob_result: Option<BlobWriteResult>,
    /// Decoded Image/Psd source frames keyed by path + mtime + size (+ active
    /// layers for Psd), so repeated frames of a still image/PSD do not pay
    /// for a full re-decode every call.
    pub(crate) source_frame_cache: SourceFrameCache,
}

pub(crate) struct PsdOverlayCacheEntry {
    pub(crate) raw_path: PathBuf,
    pub(crate) source_width: u32,
    pub(crate) source_height: u32,
}

/// Cache key for a decoded Image/Psd source frame. Two reads of the same
/// path only hit the cache when the file's mtime and size are unchanged and
/// (for Psd) the same set of active layer ids and expected dimensions were
/// requested; any change forces a fresh decode.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct SourceFrameCacheKey {
    pub(crate) path: String,
    pub(crate) mtime_nanos: i128,
    pub(crate) file_len: u64,
    pub(crate) active_layer_ids: Vec<String>,
    pub(crate) expected_width: u32,
    pub(crate) expected_height: u32,
}

/// Entry-count and total-byte-size bounded cache for decoded source frames.
/// Eviction is a simple least-recently-used policy: `order` tracks recency
/// (oldest at the front) and the oldest entries are dropped once either
/// bound is exceeded. No external LRU crate is needed at this scale.
const SOURCE_FRAME_CACHE_MAX_ENTRIES: usize = 64;
const SOURCE_FRAME_CACHE_MAX_BYTES: usize = 512 * 1024 * 1024;

#[derive(Default)]
pub(crate) struct SourceFrameCache {
    entries: HashMap<SourceFrameCacheKey, Arc<RgbaFrame>>,
    order: VecDeque<SourceFrameCacheKey>,
    total_bytes: usize,
}

impl SourceFrameCache {
    pub(crate) fn get(&mut self, key: &SourceFrameCacheKey) -> Option<Arc<RgbaFrame>> {
        let frame = self.entries.get(key).cloned()?;
        self.touch(key);
        Some(frame)
    }

    pub(crate) fn insert(&mut self, key: SourceFrameCacheKey, frame: Arc<RgbaFrame>) {
        let frame_bytes = frame.pixels.len();
        if let Some(previous) = self.entries.insert(key.clone(), frame) {
            self.total_bytes = self.total_bytes.saturating_sub(previous.pixels.len());
            self.order.retain(|existing| existing != &key);
        }
        self.order.push_back(key);
        self.total_bytes += frame_bytes;
        self.evict_if_needed();
    }

    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.entries.len()
    }

    fn touch(&mut self, key: &SourceFrameCacheKey) {
        if let Some(position) = self.order.iter().position(|existing| existing == key) {
            if let Some(moved) = self.order.remove(position) {
                self.order.push_back(moved);
            }
        }
    }

    fn evict_if_needed(&mut self) {
        while self.entries.len() > SOURCE_FRAME_CACHE_MAX_ENTRIES
            || self.total_bytes > SOURCE_FRAME_CACHE_MAX_BYTES
        {
            let Some(oldest) = self.order.pop_front() else {
                break;
            };
            if let Some(removed) = self.entries.remove(&oldest) {
                self.total_bytes = self.total_bytes.saturating_sub(removed.pixels.len());
            }
        }
    }
}
