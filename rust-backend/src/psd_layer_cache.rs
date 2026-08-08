/// Per-layer decoded-RGBA cache for the PSD DISPLAY path (stage 2 of
/// `vm_tuning_research/notes/display-path-phase-split.md`'s promotion plan;
/// see `vm_tuning_research/notes/display-path-toggle-redecode.md` for the
/// motivation). Stage 1 (`psd_fast::parse_psd_fast_for_display`) already
/// decodes only the leaves a given selection needs, but every `active_layer_ids`
/// change is still a full re-decode of the newly-selected leaves because
/// nothing survives across calls. This module adds a cache keyed by
/// (file identity, layer stable_id) so a layer toggle — which changes only
/// which leaves are *selected*, never the underlying file — reuses any leaf
/// it already decoded and pays only for the composite plus the leaves that
/// are newly selected.
///
/// Cache population/lookup lives here as plain data structures; the
/// selection-aware decode loop that drives them
/// (`psd_fast::parse_psd_fast_for_display_cached`) stays in `psd_fast.rs`
/// since it needs that module's private byte-range/parallel-decode helpers.
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::UNIX_EPOCH;

/// Identifies a PSD source file for cache-key purposes: the same
/// (path, mtime, size) triple `SourceFrameCacheKey` already keys media-level
/// cache entries on (`rust-backend/src/state.rs`). Any change to the
/// underlying file changes this triple, so stale entries are never read —
/// there is no separate invalidation path to maintain.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct PsdFileIdentity {
    pub(crate) path: String,
    pub(crate) mtime_nanos: i128,
    pub(crate) file_len: u64,
}

/// Reads `path`'s current mtime/size and builds its `PsdFileIdentity`.
/// Mirrors `source_frames.rs::build_source_frame_cache_key`'s mtime
/// computation exactly, so the two caches agree on what "unchanged file"
/// means.
pub(crate) fn build_psd_file_identity(path: &str) -> Result<PsdFileIdentity, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Failed to read metadata for source '{path}': {error}"))?;
    let modified = metadata
        .modified()
        .map_err(|error| format!("Failed to read mtime for source '{path}': {error}"))?;
    let mtime_nanos = modified
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos() as i128)
        .unwrap_or_else(|error| -(error.duration().as_nanos() as i128));

    Ok(PsdFileIdentity {
        path: path.to_string(),
        mtime_nanos,
        file_len: metadata.len(),
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct PsdLayerCacheKey {
    path: String,
    mtime_nanos: i128,
    file_len: u64,
    stable_id: String,
}

impl PsdLayerCacheKey {
    pub(crate) fn new(identity: &PsdFileIdentity, stable_id: &str) -> Self {
        Self {
            path: identity.path.clone(),
            mtime_nanos: identity.mtime_nanos,
            file_len: identity.file_len,
            stable_id: stable_id.to_string(),
        }
    }
}

/// One decoded leaf layer's RGBA pixels, cached independently of any
/// particular composite selection.
pub(crate) struct CachedPsdLayer {
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) rgba: Arc<Vec<u8>>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct PsdLayerCacheStats {
    pub(crate) hits: u64,
    pub(crate) misses: u64,
    pub(crate) decodes: u64,
    pub(crate) evictions: u64,
}

/// Byte-budget LRU cache: `order` tracks recency (oldest at the front) and
/// the oldest entries are dropped once `total_bytes` exceeds `budget_bytes`.
/// Same convention as the three existing media-level caches (512MB default —
/// see `state.rs::SOURCE_FRAME_CACHE_MAX_BYTES`), but the budget is
/// constructor-injectable so tests can exercise eviction without allocating
/// hundreds of megabytes.
pub(crate) struct PsdLayerCache {
    entries: HashMap<PsdLayerCacheKey, Arc<CachedPsdLayer>>,
    order: VecDeque<PsdLayerCacheKey>,
    total_bytes: usize,
    budget_bytes: usize,
    stats: PsdLayerCacheStats,
}

pub(crate) const PSD_LAYER_CACHE_DEFAULT_BUDGET_BYTES: usize = 512 * 1024 * 1024;

impl PsdLayerCache {
    pub(crate) fn with_budget(budget_bytes: usize) -> Self {
        Self {
            entries: HashMap::new(),
            order: VecDeque::new(),
            total_bytes: 0,
            budget_bytes,
            stats: PsdLayerCacheStats::default(),
        }
    }

    pub(crate) fn get(&mut self, key: &PsdLayerCacheKey) -> Option<Arc<CachedPsdLayer>> {
        if let Some(layer) = self.entries.get(key).cloned() {
            self.touch(key);
            self.stats.hits += 1;
            Some(layer)
        } else {
            self.stats.misses += 1;
            None
        }
    }

    /// Records a freshly decoded leaf. Counts as one `decodes` regardless of
    /// whether it is later evicted — the decode work happened either way.
    pub(crate) fn insert(&mut self, key: PsdLayerCacheKey, layer: Arc<CachedPsdLayer>) {
        let layer_bytes = layer.rgba.len();
        if let Some(previous) = self.entries.insert(key.clone(), layer) {
            self.total_bytes = self.total_bytes.saturating_sub(previous.rgba.len());
            self.order.retain(|existing| existing != &key);
        }
        self.order.push_back(key);
        self.total_bytes += layer_bytes;
        self.stats.decodes += 1;
        self.evict_if_needed();
    }

    pub(crate) fn stats(&self) -> PsdLayerCacheStats {
        self.stats
    }

    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.entries.len()
    }

    fn touch(&mut self, key: &PsdLayerCacheKey) {
        if let Some(position) = self.order.iter().position(|existing| existing == key) {
            if let Some(moved) = self.order.remove(position) {
                self.order.push_back(moved);
            }
        }
    }

    fn evict_if_needed(&mut self) {
        while self.total_bytes > self.budget_bytes {
            let Some(oldest) = self.order.pop_front() else {
                break;
            };
            if let Some(removed) = self.entries.remove(&oldest) {
                self.total_bytes = self.total_bytes.saturating_sub(removed.rgba.len());
                self.stats.evictions += 1;
            }
        }
    }
}

/// Process-wide shared cache (`OnceLock<Mutex<...>>`) so every DISPLAY-path
/// call site within a given compiled artifact (the rust-backend sidecar
/// binary, or the native-overlay lib target which links this same module —
/// see `mod psd_layer_cache;` in both `main.rs` and `lib.rs`) reuses one
/// instance without threading a cache handle through every RPC/native
/// function signature. The two compiled artifacts are separate OS processes
/// with independent address spaces, so this does not (and is not intended
/// to) share cache *contents* across process boundaries — only across call
/// sites within the same process.
static GLOBAL_PSD_LAYER_CACHE: OnceLock<Mutex<PsdLayerCache>> = OnceLock::new();

pub(crate) fn global_psd_layer_cache() -> &'static Mutex<PsdLayerCache> {
    GLOBAL_PSD_LAYER_CACHE
        .get_or_init(|| Mutex::new(PsdLayerCache::with_budget(PSD_LAYER_CACHE_DEFAULT_BUDGET_BYTES)))
}
