//! Phase 4b: NV12 (biplanar 4:2:0) IOSurface のゼロコピー import と
//! GPU 上での YCbCr→RGB 変換・合成。
//!
//! ## スコープ
//! - IOSurface からの実際のテクスチャ import は macOS(Metal) 専用
//!   （`import` サブモジュール）。非 macOS でも crate 自体はビルドでき、
//!   実際に NV12 クリップを描画しようとすると
//!   `NativeWgpuRenderError::Nv12ImportUnsupportedPlatform` を返す
//!   （`import_stub` サブモジュール）。
//! - NV12 合成パイプライン（`pipeline` サブモジュール）自体は wgpu の
//!   標準 API のみを使うため、どのバックエンドでもビルド・生成できる。
//! - `NativeWgpuRenderer::render_layers_to_rgba` は本番の `SceneSnapshot`
//!   全体（トラック評価・`sources: &HashMap<String, RgbaFrame>`）とは別の、
//!   呼び出し側が明示的に組み立てた `SceneLayer` 配列を受け取る縮小版の
//!   エントリポイントである。`rust-backend`/`native-overlay` 側の本番
//!   フレームソースが今も RGBA CPU バッファのみを供給する以上、
//!   `SceneSnapshot`/`EvaluatedClip` の `media_id` 解決を NV12 対応させる
//!   本格統合はデコード側（AVAssetReader → NV12 IOSurface）の完成後の
//!   フェーズに委ねる。ここで実証しているのは:
//!     (a) IOSurface のゼロコピー import
//!     (b) NV12→RGB のフラグメントシェーダ変換
//!     (c) 既存 RGBA クリップと完全に同一の transform/opacity/effects/blend
//!         経路（`crate::build_render_params` と共通 `RenderParams` を再利用）
//!     (d) media_id+revision によるプレーンテクスチャキャッシュ
//!   の4点。詳細は `progress/phase4b-nv12-iosurface-gpu-import.md` 参照。

mod cache;
#[cfg(target_os = "macos")]
mod import;
#[cfg(not(target_os = "macos"))]
mod import_stub;
mod pipeline;
#[cfg(target_os = "macos")]
pub(crate) mod sys;

#[cfg(target_os = "macos")]
use import::import_nv12_iosurface_textures;
#[cfg(not(target_os = "macos"))]
use import_stub::import_nv12_iosurface_textures;

pub(crate) use cache::Nv12MediaTextureCache;
use cache::Nv12MediaTextureCacheEntry;
pub(crate) use pipeline::{
    create_nv12_bind_group_layout, create_nv12_pipeline_for_format,
    create_nv12_pipeline_for_format_with_layout,
};
use pipeline::{build_prepared_nv12_clip_bind_group, Nv12Params};

use std::collections::HashSet;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use crate::{
    build_render_params, wait_for_submitted_work, EvaluatedClip, NativeWgpuRenderError,
    NativeWgpuRenderer, PreparedClip, RgbaFrame,
};

/// NV12 の colour range（量子化レンジ）・YCbCr→RGB 変換行列。Phase 4c
/// Stage 2 で `uxfd-rust-core` 側へ正準定義を移した（rust-backend の
/// in-process デコードセッションと本クレートの本番合成パスが同じ型を
/// 共有するため）。ここでは re-export するだけで、このモジュール内の
/// 既存コードは一切変更不要（型としては同一）。
pub use uxfd_rust_core::{Nv12ColourMatrix, Nv12ColourRange};

/// NV12 (biplanar 4:2:0) IOSurface ソース。`surface_id` は
/// `IOSurfaceLookup` で解決可能なグローバル ID
/// （典型的には `CVPixelBufferGetIOSurface` → `IOSurfaceGetID` で得る）。
/// CVPixelBuffer そのものへの依存は持たず、デコード側の実装詳細から
/// 意図的に切り離してある。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Nv12IoSurfaceSource {
    pub surface_id: u32,
    /// Y plane の幅（CbCr plane は半解像度: `width / 2`）。
    pub width: u32,
    /// Y plane の高さ（CbCr plane は半解像度: `height / 2`）。
    pub height: u32,
    pub colour_range: Nv12ColourRange,
    pub colour_matrix: Nv12ColourMatrix,
}

/// `render_layers_to_rgba` へ渡す 1 レイヤー。RGBA クリップと NV12 クリップ
/// を同一シーンへ混在させ、z_index 昇順で 1 レンダーパスへ合成する。
#[derive(Debug, Clone)]
pub struct SceneLayer {
    pub clip: EvaluatedClip,
    pub content: SceneLayerContent,
}

#[derive(Debug, Clone)]
pub enum SceneLayerContent {
    Rgba(RgbaFrame),
    Nv12 {
        source: Nv12IoSurfaceSource,
        /// 呼び出し側が供給する内容世代。`media_texture_cache` と同じ契約:
        /// 前回と同じ `(surface_id, revision)` であれば
        /// `import_nv12_iosurface_textures` を再実行しない。
        revision: u64,
    },
}

enum PreparedLayer {
    Rgba(Arc<PreparedClip>),
    Nv12(Arc<PreparedClip>),
}

impl NativeWgpuRenderer {
    /// RGBA クリップと NV12 クリップを混在させたシーンを 1 レンダーパスへ
    /// 合成し、`self.width` x `self.height` の `RgbaFrame` として読み戻す。
    /// `layers` は任意の順序でよい（内部で `clip.z_index` 昇順にソートする）。
    pub async fn render_layers_to_rgba(
        &self,
        layers: &[SceneLayer],
    ) -> Result<RgbaFrame, NativeWgpuRenderError> {
        let mut ordered: Vec<&SceneLayer> = layers.iter().collect();
        ordered.sort_by_key(|layer| layer.clip.z_index);

        let mut prepared: Vec<PreparedLayer> = Vec::with_capacity(ordered.len());
        let mut touched_nv12_media_ids: HashSet<String> = HashSet::new();
        for layer in ordered {
            let clip = &layer.clip;
            if !clip.transform.rotation_degrees.is_finite()
                || clip.transform.scale_x <= 0.0
                || clip.transform.scale_y <= 0.0
            {
                return Err(NativeWgpuRenderError::UnsupportedTransform {
                    clip_id: clip.clip_id.clone(),
                });
            }
            let rotation_radians = clip.transform.rotation_degrees.to_radians();

            match &layer.content {
                SceneLayerContent::Rgba(frame) => {
                    // このメソッドは主に NV12 の GPU import・合成パイプライン
                    // を検証するための縮小版エントリポイントであり、RGBA 側は
                    // 本番の `media_texture_cache` 経由キャッシュを使わず毎回
                    // アップロードする（本番の高頻度パスは既存の
                    // `render_frame_stages`/`present_frame_stages` を使う）。
                    let texture =
                        crate::create_and_upload_source_texture(&self.device, &self.queue, frame);
                    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
                    let render_params =
                        build_render_params(clip, rotation_radians, frame.width, frame.height);
                    let bind_group = crate::build_prepared_clip_bind_group(
                        &self.device,
                        &self.bind_group_layout,
                        &view,
                        render_params,
                    );
                    prepared.push(PreparedLayer::Rgba(Arc::new(bind_group)));
                }
                SceneLayerContent::Nv12 { source, revision } => {
                    touched_nv12_media_ids.insert(clip.media_id.clone());
                    let (y_view, cbcr_view) = self.get_or_import_nv12_media_textures(
                        &clip.media_id,
                        *revision,
                        source,
                    )?;
                    let render_params =
                        build_render_params(clip, rotation_radians, source.width, source.height);
                    let nv12_params = Nv12Params::new(source.colour_range, source.colour_matrix);
                    let bind_group = build_prepared_nv12_clip_bind_group(
                        &self.device,
                        &self.nv12_bind_group_layout,
                        &y_view,
                        &cbcr_view,
                        nv12_params,
                        render_params,
                    );
                    prepared.push(PreparedLayer::Nv12(Arc::new(bind_group)));
                }
            }
        }

        self.evict_stale_nv12_textures(&touched_nv12_media_ids);

        // Phase 7 (W7) 需要駆動staged attach: このエントリポイントは
        // `NativeWgpuRenderer::new`（offscreen export経路、nv12_pipelineは
        // 常に構築直後にSome）専用のテスト用縮小版のため、実運用上は常に
        // 満たされるが、live attach経路と同じ型（`Option`）を共有している
        // 以上、同じガードをここにも置いておく（パニックの代わりに明示エラー）。
        let needs_nv12 = prepared
            .iter()
            .any(|layer| matches!(layer, PreparedLayer::Nv12(_)));
        if needs_nv12 && self.nv12_pipeline.is_none() {
            return Err(NativeWgpuRenderError::Nv12PipelineNotReady);
        }

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("UXFD native wgpu nv12 layer encoder"),
            });
        let output_view = self
            .output_texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        self.encode_prepared_layers(&mut encoder, &output_view, &prepared);
        self.queue.submit(Some(encoder.finish()));
        wait_for_submitted_work(&self.device, &self.queue)?;

        self.read_output_texture_to_rgba8()
    }

    fn encode_prepared_layers(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        output_view: &wgpu::TextureView,
        layers: &[PreparedLayer],
    ) {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("UXFD native wgpu nv12 layer render pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: output_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            occlusion_query_set: None,
            timestamp_writes: None,
        });

        for layer in layers {
            match layer {
                PreparedLayer::Rgba(prepared) => {
                    pass.set_pipeline(&self.pipeline);
                    pass.set_bind_group(0, &prepared.bind_group, &[]);
                }
                PreparedLayer::Nv12(prepared) => {
                    pass.set_pipeline(self.nv12_pipeline.as_ref().expect(
                        "render_layers_to_rgba already verified nv12_pipeline is ready \
                         whenever a Nv12 layer is present",
                    ));
                    pass.set_bind_group(0, &prepared.bind_group, &[]);
                }
            }
            pass.draw(0..3, 0..1);
        }
    }

    /// media_id ＋ (surface_id, revision) で Y/CbCr プレーンテクスチャを
    /// キャッシュしつつ、この呼び出しのフレームで使う `TextureView` を返す。
    /// 前回と同じ `(surface_id, revision)` であれば
    /// `import_nv12_iosurface_textures`（Metal テクスチャ import）を
    /// 一切行わない（キャッシュ hit）。
    fn get_or_import_nv12_media_textures(
        &self,
        media_id: &str,
        revision: u64,
        source: &Nv12IoSurfaceSource,
    ) -> Result<(wgpu::TextureView, wgpu::TextureView), NativeWgpuRenderError> {
        {
            let mut cache = self
                .nv12_texture_cache
                .lock()
                .expect("nv12 texture cache mutex must not be poisoned");
            let hit = cache.entries.get(media_id).is_some_and(|entry| {
                entry.revision == revision && entry.surface_id == source.surface_id
            });
            if hit {
                self.nv12_texture_cache_hits.fetch_add(1, Ordering::Relaxed);
                cache.touch(media_id);
                let entry = cache
                    .entries
                    .get_mut(media_id)
                    .expect("hit checked above must have an entry");
                entry.idle_frames = 0;
                let y_view = entry
                    .y_texture
                    .create_view(&wgpu::TextureViewDescriptor::default());
                let cbcr_view = entry
                    .cbcr_texture
                    .create_view(&wgpu::TextureViewDescriptor::default());
                return Ok((y_view, cbcr_view));
            }
        }

        self.nv12_texture_cache_misses.fetch_add(1, Ordering::Relaxed);
        let (y_texture, cbcr_texture) = import_nv12_iosurface_textures(&self.device, source)?;
        let y_view = y_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let cbcr_view = cbcr_texture.create_view(&wgpu::TextureViewDescriptor::default());

        let chroma_width = (source.width / 2).max(1) as usize;
        let chroma_height = (source.height / 2).max(1) as usize;
        let byte_len =
            source.width as usize * source.height as usize + chroma_width * chroma_height * 2;

        let mut cache = self
            .nv12_texture_cache
            .lock()
            .expect("nv12 texture cache mutex must not be poisoned");
        cache.insert(
            media_id.to_string(),
            Nv12MediaTextureCacheEntry {
                revision,
                surface_id: source.surface_id,
                y_texture,
                cbcr_texture,
                width: source.width,
                height: source.height,
                byte_len,
                idle_frames: 0,
            },
        );

        Ok((y_view, cbcr_view))
    }

    /// Phase 4c Stage 2: prepares one NV12 clip for the production composite
    /// path (`prepare_scene_clips_with_upload_fence` in `lib.rs`), mirroring
    /// `render_layers_to_rgba`'s per-clip NV12 handling above but returning a
    /// single `PreparedClip` instead of assembling `PreparedLayer`s for a
    /// dedicated render pass. `source` is rust-core's `Nv12IoSurfaceRef`
    /// (Stage 1 in-process decode session resolution, see
    /// `rust-backend/src/native_render.rs`); its `revision` field drives the
    /// same plane texture cache as `render_layers_to_rgba`. Callers are
    /// responsible for calling `evict_stale_nv12_textures` once per prepared
    /// scene (not per clip).
    pub(crate) fn prepare_nv12_clip(
        &self,
        clip: &EvaluatedClip,
        rotation_radians: f32,
        source: &uxfd_rust_core::Nv12IoSurfaceRef,
    ) -> Result<PreparedClip, NativeWgpuRenderError> {
        let native_source = Nv12IoSurfaceSource {
            surface_id: source.surface_id,
            width: source.width,
            height: source.height,
            colour_range: source.colour_range,
            colour_matrix: source.colour_matrix,
        };
        let (y_view, cbcr_view) = self.get_or_import_nv12_media_textures(
            &clip.media_id,
            source.revision,
            &native_source,
        )?;
        let render_params = build_render_params(clip, rotation_radians, source.width, source.height);
        let nv12_params = Nv12Params::new(source.colour_range, source.colour_matrix);
        Ok(build_prepared_nv12_clip_bind_group(
            &self.device,
            &self.nv12_bind_group_layout,
            &y_view,
            &cbcr_view,
            nv12_params,
            render_params,
        ))
    }

    /// Phase 4c Stage 2: evicts NV12 plane textures for media not touched by
    /// the current production scene prepare. Same eviction policy as
    /// `evict_stale_media_textures` (idle-frame threshold + byte budget).
    pub(crate) fn evict_stale_nv12_textures(&self, touched_media_ids: &HashSet<String>) {
        let mut cache = self
            .nv12_texture_cache
            .lock()
            .expect("nv12 texture cache mutex must not be poisoned");
        cache.evict_stale(touched_media_ids);
    }

    /// テスト計測用: (hits, misses) を返す。本番挙動には影響しない。
    /// 実際に呼ぶのは macOS 専用の NV12 IOSurface import テストのみ。
    #[cfg(all(test, target_os = "macos"))]
    pub(crate) fn nv12_texture_cache_stats(&self) -> (u64, u64) {
        (
            self.nv12_texture_cache_hits.load(Ordering::Relaxed),
            self.nv12_texture_cache_misses.load(Ordering::Relaxed),
        )
    }

    /// テスト計測用: 現在キャッシュされている NV12 media 数。
    #[cfg(all(test, target_os = "macos"))]
    pub(crate) fn nv12_texture_cache_len(&self) -> usize {
        self.nv12_texture_cache
            .lock()
            .expect("nv12 texture cache mutex must not be poisoned")
            .entries
            .len()
    }
}
