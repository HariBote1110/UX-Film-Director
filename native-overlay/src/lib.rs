#![allow(unexpected_cfgs)]

use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::hash::{Hash, Hasher};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use uxfd_golden_harness::{compare_rgba_frames, load_rgba_png, ComparisonThresholds, RgbaFrame};
use uxfd_native_wgpu_renderer::{
    render_native_wgpu_frame, NativeWgpuFrameStageTimings, NativeWgpuLiveSurfaceRenderer,
};
use uxfd_rust_backend::build_native_generated_source_frame;
use uxfd_rust_core::{
    ColourPipeline, Effect, EvaluatedClip, Fps, MediaKind, SamplingMode, SceneMediaReference,
    SceneSnapshot, Transform,
};
use uxfd_shared_video_frame_bridge::copy_shared_frame_into_upload_buffer;

#[cfg(target_os = "macos")]
mod macos_overlay;

#[napi(object)]
pub struct NativeOverlayAttachPayload {
    pub window_id: u32,
    pub native_window_handle: Option<Buffer>,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale_factor: f64,
}

#[napi(object)]
pub struct NativeOverlayDetachPayload {
    pub window_id: u32,
    pub native_window_handle: Option<Buffer>,
}

/// Bug E（計画書 §4 Phase E2）— `ui:preview-obstruction-changed` を受けた
/// main が呼ぶ z-order toggle の payload。
#[napi(object)]
pub struct NativeOverlaySetObstructedPayload {
    pub window_id: u32,
    pub obstructed: bool,
}

/// 選択デコレーション（選択枠・リサイズハンドル）— renderer（Viewport.tsx）が
/// `getObjectWorldCorners` の world 座標 quad（project 座標系・回転込みの四隅）を
/// 送る payload。空配列はデコレーション解除。
#[napi(object)]
pub struct NativeOverlaySelectionDecorationQuadPayload {
    pub top_left_x: f64,
    pub top_left_y: f64,
    pub top_right_x: f64,
    pub top_right_y: f64,
    pub bottom_right_x: f64,
    pub bottom_right_y: f64,
    pub bottom_left_x: f64,
    pub bottom_left_y: f64,
}

#[napi(object)]
pub struct NativeOverlaySelectionDecorationPayload {
    pub window_id: u32,
    /// project 解像度（quad 座標系の基準）。scene present と同じ contain-fit
    /// 変換（`fit_scene_snapshot_to_drawable` と同式）を通すために必要。
    pub canvas_width: u32,
    pub canvas_height: u32,
    pub quads: Vec<NativeOverlaySelectionDecorationQuadPayload>,
}

#[napi(object)]
pub struct NativeOverlaySharedFrameDescriptorPayload {
    pub memory_id: String,
    pub slot_index: u32,
    pub generation: f64,
    pub byte_offset: u32,
    pub byte_len: u32,
    pub width: u32,
    pub height: u32,
    pub stride_bytes: u32,
    pub format: String,
}

#[napi(object)]
pub struct NativeOverlaySharedFramePayload {
    pub descriptor: NativeOverlaySharedFrameDescriptorPayload,
    pub pts_frame: f64,
}

/// Bug B（症状B: 選択枠・本体フレームが2チャネル独立配信のためズレる不具合）
/// 対策 — presentNativeOverlaySharedFrame に同梱できる選択デコレーション。
/// `NativeOverlaySelectionDecorationPayload` と同じ quad/canvas 形状だが、
/// window_id は外側の `NativeOverlaySharedFramePresentPayload.window_id` と
/// 共通のため持たない。Optional のため、addon が未対応でも既存呼び出しは
/// そのまま動く（graceful degrade）。
#[napi(object)]
pub struct NativeOverlaySharedFrameSelectionDecorationPayload {
    pub canvas_width: u32,
    pub canvas_height: u32,
    pub quads: Vec<NativeOverlaySelectionDecorationQuadPayload>,
}

#[napi(object)]
pub struct NativeOverlaySharedFramePresentPayload {
    pub window_id: u32,
    pub native_window_handle: Option<Buffer>,
    pub media_id: String,
    pub snapshot: Option<NativeOverlaySceneSnapshotPayload>,
    pub media: Option<Vec<NativeOverlaySceneMediaPayload>>,
    pub slot_count: u32,
    pub frame: NativeOverlaySharedFramePayload,
    /// この present と同じ (objects, time) スナップショットから計算された
    /// 選択デコレーション。渡された場合、この present はグローバル
    /// SELECTION_DECORATIONS map を再読みせず、必ずこの値を使う（かつ
    /// map もこの値で置き換える）。省略時は従来どおり map の値を使う。
    pub selection_decoration: Option<NativeOverlaySharedFrameSelectionDecorationPayload>,
}

#[napi(object)]
pub struct NativeOverlayScenePresentPayload {
    pub window_id: u32,
    pub snapshot: NativeOverlaySceneSnapshotPayload,
    pub media: Vec<NativeOverlaySceneMediaPayload>,
    pub selection_decoration: Option<NativeOverlaySharedFrameSelectionDecorationPayload>,
}

#[napi(object)]
pub struct NativeOverlaySceneSnapshotPayload {
    pub frame_index: f64,
    pub colour: NativeOverlayColourPipelinePayload,
    pub clips: Vec<NativeOverlayEvaluatedClipPayload>,
    /// プロジェクト解像度（シーン canvas サイズ）。`clips[].transform` の座標系の基準。
    /// native overlay の drawable ピクセルサイズと一致しない場合があるため、
    /// `upload_frame_to_scene_sources` がこれを使って contain-fit 変換を行う。
    pub canvas_width: u32,
    pub canvas_height: u32,
}

#[napi(object)]
pub struct NativeOverlayColourPipelinePayload {
    pub profile: String,
    pub working_space: String,
    pub alpha: String,
}

#[napi(object)]
pub struct NativeOverlayEvaluatedClipPayload {
    pub clip_id: String,
    pub track_id: String,
    pub media_id: String,
    pub source_frame: f64,
    pub z_index: u32,
    pub transform: NativeOverlayTransformPayload,
    pub opacity: f64,
    /// rust-core `Vec<Effect>` のJSON。N-API objectで全Effect variantを
    /// 二重定義せず、rust-coreのserde契約を直接の正本として使う。
    pub effects_json: Option<String>,
}

#[napi(object)]
pub struct NativeOverlayTransformPayload {
    pub translation_x: f64,
    pub translation_y: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotation_degrees: f64,
    pub sampling: Option<String>,
}

#[napi(object)]
pub struct NativeOverlayFpsPayload {
    pub numerator: u32,
    pub denominator: u32,
}

#[napi(object)]
pub struct NativeOverlaySceneMediaPayload {
    pub id: String,
    pub kind: String,
    pub source: String,
    pub width: u32,
    pub height: u32,
    pub source_rate: Option<NativeOverlayFpsPayload>,
}

#[napi(object)]
pub struct NativeOverlayReleaseFramePayload {
    pub memory_id: String,
    pub slot_index: u32,
    pub generation: f64,
    pub pts_frame: f64,
    pub copy_out_state: String,
}

#[napi(object)]
pub struct NativeOverlayResponse {
    pub success: bool,
    pub attached: bool,
    pub reason: Option<String>,
    pub release_frame: Option<NativeOverlayReleaseFramePayload>,
    pub live_prepared_clip_count: Option<f64>,
    pub live_readback_non_transparent_pixels: Option<f64>,
    pub live_readback_checksum: Option<f64>,
    pub live_readback_export_max_channel_delta: Option<f64>,
}

#[napi(object)]
pub struct NativeOverlayCapabilities {
    pub available: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlaySharedFrameSource {
    pub media_id: String,
    pub slot_count: u32,
    pub frame: OverlaySharedFrame,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlaySharedFrame {
    pub descriptor: OverlaySharedFrameDescriptor,
    pub pts_frame: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlaySharedFrameDescriptor {
    pub memory_id: String,
    pub slot_index: u32,
    pub generation: u64,
    pub byte_offset: u32,
    pub byte_len: u32,
    pub width: u32,
    pub height: u32,
    pub stride_bytes: u32,
    pub format: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlayUploadFrame {
    pub media_id: String,
    pub width: u32,
    pub height: u32,
    pub generation: u64,
    pub pts_frame: u64,
    pub pixels: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct OverlaySharedFramePresentRequest {
    pub source: OverlaySharedFrameSource,
    pub scene: Option<NativeOverlaySceneSource>,
    /// Bug B対策 — この present に同梱された選択デコレーション（あれば）。
    /// `present_overlay_shared_frame_to_live_surface` はこれを
    /// `resolve_present_selection_decoration` に渡し、SELECTION_DECORATIONS
    /// map の再読みではなく同梱値そのものを使う。
    pub selection_decoration: Option<SelectionDecorationState>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NativeOverlaySceneSource {
    pub snapshot: SceneSnapshot,
    pub media: Vec<NativeOverlaySceneMedia>,
    /// シーン（プロジェクト）解像度。`snapshot.clips[].transform` の
    /// `translation_x/y` と `scale_x/y` はこの解像度基準の絶対ピクセル座標である。
    /// drawable（native overlay の実ピクセルサイズ）がこれと異なるサイズになる場合、
    /// `upload_frame_to_scene_sources` がこの値を使って contain-fit 変換を行う。
    pub canvas_width: u32,
    pub canvas_height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeOverlaySceneMedia {
    pub id: String,
    pub kind: String,
    pub source: String,
    pub width: u32,
    pub height: u32,
    pub source_rate: Option<Fps>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlayReleaseFramePayload {
    pub memory_id: String,
    pub slot_index: u32,
    pub generation: u64,
    pub pts_frame: u64,
    pub copy_out_state: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlaySharedFramePresentResponse {
    pub success: bool,
    pub attached: bool,
    pub release_frame: Option<OverlayReleaseFramePayload>,
    pub live_diagnostics: Option<OverlayLiveSurfaceDiagnostics>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlayLiveSurfaceDiagnostics {
    pub live_prepared_clip_count: usize,
    pub live_readback_non_transparent_pixels: u64,
    pub live_readback_checksum: u64,
    pub live_readback_export_max_channel_delta: Option<u8>,
}

#[derive(Debug, PartialEq)]
pub struct OverlayLayerContract {
    pub pixel_format: &'static str,
    pub view_x: f64,
    pub view_y: f64,
    pub view_width: f64,
    pub view_height: f64,
    pub drawable_width: u32,
    pub drawable_height: u32,
    /// CALayer の `contentsScale` に直接反映する HiDPI 倍率。`payload.scale_factor` をそのまま伝搬する。
    /// `drawable_size` だけを 2 倍化して `contentsScale` を 1.0 のまま放置すると、Core Animation は
    /// drawable のうち `bounds × contentsScale` 分（=左下 1/4）しか画面に貼り出さない。
    pub contents_scale: f64,
}

static LIVE_OVERLAY_RENDERERS: OnceLock<Mutex<HashMap<u32, NativeOverlayLiveSurfaceRenderer>>> =
    OnceLock::new();

const NATIVE_OVERLAY_SOURCE_CACHE_MAX_BYTES: usize = 512 * 1024 * 1024;
const NATIVE_OVERLAY_SOURCE_CACHE_IDLE_FRAME_LIMIT: u64 = 30;
type NativeOverlaySharedSources = HashMap<String, Arc<RgbaFrame>>;

struct NativeOverlaySourceCacheEntry {
    revision: u64,
    frame: Arc<RgbaFrame>,
    byte_len: usize,
    idle_frames: u64,
}

#[derive(Default)]
struct NativeOverlaySourceCache {
    entries: HashMap<String, NativeOverlaySourceCacheEntry>,
    order: VecDeque<String>,
    total_bytes: usize,
    #[cfg(test)]
    hits: u64,
    #[cfg(test)]
    misses: u64,
}

impl NativeOverlaySourceCache {
    fn get(&mut self, media_id: &str, revision: u64) -> Option<Arc<RgbaFrame>> {
        let hit = self
            .entries
            .get(media_id)
            .map(|entry| entry.revision == revision)
            .unwrap_or(false);
        if !hit {
            #[cfg(test)]
            {
                self.misses += 1;
            }
            return None;
        }
        #[cfg(test)]
        {
            self.hits += 1;
        }
        self.touch(media_id);
        let entry = self
            .entries
            .get_mut(media_id)
            .expect("cache hit must keep its entry");
        entry.idle_frames = 0;
        Some(Arc::clone(&entry.frame))
    }

    fn insert(&mut self, media_id: String, revision: u64, frame: Arc<RgbaFrame>) {
        let byte_len = frame.pixels.len();
        if let Some(previous) = self.entries.insert(
            media_id.clone(),
            NativeOverlaySourceCacheEntry {
                revision,
                frame,
                byte_len,
                idle_frames: 0,
            },
        ) {
            self.total_bytes = self.total_bytes.saturating_sub(previous.byte_len);
            self.order.retain(|existing| existing != &media_id);
        }
        self.total_bytes += byte_len;
        self.order.push_back(media_id);
    }

    fn touch(&mut self, media_id: &str) {
        if let Some(position) = self.order.iter().position(|existing| existing == media_id) {
            if let Some(moved) = self.order.remove(position) {
                self.order.push_back(moved);
            }
        }
    }

    fn remove(&mut self, media_id: &str) {
        if let Some(entry) = self.entries.remove(media_id) {
            self.total_bytes = self.total_bytes.saturating_sub(entry.byte_len);
        }
        self.order.retain(|existing| existing != media_id);
    }

    fn evict_stale(&mut self, touched_media_ids: &HashSet<String>) {
        let mut stale = Vec::new();
        for (media_id, entry) in self.entries.iter_mut() {
            if touched_media_ids.contains(media_id) {
                entry.idle_frames = 0;
            } else {
                entry.idle_frames += 1;
                if entry.idle_frames > NATIVE_OVERLAY_SOURCE_CACHE_IDLE_FRAME_LIMIT {
                    stale.push(media_id.clone());
                }
            }
        }
        for media_id in stale {
            self.remove(&media_id);
        }
        while self.total_bytes > NATIVE_OVERLAY_SOURCE_CACHE_MAX_BYTES {
            let Some(oldest) = self.order.front().cloned() else {
                break;
            };
            self.remove(&oldest);
        }
    }

    #[cfg(test)]
    fn stats(&self) -> (u64, u64) {
        (self.hits, self.misses)
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.entries.len()
    }
}

pub struct NativeOverlayLiveSurfaceRenderer {
    window_id: u32,
    drawable_width: u32,
    drawable_height: u32,
    /// HiDPI 倍率（`OverlayLayerContract::contents_scale`）。選択デコレーションの
    /// 枠線幅・ハンドルサイズを CSS pt から物理ピクセルへ換算するために保持する。
    contents_scale: f64,
    /// 直近に present した scene（デコレーション上乗せ前の fitted snapshot と
    /// sources）。選択変更のみが起きた際（動画 present が来ないポーズ中など）に
    /// 同じ scene へデコレーションだけ差し替えて再 present するためのキャッシュ。
    /// 透明クリア（Bug D/F 経路）で None に戻る。
    ///
    /// `Arc` で共有することで、選択変更のみの再 present（`present_cached_scene_with_decoration`）
    /// が `RgbaFrame`（フルHDで約8MBのピクセルバッファ）を含む `HashMap` の
    /// deep clone を一切発生させない（参照カウントのコピーのみ）。
    last_scene: Option<Arc<(SceneSnapshot, NativeOverlaySharedSources)>>,
    /// `last_scene` の世代カウンタ。`present_upload_frame` で新しい scene が
    /// 来るたびにインクリメントし、native-wgpu-renderer 側の prepared clip
    /// キャッシュ（`prepare_base_scene_clips_cached`）のキーとして渡す。
    /// 同じ世代の再 present では GPU テクスチャ生成・アップロードを丸ごと
    /// スキップできる。
    scene_generation: u64,
    /// base scene の media revision。prepared clip を新しい scene 世代で作り直す
    /// ときも、内容が不変なsourceのGPU textureを再利用するために保持する。
    last_scene_content_revisions: HashMap<String, u64>,
    /// direct CAMetalLayer scene が毎 tick 渡されても、静的な生成 source を
    /// CPU でラスタライズし直さないための media revision 単位キャッシュ。
    native_source_cache: NativeOverlaySourceCache,
    #[cfg(target_os = "macos")]
    view_handle: usize,
    renderer: NativeWgpuLiveSurfaceRenderer,
}

unsafe impl Send for NativeOverlayLiveSurfaceRenderer {}

impl NativeOverlayLiveSurfaceRenderer {
    #[cfg(target_os = "macos")]
    fn from_appkit_view(
        window_id: u32,
        view_handle: usize,
        contract: &OverlayLayerContract,
    ) -> Result<Self, String> {
        let renderer = pollster::block_on(NativeWgpuLiveSurfaceRenderer::from_appkit_view(
            view_handle,
            contract.drawable_width,
            contract.drawable_height,
        ))
        .map_err(|error| format!("Native overlay live surface creation failed: {error:?}"))?;

        Ok(Self {
            window_id,
            drawable_width: contract.drawable_width,
            drawable_height: contract.drawable_height,
            contents_scale: contract.contents_scale,
            last_scene: None,
            scene_generation: 0,
            last_scene_content_revisions: HashMap::new(),
            native_source_cache: NativeOverlaySourceCache::default(),
            view_handle,
            renderer,
        })
    }

    fn present_upload_frame(
        &mut self,
        upload: &OverlayUploadFrame,
        scene: Option<&NativeOverlaySceneSource>,
        decoration: Option<&SelectionDecorationState>,
    ) -> Result<Option<OverlayLiveSurfaceDiagnostics>, String> {
        let _window_id = self.window_id;
        #[cfg(target_os = "macos")]
        let _view_handle = self.view_handle;
        let trace_start = overlay_trace_enabled().then(Instant::now);
        // 残像バグ診断（`UXFD_OVERLAY_TRACE=1`）— clip 削除後に present_upload_frame
        // が走ると last_scene が動画で再設定され、直前の transparent clear を
        // 上書きしてしまう。clear と present_upload の stderr 上の順序で
        // 「clear の後に動画 present が届いているか」を実機で切り分けるための恒久
        // 診断（既定は無効）。
        if overlay_trace_enabled() {
            eprintln!(
                "[uxfd-overlay-trace] present_upload_frame window_id={} media={} upload={}x{}",
                self.window_id, upload.media_id, upload.width, upload.height,
            );
        }
        let content_revisions = scene
            .map(native_overlay_source_content_revisions_for_scene)
            .unwrap_or_default();
        let (snapshot, sources) = upload_frame_to_scene_sources_with_cache(
            upload,
            scene,
            self.drawable_width,
            self.drawable_height,
            &mut self.native_source_cache,
        )?;
        // デコレーション上乗せ前の scene をキャッシュし、選択変更のみの
        // 再 present（present_cached_scene_with_decoration）で再利用する。
        // Arc に包むことで、この代入自体は参照カウントのコピーのみで
        // RgbaFrame ピクセルバッファの deep clone を伴わない。
        self.last_scene = Some(Arc::new((snapshot, sources)));
        self.last_scene_content_revisions = content_revisions;
        self.scene_generation += 1;
        let (base_snapshot, base_sources) = self
            .last_scene
            .as_deref()
            .expect("last_scene was just assigned above");

        let (decoration_clips, decoration_sources) = decoration
            .map(|state| {
                build_selection_decoration_clips(
                    state,
                    self.drawable_width,
                    self.drawable_height,
                    self.contents_scale,
                )
            })
            .unwrap_or_default();

        if live_surface_readback_trace_enabled() {
            // 診断専用の readback 経路。base + decoration を 1 つの snapshot に
            // 合成してから渡す（この経路は既定無効・deep clone を許容する）。
            let mut merged_snapshot = base_snapshot.clone();
            let mut merged_sources: HashMap<String, RgbaFrame> = base_sources
                .iter()
                .map(|(media_id, frame)| (media_id.clone(), frame.as_ref().clone()))
                .collect();
            merged_snapshot.clips.extend(decoration_clips);
            merged_sources.extend(decoration_sources);
            let report = pollster::block_on(
                self.renderer.present_scene_to_surface_texture_with_readback(
                    &merged_snapshot,
                    &merged_sources,
                ),
            )
            .map_err(|error| format!("Native overlay live surface present failed: {error:?}"))?;
            let live_readback_export_max_channel_delta = compare_live_overlay_readback_with_export(
                &report.frame,
                &merged_snapshot,
                &merged_sources,
            )?;
            return Ok(Some(live_surface_diagnostics_from_frame_report(
                report,
                Some(live_readback_export_max_channel_delta),
            )));
        }

        let report = pollster::block_on(
            self.renderer.present_scene_with_decoration_to_surface_texture(
                self.scene_generation,
                base_snapshot,
                base_sources,
                &self.last_scene_content_revisions,
                &decoration_clips,
                &decoration_sources,
            ),
        )
        .map_err(|error| format!("Native overlay live surface present failed: {error:?}"))?;
        if let Some(start) = trace_start {
            trace_present_stage_timings("present_upload_frame", &report.timings, start.elapsed());
        }
        Ok(Some(OverlayLiveSurfaceDiagnostics {
            live_prepared_clip_count: report.prepared_clip_count,
            live_readback_non_transparent_pixels: 0,
            live_readback_checksum: 0,
            live_readback_export_max_channel_delta: None,
        }))
    }

    fn present_scene(
        &mut self,
        scene: &NativeOverlaySceneSource,
        decoration: Option<&SelectionDecorationState>,
    ) -> Result<Option<OverlayLiveSurfaceDiagnostics>, String> {
        // `present_upload_frame` already owns the canonical scene fitting,
        // caching, decoration and CAMetalLayer present path. Supply a single
        // unreferenced transparent pixel so scene-only callers share that
        // implementation without a completed-frame readback or shared-memory
        // transfer. The renderer prepares textures only for referenced clips.
        let unreferenced = OverlayUploadFrame {
            media_id: "__uxfd_scene_only_unreferenced__".to_string(),
            width: 1,
            height: 1,
            generation: self.scene_generation.wrapping_add(1),
            pts_frame: scene.snapshot.frame_index,
            pixels: vec![0, 0, 0, 0],
        };
        self.present_upload_frame(&unreferenced, Some(scene), decoration)
    }

    /// キャッシュ済み scene（無ければ透明クリア相当の空 scene）にデコレーション
    /// を上乗せして再 present する。noVideoDecodeRequest の透明クリア状態でも
    /// デコレーションのみを present できる（426c の透明クリア機構と両立する）。
    ///
    /// `last_scene` は `Arc` 共有のため、ここでは clone してもピクセルバッファの
    /// 複製は起きない（参照カウントのコピーのみ）。base scene の GPU 側 prepare
    /// は `scene_generation` が変わらない限り native-wgpu-renderer 側キャッシュが
    /// ヒットし、テクスチャ再アップロードも起きない（デコレーション quad のみ
    /// 毎回軽量に prepare し直す）。
    fn present_cached_scene_with_decoration(
        &mut self,
        decoration: Option<&SelectionDecorationState>,
    ) -> Result<(), String> {
        let trace_start = overlay_trace_enabled().then(Instant::now);
        let cached = self.last_scene.clone();
        let owned_empty: (SceneSnapshot, NativeOverlaySharedSources);
        let (base_snapshot, base_sources) = match cached.as_deref() {
            Some((snapshot, sources)) => (snapshot, sources),
            None => {
                let (snapshot, _) = build_empty_scene_snapshot_for_transparent_clear();
                owned_empty = (snapshot, HashMap::new());
                (&owned_empty.0, &owned_empty.1)
            }
        };

        let (decoration_clips, decoration_sources) = decoration
            .map(|state| {
                build_selection_decoration_clips(
                    state,
                    self.drawable_width,
                    self.drawable_height,
                    self.contents_scale,
                )
            })
            .unwrap_or_default();

        // 残像診断（`UXFD_OVERLAY_CLEAR_READBACK=1`）— clear（空シーン present）時に
        // 実 drawable の pre/post 非透明ピクセル数を readback し stderr へ出す。
        // last_scene=None（動画が居ない透明クリア）のときのみ意味があるので、
        // その条件下だけで採取する（動画 present 中は通常の軽量経路を維持）。
        if clear_readback_trace_enabled() && self.last_scene.is_none() {
            let report = pollster::block_on(
                self.renderer
                    .present_scene_with_decoration_to_surface_texture_with_clear_readback(
                        self.scene_generation,
                        base_snapshot,
                        base_sources,
                        &self.last_scene_content_revisions,
                        &decoration_clips,
                        &decoration_sources,
                    ),
            )
            .map_err(|error| {
                format!("Native overlay clear-readback present failed: {error:?}")
            })?;
            eprintln!(
                "[uxfd-overlay-trace] clear_readback window_id={} drawable={}x{} \
                 prepared_clips={} pre_clear_non_transparent={} post_clear_non_transparent={}",
                self.window_id,
                report.width,
                report.height,
                report.prepared_clip_count,
                report.pre_clear_non_transparent_pixels,
                report.post_clear_non_transparent_pixels,
            );
            return Ok(());
        }

        let report = pollster::block_on(
            self.renderer.present_scene_with_decoration_to_surface_texture(
                self.scene_generation,
                base_snapshot,
                base_sources,
                &self.last_scene_content_revisions,
                &decoration_clips,
                &decoration_sources,
            ),
        )
        .map_err(|error| {
            format!("Native overlay selection decoration present failed: {error:?}")
        })?;
        if let Some(start) = trace_start {
            trace_present_stage_timings(
                "present_cached_scene_with_decoration",
                &report.timings,
                start.elapsed(),
            );
        }
        Ok(())
    }
}

#[napi(js_name = "attachNativeOverlay")]
pub fn attach_native_overlay(payload: NativeOverlayAttachPayload) -> NativeOverlayResponse {
    match std::panic::catch_unwind(AssertUnwindSafe(|| attach_native_overlay_inner(payload))) {
        Ok(response) => response,
        Err(_) => failure("Native overlay attach panicked."),
    }
}

#[napi(js_name = "detachNativeOverlay")]
pub fn detach_native_overlay(payload: NativeOverlayDetachPayload) -> NativeOverlayResponse {
    match catch_unwind(AssertUnwindSafe(|| detach_native_overlay_inner(payload))) {
        Ok(response) => response,
        Err(_) => failure("Native overlay detach panicked."),
    }
}

#[napi(js_name = "presentNativeOverlaySharedFrame")]
pub fn present_native_overlay_shared_frame(
    payload: NativeOverlaySharedFramePresentPayload,
) -> NativeOverlayResponse {
    match catch_unwind(AssertUnwindSafe(|| {
        present_native_overlay_shared_frame_inner(payload)
    })) {
        Ok(response) => response,
        Err(_) => failure("Native overlay shared frame present panicked."),
    }
}

#[napi(js_name = "presentNativeOverlayScene")]
pub fn present_native_overlay_scene(
    payload: NativeOverlayScenePresentPayload,
) -> NativeOverlayResponse {
    match catch_unwind(AssertUnwindSafe(|| {
        present_native_overlay_scene_inner(payload)
    })) {
        Ok(response) => response,
        Err(_) => failure("Native overlay scene present panicked."),
    }
}

#[napi(js_name = "getNativeOverlayCapabilities")]
pub fn get_native_overlay_capabilities() -> NativeOverlayCapabilities {
    platform_capabilities()
}

#[napi(js_name = "clearNativeOverlayLiveSurface")]
pub fn clear_native_overlay_live_surface_napi(
    payload: NativeOverlayDetachPayload,
) -> NativeOverlayResponse {
    match catch_unwind(AssertUnwindSafe(|| {
        clear_native_overlay_live_surface_inner(payload)
    })) {
        Ok(response) => response,
        Err(_) => failure("Native overlay clear surface panicked."),
    }
}

fn clear_native_overlay_live_surface_inner(
    payload: NativeOverlayDetachPayload,
) -> NativeOverlayResponse {
    let window_id = payload.window_id;
    match clear_native_overlay_live_surface(window_id) {
        Ok(()) => NativeOverlayResponse {
            success: true,
            attached: true,
            reason: None,
            release_frame: None,
            live_prepared_clip_count: Some(0.0),
            live_readback_non_transparent_pixels: None,
            live_readback_checksum: None,
            live_readback_export_max_channel_delta: None,
        },
        Err(reason) => failure(&reason),
    }
}

/// Bug E（計画書 §4 Phase E2）— electron/nativeOverlayMainBridge.ts の
/// `setObstructed` から呼ばれる napi export。`ui:preview-obstruction-changed`
/// の debounce・overlay overlap 最終判定は main 側（TypeScript）の責務で、
/// ここでは受け取った `obstructed` をそのまま child NSWindow の z-order
/// 切替へ反映するだけにする。
#[napi(js_name = "setNativeOverlayObstructed")]
pub fn set_native_overlay_obstructed_napi(
    payload: NativeOverlaySetObstructedPayload,
) -> NativeOverlayResponse {
    match catch_unwind(AssertUnwindSafe(|| {
        set_native_overlay_obstructed_inner(payload)
    })) {
        Ok(response) => response,
        Err(_) => failure("Native overlay set obstructed panicked."),
    }
}

fn set_native_overlay_obstructed_inner(
    payload: NativeOverlaySetObstructedPayload,
) -> NativeOverlayResponse {
    match set_native_overlay_obstructed(payload.window_id, payload.obstructed) {
        Ok(()) => NativeOverlayResponse {
            success: true,
            attached: true,
            reason: None,
            release_frame: None,
            live_prepared_clip_count: None,
            live_readback_non_transparent_pixels: None,
            live_readback_checksum: None,
            live_readback_export_max_channel_delta: None,
        },
        Err(reason) => failure(&reason),
    }
}

/// 選択デコレーション — electron/nativeOverlayMainBridge.ts の
/// `setSelectionDecoration` から呼ばれる napi export。quads は project 座標系の
/// world 四隅（回転込み）。空配列でデコレーション解除。native_window_handle は
/// 不要（clearSurface / setObstructed と同じく registry lookup で完結する）。
#[napi(js_name = "setNativeOverlaySelectionDecoration")]
pub fn set_native_overlay_selection_decoration_napi(
    payload: NativeOverlaySelectionDecorationPayload,
) -> NativeOverlayResponse {
    match catch_unwind(AssertUnwindSafe(|| {
        set_native_overlay_selection_decoration_inner(payload)
    })) {
        Ok(response) => response,
        Err(_) => failure("Native overlay set selection decoration panicked."),
    }
}

fn set_native_overlay_selection_decoration_inner(
    payload: NativeOverlaySelectionDecorationPayload,
) -> NativeOverlayResponse {
    let state = selection_decoration_state_from_quad_payloads(
        payload.canvas_width,
        payload.canvas_height,
        payload.quads,
    );
    match set_native_overlay_selection_decoration(payload.window_id, state) {
        Ok(()) => NativeOverlayResponse {
            success: true,
            attached: true,
            reason: None,
            release_frame: None,
            live_prepared_clip_count: None,
            live_readback_non_transparent_pixels: None,
            live_readback_checksum: None,
            live_readback_export_max_channel_delta: None,
        },
        Err(reason) => failure(&reason),
    }
}

fn attach_native_overlay_inner(payload: NativeOverlayAttachPayload) -> NativeOverlayResponse {
    let window_id = payload.window_id;
    let native_window_handle = match native_window_handle_bytes(&payload) {
        Ok(bytes) => bytes,
        Err(reason) => return failure(reason),
    };
    let contract = match build_overlay_layer_contract(&payload) {
        Ok(contract) => contract,
        Err(reason) => return failure(reason),
    };
    #[cfg(target_os = "macos")]
    {
        let view_handle = match macos_overlay::attach_overlay_view(&native_window_handle, &contract)
        {
            Ok(view_handle) => view_handle,
            Err(reason) => return failure(reason),
        };
        if let Err(reason) = attach_live_overlay_surface_renderer(window_id, view_handle, &contract)
        {
            return failure(&reason);
        }
        // `wgpu::create_surface_unsafe` は NSView の layer を CAMetalLayer に差し替えるため、
        // surface 構築前に設定した `contentsScale` は失われている。HiDPI 環境では
        // ここで再度反映しないと drawable の左下 1/4 しか画面に貼り出されない（Bug B）。
        macos_overlay::set_overlay_view_contents_scale(view_handle, contract.contents_scale);
        // contentsScale と同じ理由で `opaque` も layer 差し替えにより既定値 YES へ戻る。
        // 再適用しないと `LoadOp::Clear(TRANSPARENT)` が compositor 上で不透明扱いされ、
        // 編集画面の preview が真っ黒になる（Bug E — Bug D 直後の実機リグレッション）。
        macos_overlay::set_overlay_view_opaque(view_handle, false);
    }

    NativeOverlayResponse {
        success: true,
        attached: true,
        reason: None,
        release_frame: None,
        live_prepared_clip_count: None,
        live_readback_non_transparent_pixels: None,
        live_readback_checksum: None,
        live_readback_export_max_channel_delta: None,
    }
}

fn detach_native_overlay_inner(payload: NativeOverlayDetachPayload) -> NativeOverlayResponse {
    let window_id = payload.window_id;
    let native_window_handle = match detach_native_window_handle_bytes(&payload) {
        Ok(bytes) => bytes,
        Err(reason) => return failure(reason),
    };
    detach_live_overlay_surface_renderer(window_id);
    #[cfg(target_os = "macos")]
    if let Err(reason) = macos_overlay::detach_overlay_view(&native_window_handle) {
        return failure(reason);
    }

    NativeOverlayResponse {
        success: true,
        attached: false,
        reason: None,
        release_frame: None,
        live_prepared_clip_count: None,
        live_readback_non_transparent_pixels: None,
        live_readback_checksum: None,
        live_readback_export_max_channel_delta: None,
    }
}

fn failure(reason: &str) -> NativeOverlayResponse {
    NativeOverlayResponse {
        success: false,
        attached: false,
        reason: Some(reason.to_string()),
        release_frame: None,
        live_prepared_clip_count: None,
        live_readback_non_transparent_pixels: None,
        live_readback_checksum: None,
        live_readback_export_max_channel_delta: None,
    }
}

fn present_native_overlay_shared_frame_inner(
    payload: NativeOverlaySharedFramePresentPayload,
) -> NativeOverlayResponse {
    let window_id = payload.window_id;
    if let Err(reason) = present_native_window_handle_bytes(&payload) {
        return failure(reason);
    }
    let request = match scene_present_request_from_payload(payload) {
        Ok(request) => request,
        Err(reason) => return failure(&reason),
    };
    match present_overlay_shared_frame_to_live_surface(window_id, request) {
        Ok(response) => NativeOverlayResponse {
            success: response.success,
            attached: response.attached,
            reason: None,
            live_prepared_clip_count: response
                .live_diagnostics
                .as_ref()
                .map(|diagnostics| diagnostics.live_prepared_clip_count as f64),
            live_readback_non_transparent_pixels: response
                .live_diagnostics
                .as_ref()
                .map(|diagnostics| diagnostics.live_readback_non_transparent_pixels as f64),
            live_readback_checksum: response
                .live_diagnostics
                .as_ref()
                .map(|diagnostics| diagnostics.live_readback_checksum as f64),
            live_readback_export_max_channel_delta: response.live_diagnostics.as_ref().and_then(
                |diagnostics| {
                    diagnostics
                        .live_readback_export_max_channel_delta
                        .map(|max_channel_delta| max_channel_delta as f64)
                },
            ),
            release_frame: response.release_frame.map(|release_frame| {
                NativeOverlayReleaseFramePayload {
                    memory_id: release_frame.memory_id,
                    slot_index: release_frame.slot_index,
                    generation: release_frame.generation as f64,
                    pts_frame: release_frame.pts_frame as f64,
                    copy_out_state: release_frame.copy_out_state,
                }
            }),
        },
        Err(reason) => failure(&reason),
    }
}

fn present_native_overlay_scene_inner(
    payload: NativeOverlayScenePresentPayload,
) -> NativeOverlayResponse {
    let window_id = payload.window_id;
    let canvas_width = payload.snapshot.canvas_width;
    let canvas_height = payload.snapshot.canvas_height;
    let scene = match scene_snapshot_from_payload(payload.snapshot) {
        Ok(snapshot) => NativeOverlaySceneSource {
            snapshot,
            media: payload.media.into_iter().map(scene_media_from_payload).collect(),
            canvas_width,
            canvas_height,
        },
        Err(reason) => return failure(&reason),
    };
    let decoration = payload.selection_decoration.map(|decoration| {
        selection_decoration_state_from_quad_payloads(
            decoration.canvas_width,
            decoration.canvas_height,
            decoration.quads,
        )
    });
    match present_overlay_scene_to_live_surface(window_id, &scene, decoration) {
        Ok(live_diagnostics) => NativeOverlayResponse {
            success: true,
            attached: true,
            reason: None,
            release_frame: None,
            live_prepared_clip_count: live_diagnostics
                .as_ref()
                .map(|diagnostics| diagnostics.live_prepared_clip_count as f64),
            live_readback_non_transparent_pixels: live_diagnostics
                .as_ref()
                .map(|diagnostics| diagnostics.live_readback_non_transparent_pixels as f64),
            live_readback_checksum: live_diagnostics
                .as_ref()
                .map(|diagnostics| diagnostics.live_readback_checksum as f64),
            live_readback_export_max_channel_delta: live_diagnostics.as_ref().and_then(
                |diagnostics| diagnostics
                    .live_readback_export_max_channel_delta
                    .map(|value| value as f64),
            ),
        },
        Err(reason) => failure(&reason),
    }
}

#[cfg(target_os = "macos")]
fn attach_live_overlay_surface_renderer(
    window_id: u32,
    view_handle: usize,
    contract: &OverlayLayerContract,
) -> Result<(), String> {
    let renderer =
        NativeOverlayLiveSurfaceRenderer::from_appkit_view(window_id, view_handle, contract)?;
    let mut renderers = LIVE_OVERLAY_RENDERERS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| "Native overlay live renderer registry is poisoned.".to_string())?;
    renderers.insert(window_id, renderer);
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn attach_live_overlay_surface_renderer(
    _window_id: u32,
    _layer_handle: usize,
    _contract: &OverlayLayerContract,
) -> Result<(), String> {
    Err("Native overlay live surface is only available on macOS.".to_string())
}

fn detach_live_overlay_surface_renderer(window_id: u32) {
    if let Some(renderers) = LIVE_OVERLAY_RENDERERS.get() {
        if let Ok(mut renderers) = renderers.lock() {
            renderers.remove(&window_id);
        }
    }
    // 選択デコレーション state も window 単位で破棄する（unmount 後の再 attach
    // で古い選択枠が蘇らないようにする。TS 側は attach 後に最新 state を再送する）。
    remove_native_overlay_selection_decoration(window_id);
}

pub fn build_overlay_layer_contract(
    payload: &NativeOverlayAttachPayload,
) -> Result<OverlayLayerContract, &'static str> {
    if !payload.width.is_finite()
        || !payload.height.is_finite()
        || !payload.scale_factor.is_finite()
        || payload.width <= 0.0
        || payload.height <= 0.0
        || payload.scale_factor <= 0.0
    {
        return Err("Native overlay size and scale factor must be positive.");
    }

    Ok(OverlayLayerContract {
        pixel_format: "bgra8Unorm",
        view_x: payload.x,
        view_y: payload.y,
        view_width: payload.width,
        view_height: payload.height,
        drawable_width: (payload.width * payload.scale_factor).round() as u32,
        drawable_height: (payload.height * payload.scale_factor).round() as u32,
        contents_scale: payload.scale_factor,
    })
}

pub fn native_window_handle_bytes(
    payload: &NativeOverlayAttachPayload,
) -> Result<Vec<u8>, &'static str> {
    let Some(handle) = &payload.native_window_handle else {
        return Err("Native overlay window handle is required.");
    };
    let bytes = handle.as_ref();
    if bytes.len() != std::mem::size_of::<usize>() {
        return Err("Native overlay window handle has an unexpected byte length.");
    }
    Ok(bytes.to_vec())
}

pub fn detach_native_window_handle_bytes(
    payload: &NativeOverlayDetachPayload,
) -> Result<Vec<u8>, &'static str> {
    let Some(handle) = &payload.native_window_handle else {
        return Err("Native overlay window handle is required.");
    };
    let bytes = handle.as_ref();
    if bytes.len() != std::mem::size_of::<usize>() {
        return Err("Native overlay window handle has an unexpected byte length.");
    }
    Ok(bytes.to_vec())
}

pub fn present_native_window_handle_bytes(
    payload: &NativeOverlaySharedFramePresentPayload,
) -> Result<Vec<u8>, &'static str> {
    let Some(handle) = &payload.native_window_handle else {
        return Err("Native overlay window handle is required.");
    };
    let bytes = handle.as_ref();
    if bytes.len() != std::mem::size_of::<usize>() {
        return Err("Native overlay window handle has an unexpected byte length.");
    }
    Ok(bytes.to_vec())
}

fn scene_present_request_from_payload(
    payload: NativeOverlaySharedFramePresentPayload,
) -> Result<OverlaySharedFramePresentRequest, String> {
    let scene = match (payload.snapshot, payload.media) {
        (Some(snapshot), Some(media)) => {
            let canvas_width = snapshot.canvas_width;
            let canvas_height = snapshot.canvas_height;
            Some(NativeOverlaySceneSource {
                snapshot: scene_snapshot_from_payload(snapshot)?,
                media: media.into_iter().map(scene_media_from_payload).collect(),
                canvas_width,
                canvas_height,
            })
        }
        (None, None) => None,
        _ => {
            return Err(
                "Native overlay scene payload must include both snapshot and media.".to_string(),
            )
        }
    };

    Ok(OverlaySharedFramePresentRequest {
        source: OverlaySharedFrameSource {
            media_id: payload.media_id,
            slot_count: payload.slot_count,
            frame: OverlaySharedFrame {
                descriptor: OverlaySharedFrameDescriptor {
                    memory_id: payload.frame.descriptor.memory_id,
                    slot_index: payload.frame.descriptor.slot_index,
                    generation: safe_u64_from_f64(
                        "generation",
                        payload.frame.descriptor.generation,
                    )?,
                    byte_offset: payload.frame.descriptor.byte_offset,
                    byte_len: payload.frame.descriptor.byte_len,
                    width: payload.frame.descriptor.width,
                    height: payload.frame.descriptor.height,
                    stride_bytes: payload.frame.descriptor.stride_bytes,
                    format: payload.frame.descriptor.format,
                },
                pts_frame: safe_u64_from_f64("ptsFrame", payload.frame.pts_frame)?,
            },
        },
        scene,
        selection_decoration: payload.selection_decoration.map(|decoration| {
            selection_decoration_state_from_quad_payloads(
                decoration.canvas_width,
                decoration.canvas_height,
                decoration.quads,
            )
        }),
    })
}

fn safe_u64_from_f64(label: &str, value: f64) -> Result<u64, String> {
    if !value.is_finite() || value < 0.0 || value.fract() != 0.0 || value > 9_007_199_254_740_991.0
    {
        return Err(format!(
            "{label} must be a safe non-negative integer, got {value}"
        ));
    }
    Ok(value as u64)
}

pub fn copy_overlay_shared_frame_source_for_upload(
    source: &OverlaySharedFrameSource,
    timeout: Duration,
) -> Result<OverlayUploadFrame, String> {
    let descriptor = &source.frame.descriptor;
    if descriptor.format != "rgba8Srgb" {
        return Err(format!(
            "Native overlay shared frame format must be rgba8Srgb, got {}.",
            descriptor.format
        ));
    }
    let expected_byte_offset = descriptor
        .byte_len
        .checked_mul(descriptor.slot_index)
        .ok_or_else(|| "Native overlay shared frame byteOffset overflows.".to_string())?;
    if descriptor.byte_offset != 0 && descriptor.byte_offset != expected_byte_offset {
        return Err(format!(
            "Native overlay shared frame byteOffset must be zero or slotIndex * byteLen, expected {}, got {}.",
            expected_byte_offset, descriptor.byte_offset
        ));
    }
    let row_bytes = descriptor
        .width
        .checked_mul(4)
        .ok_or_else(|| "Native overlay shared frame row byte length overflows.".to_string())?;
    if descriptor.stride_bytes < row_bytes {
        return Err(
            "Native overlay shared frame strideBytes is smaller than width * 4.".to_string(),
        );
    }
    let required_byte_len = descriptor
        .stride_bytes
        .checked_mul(descriptor.height)
        .ok_or_else(|| "Native overlay shared frame byte length overflows.".to_string())?;
    if descriptor.byte_len != required_byte_len {
        return Err(format!(
            "Native overlay shared frame byteLen must equal strideBytes * height, expected {}, got {}.",
            required_byte_len, descriptor.byte_len
        ));
    }

    let mut upload_buffer = vec![0_u8; descriptor.byte_len as usize];
    copy_shared_frame_into_upload_buffer(
        &descriptor.memory_id,
        source.slot_count,
        descriptor.byte_len as usize,
        descriptor.slot_index,
        descriptor.generation,
        source.frame.pts_frame,
        &mut upload_buffer,
        timeout,
    )
    .map_err(|error| format!("Native overlay shared frame copy failed: {error:?}"))?;

    let mut pixels =
        Vec::with_capacity((descriptor.width as usize) * (descriptor.height as usize) * 4);
    let stride_bytes = descriptor.stride_bytes as usize;
    let row_bytes = row_bytes as usize;
    for row_index in 0..descriptor.height as usize {
        let row_start = row_index * stride_bytes;
        pixels.extend_from_slice(&upload_buffer[row_start..row_start + row_bytes]);
    }

    Ok(OverlayUploadFrame {
        media_id: source.media_id.clone(),
        width: descriptor.width,
        height: descriptor.height,
        generation: descriptor.generation,
        pts_frame: source.frame.pts_frame,
        pixels,
    })
}

pub fn present_overlay_shared_frame_for_test(
    request: OverlaySharedFramePresentRequest,
) -> Result<OverlaySharedFramePresentResponse, String> {
    let upload =
        copy_overlay_shared_frame_source_for_upload(&request.source, Duration::from_millis(100))?;
    let descriptor = &request.source.frame.descriptor;

    Ok(OverlaySharedFramePresentResponse {
        success: true,
        attached: true,
        live_diagnostics: None,
        release_frame: Some(OverlayReleaseFramePayload {
            memory_id: descriptor.memory_id.clone(),
            slot_index: descriptor.slot_index,
            generation: upload.generation,
            pts_frame: upload.pts_frame,
            copy_out_state: "gpuUploadFenceSignalled".to_string(),
        }),
    })
}

// --- 選択デコレーション（選択枠・リサイズハンドル）描画 ---
//
// SceneSelectionOverlay（HTML/SVG）は child NSWindow 化された native overlay
// より常に下にあり、オブジェクトが現在フレームへ描画されると不透明ピクセルに
// 隠れて見えない。そこで枠線（金 #ffd700・2pt 相当）とハンドル（白面 + 金枠）
// の見た目を scene present の最後に EvaluatedClip として上乗せ描画する。
// 1x1 単色 RgbaFrame を Transform（translation/scale/rotation）で伸縮・回転
// させるだけなので、専用の描画パイプラインは追加しない。

pub const SELECTION_DECORATION_GOLD_MEDIA_ID: &str = "uxfd-selection-decoration-gold";
pub const SELECTION_DECORATION_WHITE_MEDIA_ID: &str = "uxfd-selection-decoration-white";
/// SVG（SceneSelectionOverlay.tsx）の strokeWidth=2 相当（CSS pt）。
const SELECTION_DECORATION_LINE_WIDTH_CSS: f64 = 2.0;
/// SVG の RESIZE_HANDLE_SIZE=10 相当（CSS pt）。
const SELECTION_DECORATION_HANDLE_SIZE_CSS: f64 = 10.0;
/// SVG のハンドル strokeWidth=1.2 相当（CSS pt）。stroke は矩形境界を跨ぐため、
/// 金枠の外形は 10+1.2、白面は 10-1.2 になる。
const SELECTION_DECORATION_HANDLE_STROKE_CSS: f64 = 1.2;
const SELECTION_DECORATION_EDGE_Z_INDEX: u32 = u32::MAX - 2;
const SELECTION_DECORATION_HANDLE_FRAME_Z_INDEX: u32 = u32::MAX - 1;
const SELECTION_DECORATION_HANDLE_FACE_Z_INDEX: u32 = u32::MAX;

/// project 座標系（canvas 基準）の world 四隅。回転はここに折り込み済み。
#[derive(Debug, Clone, PartialEq)]
pub struct SelectionDecorationQuad {
    pub top_left: (f64, f64),
    pub top_right: (f64, f64),
    pub bottom_right: (f64, f64),
    pub bottom_left: (f64, f64),
}

#[derive(Debug, Clone, PartialEq)]
pub struct SelectionDecorationState {
    pub canvas_width: u32,
    pub canvas_height: u32,
    pub quads: Vec<SelectionDecorationQuad>,
}

static SELECTION_DECORATIONS: OnceLock<Mutex<HashMap<u32, SelectionDecorationState>>> =
    OnceLock::new();

fn selection_decorations() -> &'static Mutex<HashMap<u32, SelectionDecorationState>> {
    SELECTION_DECORATIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn stored_native_overlay_selection_decoration(
    window_id: u32,
) -> Option<SelectionDecorationState> {
    selection_decorations()
        .lock()
        .ok()
        .and_then(|map| map.get(&window_id).cloned())
}

fn store_native_overlay_selection_decoration(
    window_id: u32,
    state: SelectionDecorationState,
) -> Result<(), String> {
    let mut map = selection_decorations()
        .lock()
        .map_err(|_| "Native overlay selection decoration registry is poisoned.".to_string())?;
    if state.quads.is_empty() {
        map.remove(&window_id);
    } else {
        map.insert(window_id, state);
    }
    Ok(())
}

fn remove_native_overlay_selection_decoration(window_id: u32) {
    if let Some(map) = SELECTION_DECORATIONS.get() {
        if let Ok(mut map) = map.lock() {
            map.remove(&window_id);
        }
    }
}

/// napi の quad payload（quads の生配列 + canvas サイズ）を
/// `SelectionDecorationState` へ変換する唯一の実装。
/// `set_native_overlay_selection_decoration_inner`（standalone 経路）と
/// `scene_present_request_from_payload`（Bug B対策の同梱経路）の双方が使う。
fn selection_decoration_state_from_quad_payloads(
    canvas_width: u32,
    canvas_height: u32,
    quads: Vec<NativeOverlaySelectionDecorationQuadPayload>,
) -> SelectionDecorationState {
    SelectionDecorationState {
        canvas_width,
        canvas_height,
        quads: quads
            .into_iter()
            .map(|quad| SelectionDecorationQuad {
                top_left: (quad.top_left_x, quad.top_left_y),
                top_right: (quad.top_right_x, quad.top_right_y),
                bottom_right: (quad.bottom_right_x, quad.bottom_right_y),
                bottom_left: (quad.bottom_left_x, quad.bottom_left_y),
            })
            .collect(),
    }
}

/// Bug B（症状B）対策 — この present で使う選択デコレーションを決定する。
/// `embedded`（presentNativeOverlaySharedFrame に同梱された値）がある場合は
/// SELECTION_DECORATIONS map をそれで置き換えた上で、その値そのものを返す
/// （map を再読みしない。呼び出し直後に他の呼び出しが map を書き換えていても
/// この present の結果は同梱値のまま変わらない）。空 quads は
/// standalone 経路（`store_native_overlay_selection_decoration`）と同じ
/// 「デコレーション解除」として扱い、map からエントリを除去した上で None を
/// 返す。`embedded` が無い場合は従来どおり map に格納済みの値へフォールバック
/// する（addon が同梱に未対応な JS 側との後方互換）。
fn resolve_present_selection_decoration(
    window_id: u32,
    embedded: Option<SelectionDecorationState>,
) -> Option<SelectionDecorationState> {
    match embedded {
        Some(state) => {
            // store 自体が失敗する（mutex poisoned）ケースはこの present の
            // 描画継続を止めるほどではないため、ここでは結果を無視する
            // （後続の present 群でも再試行される）。
            let _ = store_native_overlay_selection_decoration(window_id, state.clone());
            if state.quads.is_empty() {
                None
            } else {
                Some(state)
            }
        }
        None => stored_native_overlay_selection_decoration(window_id),
    }
}

/// state を保存した上で、attach 済みならキャッシュ scene（無ければ透明クリア
/// 相当の空 scene）へデコレーションを上乗せして即時再 present する。未 attach
/// の場合も state は保持し（attach 後の present が拾う）、Err を返して TS 側の
/// SVG フォールバック判断に使わせる。
/// ロック順序: SELECTION_DECORATIONS を解放してから LIVE_OVERLAY_RENDERERS を
/// 取る（present 経路と同順。両ロックの同時保持はしない）。
pub fn set_native_overlay_selection_decoration(
    window_id: u32,
    state: SelectionDecorationState,
) -> Result<(), String> {
    store_native_overlay_selection_decoration(window_id, state)?;
    let decoration = stored_native_overlay_selection_decoration(window_id);
    let mut renderers = LIVE_OVERLAY_RENDERERS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| "Native overlay live renderer registry is poisoned.".to_string())?;
    let renderer = renderers
        .get_mut(&window_id)
        .ok_or_else(|| "Native overlay live surface is not attached.".to_string())?;
    renderer.present_cached_scene_with_decoration(decoration.as_ref())
}

fn solid_rgba_frame(rgba: [u8; 4]) -> RgbaFrame {
    RgbaFrame::from_rgba8(1, 1, rgba.to_vec()).expect("1x1 solid colour frame is always valid")
}

fn decoration_clip(
    clip_id: String,
    media_id: &str,
    z_index: u32,
    translation: (f64, f64),
    scale: (f64, f64),
    rotation_degrees: f64,
) -> EvaluatedClip {
    EvaluatedClip {
        clip_id,
        track_id: "uxfd-selection-decoration".to_string(),
        media_id: media_id.to_string(),
        source_frame: 0,
        z_index,
        transform: Transform {
            translation_x: translation.0 as f32,
            translation_y: translation.1 as f32,
            scale_x: scale.0 as f32,
            scale_y: scale.1 as f32,
            rotation_degrees: rotation_degrees as f32,
            sampling: SamplingMode::Nearest,
        },
        opacity: 1.0,
        effects: Vec::new(),
    }
}

/// 辺 A→B を線幅 `line_width` の回転矩形 clip として構築する。
/// solid_composite.wgsl の Transform 解釈（translation=ソース原点の出力座標・
/// 回転は translation 点まわり）に合わせ、線の中心を辺上に載せる法線オフセット
/// と、角の継ぎ目を埋める両端の半幅延長を translation に折り込む。
fn selection_edge_clip(
    quad_index: usize,
    edge_index: usize,
    a: (f64, f64),
    b: (f64, f64),
    line_width: f64,
) -> Option<EvaluatedClip> {
    let dx = b.0 - a.0;
    let dy = b.1 - a.1;
    let length = (dx * dx + dy * dy).sqrt();
    if !length.is_finite() {
        return None;
    }
    let theta = dy.atan2(dx);
    let (sin, cos) = theta.sin_cos();
    let half = line_width * 0.5;
    let start = (a.0 - cos * half, a.1 - sin * half);
    let translation = (start.0 + sin * half, start.1 - cos * half);
    Some(decoration_clip(
        format!("uxfd-selection-decoration-{quad_index}-edge-{edge_index}"),
        SELECTION_DECORATION_GOLD_MEDIA_ID,
        SELECTION_DECORATION_EDGE_Z_INDEX,
        translation,
        (length + line_width, line_width),
        theta.to_degrees(),
    ))
}

/// quads（project 座標系）を drawable 座標へ contain-fit 変換し、選択枠 4 辺と
/// 四隅ハンドル（金枠 + 白面）の EvaluatedClip 群と 1x1 単色 sources を返す。
/// 変換式は `fit_scene_snapshot_to_drawable` と同一（等方 fit + 中央 letterbox）。
/// 線幅・ハンドルサイズは CSS pt × `contents_scale` の物理ピクセル固定で、
/// fit の影響を受けない（SVG の見た目と同じ挙動）。
pub fn build_selection_decoration_clips(
    state: &SelectionDecorationState,
    drawable_width: u32,
    drawable_height: u32,
    contents_scale: f64,
) -> (Vec<EvaluatedClip>, HashMap<String, RgbaFrame>) {
    let mut clips = Vec::new();
    let mut sources = HashMap::new();
    if state.quads.is_empty() {
        return (clips, sources);
    }
    sources.insert(
        SELECTION_DECORATION_GOLD_MEDIA_ID.to_string(),
        solid_rgba_frame([255, 215, 0, 255]),
    );
    sources.insert(
        SELECTION_DECORATION_WHITE_MEDIA_ID.to_string(),
        solid_rgba_frame([255, 255, 255, 255]),
    );

    // `fit_scene_snapshot_to_drawable`（scene 本体）と同じ共通ヘルパーを使い、
    // canvas_width/height が 0 のときの Fail Safe（無変換）も含めて式を一本化する。
    let (fit_scale, offset_x, offset_y) = contain_fit_transform(
        state.canvas_width,
        state.canvas_height,
        drawable_width,
        drawable_height,
    );
    let fit = |point: (f64, f64)| (point.0 * fit_scale + offset_x, point.1 * fit_scale + offset_y);

    let line_width = SELECTION_DECORATION_LINE_WIDTH_CSS * contents_scale;
    let handle_frame_size =
        (SELECTION_DECORATION_HANDLE_SIZE_CSS + SELECTION_DECORATION_HANDLE_STROKE_CSS)
            * contents_scale;
    let handle_face_size =
        (SELECTION_DECORATION_HANDLE_SIZE_CSS - SELECTION_DECORATION_HANDLE_STROKE_CSS)
            * contents_scale;

    for (quad_index, quad) in state.quads.iter().enumerate() {
        let corners = [
            fit(quad.top_left),
            fit(quad.top_right),
            fit(quad.bottom_right),
            fit(quad.bottom_left),
        ];
        for edge_index in 0..4 {
            if let Some(clip) = selection_edge_clip(
                quad_index,
                edge_index,
                corners[edge_index],
                corners[(edge_index + 1) % 4],
                line_width,
            ) {
                clips.push(clip);
            }
        }
        for (corner_index, corner) in corners.iter().enumerate() {
            let half = handle_frame_size * 0.5;
            clips.push(decoration_clip(
                format!("uxfd-selection-decoration-{quad_index}-handle-frame-{corner_index}"),
                SELECTION_DECORATION_GOLD_MEDIA_ID,
                SELECTION_DECORATION_HANDLE_FRAME_Z_INDEX,
                (corner.0 - half, corner.1 - half),
                (handle_frame_size, handle_frame_size),
                0.0,
            ));
        }
        for (corner_index, corner) in corners.iter().enumerate() {
            let half = handle_face_size * 0.5;
            clips.push(decoration_clip(
                format!("uxfd-selection-decoration-{quad_index}-handle-face-{corner_index}"),
                SELECTION_DECORATION_WHITE_MEDIA_ID,
                SELECTION_DECORATION_HANDLE_FACE_Z_INDEX,
                (corner.0 - half, corner.1 - half),
                (handle_face_size, handle_face_size),
                0.0,
            ));
        }
    }
    (clips, sources)
}

/// scene present 直前の snapshot / sources にデコレーションを上乗せする。
/// 既存 clip は変更しない（z_index が u32::MAX 近傍なので常に最前面）。
pub fn append_selection_decoration_to_scene(
    snapshot: &mut SceneSnapshot,
    sources: &mut HashMap<String, RgbaFrame>,
    state: &SelectionDecorationState,
    drawable_width: u32,
    drawable_height: u32,
    contents_scale: f64,
) {
    let (clips, decoration_sources) =
        build_selection_decoration_clips(state, drawable_width, drawable_height, contents_scale);
    snapshot.clips.extend(clips);
    sources.extend(decoration_sources);
}

/// Bug D — clip 削除で `activeJob` が消え shared frame present が止まると、
/// CAMetalLayer drawable に削除前フレームが残ったままになる。この症状を
/// 潰すため、`clear_native_overlay_live_surface` は空 SceneSnapshot と空
/// sources を live surface に present し、既存 render pass の
/// `LoadOp::Clear(wgpu::Color::TRANSPARENT)` によって drawable 全 pixel を
/// alpha=0 で上書きする。専用 clear render logic は追加しない。
pub fn build_empty_scene_snapshot_for_transparent_clear() -> (SceneSnapshot, HashMap<String, RgbaFrame>) {
    (
        SceneSnapshot {
            frame_index: 0,
            colour: ColourPipeline::rec709_sdr_linear(),
            clips: Vec::new(),
        },
        HashMap::new(),
    )
}

/// Bug D — `activeJob` が空になったとき、または unmount / project 切替の際に
/// live surface を透明 clear するための単発 present。attach されていない
/// `window_id` を渡した場合は明示的な Err を返し、上位で fallback 判断できる
/// ようにする。
pub fn clear_native_overlay_live_surface(window_id: u32) -> Result<(), String> {
    // 残像バグ診断（`UXFD_OVERLAY_TRACE=1`）— present 側（present_upload_frame /
    // present_shared_frame）にはトレースがあったが clear 側には無く、
    // 「削除後に clear が実際に走ったか」を実機で確認できなかった。この1行で
    // 測定ギャップを埋める（既定は無効・挙動変更なし）。
    if overlay_trace_enabled() {
        eprintln!("[uxfd-overlay-trace] clear_live_surface window_id={window_id}");
    }
    // 選択デコレーションは透明クリア後も見えるべき（noVideoDecodeRequest で
    // 動画が居ない時間帯でも選択枠は残る）。ロック順序: decoration → renderers
    // の順に取得し、同時保持はしない。
    let decoration = stored_native_overlay_selection_decoration(window_id);
    let mut renderers = LIVE_OVERLAY_RENDERERS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| "Native overlay live renderer registry is poisoned.".to_string())?;
    let renderer = renderers
        .get_mut(&window_id)
        .ok_or_else(|| "Native overlay live surface is not attached.".to_string())?;
    renderer.last_scene = None;
    // 削除残像バグ・修正（実機トレースで確定した真因への対処）: `last_scene` を
    // None に戻すだけでは native-wgpu-renderer 側 `prepare_base_scene_clips_cached`
    // が「generation 一致のみでキャッシュヒット判定」する契約（変更しない）に
    // より、直前の動画シーンの `Arc<PreparedClip>` を誤って返し続けてしまう。
    // ここで `scene_generation` を前進させ、以降の present を意図的にキャッシュ
    // ミスさせることで、空 snapshot が実際に prepare・描画されるようにする。
    // `last_scene` が Some のまま selection 変更だけで再 present するケース
    // （`present_cached_scene_with_decoration` のキャッシュヒット）はこの分岐を
    // 通らないため影響しない。
    renderer.scene_generation += 1;
    // 候補修正（`UXFD_OVERLAY_CLEAR_FLUSH=1`、既定オフ）— 仮説1（Immediate
    // present での swapchain drawable 保持）向け。CAMetalLayer は複数 drawable を
    // 持ち、Immediate モードでは present 回数が数回で止まると「クリアされていない
    // 別 drawable」に前の動画フレームが残って表示され続けうる。透明クリアを
    // desired_maximum_frame_latency(2)+1=3 回連続 present し、全 drawable を確実に
    // 透明で上書きする。実機で残像が消えれば真因が仮説1と確定する。既定では
    // 従来どおり1回のみ present（挙動変更なし）。
    let clear_present_count = if clear_flush_enabled() { 3 } else { 1 };
    for _ in 0..clear_present_count {
        renderer
            .present_cached_scene_with_decoration(decoration.as_ref())
            .map_err(|error| {
                format!("Native overlay live surface transparent clear failed: {error}")
            })?;
    }
    Ok(())
}

/// Bug E（計画書 §4 Phase E2・ADR-013）— `ui:preview-obstruction-changed` を
/// main で受けた結果として、attach 済みの overlay child NSWindow の z-order
/// を切り替える。attach されていない `window_id` は明示的な Err を返す
/// （`clear_native_overlay_live_surface` と同じ Fail Safe 方針）。
/// GPU の live surface present はこの呼び出しの影響を受けず、動画再生は
/// 継続する（§9 設計判断 3: orderOut ではなく order 下げを採用）。
pub fn set_native_overlay_obstructed(window_id: u32, obstructed: bool) -> Result<(), String> {
    let renderers = LIVE_OVERLAY_RENDERERS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| "Native overlay live renderer registry is poisoned.".to_string())?;
    let renderer = renderers
        .get(&window_id)
        .ok_or_else(|| "Native overlay live surface is not attached.".to_string())?;
    #[cfg(target_os = "macos")]
    {
        macos_overlay::set_overlay_view_obstructed(renderer.view_handle, obstructed);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = renderer;
        let _ = obstructed;
    }
    Ok(())
}

pub fn present_overlay_shared_frame_to_live_surface(
    window_id: u32,
    request: OverlaySharedFramePresentRequest,
) -> Result<OverlaySharedFramePresentResponse, String> {
    let upload =
        copy_overlay_shared_frame_source_for_upload(&request.source, Duration::from_millis(100))?;
    let descriptor = &request.source.frame.descriptor;
    // Bug B対策 — この present に選択デコレーションが同梱されていれば
    // （body frame と同じ (objects, time) から計算された値）それを唯一の
    // 正本として使い、SELECTION_DECORATIONS map もそれで置き換える。
    // 同梱が無い場合のみ、従来どおり map の値へフォールバックする
    // （standalone setSelectionDecoration 経路との後方互換）。
    // ロック順序: decoration → renderers（set_native_overlay_selection_decoration
    // と同順。両ロックの同時保持はしない）。
    let decoration = resolve_present_selection_decoration(window_id, request.selection_decoration);
    let mut renderers = LIVE_OVERLAY_RENDERERS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| "Native overlay live renderer registry is poisoned.".to_string())?;
    let renderer = renderers
        .get_mut(&window_id)
        .ok_or_else(|| "Native overlay live surface is not attached.".to_string())?;
    let live_diagnostics =
        renderer.present_upload_frame(&upload, request.scene.as_ref(), decoration.as_ref())?;

    Ok(OverlaySharedFramePresentResponse {
        success: true,
        attached: true,
        live_diagnostics,
        release_frame: Some(OverlayReleaseFramePayload {
            memory_id: descriptor.memory_id.clone(),
            slot_index: descriptor.slot_index,
            generation: upload.generation,
            pts_frame: upload.pts_frame,
            copy_out_state: "gpuUploadFenceSignalled".to_string(),
        }),
    })
}

pub fn present_overlay_scene_to_live_surface(
    window_id: u32,
    scene: &NativeOverlaySceneSource,
    selection_decoration: Option<SelectionDecorationState>,
) -> Result<Option<OverlayLiveSurfaceDiagnostics>, String> {
    let decoration =
        resolve_present_selection_decoration(window_id, selection_decoration);
    let mut renderers = LIVE_OVERLAY_RENDERERS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| "Native overlay live renderer registry is poisoned.".to_string())?;
    let renderer = renderers
        .get_mut(&window_id)
        .ok_or_else(|| "Native overlay live surface is not attached.".to_string())?;
    renderer.present_scene(scene, decoration.as_ref())
}

/// Opt-in trace (`UXFD_OVERLAY_TRACE=1`): scene present ごとに canvas/drawable 寸法、
/// contain-fit スケール、letterbox offset、decode 縮小補正、先頭 clip の transform
/// before→after を stderr に 1 ブロック出力する。preview 縮小表示の座標系不一致を
/// 実機で切り分けるための恒久診断（既定は無効）。
fn overlay_trace_enabled() -> bool {
    std::env::var("UXFD_OVERLAY_TRACE")
        .map(|value| value == "1")
        .unwrap_or(false)
}

fn trace_scene_fit(
    scene: &NativeOverlaySceneSource,
    upload: &OverlayUploadFrame,
    fitted_snapshot: &SceneSnapshot,
    drawable_width: u32,
    drawable_height: u32,
) {
    let (fit_scale, offset_x, offset_y) = contain_fit_transform(
        scene.canvas_width,
        scene.canvas_height,
        drawable_width,
        drawable_height,
    );
    let media_dims = scene
        .media
        .iter()
        .find(|media| media.id == upload.media_id)
        .map(|media| format!("{}x{} ({})", media.width, media.height, media.kind))
        .unwrap_or_else(|| "<missing media entry>".to_string());
    eprintln!(
        "[uxfd-overlay-trace] canvas={}x{} drawable={}x{} fit_scale={fit_scale} \
         letterbox_offset=({offset_x}, {offset_y}) upload={}x{} media_declared={media_dims}",
        scene.canvas_width,
        scene.canvas_height,
        drawable_width,
        drawable_height,
        upload.width,
        upload.height,
    );
    if let (Some(before), Some(after)) =
        (scene.snapshot.clips.first(), fitted_snapshot.clips.first())
    {
        eprintln!(
            "[uxfd-overlay-trace] clip[0]={} transform before: t=({}, {}) s=({}, {}) \
             -> after: t=({}, {}) s=({}, {})",
            before.clip_id,
            before.transform.translation_x,
            before.transform.translation_y,
            before.transform.scale_x,
            before.transform.scale_y,
            after.transform.translation_x,
            after.transform.translation_y,
            after.transform.scale_x,
            after.transform.scale_y,
        );
    }
}

/// Opt-in trace (`UXFD_OVERLAY_TRACE=1`): shared frame present / デコレーション
/// only present の各段（scene 合成・prepare(テクスチャ準備+アップロード)・
/// get_current_texture 待ち・submit+present・合計）の所要時間を stderr へ出力する。
/// 実機で「デコレーション更新が重い」と感じたとき、どの段が支配的かをここで
/// 切り分ける。段の対応は `NativeWgpuFrameStageTimings` のフィールド名と揃える
/// （source_upload=prepare、acquire=get_current_texture 待ち、render=submit+present）。
fn trace_present_stage_timings(
    label: &str,
    timings: &NativeWgpuFrameStageTimings,
    outer_total: Duration,
) {
    eprintln!(
        "[uxfd-overlay-trace] {label} prepare(upload)={:?} acquire(get_current_texture)={:?} \
         render(submit+present)={:?} inner_total={:?} outer_total={outer_total:?}",
        timings.source_upload, timings.acquire, timings.render, timings.total,
    );
}

fn live_surface_readback_trace_enabled() -> bool {
    std::env::var("UXFD_NATIVE_OVERLAY_READBACK_TRACE")
        .ok()
        .as_deref()
        == Some("1")
}

/// 残像診断（`UXFD_OVERLAY_CLEAR_READBACK=1`）— clear（透明クリア）present 時に
/// 実 drawable を readback して pre/post の非透明ピクセル数を stderr へ出す。
/// 実 GPU present 経路を通るため offscreen readback では再現できない swapchain
/// 保持（Immediate present での drawable 再利用）を実機で切り分けるための恒久
/// 診断（既定は無効）。
fn clear_readback_trace_enabled() -> bool {
    std::env::var("UXFD_OVERLAY_CLEAR_READBACK").ok().as_deref() == Some("1")
}

/// 候補修正フラグ（`UXFD_OVERLAY_CLEAR_FLUSH=1`、既定オフ）— clear 時に透明
/// フレームを複数回 present し、Immediate present での swapchain drawable 保持
/// （仮説1）による残像を消す。実機で残像が消えるかで真因を確定するための toggle。
fn clear_flush_enabled() -> bool {
    std::env::var("UXFD_OVERLAY_CLEAR_FLUSH").ok().as_deref() == Some("1")
}

fn live_surface_diagnostics_from_frame_report(
    report: uxfd_native_wgpu_renderer::NativeWgpuFrameReport,
    live_readback_export_max_channel_delta: Option<u8>,
) -> OverlayLiveSurfaceDiagnostics {
    let live_readback_non_transparent_pixels = report
        .frame
        .pixels
        .chunks_exact(4)
        .filter(|pixel| pixel[3] != 0)
        .count() as u64;
    let live_readback_checksum = report
        .frame
        .pixels
        .iter()
        .fold(0_u64, |sum, value| sum.wrapping_add(*value as u64));
    OverlayLiveSurfaceDiagnostics {
        live_prepared_clip_count: report.prepared_clip_count,
        live_readback_non_transparent_pixels,
        live_readback_checksum,
        live_readback_export_max_channel_delta,
    }
}

fn compare_live_overlay_readback_with_export(
    live_readback: &RgbaFrame,
    snapshot: &SceneSnapshot,
    sources: &HashMap<String, RgbaFrame>,
) -> Result<u8, String> {
    let export_readback = pollster::block_on(render_native_wgpu_frame(
        snapshot,
        sources,
        live_readback.width,
        live_readback.height,
    ))
    .map_err(|error| format!("Native overlay export readback comparison failed: {error:?}"))?;
    let comparison = compare_rgba_frames(
        &export_readback,
        live_readback,
        ComparisonThresholds::exact(),
    );
    Ok(comparison.metrics.max_channel_delta)
}

pub fn upload_frame_to_scene_sources(
    upload: &OverlayUploadFrame,
    scene: Option<&NativeOverlaySceneSource>,
    drawable_width: u32,
    drawable_height: u32,
) -> Result<(SceneSnapshot, HashMap<String, RgbaFrame>), String> {
    let mut source_cache = NativeOverlaySourceCache::default();
    let (snapshot, sources) = upload_frame_to_scene_sources_with_cache(
        upload,
        scene,
        drawable_width,
        drawable_height,
        &mut source_cache,
    )?;
    Ok((
        snapshot,
        sources
            .into_iter()
            .map(|(media_id, frame)| (media_id, frame.as_ref().clone()))
            .collect(),
    ))
}

fn upload_frame_to_scene_sources_with_cache(
    upload: &OverlayUploadFrame,
    scene: Option<&NativeOverlaySceneSource>,
    drawable_width: u32,
    drawable_height: u32,
    source_cache: &mut NativeOverlaySourceCache,
) -> Result<(SceneSnapshot, NativeOverlaySharedSources), String> {
    let frame = RgbaFrame::from_rgba8(upload.width, upload.height, upload.pixels.clone())
        .map_err(|error| format!("Native overlay upload frame is invalid: {error:?}"))?;
    let mut sources = scene
        .map(|scene| load_overlay_native_sources_for_scene_cached(scene, source_cache))
        .transpose()?
        .unwrap_or_default();
    sources.insert(upload.media_id.clone(), Arc::new(frame));
    if let Some(scene) = scene {
        // preview 経路の decode は速度のため media 宣言サイズより小さい proxy 解像度へ
        // ダウンスケールされ得る（例: maxDecodeEdge=720 で 1920x1080 → 720x405）。
        // clip.transform.scale は「media 宣言サイズの source を表示サイズへ拡縮する」
        // 前提の値なので、decode 縮小比（media 宣言サイズ / upload 実寸）を掛け直して
        // シーン座標系での表示サイズを復元する。rust-backend の CPU fast path
        // （cpu_simple_video.rs の fit_scale_x = media.width / source.width）と同じ補正。
        let compensated_snapshot =
            compensate_upload_decode_downscale(&scene.snapshot, scene, upload);
        let fitted_snapshot = fit_scene_snapshot_to_drawable(
            &compensated_snapshot,
            scene.canvas_width,
            scene.canvas_height,
            drawable_width,
            drawable_height,
        );
        if overlay_trace_enabled() {
            trace_scene_fit(
                scene,
                upload,
                &fitted_snapshot,
                drawable_width,
                drawable_height,
            );
        }
        return Ok((fitted_snapshot, sources));
    }

    let scale_x = if upload.width == 0 {
        1.0
    } else {
        drawable_width as f32 / upload.width as f32
    };
    let scale_y = if upload.height == 0 {
        1.0
    } else {
        drawable_height as f32 / upload.height as f32
    };

    let mut transform = Transform::identity();
    transform.scale_x = scale_x;
    transform.scale_y = scale_y;

    let snapshot = SceneSnapshot {
        frame_index: upload.pts_frame,
        colour: ColourPipeline::rec709_sdr_linear(),
        clips: vec![EvaluatedClip {
            clip_id: "native-overlay-upload".to_string(),
            track_id: "native-overlay-track".to_string(),
            media_id: upload.media_id.clone(),
            source_frame: upload.pts_frame,
            z_index: 0,
            transform,
            opacity: 1.0,
            effects: Vec::new(),
        }],
    };

    Ok((snapshot, sources))
}

/// preview decode がダウンスケールした upload frame（`upload.width/height`）と
/// media 宣言サイズ（`scene.media` の該当 entry）の比を、その media を参照する
/// 全 clip の scale に掛け直す。source == media 宣言サイズなら比は 1.0 で無変換。
/// media entry が見つからない・寸法が 0 の場合も無変換で返す（Fail Safe）。
fn compensate_upload_decode_downscale(
    snapshot: &SceneSnapshot,
    scene: &NativeOverlaySceneSource,
    upload: &OverlayUploadFrame,
) -> SceneSnapshot {
    let Some(media) = scene.media.iter().find(|media| media.id == upload.media_id) else {
        return snapshot.clone();
    };
    if media.kind != "Video"
        || upload.width == 0
        || upload.height == 0
        || media.width == 0
        || media.height == 0
    {
        return snapshot.clone();
    }

    let decode_scale_x = media.width as f32 / upload.width as f32;
    let decode_scale_y = media.height as f32 / upload.height as f32;
    let mut compensated = snapshot.clone();
    for clip in &mut compensated.clips {
        if clip.media_id != upload.media_id {
            continue;
        }
        clip.transform.scale_x *= decode_scale_x;
        clip.transform.scale_y *= decode_scale_y;
    }
    compensated
}

/// project 座標系（`canvas_width`/`canvas_height` 基準の絶対ピクセル座標）を
/// drawable 座標系へ contain-fit 変換するための `(fit_scale, offset_x, offset_y)`
/// を計算する共通ヘルパー。scene 本体（`fit_scene_snapshot_to_drawable`）・
/// 選択デコレーション（`build_selection_decoration_clips`）・診断トレース
/// （`trace_scene_fit`）の 3 箇所が個別に同種の式を持っていたことが、
/// 「fit_scale だけ 1.0 にフォールバックし offset は 0 の canvas サイズで
/// 計算してしまう」非対称バグの温床になっていた。canvas サイズが 0 のときは
/// アスペクト比が定義できない Fail Safe ケースとして、fit_scale=1.0 かつ
/// offset=(0,0) の完全な無変換（呼び出し元が transform を素通しできる値）を
/// 返す。
fn contain_fit_transform(
    canvas_width: u32,
    canvas_height: u32,
    drawable_width: u32,
    drawable_height: u32,
) -> (f64, f64, f64) {
    if canvas_width == 0 || canvas_height == 0 {
        return (1.0, 0.0, 0.0);
    }
    let fit_scale = (drawable_width as f64 / canvas_width as f64)
        .min(drawable_height as f64 / canvas_height as f64);
    let offset_x = (drawable_width as f64 - canvas_width as f64 * fit_scale) * 0.5;
    let offset_y = (drawable_height as f64 - canvas_height as f64 * fit_scale) * 0.5;
    (fit_scale, offset_x, offset_y)
}

/// `scene.snapshot` の `clips[].transform` はプロジェクト解像度（`canvas_width`/
/// `canvas_height`）基準の絶対ピクセル座標である。一方 `solid_composite.wgsl` の
/// フラグメントシェーダーは `translation_x/y`・`scale_x/y` を drawable の
/// 出力ピクセル座標としてそのまま解釈する（NDC 正規化を行わない）。
///
/// native overlay の drawable サイズ（attach rect 由来。例 1564x880）は
/// プロジェクト解像度（例 1920x1080）と一致しない場合が常態であり、fit 変換を
/// 挟まないとシーンが drawable の左上に「実寸」で描かれ、はみ出た分は切り取られる
/// （実機で観測された「pane 左上 1/4 に半分スケール表示」の真因）。
///
/// ここでは export 経路（drawable = プロジェクト解像度）と同じ見た目を保つため、
/// アスペクト比を維持したまま drawable に収まる最大スケール（contain-fit）を
/// 計算し、中央寄せ（letterbox/pillarbox）した上で各 clip の transform に適用する。
/// 等方スケールなので回転角・アスペクト比には影響しない。canvas サイズが 0 の
/// ときは `contain_fit_transform` の Fail Safe（無変換）に従い、そのまま返す。
fn fit_scene_snapshot_to_drawable(
    snapshot: &SceneSnapshot,
    canvas_width: u32,
    canvas_height: u32,
    drawable_width: u32,
    drawable_height: u32,
) -> SceneSnapshot {
    if canvas_width == 0 || canvas_height == 0 {
        return snapshot.clone();
    }

    let (fit_scale, offset_x, offset_y) =
        contain_fit_transform(canvas_width, canvas_height, drawable_width, drawable_height);
    let fit_scale = fit_scale as f32;
    let offset_x = offset_x as f32;
    let offset_y = offset_y as f32;

    let mut fitted = snapshot.clone();
    for clip in &mut fitted.clips {
        clip.transform.translation_x = clip.transform.translation_x * fit_scale + offset_x;
        clip.transform.translation_y = clip.transform.translation_y * fit_scale + offset_y;
        clip.transform.scale_x *= fit_scale;
        clip.transform.scale_y *= fit_scale;
    }
    fitted
}

pub fn load_overlay_image_sources_for_scene(
    scene: &NativeOverlaySceneSource,
) -> Result<HashMap<String, RgbaFrame>, String> {
    // `media.width`/`media.height` は TS の `mediaDimensionsForObject` 設計上 image clip の
    // display size（タイムライン上の表示サイズ）であり、PNG のネイティブ解像度ではない。
    // 一方 Rust 側の `prepare_clip` は `source.width/height` を `RenderParams.source_width/source_height`
    // にそのまま渡し、`transform.scale_x/scale_y` で display サイズへ拡縮する設計で動く。
    // よって display size と PNG native size の不一致を validation で reject する以前の設計は
    // 鶏が先か卵が先かの矛盾を抱えていた。PNG の native size をそのまま `sources` に登録し、
    // 後段の transform に resampling を任せるのが正しい。
    let mut sources = HashMap::new();
    for media in &scene.media {
        if media.kind != "Image" {
            continue;
        }
        let frame = load_rgba_png(&media.source)
            .map_err(|error| format!("Native overlay image source load failed: {error:?}"))?;
        sources.insert(media.id.clone(), frame);
    }
    Ok(sources)
}

pub fn load_overlay_native_sources_for_scene(
    scene: &NativeOverlaySceneSource,
) -> Result<HashMap<String, RgbaFrame>, String> {
    let mut cache = NativeOverlaySourceCache::default();
    Ok(load_overlay_native_sources_for_scene_cached(scene, &mut cache)?
        .into_iter()
        .map(|(media_id, frame)| (media_id, frame.as_ref().clone()))
        .collect())
}

fn load_overlay_native_sources_for_scene_cached(
    scene: &NativeOverlaySceneSource,
    cache: &mut NativeOverlaySourceCache,
) -> Result<NativeOverlaySharedSources, String> {
    let mut sources = HashMap::new();
    let mut touched_media_ids = HashSet::new();
    for media in &scene.media {
        let Some(kind) = overlay_media_kind(&media.kind) else {
            continue;
        };
        let source_frame = scene
            .snapshot
            .clips
            .iter()
            .find(|clip| clip.media_id == media.id)
            .map(|clip| clip.source_frame)
            .unwrap_or(scene.snapshot.frame_index);
        let reference = SceneMediaReference {
            id: media.id.clone(),
            kind: kind.clone(),
            source: media.source.clone(),
            width: media.width,
            height: media.height,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };
        let revision = native_overlay_media_content_revision(media, source_frame);
        if let Some(revision) = revision {
            if let Some(frame) = cache.get(&media.id, revision) {
                touched_media_ids.insert(media.id.clone());
                sources.insert(media.id.clone(), frame);
                continue;
            }
        }
        let frame = if kind == MediaKind::Image {
            load_rgba_png(&media.source)
                .map_err(|error| format!("Native overlay image source load failed: {error:?}"))?
        } else if let Some(frame) = build_native_generated_source_frame(&reference, source_frame)? {
            frame
        } else {
            continue;
        };
        let frame = Arc::new(frame);
        if let Some(revision) = revision {
            cache.insert(media.id.clone(), revision, Arc::clone(&frame));
            touched_media_ids.insert(media.id.clone());
        }
        if sources.insert(media.id.clone(), frame).is_some() {
            return Err(format!("Duplicate native overlay source mediaId '{}'", media.id));
        }
    }
    cache.evict_stale(&touched_media_ids);
    Ok(sources)
}

fn overlay_media_kind(kind: &str) -> Option<MediaKind> {
    Some(match kind {
        "Video" => MediaKind::Video,
        "Image" => MediaKind::Image,
        "SolidColour" => MediaKind::SolidColour,
        "GeneratedGradient" => MediaKind::GeneratedGradient,
        "GeneratedAudioWaveform" => MediaKind::GeneratedAudioWaveform,
        "GeneratedAudioSphere" => MediaKind::GeneratedAudioSphere,
        "GeneratedParticle" => MediaKind::GeneratedParticle,
        "GeneratedBarcode" => MediaKind::GeneratedBarcode,
        "GeneratedPuzzlePiece" => MediaKind::GeneratedPuzzlePiece,
        "GeneratedColourWheel" => MediaKind::GeneratedColourWheel,
        "GeneratedGourd" => MediaKind::GeneratedGourd,
        "GeneratedGear" => MediaKind::GeneratedGear,
        "GeneratedTrackBar" => MediaKind::GeneratedTrackBar,
        "GeneratedPieChart" => MediaKind::GeneratedPieChart,
        "GeneratedHistogram" => MediaKind::GeneratedHistogram,
        "GeneratedToneCurve" => MediaKind::GeneratedToneCurve,
        "GeneratedGetColorDots" => MediaKind::GeneratedGetColorDots,
        "GeneratedHksyCheckerGrid" => MediaKind::GeneratedHksyCheckerGrid,
        "GeneratedRegionFrame" => MediaKind::GeneratedRegionFrame,
        "GeneratedSimpleTube" => MediaKind::GeneratedSimpleTube,
        "GeneratedSphereDots" => MediaKind::GeneratedSphereDots,
        "GeneratedSphericalField" => MediaKind::GeneratedSphericalField,
        "GeneratedSunburst" => MediaKind::GeneratedSunburst,
        "GeneratedCircularArrow" => MediaKind::GeneratedCircularArrow,
        "GeneratedTriangleBracket" => MediaKind::GeneratedTriangleBracket,
        "GeneratedTartanCheck" => MediaKind::GeneratedTartanCheck,
        "GeneratedHoundstooth" => MediaKind::GeneratedHoundstooth,
        "GeneratedYagasuri" => MediaKind::GeneratedYagasuri,
        "GeneratedPaperAirplane" => MediaKind::GeneratedPaperAirplane,
        "GeneratedAsanohaPattern" => MediaKind::GeneratedAsanohaPattern,
        "GeneratedFocusLinesPlus" => MediaKind::GeneratedFocusLinesPlus,
        "GeneratedRandomLineEx" => MediaKind::GeneratedRandomLineEx,
        "GeneratedContourTrace" => MediaKind::GeneratedContourTrace,
        "GeneratedDisplacementPoly" => MediaKind::GeneratedDisplacementPoly,
        "GeneratedPlainEffectorLine" => MediaKind::GeneratedPlainEffectorLine,
        "GeneratedHologram" => MediaKind::GeneratedHologram,
        "GeneratedProtractor" => MediaKind::GeneratedProtractor,
        "GeneratedShakingPolygon" => MediaKind::GeneratedShakingPolygon,
        "GeneratedShatteredSphere" => MediaKind::GeneratedShatteredSphere,
        "GeneratedShape" => MediaKind::GeneratedShape,
        "Psd" => MediaKind::Psd,
        "Text" => MediaKind::Text,
        _ => return None,
    })
}

fn native_overlay_media_content_revision(
    media: &NativeOverlaySceneMedia,
    source_frame: u64,
) -> Option<u64> {
    let kind = overlay_media_kind(&media.kind)?;
    if matches!(
        kind,
        MediaKind::Video | MediaKind::GeneratedAudioWaveform | MediaKind::GeneratedAudioSphere
    ) {
        return None;
    }

    let mut hasher = DefaultHasher::new();
    media.id.hash(&mut hasher);
    media.kind.hash(&mut hasher);
    media.source.hash(&mut hasher);
    media.width.hash(&mut hasher);
    media.height.hash(&mut hasher);

    if matches!(kind, MediaKind::Image | MediaKind::Psd) {
        hash_local_file_metadata(&media.source, &mut hasher)?;
    }
    if kind == MediaKind::GeneratedGetColorDots {
        hash_getcolor_source_image_metadata(&media.source, &mut hasher)?;
    }
    if matches!(
        kind,
        MediaKind::GeneratedParticle
            | MediaKind::GeneratedFocusLinesPlus
            | MediaKind::GeneratedShakingPolygon
            | MediaKind::GeneratedShatteredSphere
    ) {
        source_frame.hash(&mut hasher);
    }
    Some(hasher.finish())
}

fn native_overlay_source_content_revisions_for_scene(
    scene: &NativeOverlaySceneSource,
) -> HashMap<String, u64> {
    scene
        .media
        .iter()
        .filter_map(|media| {
            let source_frame = scene
                .snapshot
                .clips
                .iter()
                .find(|clip| clip.media_id == media.id)
                .map(|clip| clip.source_frame)
                .unwrap_or(scene.snapshot.frame_index);
            native_overlay_media_content_revision(media, source_frame)
                .map(|revision| (media.id.clone(), revision))
        })
        .collect()
}

fn hash_getcolor_source_image_metadata(source: &str, hasher: &mut DefaultHasher) -> Option<()> {
    let parsed: serde_json::Value = serde_json::from_str(source).ok()?;
    let Some(source_image) = parsed.get("source_image").and_then(|value| value.as_str()) else {
        return Some(());
    };
    hash_local_file_metadata(source_image, hasher)
}

fn hash_local_file_metadata(source: &str, hasher: &mut DefaultHasher) -> Option<()> {
    let path = source.strip_prefix("file://").unwrap_or(source);
    let metadata = fs::metadata(path).ok()?;
    metadata.len().hash(hasher);
    metadata.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.hash(hasher);
    Some(())
}

fn scene_snapshot_from_payload(
    payload: NativeOverlaySceneSnapshotPayload,
) -> Result<SceneSnapshot, String> {
    Ok(SceneSnapshot {
        frame_index: safe_u64_from_f64("snapshot.frameIndex", payload.frame_index)?,
        colour: ColourPipeline {
            profile: payload.colour.profile,
            working_space: payload.colour.working_space,
            alpha: payload.colour.alpha,
        },
        clips: payload
            .clips
            .into_iter()
            .map(evaluated_clip_from_payload)
            .collect::<Result<Vec<_>, _>>()?,
    })
}

fn evaluated_clip_from_payload(
    payload: NativeOverlayEvaluatedClipPayload,
) -> Result<EvaluatedClip, String> {
    let effects = payload
        .effects_json
        .as_deref()
        .map(serde_json::from_str::<Vec<Effect>>)
        .transpose()
        .map_err(|error| format!("clip.effectsJson is invalid: {error}"))?
        .unwrap_or_default();
    Ok(EvaluatedClip {
        clip_id: payload.clip_id,
        track_id: payload.track_id,
        media_id: payload.media_id,
        source_frame: safe_u64_from_f64("clip.sourceFrame", payload.source_frame)?,
        z_index: payload.z_index,
        transform: Transform {
            translation_x: payload.transform.translation_x as f32,
            translation_y: payload.transform.translation_y as f32,
            scale_x: payload.transform.scale_x as f32,
            scale_y: payload.transform.scale_y as f32,
            rotation_degrees: payload.transform.rotation_degrees as f32,
            sampling: sampling_mode_from_payload(payload.transform.sampling.as_deref()),
        },
        opacity: payload.opacity as f32,
        effects,
    })
}

fn sampling_mode_from_payload(value: Option<&str>) -> SamplingMode {
    match value {
        Some("bilinear") | Some("Bilinear") => SamplingMode::Bilinear,
        _ => SamplingMode::Nearest,
    }
}

fn scene_media_from_payload(payload: NativeOverlaySceneMediaPayload) -> NativeOverlaySceneMedia {
    NativeOverlaySceneMedia {
        id: payload.id,
        kind: payload.kind,
        source: payload.source,
        width: payload.width,
        height: payload.height,
        source_rate: payload.source_rate.map(|rate| Fps {
            numerator: rate.numerator,
            denominator: rate.denominator,
        }),
    }
}

#[cfg(target_os = "macos")]
fn platform_capabilities() -> NativeOverlayCapabilities {
    NativeOverlayCapabilities {
        available: true,
        reason: None,
    }
}

#[cfg(not(target_os = "macos"))]
fn platform_capabilities() -> NativeOverlayCapabilities {
    NativeOverlayCapabilities {
        available: false,
        reason: Some("Native overlay preview is only available on macOS.".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    #[test]
    fn scene_media_payload_preserves_video_source_rate() {
        let media = scene_media_from_payload(NativeOverlaySceneMediaPayload {
            id: "video-1".to_string(),
            kind: "Video".to_string(),
            source: "/tmp/video.mov".to_string(),
            width: 1920,
            height: 1080,
            source_rate: Some(NativeOverlayFpsPayload {
                numerator: 30_000,
                denominator: 1_001,
            }),
        });

        assert_eq!(
            media.source_rate,
            Some(Fps {
                numerator: 30_000,
                denominator: 1_001,
            })
        );
    }

    static SHM_NAME_COUNTER: AtomicU64 = AtomicU64::new(0);

    #[test]
    fn evaluated_clip_payload_preserves_rust_core_effects_for_direct_present() {
        let clip = evaluated_clip_from_payload(NativeOverlayEvaluatedClipPayload {
            clip_id: "clip-effect".to_string(),
            track_id: "track-1".to_string(),
            media_id: "generated-getcolor".to_string(),
            source_frame: 12.0,
            z_index: 3,
            transform: NativeOverlayTransformPayload {
                translation_x: 10.0,
                translation_y: 20.0,
                scale_x: 1.0,
                scale_y: 1.0,
                rotation_degrees: 0.0,
                sampling: Some("bilinear".to_string()),
            },
            opacity: 0.8,
            effects_json: Some(
                r#"[{"ColourCorrection":{"brightness":1.1,"contrast":0.9,"saturation":1.2,"hue_degrees":15.0}}]"#
                    .to_string(),
            ),
        })
        .expect("valid rust-core effect JSON");

        assert_eq!(
            clip.effects,
            vec![Effect::ColourCorrection {
                brightness: 1.1,
                contrast: 0.9,
                saturation: 1.2,
                hue_degrees: 15.0,
            }]
        );
    }

    #[test]
    fn overlay_layer_contract_uses_bgra8_unorm_and_scaled_drawable_size() {
        let contract = build_overlay_layer_contract(&NativeOverlayAttachPayload {
            window_id: 42,
            native_window_handle: Some(napi::bindgen_prelude::Buffer::from(vec![
                1, 2, 3, 4, 5, 6, 7, 8,
            ])),
            x: 12.0,
            y: 34.0,
            width: 640.0,
            height: 360.0,
            scale_factor: 2.0,
        })
        .expect("valid overlay contract");

        assert_eq!(contract.pixel_format, "bgra8Unorm");
        assert_eq!(contract.view_x, 12.0);
        assert_eq!(contract.view_y, 34.0);
        assert_eq!(contract.view_width, 640.0);
        assert_eq!(contract.view_height, 360.0);
        assert_eq!(contract.drawable_width, 1280);
        assert_eq!(contract.drawable_height, 720);
        // HiDPI 環境の CAMetalLayer は `contentsScale` を明示設定しないと既定値 1.0 のままになり、
        // drawable のうち bounds × 1.0 ピクセル分（=左下 1/4）しか画面に貼り出されない。
        // `contents_scale` は `scale_factor` をそのまま伝搬し、live attach で layer に反映する正本値である。
        assert_eq!(contract.contents_scale, 2.0);
    }

    #[test]
    fn overlay_layer_contract_contents_scale_matches_payload_scale_factor() {
        let contract = build_overlay_layer_contract(&NativeOverlayAttachPayload {
            window_id: 7,
            native_window_handle: Some(napi::bindgen_prelude::Buffer::from(vec![
                1, 2, 3, 4, 5, 6, 7, 8,
            ])),
            x: 0.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
            scale_factor: 1.5,
        })
        .expect("valid overlay contract");

        assert_eq!(contract.contents_scale, 1.5);
        assert_eq!(contract.drawable_width, 2880);
        assert_eq!(contract.drawable_height, 1620);
    }

    #[test]
    fn overlay_layer_contract_rejects_non_positive_geometry() {
        let error = build_overlay_layer_contract(&NativeOverlayAttachPayload {
            window_id: 42,
            native_window_handle: Some(napi::bindgen_prelude::Buffer::from(vec![
                1, 2, 3, 4, 5, 6, 7, 8,
            ])),
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 360.0,
            scale_factor: 2.0,
        })
        .expect_err("zero width must be rejected");

        assert_eq!(
            error,
            "Native overlay size and scale factor must be positive."
        );
    }

    #[test]
    fn native_window_handle_bytes_are_required_for_attach() {
        let payload = NativeOverlayAttachPayload {
            window_id: 42,
            native_window_handle: Some(napi::bindgen_prelude::Buffer::from(vec![
                1, 2, 3, 4, 5, 6, 7, 8,
            ])),
            x: 0.0,
            y: 0.0,
            width: 320.0,
            height: 180.0,
            scale_factor: 2.0,
        };

        assert_eq!(
            native_window_handle_bytes(&payload).expect("native handle bytes"),
            vec![1, 2, 3, 4, 5, 6, 7, 8],
        );
    }

    #[test]
    fn native_window_handle_bytes_reject_missing_handle() {
        let payload = NativeOverlayAttachPayload {
            window_id: 42,
            native_window_handle: None,
            x: 0.0,
            y: 0.0,
            width: 320.0,
            height: 180.0,
            scale_factor: 2.0,
        };

        assert_eq!(
            native_window_handle_bytes(&payload).expect_err("missing handle must be rejected"),
            "Native overlay window handle is required.",
        );
    }

    #[test]
    fn detach_native_window_handle_bytes_are_required_for_detach() {
        let payload = NativeOverlayDetachPayload {
            window_id: 42,
            native_window_handle: Some(napi::bindgen_prelude::Buffer::from(vec![
                1, 2, 3, 4, 5, 6, 7, 8,
            ])),
        };

        assert_eq!(
            detach_native_window_handle_bytes(&payload).expect("native handle bytes"),
            vec![1, 2, 3, 4, 5, 6, 7, 8],
        );
    }

    #[test]
    fn overlay_shared_frame_copy_preserves_pixels_and_lease_generation() {
        let memory_id = unique_shm_name();
        let pixels = vec![255, 0, 0, 255, 0, 0, 255, 255];
        let ring = uxfd_shared_memory_spike::PosixSharedRing::create_with_slot_count(
            &memory_id,
            2,
            pixels.len(),
        )
        .expect("create overlay source ring");
        ring.write_frame(7, &pixels)
            .expect("write overlay source frame");

        let upload = copy_overlay_shared_frame_source_for_upload(
            &OverlaySharedFrameSource {
                media_id: "decoded-video".to_string(),
                slot_count: 2,
                frame: OverlaySharedFrame {
                    descriptor: OverlaySharedFrameDescriptor {
                        memory_id,
                        slot_index: 0,
                        generation: 3,
                        byte_offset: 0,
                        byte_len: pixels.len() as u32,
                        width: 2,
                        height: 1,
                        stride_bytes: 8,
                        format: "rgba8Srgb".to_string(),
                    },
                    pts_frame: 7,
                },
            },
            std::time::Duration::from_millis(100),
        )
        .expect("copy overlay shared frame source");

        assert_eq!(upload.media_id, "decoded-video");
        assert_eq!(upload.width, 2);
        assert_eq!(upload.height, 1);
        assert_eq!(upload.generation, 3);
        assert_eq!(upload.pts_frame, 7);
        assert_eq!(upload.pixels, pixels);
    }

    #[test]
    fn overlay_shared_frame_copy_accepts_slot_relative_byte_offset() {
        let memory_id = unique_shm_name();
        let first_pixels = vec![0, 0, 0, 255];
        let second_pixels = vec![255, 128, 64, 255];
        let ring = uxfd_shared_memory_spike::PosixSharedRing::create_with_slot_count(
            &memory_id,
            2,
            second_pixels.len(),
        )
        .expect("create overlay source ring");
        ring.write_frame(1, &first_pixels)
            .expect("write first overlay source frame");
        ring.write_frame(2, &second_pixels)
            .expect("write second overlay source frame");

        let upload = copy_overlay_shared_frame_source_for_upload(
            &OverlaySharedFrameSource {
                media_id: "decoded-video".to_string(),
                slot_count: 2,
                frame: OverlaySharedFrame {
                    descriptor: OverlaySharedFrameDescriptor {
                        memory_id,
                        slot_index: 1,
                        generation: 3,
                        byte_offset: second_pixels.len() as u32,
                        byte_len: second_pixels.len() as u32,
                        width: 1,
                        height: 1,
                        stride_bytes: 4,
                        format: "rgba8Srgb".to_string(),
                    },
                    pts_frame: 2,
                },
            },
            std::time::Duration::from_millis(100),
        )
        .expect("copy overlay shared frame source from non-zero slot offset");

        assert_eq!(upload.pixels, second_pixels);
        assert_eq!(upload.generation, 3);
    }

    #[test]
    fn present_shared_frame_returns_release_payload_after_upload_copy() {
        let memory_id = unique_shm_name();
        let pixels = vec![32, 64, 96, 255];
        let ring = uxfd_shared_memory_spike::PosixSharedRing::create_with_slot_count(
            &memory_id,
            1,
            pixels.len(),
        )
        .expect("create overlay present ring");
        ring.write_frame(9, &pixels)
            .expect("write overlay present frame");

        let response = present_overlay_shared_frame_for_test(OverlaySharedFramePresentRequest {
            source: OverlaySharedFrameSource {
                media_id: "decoded-video".to_string(),
                slot_count: 1,
                frame: OverlaySharedFrame {
                    descriptor: OverlaySharedFrameDescriptor {
                        memory_id: memory_id.clone(),
                        slot_index: 0,
                        generation: 4,
                        byte_offset: 0,
                        byte_len: pixels.len() as u32,
                        width: 1,
                        height: 1,
                        stride_bytes: 4,
                        format: "rgba8Srgb".to_string(),
                    },
                    pts_frame: 9,
                },
            },
            scene: None,
            selection_decoration: None,
        })
        .expect("present overlay shared frame");

        assert!(response.success);
        assert!(response.attached);
        assert_eq!(
            response.release_frame,
            Some(OverlayReleaseFramePayload {
                memory_id,
                slot_index: 0,
                generation: 4,
                pts_frame: 9,
                copy_out_state: "gpuUploadFenceSignalled".to_string(),
            })
        );
    }

    #[test]
    fn overlay_image_source_loader_keeps_native_png_size_when_declared_size_differs() {
        // TS 側の `mediaDimensionsForObject` は image clip に対して `object.width/height`
        // （タイムライン上の display size）をそのまま渡す設計で、PNG のネイティブ解像度ではない。
        // 一方 Rust 側の `prepare_clip` は `source.width`/`source.height` を `RenderParams.source_width/source_height`
        // にそのまま渡し、`transform.scale_x/scale_y` で display サイズへ拡縮する想定で動く。
        // よって native overlay も display size と PNG native size の不一致を受け入れ、
        // PNG の native size をそのまま `sources` に登録するのが正しい契約。
        let image_path = unique_temp_path("overlay-image-display-vs-native", "png");
        let image = RgbaFrame::from_rgba8(2, 1, vec![255, 0, 0, 255, 0, 0, 255, 255])
            .expect("valid image frame");
        uxfd_golden_harness::save_rgba_png(&image_path, &image).expect("save image fixture");

        let sources = load_overlay_image_sources_for_scene(&NativeOverlaySceneSource {
            snapshot: SceneSnapshot {
                frame_index: 0,
                colour: ColourPipeline::rec709_sdr_linear(),
                clips: Vec::new(),
            },
            media: vec![NativeOverlaySceneMedia {
                id: "image-1".to_string(),
                kind: "Image".to_string(),
                source: image_path.to_string_lossy().to_string(),
                // 意図的に display size と native size を不一致にする。
                // display=1x1 / native=2x1。current 実装は ここで Err を返すが、
                // 修正後は PNG の native size をそのまま登録すべき。
                width: 1,
                height: 1,
                source_rate: None,
            }],
            canvas_width: 1920,
            canvas_height: 1080,
        })
        .expect("image source must load even when display size differs from PNG native size");

        let frame = sources
            .get("image-1")
            .expect("image source must be registered under its media id");
        assert_eq!(frame.width, 2);
        assert_eq!(frame.height, 1);
        let _ = std::fs::remove_file(image_path);
    }

    #[test]
    fn overlay_native_source_loader_builds_getcolor_for_direct_mixed_scene_present() {
        let scene = NativeOverlaySceneSource {
            snapshot: SceneSnapshot {
                frame_index: 236,
                colour: ColourPipeline::rec709_sdr_linear(),
                clips: vec![
                    EvaluatedClip {
                        clip_id: "video-clip".to_string(),
                        track_id: "video-track".to_string(),
                        media_id: "video-media".to_string(),
                        source_frame: 236,
                        z_index: 0,
                        transform: Transform::identity(),
                        opacity: 1.0,
                        effects: Vec::new(),
                    },
                    EvaluatedClip {
                        clip_id: "getcolor-clip".to_string(),
                        track_id: "getcolor-track".to_string(),
                        media_id: "getcolor-media".to_string(),
                        source_frame: 0,
                        z_index: 1,
                        transform: Transform::identity(),
                        opacity: 1.0,
                        effects: Vec::new(),
                    },
                ],
            },
            media: vec![
                NativeOverlaySceneMedia {
                    id: "video-media".to_string(),
                    kind: "Video".to_string(),
                    source: "/tmp/video.mov".to_string(),
                    width: 1920,
                    height: 1080,
                    source_rate: None,
                },
                NativeOverlaySceneMedia {
                    id: "getcolor-media".to_string(),
                    kind: "GeneratedGetColorDots".to_string(),
                    source: concat!(
                        r##"{"generator":"getcolor-v2r-dot-field","columns":4,"rows":2,"##,
                        r##""dot_size":18.0,"size_influence":0.65,"luminance_influence":0.7,"##,
                        r##""hue_shift_degrees":0.0,"alternate_rows":true,"##,
                        r##""foreground_colour":"#ffffff","secondary_colour":"#36c2ff","##,
                        r##""background_colour":"#000000","seed":93}"##
                    )
                    .to_string(),
                    width: 160,
                    height: 90,
                    source_rate: None,
                },
            ],
            canvas_width: 1920,
            canvas_height: 1080,
        };

        let sources = load_overlay_native_sources_for_scene(&scene)
            .expect("direct CAMetalLayer scene must build GetColor without a completed-frame upload");

        assert!(
            !sources.contains_key("video-media"),
            "video pixels are supplied by the decoded-frame upload"
        );
        let getcolor = sources
            .get("getcolor-media")
            .expect("GetColor source must be generated in the native-overlay process");
        assert_eq!((getcolor.width, getcolor.height), (160, 90));
        assert!(
            getcolor
                .pixels
                .chunks_exact(4)
                .any(|pixel| pixel[2] > 200 && pixel[3] == 255),
            "generated source must contain visible blue/cyan dots"
        );
    }

    #[test]
    fn overlay_native_source_cache_reuses_static_generated_frames_and_evicts_idle_media() {
        let scene = NativeOverlaySceneSource {
            snapshot: SceneSnapshot {
                frame_index: 0,
                colour: ColourPipeline::rec709_sdr_linear(),
                clips: vec![EvaluatedClip {
                    clip_id: "hksy-clip".to_string(),
                    track_id: "track".to_string(),
                    media_id: "hksy-media".to_string(),
                    source_frame: 0,
                    z_index: 0,
                    transform: Transform::identity(),
                    opacity: 1.0,
                    effects: Vec::new(),
                }],
            },
            media: vec![NativeOverlaySceneMedia {
                id: "hksy-media".to_string(),
                kind: "GeneratedHksyCheckerGrid".to_string(),
                source: concat!(
                    r##"{"generator":"hksy-checker-grid","cell_size":8,"line_width":1,"##,
                    r##""checker_enabled":true,"grid_enabled":true,"foreground_colour":"#ffffff","##,
                    r##""secondary_colour":"#333333","background_colour":"#000000"}"##
                )
                .to_string(),
                width: 64,
                height: 36,
                source_rate: None,
            }],
            canvas_width: 64,
            canvas_height: 36,
        };
        let mut cache = NativeOverlaySourceCache::default();

        let first = load_overlay_native_sources_for_scene_cached(&scene, &mut cache)
            .expect("first static generated source load must succeed");
        assert_eq!(cache.stats(), (0, 1));

        let second = load_overlay_native_sources_for_scene_cached(&scene, &mut cache)
            .expect("second static generated source load must succeed");
        assert_eq!(
            cache.stats(),
            (1, 1),
            "unchanged static generated media must reuse its CPU source frame"
        );
        assert_eq!(first, second);
        assert!(
            Arc::ptr_eq(
                first.get("hksy-media").expect("first frame must exist"),
                second.get("hksy-media").expect("second frame must exist"),
            ),
            "CPU source cache hit must share the same RgbaFrame allocation instead of cloning pixels"
        );

        let empty_scene = NativeOverlaySceneSource {
            snapshot: SceneSnapshot {
                frame_index: 1,
                colour: ColourPipeline::rec709_sdr_linear(),
                clips: Vec::new(),
            },
            media: Vec::new(),
            canvas_width: 64,
            canvas_height: 36,
        };
        for _ in 0..=NATIVE_OVERLAY_SOURCE_CACHE_IDLE_FRAME_LIMIT {
            load_overlay_native_sources_for_scene_cached(&empty_scene, &mut cache)
                .expect("empty scene cache sweep must succeed");
        }
        assert_eq!(cache.len(), 0, "idle generated source must be evicted");
    }

    #[test]
    fn getcolor_source_image_metadata_changes_native_overlay_media_revision() {
        let unique = format!(
            "uxfd-getcolor-cache-revision-{}-{}",
            std::process::id(),
            SHM_NAME_COUNTER.fetch_add(1, Ordering::Relaxed),
        );
        let source_image = std::env::temp_dir().join(unique);
        std::fs::write(&source_image, [1_u8, 2, 3]).expect("write initial source image marker");
        let media = NativeOverlaySceneMedia {
            id: "getcolor-media".to_string(),
            kind: "GeneratedGetColorDots".to_string(),
            source: format!(
                r##"{{"generator":"getcolor-v2r-dot-field","columns":2,"rows":2,"dot_size":4,"size_influence":0.5,"luminance_influence":0.5,"hue_shift_degrees":0,"alternate_rows":false,"foreground_colour":"#ffffff","secondary_colour":"#000000","background_colour":"#000000","seed":1,"source_image":"{}"}}"##,
                source_image.display(),
            ),
            width: 16,
            height: 16,
            source_rate: None,
        };
        let first = native_overlay_media_content_revision(&media, 0)
            .expect("GetColor source image metadata must produce a revision");
        std::fs::write(&source_image, [1_u8, 2, 3, 4])
            .expect("change source image marker size");
        let second = native_overlay_media_content_revision(&media, 0)
            .expect("changed GetColor source image metadata must produce a revision");
        let _ = std::fs::remove_file(source_image);

        assert_ne!(
            first, second,
            "GetColor cache revision must include source_image metadata, not only its JSON path"
        );
    }

    #[test]
    fn build_empty_scene_snapshot_for_transparent_clear_yields_no_clips_and_no_sources() {
        // Bug D — `clear_native_overlay_live_surface` は空 scene を live surface に present し、
        // `LoadOp::Clear(wgpu::Color::TRANSPARENT)` によって drawable を全 pixel alpha=0 で
        // 上書きする方針。専用 clear render logic は追加しない（既存の
        // `present_scene_to_surface_texture` が空 clips でも同じ clear pass を走らせるため）。
        // よって呼び出し側は「空 SceneSnapshot と空 sources」を必ず用意できる必要がある。
        let (snapshot, sources) = build_empty_scene_snapshot_for_transparent_clear();

        assert!(
            snapshot.clips.is_empty(),
            "empty scene snapshot for transparent clear must carry no clips, got {} clips",
            snapshot.clips.len(),
        );
        assert!(
            sources.is_empty(),
            "empty scene snapshot for transparent clear must carry no sources, got {} entries",
            sources.len(),
        );
        assert_eq!(
            snapshot.colour,
            ColourPipeline::rec709_sdr_linear(),
            "transparent clear must reuse the canonical colour pipeline so downstream \
             validators do not treat this present as an out-of-band colour change",
        );
    }

    #[test]
    fn set_native_overlay_obstructed_returns_err_when_no_renderer_is_registered() {
        // Bug E（計画書 §4 Phase E2）— attach されていない window_id に対して
        // set_native_overlay_obstructed を呼んだ場合、clear_native_overlay_live_surface
        // と同じ Fail Safe 方針で明示的な Err を返す。
        let unused_window_id = u32::MAX - 4242;
        let error = set_native_overlay_obstructed(unused_window_id, true)
            .expect_err("toggling obstruction on an unattached window must not silently succeed");
        assert!(
            error.contains("Native overlay live surface"),
            "error message should point at the live surface registry, got: {error}",
        );
    }

    #[test]
    fn native_overlay_exports_set_obstructed_through_napi() {
        // Bug E（計画書 §4 Phase E2）— electron/nativeOverlayMainBridge.ts の
        // setObstructed から呼べる napi export
        // `setNativeOverlayObstructed(payload: { windowId, obstructed })` を
        // 用意する契約を固定する。
        let source = include_str!("lib.rs");

        assert!(source.contains("#[napi(js_name = \"setNativeOverlayObstructed\")]"));
        assert!(source.contains("pub fn set_native_overlay_obstructed"));
    }

    #[test]
    fn clear_native_overlay_live_surface_returns_err_when_no_renderer_is_registered() {
        // Bug D — clip 削除後に overlay の drawable に古いフレームが残る問題への対処として、
        // `clear_native_overlay_live_surface(window_id)` を新設する。attach されていない
        // window_id に対しては明示的な Err を返し、上位から fallback 判断できるようにする。
        let unused_window_id = u32::MAX - 424;
        let error = clear_native_overlay_live_surface(unused_window_id)
            .expect_err("clearing an unattached window must not silently succeed");
        assert!(
            error.contains("Native overlay live surface"),
            "error message should point at the live surface registry, got: {error}",
        );
    }

    #[test]
    fn clear_native_overlay_live_surface_advances_scene_generation_to_invalidate_prepared_clip_cache(
    ) {
        // 削除残像バグ・真因（実機トレース `UXFD_OVERLAY_CLEAR_READBACK=1` で確定済み）:
        // 動画シーンを present すると `present_upload_frame` が `last_scene` を
        // キャッシュしつつ `scene_generation` を進める。その後クリップを削除して
        // `clear_native_overlay_live_surface` が呼ばれても、これまでは
        // `last_scene = None` にするだけで `scene_generation` を据え置いていた。
        // native-wgpu-renderer 側 `prepare_base_scene_clips_cached` は
        // generation の一致のみでキャッシュヒットを判定し、渡された snapshot の
        // 中身（空かどうか）を一切見ない契約（既存テストで固定済み・変更しない）。
        // そのため空 snapshot を渡しても直前の動画の `Arc<PreparedClip>` が
        // キャッシュから返り、透明クリアのはずが削除済み動画をフルスクリーン
        // 再描画していた（実測: drawable=1563x879 prepared_clips=1
        // pre_clear_non_transparent=0 post_clear_non_transparent=1372998 ≒ 全pixel）。
        //
        // 修正は clear 時に `scene_generation` を前進させ、renderer 側キャッシュを
        // 意図的にミスさせて空 snapshot を実際に prepare させること。
        //
        // 実際の present は NSWindow 経由の live surface 前提のため headless な
        // `cargo test --lib` では再現できない（本ファイル内の他の macOS/NSWindow
        // 依存契約と同じ理由で `include_str!` によるソース契約で固定する）。
        // `include_str!` は本テスト自身のソースも含むため、探索対象の文字列を
        // そのまま埋め込むと自分自身にマッチしてしまう。`concat!` で断片から
        // 組み立て、ソース上に検索対象そのものが現れないようにする。
        let source = include_str!("lib.rs");

        let last_scene_reset = concat!("renderer.last_scene", " = None;");
        let last_scene_reset_position = source
            .find(last_scene_reset)
            .expect("clear_native_overlay_live_surface must reset last_scene to None on clear");

        let generation_advance = concat!("renderer.scene_generation", " += 1;");
        let generation_advance_position = source.find(generation_advance).expect(
            "clear_native_overlay_live_surface must advance scene_generation on clear so that \
             native-wgpu-renderer's prepare_base_scene_clips_cached (generation 一致のみで \
             判定する契約) cannot hit the stale video scene's cache and redraw a deleted clip",
        );

        assert!(
            generation_advance_position > last_scene_reset_position,
            "scene_generation must be advanced immediately after last_scene is reset to None",
        );
    }

    #[test]
    fn macos_overlay_view_is_click_through() {
        let source = include_str!("macos_overlay.rs");

        assert!(source.contains("UXFDNativeOverlayPassthroughView"));
        assert!(source.contains("hit_test_passthrough"));
        assert!(source.contains("sel!(hitTest:)"));
    }

    #[test]
    fn macos_overlay_layer_is_configured_as_non_opaque_for_transparent_composition() {
        // Bug D — CAMetalLayer は既定 `opaque = YES` で、この状態では下層 WebView や
        // WebGPU presenter は常時不可視になる。`clear_native_overlay_live_surface` が
        // 全 pixel alpha=0 で drawable を上書きしても、compositor が overlay を
        // 不透明扱いする限り透過効果は生まれない。opaque=NO 設定を要求する契約。
        let source = include_str!("macos_overlay.rs");

        assert!(
            source.contains("setOpaque"),
            "macos_overlay must configure CAMetalLayer setOpaque: to enable transparent clear",
        );
    }

    #[test]
    fn macos_overlay_exposes_set_overlay_view_opaque_public_api() {
        // Bug E — `opaque` は `contentsScale` と同じく、`wgpu::create_surface_unsafe` が
        // layer を差し替えると既定値へ戻ってしまう。attach 直後の一度きりの設定だけでは
        // 不十分で、`set_overlay_view_contents_scale` と対になる公開 API
        // `set_overlay_view_opaque(view_handle, opaque)` を用意し、surface 構築後にも
        // 再適用できる契約にする。
        let source = include_str!("macos_overlay.rs");

        assert!(
            source.contains("pub fn set_overlay_view_opaque(view_handle: usize, opaque: bool)"),
            "macos_overlay must expose set_overlay_view_opaque so callers can reapply opaque=NO \
             after wgpu replaces the CAMetalLayer, mirroring set_overlay_view_contents_scale",
        );
    }

    #[test]
    fn attach_native_overlay_inner_reapplies_opaque_immediately_after_contents_scale() {
        // Bug E — 実機リグレッション: Bug D で opaque=NO を attach 時に一度設定したが、
        // wgpu の surface 構築処理が layer を差し替えるため、contentsScale と同様に
        // opaque も既定値 YES へ戻ってしまい、透明クリアが compositor 上で
        // 不透明扱いされ画面が黒くなった。contents_scale 再適用呼び出しの直下で
        // opaque 再適用を呼び、surface 構築後に再適用する契約を source 上で固定する。
        // （このテスト自身のコメントが対象文字列と一致しないよう、呼び出しの断片は
        // 変数化して concat! で組み立てる。）
        let source = include_str!("lib.rs");

        let contents_scale_needle = concat!(
            "macos_overlay::set_overlay_view_contents_scale(",
            "view_handle, contract.contents_scale);"
        );
        let opaque_needle = concat!(
            "macos_overlay::set_overlay_view_opaque(",
            "view_handle, false);"
        );

        let contents_scale_call_position = source.find(contents_scale_needle).expect(
            "attach_native_overlay_inner must still reapply contents_scale after surface construction",
        );
        let opaque_call_position = source.find(opaque_needle).expect(
            "attach_native_overlay_inner must reapply opaque=false immediately after \
             reapplying contents_scale, mirroring the Bug B contents_scale fix",
        );

        assert!(
            opaque_call_position > contents_scale_call_position,
            "set_overlay_view_opaque must be called after set_overlay_view_contents_scale \
             (i.e. after wgpu surface construction), not before",
        );
    }

    #[test]
    fn macos_overlay_attaches_via_child_nswindow_not_contentview_subview() {
        // Bug E（ADR-013）— HTML 駆動 UI（context menu / popover / tooltip / modal /
        // dropdown）が overlay の CAMetalLayer に隠れて見切れる問題の根本対策として、
        // overlay を main BrowserWindow の contentView subview から独立した
        // child NSWindow へ置換する。macOS の z-order は「同一 NSWindow 内の view
        // 階層」と「複数 NSWindow 間の window order」が独立軸であり、subview の
        //ままでは HTML 側 UI を一律 overlay より上に置けない構造的制約があるため。
        //
        // 契約: parent NSWindow を取得し、borderless / transparent な child
        // NSWindow を new して addChildWindow:ordered: で attach すること。
        let source = include_str!("macos_overlay.rs");

        assert!(
            source.contains("addChildWindow") && source.contains("ordered"),
            "attach must addChildWindow:ordered: the overlay child NSWindow onto the parent",
        );
        assert!(
            source.contains("NSWindowAbove"),
            "attach must order the child NSWindow above the parent by default (steady state)",
        );
        assert!(
            source.contains("NSWindowStyleMaskBorderless") || source.contains("styleMask"),
            "the overlay child NSWindow must be created borderless (no titlebar/chrome)",
        );
        assert!(
            source.contains("setOpaque") && source.contains("clearColor"),
            "the overlay child NSWindow must be transparent (opaque=NO, background=clearColor) \
             so it does not paint over the parent window when uncovered by live surface content",
        );
    }

    #[test]
    fn macos_overlay_child_window_ignores_mouse_events_for_hit_through() {
        // preview の操作（クリック/ドラッグ/スクラブ）はすべて下層 WebView 側の
        // React UI が処理する設計であるため、child NSWindow 自身がマウスイベントを
        // 奪ってはならない。既存 NSView の hitTest: nil 返しに加えて、child NSWindow
        // にも setIgnoresMouseEvents:YES を設定し、window レベルでも hit-through を
        // 保証する（`window level` が subview 時代には存在しなかった新しい懸念）。
        let source = include_str!("macos_overlay.rs");

        assert!(
            source.contains("setIgnoresMouseEvents"),
            "the overlay child NSWindow must call setIgnoresMouseEvents:YES so pointer events \
             fall through to the underlying WebView-driven React UI",
        );
    }

    #[test]
    fn macos_overlay_observes_parent_window_geometry_notifications_for_manual_resync() {
        // Bug E（ADR-plan §4 Phase E0）— `addChildWindow:ordered:` は既定で
        // child window を parent の移動に追従させるが、リスクとして
        // Mission Control / Spaces 跨ぎやフルスクリーン切替で外れる場面が
        // ありうる（計画書 §6）。保険として `NSWindowDidMoveNotification` /
        // `NSWindowDidResizeNotification` を parent window に対して監視し、
        // child window の geometry を手動で再同期する契約を固定する。
        let source = include_str!("macos_overlay.rs");

        assert!(
            source.contains("NSWindowDidMoveNotification"),
            "attach must observe NSWindowDidMoveNotification on the parent NSWindow to manually \
             resync the child window geometry as a fallback to addChildWindow's default tracking",
        );
        assert!(
            source.contains("NSWindowDidResizeNotification"),
            "attach must observe NSWindowDidResizeNotification on the parent NSWindow to manually \
             resync the child window geometry as a fallback to addChildWindow's default tracking",
        );
        assert!(
            source.contains("addObserver") && source.contains("selector"),
            "the geometry resync must be wired via NSNotificationCenter addObserver:selector:name:object:",
        );
    }

    #[test]
    fn macos_overlay_detach_removes_child_window_from_parent() {
        // child NSWindow 化に伴い、detach は既存の removeFromSuperview だけでは
        // 不十分になる。addChildWindow の対称操作である removeChildWindow: を
        // 呼び、parent-child 関係を明示的に解除する契約を固定する。
        let source = include_str!("macos_overlay.rs");

        assert!(
            source.contains("removeChildWindow"),
            "detach must call removeChildWindow: to sever the parent/child NSWindow relationship \
             that attach established via addChildWindow:ordered:",
        );
    }

    #[test]
    fn macos_overlay_exposes_set_overlay_view_obstructed_public_api() {
        // Bug E（計画書 §4 Phase E2）— HTML 駆動 UI（modal 等）が preview に
        // 重なって開いたとき、child NSWindow の z-order を下げる（`order`
        // 下げ）ための公開 API。GPU present は止めず、表示位置（z-order）
        // だけを切り替える設計（計画書 §9 の設計判断 3: 再生継続性を優先し
        // orderOut ではなく order 下げを採用）。
        let source = include_str!("macos_overlay.rs");

        assert!(
            source.contains("pub fn set_overlay_view_obstructed(view_handle: usize, obstructed: bool)"),
            "macos_overlay must expose set_overlay_view_obstructed(view_handle, obstructed) so \
             callers can toggle the child NSWindow z-order when a preview-overlapping HTML UI opens",
        );
    }

    #[test]
    fn macos_overlay_obstructed_toggle_uses_order_below_not_order_out() {
        // 計画書 §9 設計判断 3 の確定: modal open 時は `orderOut:`（完全隠し）
        // ではなく `NSWindowBelow` への order 変更を使う。再生継続性を優先し、
        // GPU present を止めないため。
        let source = include_str!("macos_overlay.rs");

        assert!(
            source.contains("NSWindowBelow"),
            "the obstructed toggle must lower the child window with NSWindowBelow (not orderOut:), \
             so live surface present keeps running while the child window is simply behind the parent",
        );
        assert!(
            source.contains("fn set_overlay_view_obstructed") ,
        );
    }

    #[test]
    fn upload_frame_to_scene_sources_fits_scene_canvas_into_drawable_pixel_size() {
        // 実機バグ: preview pane（drawable 1564x880, CSS 782x440 相当 @ dpr2）へ 1920x1080
        // プロジェクトのシーンを present すると、動画が pane 左上 1/4 に半分スケールで
        // 表示された。原因は `scene.snapshot` の `transform.translation_x/y` と
        // `scale_x/y` がプロジェクト解像度（1920x1080）基準の絶対ピクセル座標であるにも
        // かかわらず、drawable ピクセル座標としてそのままシェーダーへ渡っていたこと。
        // drawable と canvas のアスペクト比が僅かにでもズレると contain-fit
        // （min(drawable/canvas) 倍）で drawable 全域に描画されるべきだが、fit 変換が
        // 一切行われていなかったため、シーン全体が drawable の左上に「実寸」で
        // 描かれ、はみ出た残りは切り取られていた。
        //
        // このテストは `NativeOverlaySceneSource` に canvas サイズ（プロジェクト解像度）
        // を持たせ、`upload_frame_to_scene_sources` が drawable 1564x880・canvas
        // 1920x1080 のとき、contain-fit スケール ≈0.8146（= min(1564/1920, 880/1080)）を
        // clip の transform に適用した snapshot を返すことを要求する。
        let upload = OverlayUploadFrame {
            media_id: "video-1".to_string(),
            width: 4,
            height: 4,
            generation: 1,
            pts_frame: 0,
            pixels: vec![0_u8; 4 * 4 * 4],
        };

        let scene = NativeOverlaySceneSource {
            snapshot: SceneSnapshot {
                frame_index: 0,
                colour: ColourPipeline::rec709_sdr_linear(),
                clips: vec![EvaluatedClip {
                    clip_id: "clip-1".to_string(),
                    track_id: "track-1".to_string(),
                    media_id: "video-1".to_string(),
                    source_frame: 0,
                    z_index: 0,
                    transform: Transform {
                        translation_x: 0.0,
                        translation_y: 0.0,
                        scale_x: 1920.0,
                        scale_y: 1080.0,
                        rotation_degrees: 0.0,
                        sampling: SamplingMode::Bilinear,
                    },
                    opacity: 1.0,
                    effects: Vec::new(),
                }],
            },
            media: Vec::new(),
            canvas_width: 1920,
            canvas_height: 1080,
        };

        let (snapshot, _sources) =
            upload_frame_to_scene_sources(&upload, Some(&scene), 1564, 880)
                .expect("scene upload must fit into the drawable pixel size");

        let expected_fit_scale = (1564.0_f32 / 1920.0).min(880.0_f32 / 1080.0);
        assert!(
            (expected_fit_scale - 0.8146).abs() < 0.001,
            "expected fit scale sanity check to be ~0.8146, got {expected_fit_scale}"
        );

        let clip = &snapshot.clips[0];
        assert!(
            (clip.transform.scale_x - 1920.0 * expected_fit_scale).abs() < 0.01,
            "expected drawable-fit scale_x ~{}, got {}",
            1920.0 * expected_fit_scale,
            clip.transform.scale_x
        );
        assert!(
            (clip.transform.scale_y - 1080.0 * expected_fit_scale).abs() < 0.01,
            "expected drawable-fit scale_y ~{}, got {}",
            1080.0 * expected_fit_scale,
            clip.transform.scale_y
        );

        assert!(
            (clip.transform.scale_x - 1564.0).abs() < 1.0,
            "expected the fitted clip width to span the drawable width (~1564), got {}",
            clip.transform.scale_x
        );
    }

    #[test]
    fn upload_frame_to_scene_sources_compensates_preview_decode_downscale_for_final_drawn_width() {
        // 実機残存バグ（425d）: contain-fit（×0.8146）を適用しても動画が pane 比 ≈0.38 の
        // 縮小表示のままだった。真因は preview 経路の decode が
        // SHARED_RENDERER_PLAYBACK_DECODE_MAX_EDGE=720 で 1920x1080 → 720x405 に
        // ダウンスケールした frame を sources に登録するのに対し、clip.transform.scale_x は
        // 「media 宣言サイズ（1920）のソースを表示サイズへ拡縮する」前提の値のままで、
        // decode 縮小比（720/1920=0.375）の補正が無かったこと。solid_composite.wgsl は
        // source 実寸 × scale で描画幅を決めるため、720×fit(0.8146)=587px → pane 比 0.375 と
        // 実測 0.38 が一致する。rust-backend の CPU fast path
        // （cpu_simple_video.rs の fit_scale_x = media.width / source.width）は同じ問題を
        // 既に補正しており、native overlay 経路にも同じ補正が必要。
        //
        // 前回の単体テストは snapshot の scale_x の値だけを検証し、sources に登録される
        // frame 実寸との積（= shader 入力直前の実効描画幅）を見ていなかったため
        // この層の欠陥を素通しした。本テストは (snapshot, sources) ペアで
        // 「sources[media_id] 実寸 × clip.scale = 最終描画サイズ」を固定する。
        let upload = OverlayUploadFrame {
            media_id: "video-1".to_string(),
            // preview decode が 1920x1080 → 720x405 へ縮小した状態を再現する。
            width: 720,
            height: 405,
            generation: 1,
            pts_frame: 0,
            pixels: vec![0_u8; 720 * 405 * 4],
        };

        let scene = NativeOverlaySceneSource {
            snapshot: SceneSnapshot {
                frame_index: 0,
                colour: ColourPipeline::rec709_sdr_linear(),
                clips: vec![EvaluatedClip {
                    clip_id: "clip-1".to_string(),
                    track_id: "track-1".to_string(),
                    media_id: "video-1".to_string(),
                    source_frame: 0,
                    z_index: 0,
                    transform: Transform {
                        translation_x: 0.0,
                        translation_y: 0.0,
                        // TS の buildRustSceneSnapshotForTimeline は previewProxy モードで
                        // transformScale={1,1} を返すため、scale は object.scaleX のまま。
                        scale_x: 1.0,
                        scale_y: 1.0,
                        rotation_degrees: 0.0,
                        sampling: SamplingMode::Bilinear,
                    },
                    opacity: 1.0,
                    effects: Vec::new(),
                }],
            },
            media: vec![NativeOverlaySceneMedia {
                id: "video-1".to_string(),
                kind: "Video".to_string(),
                source: "/tmp/example.mp4".to_string(),
                // media 宣言サイズ（プロジェクトのシーン座標系での表示基準サイズ）。
                width: 1920,
                height: 1080,
                source_rate: None,
            }],
            canvas_width: 1920,
            canvas_height: 1080,
        };

        let (snapshot, sources) =
            upload_frame_to_scene_sources(&upload, Some(&scene), 1564, 880)
                .expect("scene upload must compensate decode downscale and fit to drawable");

        let source = sources
            .get("video-1")
            .expect("decoded video frame must be registered in the sources");
        let clip = &snapshot.clips[0];

        // shader 入力直前の実効描画サイズ = sources 実寸 × clip.scale。
        // fit = min(1564/1920, 880/1080) = 0.81458…
        // 期待描画幅 = 1920 × fit ≈ 1564、期待描画高 = 1080 × fit ≈ 879.75。
        let drawn_width = source.width as f32 * clip.transform.scale_x;
        let drawn_height = source.height as f32 * clip.transform.scale_y;
        assert!(
            (drawn_width - 1564.0).abs() < 1.0,
            "expected the final drawn width to span the drawable width (~1564), got {drawn_width} \
             (source {}x{}, scale {}x{})",
            source.width,
            source.height,
            clip.transform.scale_x,
            clip.transform.scale_y
        );
        assert!(
            (drawn_height - 879.75).abs() < 1.0,
            "expected the final drawn height to be canvas_height * fit (~879.75), got {drawn_height}"
        );

        // letterbox 中央寄せ: offset = ((1564-1564)/2, (880-879.75)/2) ≈ (0, 0.123)。
        assert!(
            clip.transform.translation_x.abs() < 0.5,
            "expected horizontal letterbox offset ~0, got {}",
            clip.transform.translation_x
        );
        let expected_offset_y = (880.0 - 1080.0 * (1564.0_f32 / 1920.0)) * 0.5;
        assert!(
            (clip.transform.translation_y - expected_offset_y).abs() < 0.5,
            "expected vertical letterbox offset ~{expected_offset_y}, got {}",
            clip.transform.translation_y
        );
    }

    #[test]
    fn upload_frame_to_scene_sources_compensates_drawable_matched_decode_edge() {
        // preview decode edge が drawable 長辺に追従するようになった後の代表ケース:
        // drawable 1564x880 → decode 1564x880（media 1920x1080、補正比 1920/1564 ≈ 1.228）。
        // 補正 × fit = (1920/1564) × (1564/1920) = 1.0 となり、decode 実寸が drawable と
        // 一致するときは実質無変換で 1:1 present になる（ボケの原因となる拡大が消える）。
        let upload = OverlayUploadFrame {
            media_id: "video-1".to_string(),
            width: 1564,
            height: 880,
            generation: 1,
            pts_frame: 0,
            pixels: vec![0_u8; 1564 * 880 * 4],
        };

        let scene = NativeOverlaySceneSource {
            snapshot: SceneSnapshot {
                frame_index: 0,
                colour: ColourPipeline::rec709_sdr_linear(),
                clips: vec![EvaluatedClip {
                    clip_id: "clip-1".to_string(),
                    track_id: "track-1".to_string(),
                    media_id: "video-1".to_string(),
                    source_frame: 0,
                    z_index: 0,
                    transform: Transform {
                        translation_x: 0.0,
                        translation_y: 0.0,
                        scale_x: 1.0,
                        scale_y: 1.0,
                        rotation_degrees: 0.0,
                        sampling: SamplingMode::Bilinear,
                    },
                    opacity: 1.0,
                    effects: Vec::new(),
                }],
            },
            media: vec![NativeOverlaySceneMedia {
                id: "video-1".to_string(),
                kind: "Video".to_string(),
                source: "/tmp/example.mp4".to_string(),
                width: 1920,
                height: 1080,
                source_rate: None,
            }],
            canvas_width: 1920,
            canvas_height: 1080,
        };

        let (snapshot, sources) =
            upload_frame_to_scene_sources(&upload, Some(&scene), 1564, 880)
                .expect("drawable-matched decode edge must present 1:1");

        let source = sources.get("video-1").expect("video source must exist");
        let clip = &snapshot.clips[0];

        // decode 縮小補正の単体値も固定する: media 1920 / upload 1564 ≈ 1.2276。
        // （fit 0.81458 との積で scale ≈ 1.0）
        let expected_compensation = 1920.0_f32 / 1564.0;
        assert!(
            (expected_compensation - 1.2276).abs() < 0.001,
            "expected compensation ratio sanity check to be ~1.2276, got {expected_compensation}"
        );

        let drawn_width = source.width as f32 * clip.transform.scale_x;
        let drawn_height = source.height as f32 * clip.transform.scale_y;
        assert!(
            (drawn_width - 1564.0).abs() < 1.0,
            "expected 1:1 drawn width (~1564), got {drawn_width} (scale {})",
            clip.transform.scale_x
        );
        assert!(
            (drawn_height - 879.75).abs() < 1.0,
            "expected drawn height ~879.75 (canvas_height * fit), got {drawn_height}"
        );
        assert!(
            (clip.transform.scale_x - 1.0).abs() < 0.01,
            "expected near-identity effective scale for drawable-matched decode, got {}",
            clip.transform.scale_x
        );
    }

    #[test]
    fn upload_frame_to_scene_sources_centres_scene_with_pillarbox_offset_in_wide_drawable() {
        // 幅方向に余白が出る drawable（pillarbox）で中央寄せ translation が効くことを固定する。
        // drawable 2000x880・canvas 1920x1080 のとき fit = min(2000/1920, 880/1080) = 0.81481…、
        // fitted 幅 = 1920 × fit ≈ 1564.4、offset_x = (2000 - 1564.4) / 2 ≈ 217.8。
        let upload = OverlayUploadFrame {
            media_id: "video-1".to_string(),
            width: 720,
            height: 405,
            generation: 1,
            pts_frame: 0,
            pixels: vec![0_u8; 720 * 405 * 4],
        };

        let scene = NativeOverlaySceneSource {
            snapshot: SceneSnapshot {
                frame_index: 0,
                colour: ColourPipeline::rec709_sdr_linear(),
                clips: vec![EvaluatedClip {
                    clip_id: "clip-1".to_string(),
                    track_id: "track-1".to_string(),
                    media_id: "video-1".to_string(),
                    source_frame: 0,
                    z_index: 0,
                    transform: Transform {
                        translation_x: 0.0,
                        translation_y: 0.0,
                        scale_x: 1.0,
                        scale_y: 1.0,
                        rotation_degrees: 0.0,
                        sampling: SamplingMode::Bilinear,
                    },
                    opacity: 1.0,
                    effects: Vec::new(),
                }],
            },
            media: vec![NativeOverlaySceneMedia {
                id: "video-1".to_string(),
                kind: "Video".to_string(),
                source: "/tmp/example.mp4".to_string(),
                width: 1920,
                height: 1080,
                source_rate: None,
            }],
            canvas_width: 1920,
            canvas_height: 1080,
        };

        let (snapshot, sources) =
            upload_frame_to_scene_sources(&upload, Some(&scene), 2000, 880)
                .expect("scene upload must centre the fitted scene in a wide drawable");

        let source = sources.get("video-1").expect("video source must exist");
        let clip = &snapshot.clips[0];
        let fit = 880.0_f32 / 1080.0;
        let expected_offset_x = (2000.0 - 1920.0 * fit) * 0.5;

        assert!(
            (clip.transform.translation_x - expected_offset_x).abs() < 0.5,
            "expected horizontal pillarbox offset ~{expected_offset_x}, got {}",
            clip.transform.translation_x
        );
        let drawn_width = source.width as f32 * clip.transform.scale_x;
        assert!(
            (drawn_width - 1920.0 * fit).abs() < 1.0,
            "expected the final drawn width to be canvas_width * fit (~{}), got {drawn_width}",
            1920.0 * fit
        );
    }

    // --- 選択デコレーション（選択枠・リサイズハンドル）契約テスト ---
    //
    // 実機バグ: SceneSelectionOverlay（HTML/SVG）は child NSWindow 化された
    // native overlay（CAMetalLayer）より常に下にあるため、オブジェクトが
    // 現在フレームに描画されている間は選択枠が不透明ピクセルに隠れて見えない。
    // 修正方針は「選択枠・ハンドルの見た目を native overlay の scene present
    // 最後に上乗せ描画する」こと。ここでは quad（project 座標系）→ drawable
    // 座標変換と、デコレーション clip 構築の契約を固定する。

    fn axis_aligned_selection_state(
        canvas_width: u32,
        canvas_height: u32,
    ) -> SelectionDecorationState {
        SelectionDecorationState {
            canvas_width,
            canvas_height,
            quads: vec![SelectionDecorationQuad {
                top_left: (100.0, 100.0),
                top_right: (300.0, 100.0),
                bottom_right: (300.0, 200.0),
                bottom_left: (100.0, 200.0),
            }],
        }
    }

    fn assert_approx(actual: f32, expected: f32, label: &str) {
        assert!(
            (actual - expected).abs() < 1e-3,
            "{label}: expected {expected}, got {actual}"
        );
    }

    #[test]
    fn contain_fit_transform_matches_scene_and_decoration_callers_for_the_same_geometry() {
        // 契約: scene 本体（fit_scene_snapshot_to_drawable）とデコレーション
        // （build_selection_decoration_clips）が同じ canvas/drawable ペアに対して
        // 計算する fit_scale・letterbox offset は、`contain_fit_transform` という
        // 単一の実装を共有しているため、常に完全一致でなければならない。
        // pane 実測値相当（canvas 1920x1080・drawable 1564x880 @ dpr2 相当）で固定する。
        let (fit_scale, offset_x, offset_y) = contain_fit_transform(1920, 1080, 1564, 880);
        assert_approx(fit_scale as f32, 1564.0 / 1920.0, "fit_scale");
        // 1564/1920 ≈ 0.8146 と 880/1080 ≈ 0.8148 のうち小さい方（横基準の letterbox）。
        assert!(fit_scale < 880.0 / 1080.0, "fit_scale must pick the smaller axis ratio");
        assert_approx(offset_x as f32, 0.0, "offset_x must be ~0 for a near-matching aspect ratio");
        assert!(offset_y >= 0.0, "offset_y must be non-negative letterbox padding");

        // canvas サイズ 0（projectSettings 未到達などの Fail Safe 経路）は
        // 無変換（fit_scale=1, offset=0）でなければならない。scene 本体
        // （fit_scene_snapshot_to_drawable の早期 return）と同じ契約。
        let (zero_fit_scale, zero_offset_x, zero_offset_y) =
            contain_fit_transform(0, 0, 1564, 880);
        assert_approx(zero_fit_scale as f32, 1.0, "zero-canvas fit_scale");
        assert_approx(zero_offset_x as f32, 0.0, "zero-canvas offset_x");
        assert_approx(zero_offset_y as f32, 0.0, "zero-canvas offset_y");
    }

    #[test]
    fn selection_decoration_clips_transform_quad_corners_with_scene_contain_fit() {
        // canvas 1920x1080 → drawable 960x540 は contain-fit 0.5・offset (0,0)。
        // fit_scene_snapshot_to_drawable と同じ変換をデコレーションにも通す契約。
        let state = axis_aligned_selection_state(1920, 1080);
        let (clips, sources) = build_selection_decoration_clips(&state, 960, 540, 1.0);

        // 4 辺 + 4 ハンドル（金枠）+ 4 ハンドル（白面）= 12 clips / quad。
        assert_eq!(clips.len(), 12);
        assert!(sources.contains_key(SELECTION_DECORATION_GOLD_MEDIA_ID));
        assert!(sources.contains_key(SELECTION_DECORATION_WHITE_MEDIA_ID));
        let gold = &sources[SELECTION_DECORATION_GOLD_MEDIA_ID];
        assert_eq!((gold.width, gold.height), (1, 1));
        assert_eq!(&gold.pixels[..4], &[255, 215, 0, 255]);
        let white = &sources[SELECTION_DECORATION_WHITE_MEDIA_ID];
        assert_eq!(&white.pixels[..4], &[255, 255, 255, 255]);

        // 上辺: fitted TL(50,50)→TR(150,50)。線幅 2（contents_scale=1）を線の
        // 中心に載せ、角の継ぎ目を埋めるため両端を半幅ずつ延長する。
        let top = &clips[0];
        assert_eq!(top.media_id, SELECTION_DECORATION_GOLD_MEDIA_ID);
        assert_approx(top.transform.rotation_degrees, 0.0, "top edge rotation");
        assert_approx(top.transform.translation_x, 49.0, "top edge translation_x");
        assert_approx(top.transform.translation_y, 49.0, "top edge translation_y");
        assert_approx(top.transform.scale_x, 102.0, "top edge scale_x");
        assert_approx(top.transform.scale_y, 2.0, "top edge scale_y");

        // 右辺: TR(150,50)→BR(150,100)、回転 90 度。
        let right = &clips[1];
        assert_approx(right.transform.rotation_degrees, 90.0, "right edge rotation");
        assert_approx(right.transform.translation_x, 151.0, "right edge translation_x");
        assert_approx(right.transform.translation_y, 49.0, "right edge translation_y");
        assert_approx(right.transform.scale_x, 52.0, "right edge scale_x");
        assert_approx(right.transform.scale_y, 2.0, "right edge scale_y");

        // ハンドル: SVG（rect 10x10・stroke 1.2）の見た目を金枠 11.2 + 白面 8.8
        // の 2 clip で再現する。TL corner (50,50) 中心。
        let gold_handle = &clips[4];
        assert_eq!(gold_handle.media_id, SELECTION_DECORATION_GOLD_MEDIA_ID);
        assert_approx(gold_handle.transform.translation_x, 50.0 - 5.6, "gold handle tx");
        assert_approx(gold_handle.transform.translation_y, 50.0 - 5.6, "gold handle ty");
        assert_approx(gold_handle.transform.scale_x, 11.2, "gold handle scale_x");
        let white_handle = &clips[8];
        assert_eq!(white_handle.media_id, SELECTION_DECORATION_WHITE_MEDIA_ID);
        assert_approx(white_handle.transform.translation_x, 50.0 - 4.4, "white handle tx");
        assert_approx(white_handle.transform.scale_x, 8.8, "white handle scale_x");

        // z-order: 動画・画像 clip より常に上。辺 < ハンドル金 < ハンドル白。
        assert!(clips[0].z_index >= u32::MAX - 2);
        assert!(clips[4].z_index > clips[0].z_index);
        assert!(clips[8].z_index > clips[4].z_index);
        for clip in &clips {
            assert_approx(clip.opacity, 1.0, "decoration opacity");
        }
    }

    #[test]
    fn selection_decoration_clips_scale_line_thickness_with_contents_scale() {
        // HiDPI（contents_scale=2）では CSS 2pt の枠線が物理 4px になる契約。
        let state = SelectionDecorationState {
            canvas_width: 200,
            canvas_height: 200,
            quads: vec![SelectionDecorationQuad {
                top_left: (10.0, 10.0),
                top_right: (110.0, 10.0),
                bottom_right: (110.0, 110.0),
                bottom_left: (10.0, 110.0),
            }],
        };
        let (clips, _sources) = build_selection_decoration_clips(&state, 200, 200, 2.0);

        let top = &clips[0];
        assert_approx(top.transform.translation_x, 8.0, "top edge translation_x");
        assert_approx(top.transform.translation_y, 8.0, "top edge translation_y");
        assert_approx(top.transform.scale_x, 104.0, "top edge scale_x");
        assert_approx(top.transform.scale_y, 4.0, "top edge scale_y");
        let gold_handle = &clips[4];
        assert_approx(gold_handle.transform.scale_x, 22.4, "gold handle scale_x");
        let white_handle = &clips[8];
        assert_approx(white_handle.transform.scale_x, 17.6, "white handle scale_x");
    }

    #[test]
    fn selection_decoration_clips_rotated_edge_uses_rotation_degrees() {
        // 回転済み quad（world 座標の四隅が回転を含む）の辺は、辺方向の
        // atan2 をそのまま rotation_degrees に載せる契約。
        let state = SelectionDecorationState {
            canvas_width: 200,
            canvas_height: 200,
            quads: vec![SelectionDecorationQuad {
                top_left: (0.0, 0.0),
                top_right: (0.0, 100.0),
                bottom_right: (-100.0, 100.0),
                bottom_left: (-100.0, 0.0),
            }],
        };
        let (clips, _sources) = build_selection_decoration_clips(&state, 200, 200, 1.0);

        let edge = &clips[0];
        assert_approx(edge.transform.rotation_degrees, 90.0, "rotated edge rotation");
        assert_approx(edge.transform.translation_x, 1.0, "rotated edge translation_x");
        assert_approx(edge.transform.translation_y, -1.0, "rotated edge translation_y");
        assert_approx(edge.transform.scale_x, 102.0, "rotated edge scale_x");
        assert_approx(edge.transform.scale_y, 2.0, "rotated edge scale_y");
    }

    #[test]
    fn append_selection_decoration_layers_clips_above_existing_scene() {
        // scene present の最後に上乗せする契約: 既存 clip は変更せず、
        // デコレーション clip と 1x1 単色 source を追記する。
        let state = axis_aligned_selection_state(1920, 1080);
        let (mut snapshot, mut sources) = build_empty_scene_snapshot_for_transparent_clear();
        snapshot.clips.push(EvaluatedClip {
            clip_id: "existing".to_string(),
            track_id: "track".to_string(),
            media_id: "video".to_string(),
            source_frame: 0,
            z_index: 5,
            transform: Transform::identity(),
            opacity: 1.0,
            effects: Vec::new(),
        });

        append_selection_decoration_to_scene(&mut snapshot, &mut sources, &state, 960, 540, 1.0);

        assert_eq!(snapshot.clips.len(), 1 + 12);
        assert_eq!(snapshot.clips[0].clip_id, "existing");
        assert_eq!(snapshot.clips[0].z_index, 5);
        assert!(snapshot.clips[1..].iter().all(|clip| clip.z_index >= u32::MAX - 2));
        assert!(sources.contains_key(SELECTION_DECORATION_GOLD_MEDIA_ID));
        assert!(sources.contains_key(SELECTION_DECORATION_WHITE_MEDIA_ID));
    }

    #[test]
    fn last_scene_cache_shares_rgba_pixel_buffers_via_arc_without_deep_clone() {
        // タスク2: `NativeOverlayLiveSurfaceRenderer.last_scene` は
        // `Arc<(SceneSnapshot, HashMap<String, RgbaFrame>)>` として保持し、
        // デコレーションのみの再 present（present_cached_scene_with_decoration
        // 相当の読み出しパターン: `.clone()` して中身を読む）が RgbaFrame の
        // ピクセルバッファを deep clone しないことを固定する。
        // フルHD 相当の 1 ソース（約 8MB）で `Arc::clone` 前後の strong_count と
        // ポインタ同一性を確認し、「clone のたびに新しい Vec<u8> が確保される」
        // 回帰を検出できるようにする。
        let width = 1920_u32;
        let height = 1080_u32;
        let frame = RgbaFrame::from_rgba8(width, height, vec![7u8; (width * height * 4) as usize])
            .expect("valid full-hd frame");
        let mut sources = HashMap::new();
        sources.insert("video-1".to_string(), frame);
        let snapshot = SceneSnapshot {
            frame_index: 0,
            colour: ColourPipeline::rec709_sdr_linear(),
            clips: Vec::new(),
        };

        let last_scene: Option<Arc<(SceneSnapshot, HashMap<String, RgbaFrame>)>> =
            Some(Arc::new((snapshot, sources)));

        // present_cached_scene_with_decoration がやるのと同じ読み出しパターン。
        let cached = last_scene.clone();
        let (_, cached_sources) = cached.as_deref().expect("scene must be cached");
        let (_, original_sources) = last_scene.as_deref().expect("scene must be cached");

        assert_eq!(
            Arc::strong_count(last_scene.as_ref().unwrap()),
            2,
            "cloning the cached scene for re-present must only bump the Arc refcount, \
             not allocate a fresh RgbaFrame pixel buffer",
        );
        assert!(
            std::ptr::eq(
                cached_sources.get("video-1").unwrap().pixels.as_ptr(),
                original_sources.get("video-1").unwrap().pixels.as_ptr(),
            ),
            "decoration-only re-present must reuse the exact same pixel buffer allocation, \
             not a deep copy",
        );
    }

    #[test]
    fn selection_decoration_state_is_stored_even_when_no_renderer_is_attached() {
        // TS 側は attach 完了時に再送するが、addon 側も state を保持して
        // おき、Err（未 attach）を返して SVG フォールバックを促す契約。
        let window_id = 990_001;
        let state = axis_aligned_selection_state(1920, 1080);

        let result = set_native_overlay_selection_decoration(window_id, state.clone());

        assert_eq!(
            result.expect_err("no renderer attached"),
            "Native overlay live surface is not attached."
        );
        assert_eq!(
            stored_native_overlay_selection_decoration(window_id),
            Some(state)
        );
    }

    #[test]
    fn selection_decoration_state_is_cleared_by_empty_quads() {
        // 空配列 = 選択解除。state を破棄し、以後の present に上乗せしない契約。
        let window_id = 990_002;
        let state = axis_aligned_selection_state(1920, 1080);
        let _ = set_native_overlay_selection_decoration(window_id, state.clone());
        assert!(stored_native_overlay_selection_decoration(window_id).is_some());

        let _ = set_native_overlay_selection_decoration(
            window_id,
            SelectionDecorationState {
                canvas_width: 1920,
                canvas_height: 1080,
                quads: Vec::new(),
            },
        );

        assert_eq!(stored_native_overlay_selection_decoration(window_id), None);
    }

    #[test]
    fn present_with_embedded_decoration_uses_the_embedded_value_and_updates_the_stored_map() {
        // Bug B（症状B: 選択枠・本体フレームの2チャネル独立配信によるズレ）対策。
        // presentNativeOverlaySharedFrame に選択デコレーションが同梱された場合、
        // その present はグローバル map を再読みせず「同梱された値そのもの」を
        // 使う。かつ map 側も同梱値で置き換える（以後の standalone
        // 再present/再attach 復旧経路がこの値を拾えるようにするため）。
        let window_id = 990_003;
        let stale = axis_aligned_selection_state(1920, 1080);
        let _ = store_native_overlay_selection_decoration(window_id, stale);

        let embedded = SelectionDecorationState {
            canvas_width: 1280,
            canvas_height: 720,
            quads: vec![SelectionDecorationQuad {
                top_left: (10.0, 10.0),
                top_right: (20.0, 10.0),
                bottom_right: (20.0, 20.0),
                bottom_left: (10.0, 20.0),
            }],
        };

        let resolved = resolve_present_selection_decoration(window_id, Some(embedded.clone()));

        assert_eq!(resolved, Some(embedded.clone()));
        assert_eq!(
            stored_native_overlay_selection_decoration(window_id),
            Some(embedded)
        );
    }

    #[test]
    fn present_with_embedded_empty_quads_clears_the_stored_map_and_uses_no_decoration() {
        // 症状A対策（ゴースト選択枠）との組み合わせ: 時間帯外になった選択
        // オブジェクトは buildSelectionDecorationQuads が [] を返す。同梱
        // payload の quads が空でも、通常の setSelectionDecoration と同じく
        // map からエントリを除去し、この present はデコレーション無しで扱う。
        let window_id = 990_004;
        let stale = axis_aligned_selection_state(1920, 1080);
        let _ = store_native_overlay_selection_decoration(window_id, stale);

        let embedded_empty = SelectionDecorationState {
            canvas_width: 1280,
            canvas_height: 720,
            quads: Vec::new(),
        };

        let resolved = resolve_present_selection_decoration(window_id, Some(embedded_empty));

        assert_eq!(resolved, None);
        assert_eq!(stored_native_overlay_selection_decoration(window_id), None);
    }

    #[test]
    fn present_without_embedded_decoration_falls_back_to_the_stored_map() {
        // 後方互換: 同梱 payload を持たない旧経路（addon 側が未対応のビルド
        // 済み .node を JS が読み込んだ場合の graceful degrade を含む）は、
        // 従来どおり standalone setSelectionDecoration が書き込んだ map を
        // フォールバックとして使う。
        let window_id = 990_005;
        let stored = axis_aligned_selection_state(1920, 1080);
        let _ = store_native_overlay_selection_decoration(window_id, stored.clone());

        let resolved = resolve_present_selection_decoration(window_id, None);

        assert_eq!(resolved, Some(stored));
    }

    #[test]
    fn native_overlay_exports_set_selection_decoration_through_napi() {
        // preload / main bridge（electron/nativeOverlayMainBridge.ts）の
        // setSelectionDecoration から呼べる napi export。
        let source = include_str!("lib.rs");
        assert!(source.contains("#[napi(js_name = \"setNativeOverlaySelectionDecoration\")]"));
        assert!(source.contains("pub fn set_native_overlay_selection_decoration"));
    }

    #[test]
    fn native_overlay_shared_frame_present_payload_carries_optional_selection_decoration() {
        // Bug B対策: presentNativeOverlaySharedFrame の napi payload に
        // 選択デコレーションを同梱できるようにする（Optional なので addon が
        // 未対応でも既存呼び出しは壊れない）。
        let source = include_str!("lib.rs");
        assert!(source.contains(
            "pub selection_decoration: Option<NativeOverlaySharedFrameSelectionDecorationPayload>"
        ));
        assert!(source.contains("pub struct NativeOverlaySharedFrameSelectionDecorationPayload"));
    }

    #[test]
    fn selection_decoration_clips_render_gold_border_and_white_handles_via_readback() {
        // readback 契約: デコレーションのみの snapshot（noVideoDecodeRequest の
        // 透明クリア状態相当）を offscreen render し、枠線に金・角ハンドルに白の
        // 不透明ピクセルが載り、quad 内部は透明のままであることを固定する。
        let state = SelectionDecorationState {
            canvas_width: 200,
            canvas_height: 200,
            quads: vec![SelectionDecorationQuad {
                top_left: (40.0, 40.0),
                top_right: (160.0, 40.0),
                bottom_right: (160.0, 160.0),
                bottom_left: (40.0, 160.0),
            }],
        };
        let (mut snapshot, mut sources) = build_empty_scene_snapshot_for_transparent_clear();
        append_selection_decoration_to_scene(&mut snapshot, &mut sources, &state, 200, 200, 2.0);

        let frame = pollster::block_on(render_native_wgpu_frame(&snapshot, &sources, 200, 200))
            .expect("decoration-only offscreen render must succeed");

        let pixel = |x: usize, y: usize| {
            let offset = (y * 200 + x) * 4;
            [
                frame.pixels[offset],
                frame.pixels[offset + 1],
                frame.pixels[offset + 2],
                frame.pixels[offset + 3],
            ]
        };
        // 上辺中点 (100, 40): 金（#ffd700 相当。red 高・blue 低・不透明）。
        let border = pixel(100, 40);
        assert!(border[3] > 200, "border must be opaque, got {border:?}");
        assert!(border[0] > 180 && border[2] < 120, "border must be gold, got {border:?}");
        // TL corner (40, 40): 白ハンドル面。
        let handle = pixel(40, 40);
        assert!(handle[3] > 200, "handle must be opaque, got {handle:?}");
        assert!(
            handle[0] > 200 && handle[1] > 200 && handle[2] > 200,
            "handle must be white, got {handle:?}"
        );
        // quad 中央 (100, 100): 透明のまま（枠の内側は塗らない）。
        let interior = pixel(100, 100);
        assert_eq!(interior[3], 0, "interior must stay transparent, got {interior:?}");
    }

    #[test]
    fn selection_decoration_clips_use_identity_transform_when_canvas_size_is_zero() {
        // 契約: `fit_scene_snapshot_to_drawable`（scene 本体の contain-fit）は
        // canvas_width/height が 0 のとき「fit 変換を一切適用しない」（早期
        // return で translation/scale を無改変のまま返す）。デコレーション側の
        // `build_selection_decoration_clips` も同じ Fail Safe でなければならない。
        //
        // 修正前の実装は `fit_scale` こそ 1.0 にフォールバックしていたが、
        // その後段の `offset_x/y` 計算で分母が 0 になった `canvas_width` を
        // そのまま使っていたため `offset = drawable_size * 0.5` という巨大な
        // オフセットが生まれ、金枠・ハンドルが drawable 中心へ大きくシフトして
        // しまっていた（実機バグ: 選択枠が preview 外・タイムライン付近まで
        // ずれて見える）。canvas_width=0 は「まだ projectSettings が来ていない」
        // 起動直後などに起こり得るため、Fail Safe で無変換（offset=0）に
        // 倒すのが scene 本体との整合が取れる唯一の挙動である。
        let state = SelectionDecorationState {
            canvas_width: 0,
            canvas_height: 0,
            quads: vec![SelectionDecorationQuad {
                top_left: (100.0, 100.0),
                top_right: (300.0, 100.0),
                bottom_right: (300.0, 200.0),
                bottom_left: (100.0, 200.0),
            }],
        };
        let (clips, _sources) = build_selection_decoration_clips(&state, 960, 540, 1.0);

        // 無変換（fit_scale=1.0, offset=0）なら上辺は quad 座標そのまま
        // （TL(100,100)→TR(300,100)）を線幅 2 で載せた位置になるはずで、
        // offset_x/y はどちらも 0 でなければならない。
        let top = &clips[0];
        assert_approx(top.transform.translation_x, 99.0, "top edge translation_x (no offset)");
        assert_approx(top.transform.translation_y, 99.0, "top edge translation_y (no offset)");
        assert_approx(top.transform.scale_x, 202.0, "top edge scale_x (no fit scale)");
        assert_approx(top.transform.scale_y, 2.0, "top edge scale_y (no fit scale)");
    }

    #[test]
    fn selection_decoration_clips_outside_drawable_bounds_are_clipped_by_the_render_target() {
        // 契約 (5) — quad が drawable 境界の外へはみ出す座標を持っていても、
        // offscreen render は drawable サイズのテクスチャにしか書き込めない
        // （wgpu のフラグメントシェーダーはレンダーターゲット外のピクセルに
        // 対して呼ばれない）ため、はみ出した分は自動的に切り捨てられ、
        // パニックや drawable 外への書き込みは起こらないことを固定する。
        // quad 全体が drawable（100x100）の右下はるか外側にある。
        let state = SelectionDecorationState {
            canvas_width: 100,
            canvas_height: 100,
            quads: vec![SelectionDecorationQuad {
                top_left: (500.0, 500.0),
                top_right: (700.0, 500.0),
                bottom_right: (700.0, 700.0),
                bottom_left: (500.0, 700.0),
            }],
        };
        let (mut snapshot, mut sources) = build_empty_scene_snapshot_for_transparent_clear();
        append_selection_decoration_to_scene(&mut snapshot, &mut sources, &state, 100, 100, 1.0);

        let frame = pollster::block_on(render_native_wgpu_frame(&snapshot, &sources, 100, 100))
            .expect("offscreen render of an out-of-bounds decoration must not panic");

        assert_eq!(frame.pixels.len(), 100 * 100 * 4, "frame must stay drawable-sized");
        assert!(
            frame.pixels.iter().all(|byte| *byte == 0),
            "drawable must remain fully transparent when the decoration falls entirely outside it"
        );
    }

    fn unique_shm_name() -> String {
        let micros = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_micros()
            % 1_000_000;
        let counter = SHM_NAME_COUNTER.fetch_add(1, Ordering::Relaxed);
        format!("/uxfd-overlay{}-{micros}-{counter}", std::process::id())
    }

    fn unique_temp_path(label: &str, extension: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "uxfd-{label}-{}-{nanos}.{extension}",
            std::process::id()
        ))
    }
}
