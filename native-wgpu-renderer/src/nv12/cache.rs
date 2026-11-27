//! `media_texture_cache`（Phase 3a, RGBA 用）と同じ設計の NV12 版。
//! media_id をキーに、Y/CbCr プレーンテクスチャを (surface_id, revision) が
//! 変わらない限り再利用する。

use std::collections::{HashMap, VecDeque};

/// media_id 単位の NV12 プレーンテクスチャキャッシュ 1 エントリ。
#[allow(dead_code)]
pub(crate) struct Nv12MediaTextureCacheEntry {
    pub(crate) revision: u64,
    pub(crate) surface_id: u32,
    pub(crate) y_texture: wgpu::Texture,
    pub(crate) cbcr_texture: wgpu::Texture,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) byte_len: usize,
    pub(crate) idle_frames: u64,
}

/// `MediaTextureCache`（RGBA 用）と同じ「エントリ数上限なし・バイト予算＋
/// 挿入順キューによる単純 LRU」設計を NV12 プレーンテクスチャに適用する。
#[derive(Default)]
pub struct Nv12MediaTextureCache {
    pub(crate) entries: HashMap<String, Nv12MediaTextureCacheEntry>,
    pub(crate) order: VecDeque<String>,
    pub(crate) total_bytes: usize,
}

/// 256MB — NV12 クリップは同時再生数が RGBA 静止画/PSD 等より通常少ない
/// ため、`MEDIA_TEXTURE_CACHE_MAX_BYTES`（512MB）より小さめに設定する。
pub(crate) const NV12_TEXTURE_CACHE_MAX_BYTES: usize = 256 * 1024 * 1024;
/// `MEDIA_TEXTURE_CACHE_IDLE_FRAME_LIMIT` と揃える。
pub(crate) const NV12_TEXTURE_CACHE_IDLE_FRAME_LIMIT: u64 = 30;

impl Nv12MediaTextureCache {
    pub(crate) fn touch(&mut self, media_id: &str) {
        if let Some(position) = self.order.iter().position(|existing| existing == media_id) {
            if let Some(moved) = self.order.remove(position) {
                self.order.push_back(moved);
            }
        }
    }

    pub(crate) fn remove(&mut self, media_id: &str) {
        if let Some(removed) = self.entries.remove(media_id) {
            self.total_bytes = self.total_bytes.saturating_sub(removed.byte_len);
        }
        self.order.retain(|existing| existing != media_id);
    }

    pub(crate) fn insert(&mut self, media_id: String, entry: Nv12MediaTextureCacheEntry) {
        let byte_len = entry.byte_len;
        if let Some(previous) = self.entries.insert(media_id.clone(), entry) {
            self.total_bytes = self.total_bytes.saturating_sub(previous.byte_len);
            self.order.retain(|existing| existing != &media_id);
        }
        self.order.push_back(media_id);
        self.total_bytes += byte_len;
    }

    /// 今フレームで参照された media_id 以外の `idle_frames` を進め、閾値超過
    /// またはバイト予算超過分を退避する（`evict_stale_media_textures` と同じ
    /// 挙動）。
    pub(crate) fn evict_stale(&mut self, touched_media_ids: &std::collections::HashSet<String>) {
        let mut idle_evictions: Vec<String> = Vec::new();
        for (media_id, entry) in self.entries.iter_mut() {
            if touched_media_ids.contains(media_id) {
                entry.idle_frames = 0;
            } else {
                entry.idle_frames += 1;
                if entry.idle_frames > NV12_TEXTURE_CACHE_IDLE_FRAME_LIMIT {
                    idle_evictions.push(media_id.clone());
                }
            }
        }
        for media_id in idle_evictions {
            self.remove(&media_id);
        }

        while self.total_bytes > NV12_TEXTURE_CACHE_MAX_BYTES {
            let Some(oldest) = self.order.front().cloned() else {
                break;
            };
            self.remove(&oldest);
        }
    }
}
