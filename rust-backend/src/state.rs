use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
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
}

pub(crate) struct PsdOverlayCacheEntry {
    pub(crate) raw_path: PathBuf,
    pub(crate) source_width: u32,
    pub(crate) source_height: u32,
}
