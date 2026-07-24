use raw_window_handle::{
    AppKitWindowHandle, DisplayHandle, HandleError, HasDisplayHandle, HasWindowHandle, WindowHandle,
};
use std::borrow::Cow;
use std::collections::{HashMap, HashSet, VecDeque};
use std::ptr::NonNull;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use uxfd_golden_harness::{RgbaFrame, RgbaFrameError};
use uxfd_rust_core::{
    AudioWaveformSceneError, AudioWaveformSource, Effect, EvaluatedClip, Nv12IoSurfaceRef,
    SamplingMode, SceneSnapshot, WipeEdge,
};
use uxfd_shared_memory_spike::PosixSharedRing;
use uxfd_sidecar_protocol::{
    rgba8_srgb_ring_layout, ColourMetadata, FrameFormat, FrameRingLayoutBuildError, SharedFrame,
};
use wgpu::util::DeviceExt;

mod audio_reactive;
mod getcolor;
mod hksy;
#[cfg(target_os = "macos")]
mod metal_encode_target;
#[cfg(not(target_os = "macos"))]
#[path = "metal_encode_target_stub.rs"]
mod metal_encode_target;
mod nv12;
mod particle;
mod simple_tube;
pub use audio_reactive::NativeAudioReactiveSource;
pub use getcolor::NativeGetColorSource;
pub use hksy::NativeHksySource;
pub use nv12::{
    Nv12ColourMatrix, Nv12ColourRange, Nv12IoSurfaceSource, SceneLayer, SceneLayerContent,
};
pub use particle::NativeParticleSource;
pub use simple_tube::NativeSimpleTubeSource;

const OUTPUT_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8UnormSrgb;
const OUTPUT_BYTES_PER_PIXEL: u32 = 4;
const SOURCE_BYTES_PER_PIXEL: u32 = 4;
const COPY_BYTES_PER_ROW_ALIGNMENT: u32 = 256;

pub trait RgbaFrameSource {
    fn rgba_frame(&self) -> &RgbaFrame;
}

impl RgbaFrameSource for RgbaFrame {
    fn rgba_frame(&self) -> &RgbaFrame {
        self
    }
}

impl RgbaFrameSource for Arc<RgbaFrame> {
    fn rgba_frame(&self) -> &RgbaFrame {
        self.as_ref()
    }
}

pub fn native_wgpu_readback_frame_format() -> FrameFormat {
    FrameFormat::Rgba8Srgb
}

#[derive(Debug)]
pub enum NativeWgpuRenderError {
    AdapterUnavailable,
    CreateSurface(wgpu::CreateSurfaceError),
    RequestDevice(wgpu::RequestDeviceError),
    Surface(wgpu::SurfaceError),
    MissingSource {
        media_id: String,
    },
    SourceSizeMismatch {
        media_id: String,
        expected_width: u32,
        expected_height: u32,
        actual_width: u32,
        actual_height: u32,
    },
    FrameSizeExceedsAdapterLimit {
        width: u32,
        height: u32,
        max_texture_dimension_2d: u32,
    },
    UnsupportedTransform {
        clip_id: String,
    },
    SharedFrameLayout(FrameRingLayoutBuildError),
    SharedMemory(uxfd_shared_memory_spike::PosixShmError),
    AudioWaveform(AudioWaveformSceneError),
    GetColor(String),
    Hksy(String),
    SimpleTube(String),
    BufferMap,
    InvalidFrame(RgbaFrameError),
    /// NV12 IOSurface import は macOS(Metal) 専用。他プラットフォームでは
    /// ビルドは通るが、実際に NV12 クリップを渡すとこのエラーになる。
    Nv12ImportUnsupportedPlatform,
    /// `IOSurfaceLookup` が指定 `surface_id` を解決できなかった
    /// （デコード側がすでに解放した／不正な id を渡した等）。
    Nv12SurfaceLookupFailed {
        surface_id: u32,
    },
    BgraImportUnsupportedPlatform,
    BgraSurfaceLookupFailed {
        surface_id: u32,
    },
    BgraSurfaceSizeMismatch {
        surface_id: u32,
        expected_width: u32,
        expected_height: u32,
        actual_width: u32,
        actual_height: u32,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BgraIoSurfaceTarget {
    pub surface_id: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NativeAudioWaveformInput {
    pub media_id: String,
    pub source: AudioWaveformSource,
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NativeWgpuFrameStageTimings {
    pub setup: Duration,
    pub source_upload: Duration,
    /// `Surface::get_current_texture()` の同期ブロック待ち時間（CAMetalLayer
    /// drawable 取得待ち）。live surface 経路以外（export/readback/offscreen）
    /// では drawable 取得が発生しないため常に `Duration::ZERO`。
    pub acquire: Duration,
    pub render: Duration,
    pub readback_encode: Duration,
    pub steady_state: Duration,
    pub total: Duration,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeWgpuFrameReport {
    pub width: u32,
    pub height: u32,
    pub frame: RgbaFrame,
    pub prepared_clip_count: usize,
    pub timings: NativeWgpuFrameStageTimings,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeWgpuPresentReport {
    pub width: u32,
    pub height: u32,
    pub prepared_clip_count: usize,
    pub timings: NativeWgpuFrameStageTimings,
}

/// 残像診断（`UXFD_OVERLAY_CLEAR_READBACK=1`）専用のレポート。
/// clear（空シーン present）時に、`get_current_texture` で取得した実 drawable の
/// **描画前（pre_clear）** と **透明クリア描画後（post_clear）** の非透明ピクセル数を
/// 実サーフェステクスチャから readback して返す。
/// - `pre_clear_non_transparent_pixels > 0`: swapchain が「前フレームの動画が残った
///   drawable」を再利用して返している（Immediate present での drawable 保持＝仮説1）。
/// - `post_clear_non_transparent_pixels > 0`: 透明クリア描画自体が効いていない
///   （native の clear render のバグ）。
/// - 両方 0: 我々が present する drawable は実際に透明＝残像の主体は overlay
///   サーフェス外（背後の DOM canvas／compositor＝仮説2）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeWgpuClearReadbackReport {
    pub width: u32,
    pub height: u32,
    pub prepared_clip_count: usize,
    pub pre_clear_non_transparent_pixels: u64,
    pub post_clear_non_transparent_pixels: u64,
}

#[derive(Debug)]
pub struct NativeWgpuSharedFrameReport {
    pub ring: PosixSharedRing,
    pub slot_count: u32,
    pub slot_byte_len: u64,
    pub shared_frame: SharedFrame,
    pub timings: NativeWgpuFrameStageTimings,
}

pub struct NativeWgpuRenderer {
    width: u32,
    height: u32,
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    output_texture: wgpu::Texture,
    readback_buffer: wgpu::Buffer,
    /// live surface 専用の base scene（デコレーション上乗せ前の scene）prepared
    /// clip キャッシュ。呼び出し側が渡す `generation`（scene 世代カウンタ）が
    /// 前回と同じであれば、`create_texture`/`write_texture`/`create_bind_group`
    /// を一切行わず前回の GPU リソース（`Arc<PreparedClip>`）を再利用する。
    /// export / readback / offscreen render の既存経路（`prepare_scene_clips` /
    /// `prepare_scene_clips_without_upload_fence`）はこのキャッシュを一切参照
    /// しないため、既存の挙動には影響しない。
    prepared_scene_cache: Mutex<Option<PreparedSceneCache>>,
    /// テスト計測用フック。キャッシュ hit/miss 回数を数える。本番挙動には影響しない。
    prepared_scene_cache_hits: AtomicU64,
    prepared_scene_cache_misses: AtomicU64,
    /// media_id ＋呼び出し側供給の内容世代（revision）でキー付けした GPU
    /// テクスチャキャッシュ。毎フレーム全クリップのテクスチャを作り直す既存の
    /// `prepare_clip` の代わりに、内容が変わっていないクリップは
    /// `create_texture`/`write_texture` を一切行わず前回のテクスチャを再利用する
    /// （transform/opacity/effects のみ変わるドラッグ中の静止画・PSD・生成
    /// テキスト等が主な対象）。呼び出し側が revision を渡さない media_id は
    /// 常にミス扱いとし、既存の「毎フレーム再生成」挙動をそのまま維持する。
    media_texture_cache: Mutex<MediaTextureCache>,
    /// テスト計測用フック。キャッシュ hit/miss 回数を数える。本番挙動には影響しない。
    media_texture_cache_hits: AtomicU64,
    media_texture_cache_misses: AtomicU64,
    /// Phase 4b: NV12 IOSurface クリップ用の合成パイプライン（RGBA 用
    /// `pipeline`/`bind_group_layout` とは別のシェーダ・バインドグループ
    /// レイアウトを持つが、blend state・出力フォーマット・頂点シェーダは
    /// 完全に同一なので同一レンダーパス内で両方の pipeline を交互に
    /// `set_pipeline` して合成できる）。
    nv12_pipeline: wgpu::RenderPipeline,
    nv12_bind_group_layout: wgpu::BindGroupLayout,
    bgra_pipeline: wgpu::RenderPipeline,
    nv12_bgra_pipeline: wgpu::RenderPipeline,
    /// media_id ＋ (surface_id, revision) でキー付けした NV12 Y/CbCr
    /// プレーンテクスチャキャッシュ。`media_texture_cache` と同じ設計。
    nv12_texture_cache: Mutex<nv12::Nv12MediaTextureCache>,
    /// テスト計測用フック。キャッシュ hit/miss 回数を数える。本番挙動には影響しない。
    nv12_texture_cache_hits: AtomicU64,
    nv12_texture_cache_misses: AtomicU64,
    particle_renderer: particle::ParticleGpuRenderer,
    audio_reactive_renderer: audio_reactive::AudioReactiveGpuRenderer,
    getcolor_renderer: getcolor::GetColorGpuRenderer,
    hksy_renderer: hksy::HksyGpuRenderer,
    simple_tube_renderer: simple_tube::SimpleTubeGpuRenderer,
}

/// live surface 専用の prepared clip キャッシュ 1 世代分。
/// `prepare_scene_clips_with_upload_fence` は内部で clip を z_index 昇順に
/// ソートしてから prepare するため、呼び出し元の `snapshot.clips`（元の順序）
/// と `Vec<Arc<PreparedClip>>` のインデックスは対応しない。合成先
/// （`present_scene_with_decoration_to_surface_texture`）で z_index を正しく
/// 再構築できるよう、prepared clip とその z_index をペアで保持する。
struct PreparedSceneCache {
    generation: u64,
    prepared_clips: Vec<(u32, Arc<PreparedClip>)>,
}

/// media_id 単位の GPU テクスチャキャッシュ 1 エントリ。
struct MediaTextureCacheEntry {
    /// 呼び出し側が供給する内容世代。同じ値が続く限り `texture` を再利用する。
    revision: u64,
    texture: wgpu::Texture,
    /// アップロード済みテクスチャの実サイズ（downscale後の値。RenderParams
    /// の source_width/source_height をキャッシュ hit 時にも正しく埋める
    /// ために保持する）。
    width: u32,
    height: u32,
    /// アップロード済みピクセルバイト数（バイト予算によるLRU退避の判定に使う）。
    byte_len: usize,
    /// この media_id を参照するクリップが何フレーム連続で不在だったか。
    /// 毎フレーム `evict_stale_media_textures` で更新し、閾値超過で退避する。
    idle_frames: u64,
}

/// `SourceFrameCache`（rust-backend/src/state.rs）と同じ設計（エントリ数上限＋
/// バイト予算＋挿入順キューによる単純 LRU）を GPU テクスチャ向けに踏襲する。
#[derive(Default)]
struct MediaTextureCache {
    entries: HashMap<String, MediaTextureCacheEntry>,
    /// 直近アクセス順（最も長く触れられていないものが先頭）。
    order: VecDeque<String>,
    total_bytes: usize,
}

/// 512MB — `SourceFrameCache`（CPU側デコード結果）のバイト予算と揃える。
const MEDIA_TEXTURE_CACHE_MAX_BYTES: usize = 512 * 1024 * 1024;
/// この回数だけ連続して参照されなかった media のテクスチャは、バイト予算内でも
/// 即座に退避する（クリップ削除・シーンクリア後にすぐ GPU メモリを解放するため）。
const MEDIA_TEXTURE_CACHE_IDLE_FRAME_LIMIT: u64 = 30;

impl MediaTextureCache {
    fn touch(&mut self, media_id: &str) {
        if let Some(position) = self.order.iter().position(|existing| existing == media_id) {
            if let Some(moved) = self.order.remove(position) {
                self.order.push_back(moved);
            }
        }
    }

    fn remove(&mut self, media_id: &str) {
        if let Some(removed) = self.entries.remove(media_id) {
            self.total_bytes = self.total_bytes.saturating_sub(removed.byte_len);
        }
        self.order.retain(|existing| existing != media_id);
    }

    fn insert(&mut self, media_id: String, entry: MediaTextureCacheEntry) {
        let byte_len = entry.byte_len;
        if let Some(previous) = self.entries.insert(media_id.clone(), entry) {
            self.total_bytes = self.total_bytes.saturating_sub(previous.byte_len);
            self.order.retain(|existing| existing != &media_id);
        }
        self.order.push_back(media_id);
        self.total_bytes += byte_len;
    }
}

pub struct NativeWgpuLiveSurfaceRenderer {
    #[allow(dead_code)]
    instance: wgpu::Instance,
    surface: wgpu::Surface<'static>,
    surface_config: wgpu::SurfaceConfiguration,
    core: NativeWgpuRenderer,
}

impl NativeWgpuLiveSurfaceRenderer {
    #[cfg(target_os = "macos")]
    pub async fn from_appkit_view(
        view_handle: usize,
        width: u32,
        height: u32,
    ) -> Result<Self, NativeWgpuRenderError> {
        let instance = wgpu::Instance::default();
        let appkit_view = AppKitSurfaceView::new(view_handle);
        let target = unsafe { wgpu::SurfaceTargetUnsafe::from_window(&appkit_view) }
            .map_err(|_| NativeWgpuRenderError::AdapterUnavailable)?;
        let surface = unsafe { instance.create_surface_unsafe(target) }
            .map_err(NativeWgpuRenderError::CreateSurface)?;
        Self::from_surface(instance, surface, width, height).await
    }

    pub async fn from_surface(
        instance: wgpu::Instance,
        surface: wgpu::Surface<'static>,
        width: u32,
        height: u32,
    ) -> Result<Self, NativeWgpuRenderError> {
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .ok_or(NativeWgpuRenderError::AdapterUnavailable)?;
        let required_limits = required_limits_for_frame(&adapter, width, height)?;
        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("UXFD native wgpu live surface device"),
                    required_features: wgpu::Features::empty(),
                    required_limits,
                },
                None,
            )
            .await
            .map_err(NativeWgpuRenderError::RequestDevice)?;
        install_uncaptured_error_logging(&device, "UXFD native wgpu live surface device");
        let capabilities = surface.get_capabilities(&adapter);
        let surface_format = choose_live_surface_format(&capabilities.formats);
        let surface_config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            format: surface_format,
            width: width.max(1),
            height: height.max(1),
            present_mode: choose_live_surface_present_mode(&capabilities.present_modes),
            // Bug D — CAMetalLayer の opaque=NO 設定と合わせ、透明 clear
            // （`LoadOp::Clear(wgpu::Color::TRANSPARENT)`）の結果を実際に
            // compositor まで届けるため、premultiplied alpha を明示する。
            // wgpu が返す `alpha_modes.first()` は macOS で `Opaque` になり得て
            // 透明 clear を潰すため、`choose_live_surface_alpha_mode` で
            // PreMultiplied を優先して選ぶ。
            alpha_mode: choose_live_surface_alpha_mode(&capabilities.alpha_modes),
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        surface.configure(&device, &surface_config);

        let pipeline = create_pipeline_for_format(&device, surface_format);
        let bind_group_layout = pipeline.get_bind_group_layout(0);
        let (nv12_bind_group_layout, nv12_pipeline) =
            nv12::create_nv12_pipeline_for_format(&device, surface_format);
        let bgra_pipeline = create_pipeline_for_format_with_layout(
            &device,
            wgpu::TextureFormat::Bgra8UnormSrgb,
            &bind_group_layout,
        );
        let nv12_bgra_pipeline = nv12::create_nv12_pipeline_for_format_with_layout(
            &device,
            wgpu::TextureFormat::Bgra8UnormSrgb,
            &nv12_bind_group_layout,
        );
        let output_texture =
            create_output_texture_for_format(&device, width, height, surface_format);
        let readback_buffer = create_readback_buffer(&device, width, height);
        let particle_renderer = particle::ParticleGpuRenderer::new(&device);
        let audio_reactive_renderer = audio_reactive::AudioReactiveGpuRenderer::new(&device);
        let getcolor_renderer = getcolor::GetColorGpuRenderer::new(&device);
        let hksy_renderer = hksy::HksyGpuRenderer::new(&device);
        let simple_tube_renderer = simple_tube::SimpleTubeGpuRenderer::new(&device);
        let core = NativeWgpuRenderer {
            width,
            height,
            device,
            queue,
            pipeline,
            bind_group_layout,
            output_texture,
            readback_buffer,
            prepared_scene_cache: Mutex::new(None),
            prepared_scene_cache_hits: AtomicU64::new(0),
            prepared_scene_cache_misses: AtomicU64::new(0),
            media_texture_cache: Mutex::new(MediaTextureCache::default()),
            media_texture_cache_hits: AtomicU64::new(0),
            media_texture_cache_misses: AtomicU64::new(0),
            nv12_pipeline,
            nv12_bind_group_layout,
            bgra_pipeline,
            nv12_bgra_pipeline,
            nv12_texture_cache: Mutex::new(nv12::Nv12MediaTextureCache::default()),
            nv12_texture_cache_hits: AtomicU64::new(0),
            nv12_texture_cache_misses: AtomicU64::new(0),
            particle_renderer,
            audio_reactive_renderer,
            getcolor_renderer,
            hksy_renderer,
            simple_tube_renderer,
        };

        Ok(Self {
            instance,
            surface,
            surface_config,
            core,
        })
    }

    pub async fn present_scene_to_surface_texture(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
    ) -> Result<NativeWgpuPresentReport, NativeWgpuRenderError> {
        let total_start = Instant::now();
        let (prepared_clips, source_upload) = self.core.prepare_scene_clips_without_upload_fence(
            snapshot,
            sources,
            &HashMap::new(),
        )?;
        let acquire_start = Instant::now();
        let surface_texture = self
            .surface
            .get_current_texture()
            .map_err(NativeWgpuRenderError::Surface)?;
        let acquire = acquire_start.elapsed();
        let view = surface_texture
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder =
            self.core
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("UXFD native wgpu live surface encoder"),
                });
        self.core
            .encode_prepared_clips(&mut encoder, &view, &prepared_clips);
        let render_start = Instant::now();
        self.core.queue.submit(Some(encoder.finish()));
        surface_texture.present();
        let render = render_start.elapsed();

        Ok(NativeWgpuPresentReport {
            width: self.surface_config.width,
            height: self.surface_config.height,
            prepared_clip_count: prepared_clips.len(),
            timings: NativeWgpuFrameStageTimings {
                setup: Duration::ZERO,
                source_upload,
                acquire,
                render,
                readback_encode: Duration::ZERO,
                steady_state: source_upload + acquire + render,
                total: total_start.elapsed(),
            },
        })
    }

    /// live surface 専用: base scene（デコレーション上乗せ前）の prepared clip を
    /// `base_generation` でキャッシュし、同一世代の再 present ではテクスチャ生成・
    /// write_texture・bind group 構築を一切行わず前回の GPU リソースを再利用する。
    /// デコレーション（選択枠 quad 等）は毎回軽量に prepare し直し、base の
    /// prepared clip 列と z_index 順で合成して 1 回の render pass に描く。
    ///
    /// キャッシュキーは scene 世代カウンタのみ（内容の等価性チェックはしない）。
    /// 呼び出し側（native-overlay）が「シーンが変わったら generation を進める」
    /// 契約を守る前提。export / readback / offscreen render の既存経路
    /// （`prepare_scene_clips` / `prepare_scene_clips_without_upload_fence`）は
    /// このキャッシュを一切参照しないため、既存の挙動には影響しない。
    pub async fn present_scene_with_decoration_to_surface_texture<S: RgbaFrameSource>(
        &self,
        base_generation: u64,
        base_snapshot: &SceneSnapshot,
        base_sources: &HashMap<String, S>,
        content_revisions: &HashMap<String, u64>,
        decoration_clips: &[uxfd_rust_core::EvaluatedClip],
        decoration_sources: &HashMap<String, RgbaFrame>,
    ) -> Result<NativeWgpuPresentReport, NativeWgpuRenderError> {
        let total_start = Instant::now();
        let (base_prepared_clips, base_source_upload) = self.core.prepare_base_scene_clips_cached(
            base_generation,
            base_snapshot,
            base_sources,
            content_revisions,
        )?;
        let (decoration_prepared_clips, decoration_source_upload) =
            self.core.prepare_scene_clips_without_upload_fence(
                &SceneSnapshot {
                    frame_index: base_snapshot.frame_index,
                    colour: base_snapshot.colour.clone(),
                    clips: decoration_clips.to_vec(),
                },
                decoration_sources,
                &HashMap::new(),
            )?;
        let source_upload = base_source_upload + decoration_source_upload;

        // base（キャッシュ済み・既に z_index とペア）と decoration
        // （SELECTION_DECORATION_*_Z_INDEX が u32::MAX 近傍のため通常は末尾）を
        // z_index 順に合成する。
        let mut merged: Vec<(u32, Arc<PreparedClip>)> = base_prepared_clips;
        merged.extend(
            decoration_clips
                .iter()
                .map(|clip| clip.z_index)
                .zip(decoration_prepared_clips.into_iter()),
        );
        merged.sort_by_key(|(z_index, _)| *z_index);
        let prepared_clip_count = merged.len();
        let prepared_clips: Vec<Arc<PreparedClip>> =
            merged.into_iter().map(|(_, prepared)| prepared).collect();

        let acquire_start = Instant::now();
        let surface_texture = self
            .surface
            .get_current_texture()
            .map_err(NativeWgpuRenderError::Surface)?;
        let acquire = acquire_start.elapsed();
        let view = surface_texture
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder =
            self.core
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("UXFD native wgpu live surface decoration encoder"),
                });
        self.core
            .encode_prepared_clips(&mut encoder, &view, &prepared_clips);
        let render_start = Instant::now();
        self.core.queue.submit(Some(encoder.finish()));
        surface_texture.present();
        let render = render_start.elapsed();

        Ok(NativeWgpuPresentReport {
            width: self.surface_config.width,
            height: self.surface_config.height,
            prepared_clip_count,
            timings: NativeWgpuFrameStageTimings {
                setup: Duration::ZERO,
                source_upload,
                acquire,
                render,
                readback_encode: Duration::ZERO,
                steady_state: source_upload + acquire + render,
                total: total_start.elapsed(),
            },
        })
    }

    /// live surface 専用: RGBA source と、同一プロセスで decode された NV12
    /// IOSurface source を混在合成し、CPU readback なしで CAMetalLayer drawable
    /// へ直接 present する。
    pub async fn present_scene_with_decoration_and_nv12_to_surface_texture<S: RgbaFrameSource>(
        &self,
        base_snapshot: &SceneSnapshot,
        base_sources: &HashMap<String, S>,
        content_revisions: &HashMap<String, u64>,
        nv12_sources: &HashMap<String, Nv12IoSurfaceRef>,
        particle_sources: &HashMap<String, NativeParticleSource>,
        audio_reactive_sources: &HashMap<String, NativeAudioReactiveSource>,
        getcolor_sources: &HashMap<String, NativeGetColorSource>,
        hksy_sources: &HashMap<String, NativeHksySource>,
        simple_tube_sources: &HashMap<String, NativeSimpleTubeSource>,
        decoration_clips: &[uxfd_rust_core::EvaluatedClip],
        decoration_sources: &HashMap<String, RgbaFrame>,
    ) -> Result<NativeWgpuPresentReport, NativeWgpuRenderError> {
        let total_start = Instant::now();
        let (base_prepared_clips, base_source_upload) =
            self.core.prepare_scene_clips_with_upload_fence(
                base_snapshot,
                base_sources,
                nv12_sources,
                particle_sources,
                audio_reactive_sources,
                getcolor_sources,
                hksy_sources,
                simple_tube_sources,
                false,
                content_revisions,
            )?;
        let (decoration_prepared_clips, decoration_source_upload) =
            self.core.prepare_scene_clips_without_upload_fence(
                &SceneSnapshot {
                    frame_index: base_snapshot.frame_index,
                    colour: base_snapshot.colour.clone(),
                    clips: decoration_clips.to_vec(),
                },
                decoration_sources,
                &HashMap::new(),
            )?;
        let source_upload = base_source_upload + decoration_source_upload;

        let mut base_z_indices: Vec<u32> = base_snapshot
            .clips
            .iter()
            .map(|clip| clip.z_index)
            .collect();
        base_z_indices.sort_unstable();
        let mut merged: Vec<(u32, Arc<PreparedClip>)> = base_z_indices
            .into_iter()
            .zip(base_prepared_clips)
            .collect();
        merged.extend(
            decoration_clips
                .iter()
                .map(|clip| clip.z_index)
                .zip(decoration_prepared_clips),
        );
        merged.sort_by_key(|(z_index, _)| *z_index);
        let prepared_clip_count = merged.len();
        let prepared_clips: Vec<Arc<PreparedClip>> =
            merged.into_iter().map(|(_, prepared)| prepared).collect();

        let acquire_start = Instant::now();
        let surface_texture = self
            .surface
            .get_current_texture()
            .map_err(NativeWgpuRenderError::Surface)?;
        let acquire = acquire_start.elapsed();
        let view = surface_texture
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder =
            self.core
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("UXFD native wgpu live NV12 decoration encoder"),
                });
        self.core
            .encode_prepared_clips(&mut encoder, &view, &prepared_clips);
        let render_start = Instant::now();
        self.core.queue.submit(Some(encoder.finish()));
        surface_texture.present();
        let render = render_start.elapsed();

        Ok(NativeWgpuPresentReport {
            width: self.surface_config.width,
            height: self.surface_config.height,
            prepared_clip_count,
            timings: NativeWgpuFrameStageTimings {
                setup: Duration::ZERO,
                source_upload,
                acquire,
                render,
                readback_encode: Duration::ZERO,
                steady_state: source_upload + acquire + render,
                total: total_start.elapsed(),
            },
        })
    }

    pub async fn present_scene_to_surface_texture_with_readback(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
    ) -> Result<NativeWgpuFrameReport, NativeWgpuRenderError> {
        let total_start = Instant::now();
        let (prepared_clips, source_upload) =
            self.core
                .prepare_scene_clips(snapshot, sources, &HashMap::new())?;
        let acquire_start = Instant::now();
        let surface_texture = self
            .surface
            .get_current_texture()
            .map_err(NativeWgpuRenderError::Surface)?;
        let acquire = acquire_start.elapsed();
        let view = surface_texture
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder =
            self.core
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("UXFD native wgpu live surface readback encoder"),
                });
        self.core
            .encode_prepared_clips(&mut encoder, &view, &prepared_clips);
        copy_live_surface_texture_to_readback(
            &mut encoder,
            &surface_texture.texture,
            &self.core.readback_buffer,
            self.surface_config.width,
            self.surface_config.height,
        );

        let render_start = Instant::now();
        self.core.queue.submit(Some(encoder.finish()));
        surface_texture.present();
        wait_for_submitted_work(&self.core.device, &self.core.queue)?;
        let render = render_start.elapsed();

        let readback_encode_start = Instant::now();
        let frame = readback_to_rgba8(
            &self.core.device,
            &self.core.readback_buffer,
            self.surface_config.format,
            self.surface_config.width,
            self.surface_config.height,
        )?;
        let readback_encode = readback_encode_start.elapsed();

        Ok(NativeWgpuFrameReport {
            width: self.surface_config.width,
            height: self.surface_config.height,
            frame,
            prepared_clip_count: prepared_clips.len(),
            timings: NativeWgpuFrameStageTimings {
                setup: Duration::ZERO,
                source_upload,
                acquire,
                render,
                readback_encode,
                steady_state: source_upload + acquire + render + readback_encode,
                total: total_start.elapsed(),
            },
        })
    }

    /// 残像診断専用（`UXFD_OVERLAY_CLEAR_READBACK=1`）— clear（空シーン
    /// present）と同じ描画を行いつつ、実 drawable の pre_clear / post_clear の
    /// 非透明ピクセル数を readback する。通常経路
    /// （`present_scene_with_decoration_to_surface_texture`）と描画内容は同一だが、
    /// 取得した drawable への copy_texture_to_buffer（描画前・描画後）が追加される
    /// ぶん重いので、既定では呼ばれない。per-frame upload fence を跨がない軽量な
    /// video present 経路（`present_scene_to_surface_texture`）とは別物で、この
    /// readback 経路のみ `wait_for_submitted_work` を用いる。
    pub async fn present_scene_with_decoration_to_surface_texture_with_clear_readback<
        S: RgbaFrameSource,
    >(
        &self,
        base_generation: u64,
        base_snapshot: &SceneSnapshot,
        base_sources: &HashMap<String, S>,
        content_revisions: &HashMap<String, u64>,
        decoration_clips: &[uxfd_rust_core::EvaluatedClip],
        decoration_sources: &HashMap<String, RgbaFrame>,
    ) -> Result<NativeWgpuClearReadbackReport, NativeWgpuRenderError> {
        let (base_prepared_clips, _base_source_upload) =
            self.core.prepare_base_scene_clips_cached(
                base_generation,
                base_snapshot,
                base_sources,
                content_revisions,
            )?;
        let (decoration_prepared_clips, _decoration_source_upload) =
            self.core.prepare_scene_clips_without_upload_fence(
                &SceneSnapshot {
                    frame_index: base_snapshot.frame_index,
                    colour: base_snapshot.colour.clone(),
                    clips: decoration_clips.to_vec(),
                },
                decoration_sources,
                &HashMap::new(),
            )?;
        let mut merged: Vec<(u32, Arc<PreparedClip>)> = base_prepared_clips;
        merged.extend(
            decoration_clips
                .iter()
                .map(|clip| clip.z_index)
                .zip(decoration_prepared_clips.into_iter()),
        );
        merged.sort_by_key(|(z_index, _)| *z_index);
        let prepared_clip_count = merged.len();
        let prepared_clips: Vec<Arc<PreparedClip>> =
            merged.into_iter().map(|(_, prepared)| prepared).collect();

        let width = self.surface_config.width;
        let height = self.surface_config.height;
        let pre_clear_buffer = create_readback_buffer(&self.core.device, width, height);
        let post_clear_buffer = create_readback_buffer(&self.core.device, width, height);

        let surface_texture = self
            .surface
            .get_current_texture()
            .map_err(NativeWgpuRenderError::Surface)?;
        let view = surface_texture
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder =
            self.core
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("UXFD native wgpu live surface clear-readback encoder"),
                });
        // 描画前の drawable 残留（swapchain が再利用して返した内容）を捕捉。
        copy_live_surface_texture_to_readback(
            &mut encoder,
            &surface_texture.texture,
            &pre_clear_buffer,
            width,
            height,
        );
        // 通常の clear と同一の描画（空シーン + デコレーション）。
        self.core
            .encode_prepared_clips(&mut encoder, &view, &prepared_clips);
        // 透明クリア描画後の drawable 内容を捕捉。
        copy_live_surface_texture_to_readback(
            &mut encoder,
            &surface_texture.texture,
            &post_clear_buffer,
            width,
            height,
        );
        self.core.queue.submit(Some(encoder.finish()));
        surface_texture.present();
        wait_for_submitted_work(&self.core.device, &self.core.queue)?;

        let pre_frame = readback_to_rgba8(
            &self.core.device,
            &pre_clear_buffer,
            self.surface_config.format,
            width,
            height,
        )?;
        let post_frame = readback_to_rgba8(
            &self.core.device,
            &post_clear_buffer,
            self.surface_config.format,
            width,
            height,
        )?;

        Ok(NativeWgpuClearReadbackReport {
            width,
            height,
            prepared_clip_count,
            pre_clear_non_transparent_pixels: count_non_transparent_pixels(&pre_frame),
            post_clear_non_transparent_pixels: count_non_transparent_pixels(&post_frame),
        })
    }
}

#[cfg(target_os = "macos")]
struct AppKitSurfaceView {
    view_handle: usize,
}

#[cfg(target_os = "macos")]
impl AppKitSurfaceView {
    fn new(view_handle: usize) -> Self {
        Self { view_handle }
    }
}

#[cfg(target_os = "macos")]
impl HasDisplayHandle for AppKitSurfaceView {
    fn display_handle(&self) -> Result<DisplayHandle<'_>, HandleError> {
        Ok(DisplayHandle::appkit())
    }
}

#[cfg(target_os = "macos")]
impl HasWindowHandle for AppKitSurfaceView {
    fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
        let view = NonNull::new(self.view_handle as *mut std::ffi::c_void)
            .ok_or(HandleError::Unavailable)?;
        let handle = AppKitWindowHandle::new(view);
        Ok(unsafe { WindowHandle::borrow_raw(handle.into()) })
    }
}

impl NativeWgpuRenderer {
    pub async fn new(width: u32, height: u32) -> Result<Self, NativeWgpuRenderError> {
        let instance = wgpu::Instance::default();
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            })
            .await
            .ok_or(NativeWgpuRenderError::AdapterUnavailable)?;
        let required_limits = required_limits_for_frame(&adapter, width, height)?;
        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("UXFD native wgpu device"),
                    required_features: wgpu::Features::empty(),
                    required_limits,
                },
                None,
            )
            .await
            .map_err(NativeWgpuRenderError::RequestDevice)?;
        install_uncaptured_error_logging(&device, "UXFD native wgpu device");

        let pipeline = create_pipeline(&device);
        let bind_group_layout = pipeline.get_bind_group_layout(0);
        let (nv12_bind_group_layout, nv12_pipeline) =
            nv12::create_nv12_pipeline_for_format(&device, OUTPUT_FORMAT);
        let bgra_pipeline = create_pipeline_for_format_with_layout(
            &device,
            wgpu::TextureFormat::Bgra8UnormSrgb,
            &bind_group_layout,
        );
        let nv12_bgra_pipeline = nv12::create_nv12_pipeline_for_format_with_layout(
            &device,
            wgpu::TextureFormat::Bgra8UnormSrgb,
            &nv12_bind_group_layout,
        );
        let output_texture = create_output_texture(&device, width, height);
        let readback_buffer = create_readback_buffer(&device, width, height);
        let particle_renderer = particle::ParticleGpuRenderer::new(&device);
        let audio_reactive_renderer = audio_reactive::AudioReactiveGpuRenderer::new(&device);
        let getcolor_renderer = getcolor::GetColorGpuRenderer::new(&device);
        let hksy_renderer = hksy::HksyGpuRenderer::new(&device);
        let simple_tube_renderer = simple_tube::SimpleTubeGpuRenderer::new(&device);

        Ok(Self {
            width,
            height,
            device,
            queue,
            pipeline,
            bind_group_layout,
            output_texture,
            readback_buffer,
            prepared_scene_cache: Mutex::new(None),
            prepared_scene_cache_hits: AtomicU64::new(0),
            prepared_scene_cache_misses: AtomicU64::new(0),
            media_texture_cache: Mutex::new(MediaTextureCache::default()),
            media_texture_cache_hits: AtomicU64::new(0),
            media_texture_cache_misses: AtomicU64::new(0),
            nv12_pipeline,
            nv12_bind_group_layout,
            bgra_pipeline,
            nv12_bgra_pipeline,
            nv12_texture_cache: Mutex::new(nv12::Nv12MediaTextureCache::default()),
            nv12_texture_cache_hits: AtomicU64::new(0),
            nv12_texture_cache_misses: AtomicU64::new(0),
            particle_renderer,
            audio_reactive_renderer,
            getcolor_renderer,
            hksy_renderer,
            simple_tube_renderer,
        })
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    /// 出力サイズ依存リソース（`output_texture`／`readback_buffer`）だけを
    /// 作り直し、`device`／`pipeline`／`bind_group_layout`／per-media GPU
    /// テクスチャキャッシュ（`media_texture_cache`）は保持する。呼び出し側
    /// （`get_or_create_native_wgpu_renderer`）が単なるペインリサイズのたびに
    /// レンダラごと（＝全クリップの GPU リソース）を破棄・再構築していたのを
    /// やめ、リサイズと無関係なキャッシュ内容を生き残らせるための入口。
    /// device 生成時点で要求した `max_texture_dimension_2d` はアダプタの実上限
    /// なので、新しい width/height がそれを超えない限り device 自体は再生成
    /// 不要（`required_limits_for_frame` 参照）。
    pub fn resize_output(&mut self, width: u32, height: u32) -> Result<(), NativeWgpuRenderError> {
        let max_texture_dimension_2d = self.device.limits().max_texture_dimension_2d;
        let required_dimension = width.max(height);
        if required_dimension > max_texture_dimension_2d {
            return Err(NativeWgpuRenderError::FrameSizeExceedsAdapterLimit {
                width,
                height,
                max_texture_dimension_2d,
            });
        }

        self.output_texture = create_output_texture(&self.device, width, height);
        self.readback_buffer = create_readback_buffer(&self.device, width, height);
        self.width = width;
        self.height = height;
        Ok(())
    }

    pub async fn render_frame_stages(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
    ) -> Result<NativeWgpuFrameReport, NativeWgpuRenderError> {
        let total_start = Instant::now();
        self.render_frame_stages_with_setup(
            snapshot,
            sources,
            Duration::ZERO,
            total_start,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
        )
        .await
    }

    /// IOSurface-backed `kCVPixelFormatType_32BGRA` の外部バッファへ scene を
    /// 直接描画する。GPU→CPU copy/readback は行わず、submit 完了だけを待つ。
    pub async fn render_frame_to_bgra_iosurface(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
        content_revisions: &HashMap<String, u64>,
        nv12_sources: &HashMap<String, Nv12IoSurfaceRef>,
        target: BgraIoSurfaceTarget,
    ) -> Result<NativeWgpuFrameStageTimings, NativeWgpuRenderError> {
        self.render_frame_to_bgra_iosurface_with_audio_reactive_sources(
            snapshot,
            sources,
            content_revisions,
            nv12_sources,
            &HashMap::new(),
            target,
        )
        .await
    }

    async fn render_frame_to_bgra_iosurface_with_audio_reactive_sources(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
        content_revisions: &HashMap<String, u64>,
        nv12_sources: &HashMap<String, Nv12IoSurfaceRef>,
        audio_reactive_sources: &HashMap<String, NativeAudioReactiveSource>,
        target: BgraIoSurfaceTarget,
    ) -> Result<NativeWgpuFrameStageTimings, NativeWgpuRenderError> {
        if target.width != self.width || target.height != self.height {
            return Err(NativeWgpuRenderError::BgraSurfaceSizeMismatch {
                surface_id: target.surface_id,
                expected_width: self.width,
                expected_height: self.height,
                actual_width: target.width,
                actual_height: target.height,
            });
        }

        let total_start = Instant::now();
        let (prepared_clips, source_upload) = self.prepare_scene_clips_with_upload_fence(
            snapshot,
            sources,
            nv12_sources,
            &HashMap::new(),
            audio_reactive_sources,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            true,
            content_revisions,
        )?;
        let target_texture =
            metal_encode_target::import_bgra_iosurface_render_target(&self.device, target)?;
        let target_view = target_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("UXFD BGRA IOSurface encoder"),
            });
        self.encode_prepared_clips_with_pipelines(
            &mut encoder,
            &target_view,
            &prepared_clips,
            &self.bgra_pipeline,
            &self.nv12_bgra_pipeline,
        );

        let render_start = Instant::now();
        self.queue.submit(Some(encoder.finish()));
        wait_for_submitted_work(&self.device, &self.queue)?;
        let render = render_start.elapsed();

        Ok(NativeWgpuFrameStageTimings {
            setup: Duration::ZERO,
            source_upload,
            acquire: Duration::ZERO,
            render,
            readback_encode: Duration::ZERO,
            steady_state: source_upload + render,
            total: total_start.elapsed(),
        })
    }

    pub async fn render_frame_to_bgra_iosurface_with_audio_waveforms(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
        waveforms: &[NativeAudioWaveformInput],
        content_revisions: &HashMap<String, u64>,
        nv12_sources: &HashMap<String, Nv12IoSurfaceRef>,
        target: BgraIoSurfaceTarget,
    ) -> Result<NativeWgpuFrameStageTimings, NativeWgpuRenderError> {
        let (generated_sources, audio_reactive_sources) =
            split_audio_waveform_sources(snapshot, sources, waveforms)?;
        self.render_frame_to_bgra_iosurface_with_audio_reactive_sources(
            snapshot,
            &generated_sources,
            content_revisions,
            nv12_sources,
            &audio_reactive_sources,
            target,
        )
        .await
    }

    pub async fn present_frame_stages(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
    ) -> Result<NativeWgpuPresentReport, NativeWgpuRenderError> {
        let total_start = Instant::now();
        self.present_frame_stages_with_setup(
            snapshot,
            sources,
            Duration::ZERO,
            total_start,
            &HashMap::new(),
        )
        .await
    }

    pub async fn render_overlay_surface_frame_for_test(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
    ) -> Result<RgbaFrame, NativeWgpuRenderError> {
        self.present_frame_stages(snapshot, sources).await?;
        self.read_output_texture_to_rgba8()
    }

    pub async fn render_frame_to_shared_ring(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
        memory_id: &str,
        slot_count: u32,
        pts_frame: u64,
    ) -> Result<NativeWgpuSharedFrameReport, NativeWgpuRenderError> {
        let report = self.render_frame_stages(snapshot, sources).await?;
        frame_report_to_shared_ring(report, memory_id, slot_count, pts_frame)
    }

    /// `content_revisions` は media_id ごとの呼び出し側供給の内容世代。
    /// 値が変わらない media_id の GPU テクスチャは再アップロードされない
    /// （`prepare_clip_cached` 参照）。呼び出し側が revision を持たない
    /// media_id は常にミス扱いになり、既存の毎フレーム再生成のまま。
    /// `nv12_sources`（Phase 4c Stage 2）は media_id ごとの zero-copy NV12
    /// IOSurface 参照。`sources` に同じ media_id のエントリが無くても
    /// （＝ CPU RGBA を一切用意しなくても）ここにエントリがあればそのまま
    /// GPU import 経路で合成される。空 map なら既存の RGBA 専用挙動と完全に
    /// 同一。
    pub async fn render_frame_to_shared_ring_with_audio_waveforms(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
        waveforms: &[NativeAudioWaveformInput],
        content_revisions: &HashMap<String, u64>,
        nv12_sources: &HashMap<String, Nv12IoSurfaceRef>,
        memory_id: &str,
        slot_count: u32,
        pts_frame: u64,
    ) -> Result<NativeWgpuSharedFrameReport, NativeWgpuRenderError> {
        let report = self
            .render_frame_stages_with_audio_waveforms(
                snapshot,
                sources,
                waveforms,
                content_revisions,
                nv12_sources,
            )
            .await?;
        frame_report_to_shared_ring(report, memory_id, slot_count, pts_frame)
    }

    /// `content_revisions`/`nv12_sources` の契約は
    /// `render_frame_to_shared_ring_with_audio_waveforms` と同じ。
    pub async fn render_frame_stages_with_audio_waveforms(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
        waveforms: &[NativeAudioWaveformInput],
        content_revisions: &HashMap<String, u64>,
        nv12_sources: &HashMap<String, Nv12IoSurfaceRef>,
    ) -> Result<NativeWgpuFrameReport, NativeWgpuRenderError> {
        let (generated_sources, audio_reactive_sources) =
            split_audio_waveform_sources(snapshot, sources, waveforms)?;
        let total_start = Instant::now();
        self.render_frame_stages_with_setup(
            snapshot,
            &generated_sources,
            Duration::ZERO,
            total_start,
            content_revisions,
            nv12_sources,
            &audio_reactive_sources,
        )
        .await
    }

    async fn render_frame_stages_with_setup(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
        setup: Duration,
        total_start: Instant,
        content_revisions: &HashMap<String, u64>,
        nv12_sources: &HashMap<String, Nv12IoSurfaceRef>,
        audio_reactive_sources: &HashMap<String, NativeAudioReactiveSource>,
    ) -> Result<NativeWgpuFrameReport, NativeWgpuRenderError> {
        let (prepared_clips, source_upload) = self.prepare_scene_clips_with_upload_fence(
            snapshot,
            sources,
            nv12_sources,
            &HashMap::new(),
            audio_reactive_sources,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            true,
            content_revisions,
        )?;
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("UXFD native wgpu encoder"),
            });

        let output_view = self
            .output_texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        self.encode_prepared_clips(&mut encoder, &output_view, &prepared_clips);

        let render_start = Instant::now();
        self.queue.submit(Some(encoder.finish()));
        wait_for_submitted_work(&self.device, &self.queue)?;
        let render = render_start.elapsed();

        let mut readback_encoder =
            self.device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("UXFD native wgpu readback encoder"),
                });

        let padded_bytes_per_row = padded_bytes_per_row(self.width);
        readback_encoder.copy_texture_to_buffer(
            wgpu::ImageCopyTexture {
                texture: &self.output_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::ImageCopyBuffer {
                buffer: &self.readback_buffer,
                layout: wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_bytes_per_row),
                    rows_per_image: Some(self.height),
                },
            },
            wgpu::Extent3d {
                width: self.width,
                height: self.height,
                depth_or_array_layers: 1,
            },
        );

        let readback_encode_start = Instant::now();
        self.queue.submit(Some(readback_encoder.finish()));
        let frame = readback_to_rgba8(
            &self.device,
            &self.readback_buffer,
            OUTPUT_FORMAT,
            self.width,
            self.height,
        )?;
        let readback_encode = readback_encode_start.elapsed();

        Ok(NativeWgpuFrameReport {
            width: self.width,
            height: self.height,
            frame,
            prepared_clip_count: prepared_clips.len(),
            timings: NativeWgpuFrameStageTimings {
                setup,
                source_upload,
                acquire: Duration::ZERO,
                render,
                readback_encode,
                steady_state: source_upload + render + readback_encode,
                total: total_start.elapsed(),
            },
        })
    }

    async fn present_frame_stages_with_setup(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
        setup: Duration,
        total_start: Instant,
        content_revisions: &HashMap<String, u64>,
    ) -> Result<NativeWgpuPresentReport, NativeWgpuRenderError> {
        let (prepared_clips, source_upload) =
            self.prepare_scene_clips(snapshot, sources, content_revisions)?;
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("UXFD native wgpu present encoder"),
            });
        let output_view = self
            .output_texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        self.encode_prepared_clips(&mut encoder, &output_view, &prepared_clips);

        let render_start = Instant::now();
        self.queue.submit(Some(encoder.finish()));
        wait_for_submitted_work(&self.device, &self.queue)?;
        let render = render_start.elapsed();

        Ok(NativeWgpuPresentReport {
            width: self.width,
            height: self.height,
            prepared_clip_count: prepared_clips.len(),
            timings: NativeWgpuFrameStageTimings {
                setup,
                source_upload,
                acquire: Duration::ZERO,
                render,
                readback_encode: Duration::ZERO,
                steady_state: source_upload + render,
                total: total_start.elapsed(),
            },
        })
    }

    fn prepare_scene_clips<S: RgbaFrameSource>(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, S>,
        content_revisions: &HashMap<String, u64>,
    ) -> Result<(Vec<Arc<PreparedClip>>, Duration), NativeWgpuRenderError> {
        self.prepare_scene_clips_with_upload_fence(
            snapshot,
            sources,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            true,
            content_revisions,
        )
    }

    fn prepare_scene_clips_without_upload_fence<S: RgbaFrameSource>(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, S>,
        content_revisions: &HashMap<String, u64>,
    ) -> Result<(Vec<Arc<PreparedClip>>, Duration), NativeWgpuRenderError> {
        self.prepare_scene_clips_with_upload_fence(
            snapshot,
            sources,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            false,
            content_revisions,
        )
    }

    /// `content_revisions` は media_id ごとの呼び出し側供給の内容世代
    /// （`get_or_upload_media_texture` 参照）。media_id が同じキーで見つからない
    /// 場合は常にミス扱いになり、`prepare_clip` 時代と同じ「毎フレーム
    /// create_texture/write_texture/create_bind_group」を行う。
    ///
    /// `nv12_sources`（Phase 4c Stage 2）: media_id がここに見つかれば
    /// `sources`（RGBA）は一切参照せず、zero-copy NV12 IOSurface import 経路
    /// （`nv12::NativeWgpuRenderer::prepare_nv12_clip`）でそのクリップを
    /// 準備する。RGBA クリップと NV12 クリップは同一シーン内で混在でき、
    /// `encode_prepared_clips` が `PreparedClip::pipeline_kind` を見て
    /// クリップごとに正しいパイプラインへ切り替える。
    fn prepare_scene_clips_with_upload_fence<S: RgbaFrameSource>(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, S>,
        nv12_sources: &HashMap<String, Nv12IoSurfaceRef>,
        particle_sources: &HashMap<String, NativeParticleSource>,
        audio_reactive_sources: &HashMap<String, NativeAudioReactiveSource>,
        getcolor_sources: &HashMap<String, NativeGetColorSource>,
        hksy_sources: &HashMap<String, NativeHksySource>,
        simple_tube_sources: &HashMap<String, NativeSimpleTubeSource>,
        wait_for_upload: bool,
        content_revisions: &HashMap<String, u64>,
    ) -> Result<(Vec<Arc<PreparedClip>>, Duration), NativeWgpuRenderError> {
        let mut clips = snapshot.clips.clone();
        clips.sort_by_key(|clip| clip.z_index);

        let mut prepared_clips = Vec::with_capacity(clips.len());
        let mut touched_media_ids: HashSet<String> = HashSet::with_capacity(clips.len());
        let mut touched_nv12_media_ids: HashSet<String> = HashSet::new();
        let mut touched_particle_media_ids: HashSet<String> = HashSet::new();
        let mut touched_audio_reactive_media_ids: HashSet<String> = HashSet::new();
        let mut touched_getcolor_media_ids: HashSet<String> = HashSet::new();
        let mut touched_hksy_media_ids: HashSet<String> = HashSet::new();
        let mut touched_simple_tube_media_ids: HashSet<String> = HashSet::new();
        let max_source_dimension = self.device.limits().max_texture_dimension_2d;
        let upload_start = Instant::now();
        for clip in &clips {
            if !clip.transform.rotation_degrees.is_finite()
                || clip.transform.scale_x <= 0.0
                || clip.transform.scale_y <= 0.0
            {
                return Err(NativeWgpuRenderError::UnsupportedTransform {
                    clip_id: clip.clip_id.clone(),
                });
            }
            let rotation_radians = clip.transform.rotation_degrees.to_radians();

            if let Some(nv12_source) = nv12_sources.get(&clip.media_id) {
                touched_nv12_media_ids.insert(clip.media_id.clone());
                let prepared = self.prepare_nv12_clip(clip, rotation_radians, nv12_source)?;
                prepared_clips.push(Arc::new(prepared));
                continue;
            }

            if let Some(particle_source) = particle_sources.get(&clip.media_id) {
                touched_particle_media_ids.insert(clip.media_id.clone());
                let (texture_view, prepared_width, prepared_height) = self
                    .particle_renderer
                    .prepare(&self.device, &self.queue, &clip.media_id, particle_source);
                prepared_clips.push(Arc::new(build_prepared_clip_bind_group(
                    &self.device,
                    &self.bind_group_layout,
                    &texture_view,
                    build_render_params(clip, rotation_radians, prepared_width, prepared_height),
                )));
                continue;
            }

            if let Some(audio_source) = audio_reactive_sources.get(&clip.media_id) {
                touched_audio_reactive_media_ids.insert(clip.media_id.clone());
                let (texture_view, prepared_width, prepared_height) = self
                    .audio_reactive_renderer
                    .prepare(&self.device, &self.queue, &clip.media_id, audio_source);
                prepared_clips.push(Arc::new(build_prepared_clip_bind_group(
                    &self.device,
                    &self.bind_group_layout,
                    &texture_view,
                    build_render_params(clip, rotation_radians, prepared_width, prepared_height),
                )));
                continue;
            }

            if let Some(getcolor_source) = getcolor_sources.get(&clip.media_id) {
                touched_getcolor_media_ids.insert(clip.media_id.clone());
                let (texture_view, prepared_width, prepared_height) = self
                    .getcolor_renderer
                    .prepare(&self.device, &self.queue, &clip.media_id, getcolor_source)
                    .map_err(NativeWgpuRenderError::GetColor)?;
                prepared_clips.push(Arc::new(build_prepared_clip_bind_group(
                    &self.device,
                    &self.bind_group_layout,
                    &texture_view,
                    build_render_params(clip, rotation_radians, prepared_width, prepared_height),
                )));
                continue;
            }

            if let Some(hksy_source) = hksy_sources.get(&clip.media_id) {
                touched_hksy_media_ids.insert(clip.media_id.clone());
                let (texture_view, prepared_width, prepared_height) = self
                    .hksy_renderer
                    .prepare(&self.device, &self.queue, &clip.media_id, hksy_source)
                    .map_err(NativeWgpuRenderError::Hksy)?;
                prepared_clips.push(Arc::new(build_prepared_clip_bind_group(
                    &self.device,
                    &self.bind_group_layout,
                    &texture_view,
                    build_render_params(clip, rotation_radians, prepared_width, prepared_height),
                )));
                continue;
            }

            if let Some(simple_tube_source) = simple_tube_sources.get(&clip.media_id) {
                touched_simple_tube_media_ids.insert(clip.media_id.clone());
                let (texture_view, prepared_width, prepared_height) = self
                    .simple_tube_renderer
                    .prepare(
                        &self.device,
                        &self.queue,
                        &clip.media_id,
                        simple_tube_source,
                    )
                    .map_err(NativeWgpuRenderError::SimpleTube)?;
                prepared_clips.push(Arc::new(build_prepared_clip_bind_group(
                    &self.device,
                    &self.bind_group_layout,
                    &texture_view,
                    build_render_params(clip, rotation_radians, prepared_width, prepared_height),
                )));
                continue;
            }

            let source = sources.get(&clip.media_id).ok_or_else(|| {
                NativeWgpuRenderError::MissingSource {
                    media_id: clip.media_id.clone(),
                }
            })?;
            touched_media_ids.insert(clip.media_id.clone());
            let revision = content_revisions.get(&clip.media_id).copied();
            // media_id ＋ revision が前回と一致すれば create_texture/write_texture
            // を一切行わずキャッシュ済みテクスチャの view を返す。downscale
            // （device の max_texture_dimension_2d を超えるソース対策）もキャッシュ
            // hit 時は不要なため、ここでは行わずメソッド内部に委譲する。
            let (texture_view, prepared_width, prepared_height) = self.get_or_upload_media_texture(
                &clip.media_id,
                revision,
                source.rgba_frame(),
                max_source_dimension,
            );
            prepared_clips.push(Arc::new(build_prepared_clip_bind_group(
                &self.device,
                &self.bind_group_layout,
                &texture_view,
                build_render_params(clip, rotation_radians, prepared_width, prepared_height),
            )));
        }
        // このフレームで参照されなかった media のテクスチャは連続不参照フレーム数
        // を積み上げ、閾値超過またはバイト予算超過で GPU メモリを解放する。
        self.evict_stale_media_textures(&touched_media_ids);
        self.evict_stale_nv12_textures(&touched_nv12_media_ids);
        self.particle_renderer
            .finish_frame(&touched_particle_media_ids);
        self.audio_reactive_renderer
            .finish_frame(&touched_audio_reactive_media_ids);
        self.getcolor_renderer
            .finish_frame(&touched_getcolor_media_ids);
        self.hksy_renderer.finish_frame(&touched_hksy_media_ids);
        self.simple_tube_renderer
            .finish_frame(&touched_simple_tube_media_ids);
        if wait_for_upload {
            self.queue.submit(std::iter::empty());
            wait_for_submitted_work(&self.device, &self.queue)?;
        }
        let source_upload = upload_start.elapsed();

        Ok((prepared_clips, source_upload))
    }

    /// media_id ＋ revision で GPU テクスチャをキャッシュしつつ、この呼び出しの
    /// フレームで使うテクスチャビューと（downscale後の実際の）幅・高さを返す。
    /// `revision` が `Some` かつキャッシュ済みの値と一致する場合は
    /// create_texture/write_texture を一切行わない（キャッシュ hit）。`None`
    /// （呼び出し側が内容の同一性を判定できない）の場合は常にミス扱いとし、
    /// 旧 `prepare_clip` と同じ「毎フレーム再アップロード」挙動を維持する。
    fn get_or_upload_media_texture(
        &self,
        media_id: &str,
        revision: Option<u64>,
        source: &RgbaFrame,
        max_source_dimension: u32,
    ) -> (wgpu::TextureView, u32, u32) {
        if let Some(revision) = revision {
            let mut cache = self
                .media_texture_cache
                .lock()
                .expect("media texture cache mutex must not be poisoned");
            let hit = cache.entries.get(media_id).map(|entry| entry.revision) == Some(revision);
            if hit {
                self.media_texture_cache_hits
                    .fetch_add(1, Ordering::Relaxed);
                cache.touch(media_id);
                let entry = cache
                    .entries
                    .get_mut(media_id)
                    .expect("hit checked above must have an entry");
                entry.idle_frames = 0;
                let view = entry
                    .texture
                    .create_view(&wgpu::TextureViewDescriptor::default());
                let (width, height) = (entry.width, entry.height);
                drop(cache);
                return (view, width, height);
            }
        }

        self.media_texture_cache_misses
            .fetch_add(1, Ordering::Relaxed);
        // device の max_texture_dimension_2d を超えるソース（巨大PSD等）を
        // そのまま create_texture へ渡すと wgpu Validation Error で panic する。
        // その場合のみアスペクト比維持でCPU側縮小してから使用し、描画継続する。
        let downscaled_source;
        let upload_source = if source.width.max(source.height) > max_source_dimension {
            downscaled_source = downscale_rgba_frame_to_fit(source, max_source_dimension);
            &downscaled_source
        } else {
            source
        };
        let texture = create_and_upload_source_texture(&self.device, &self.queue, upload_source);
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let width = upload_source.width;
        let height = upload_source.height;

        if let Some(revision) = revision {
            let byte_len = upload_source.pixels.len();
            let mut cache = self
                .media_texture_cache
                .lock()
                .expect("media texture cache mutex must not be poisoned");
            cache.insert(
                media_id.to_string(),
                MediaTextureCacheEntry {
                    revision,
                    texture,
                    width,
                    height,
                    byte_len,
                    idle_frames: 0,
                },
            );
        }

        (view, width, height)
    }

    /// 今フレームで参照された media_id 以外の `idle_frames` を進め、
    /// `MEDIA_TEXTURE_CACHE_IDLE_FRAME_LIMIT` を超えたエントリを即座に解放する
    /// （クリップ削除・シーンクリア後に GPU メモリを取り戻すため）。続けて
    /// `MEDIA_TEXTURE_CACHE_MAX_BYTES` を超える分を最も長く未参照のものから
    /// 追加で退避する（`SourceFrameCache` と同じ挿入順 LRU）。
    fn evict_stale_media_textures(&self, touched_media_ids: &HashSet<String>) {
        let mut cache = self
            .media_texture_cache
            .lock()
            .expect("media texture cache mutex must not be poisoned");

        let mut idle_evictions: Vec<String> = Vec::new();
        for (media_id, entry) in cache.entries.iter_mut() {
            if touched_media_ids.contains(media_id) {
                entry.idle_frames = 0;
            } else {
                entry.idle_frames += 1;
                if entry.idle_frames > MEDIA_TEXTURE_CACHE_IDLE_FRAME_LIMIT {
                    idle_evictions.push(media_id.clone());
                }
            }
        }
        for media_id in idle_evictions {
            cache.remove(&media_id);
        }

        while cache.total_bytes > MEDIA_TEXTURE_CACHE_MAX_BYTES {
            let Some(oldest) = cache.order.front().cloned() else {
                break;
            };
            cache.remove(&oldest);
        }
    }

    /// テスト計測用: (hits, misses) を返す。本番コードパスからは参照されない。
    #[cfg(test)]
    fn media_texture_cache_stats(&self) -> (u64, u64) {
        (
            self.media_texture_cache_hits.load(Ordering::Relaxed),
            self.media_texture_cache_misses.load(Ordering::Relaxed),
        )
    }

    /// テスト計測用: 現在キャッシュされている media 数。
    #[cfg(test)]
    fn media_texture_cache_len(&self) -> usize {
        self.media_texture_cache
            .lock()
            .expect("media texture cache mutex must not be poisoned")
            .entries
            .len()
    }

    /// live surface 専用: `generation` が前回 present 時と同じであれば
    /// `create_texture`/`write_texture`/`create_bind_group` を一切行わず、
    /// 前回 prepare した `Arc<PreparedClip>` 列（と 0 秒の source_upload）を
    /// そのまま返す（キャッシュ hit）。generation が変わっていれば通常どおり
    /// prepare し直し、結果をこの世代としてキャッシュへ保存する（キャッシュ
    /// miss）。upload fence は待たない（`prepare_scene_clips_without_upload_fence`
    /// と同じ扱い。live surface は次の submit/present が実質的な fence になる）。
    fn prepare_base_scene_clips_cached<S: RgbaFrameSource>(
        &self,
        generation: u64,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, S>,
        content_revisions: &HashMap<String, u64>,
    ) -> Result<(Vec<(u32, Arc<PreparedClip>)>, Duration), NativeWgpuRenderError> {
        {
            let cache = self
                .prepared_scene_cache
                .lock()
                .expect("prepared scene cache mutex must not be poisoned");
            if let Some(cached) = cache.as_ref() {
                if cached.generation == generation {
                    self.prepared_scene_cache_hits
                        .fetch_add(1, Ordering::Relaxed);
                    return Ok((cached.prepared_clips.clone(), Duration::ZERO));
                }
            }
        }

        self.prepared_scene_cache_misses
            .fetch_add(1, Ordering::Relaxed);
        // prepare_scene_clips_with_upload_fence は内部で z_index 昇順にソートした
        // クローンを prepare するため、ソート後の z_index をここで再現し、
        // prepared clip と一対一でペアにしておく。
        let mut sorted_z_indices: Vec<u32> =
            snapshot.clips.iter().map(|clip| clip.z_index).collect();
        sorted_z_indices.sort_unstable();
        let (prepared_clips, source_upload) =
            self.prepare_scene_clips_without_upload_fence(snapshot, sources, content_revisions)?;
        let prepared_clips: Vec<(u32, Arc<PreparedClip>)> = sorted_z_indices
            .into_iter()
            .zip(prepared_clips.into_iter())
            .collect();

        let mut cache = self
            .prepared_scene_cache
            .lock()
            .expect("prepared scene cache mutex must not be poisoned");
        *cache = Some(PreparedSceneCache {
            generation,
            prepared_clips: prepared_clips.clone(),
        });

        Ok((prepared_clips, source_upload))
    }

    /// テスト計測用: (hits, misses) を返す。本番コードパスからは参照されない。
    #[cfg(test)]
    fn prepared_scene_cache_stats(&self) -> (u64, u64) {
        (
            self.prepared_scene_cache_hits.load(Ordering::Relaxed),
            self.prepared_scene_cache_misses.load(Ordering::Relaxed),
        )
    }

    fn encode_prepared_clips(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        output_view: &wgpu::TextureView,
        prepared_clips: &[Arc<PreparedClip>],
    ) {
        self.encode_prepared_clips_with_pipelines(
            encoder,
            output_view,
            prepared_clips,
            &self.pipeline,
            &self.nv12_pipeline,
        );
    }

    fn encode_prepared_clips_with_pipelines(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        output_view: &wgpu::TextureView,
        prepared_clips: &[Arc<PreparedClip>],
        rgba_pipeline: &wgpu::RenderPipeline,
        nv12_pipeline: &wgpu::RenderPipeline,
    ) {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("UXFD native wgpu render pass"),
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

        for prepared_clip in prepared_clips {
            match prepared_clip.pipeline_kind {
                ClipPipelineKind::Rgba => pass.set_pipeline(rgba_pipeline),
                ClipPipelineKind::Nv12 => pass.set_pipeline(nv12_pipeline),
            }
            pass.set_bind_group(0, &prepared_clip.bind_group, &[]);
            pass.draw(0..3, 0..1);
        }
    }

    fn read_output_texture_to_rgba8(&self) -> Result<RgbaFrame, NativeWgpuRenderError> {
        let mut readback_encoder =
            self.device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("UXFD native wgpu overlay surface test readback encoder"),
                });
        let padded_bytes_per_row = padded_bytes_per_row(self.width);
        readback_encoder.copy_texture_to_buffer(
            wgpu::ImageCopyTexture {
                texture: &self.output_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::ImageCopyBuffer {
                buffer: &self.readback_buffer,
                layout: wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_bytes_per_row),
                    rows_per_image: Some(self.height),
                },
            },
            wgpu::Extent3d {
                width: self.width,
                height: self.height,
                depth_or_array_layers: 1,
            },
        );
        self.queue.submit(Some(readback_encoder.finish()));
        readback_to_rgba8(
            &self.device,
            &self.readback_buffer,
            OUTPUT_FORMAT,
            self.width,
            self.height,
        )
    }
}

pub async fn render_native_wgpu_frame(
    snapshot: &SceneSnapshot,
    sources: &HashMap<String, RgbaFrame>,
    width: u32,
    height: u32,
) -> Result<RgbaFrame, NativeWgpuRenderError> {
    measure_native_wgpu_frame_stages(snapshot, sources, width, height)
        .await
        .map(|report| report.frame)
}

pub async fn render_native_wgpu_overlay_surface_frame(
    snapshot: &SceneSnapshot,
    sources: &HashMap<String, RgbaFrame>,
    width: u32,
    height: u32,
) -> Result<RgbaFrame, NativeWgpuRenderError> {
    let renderer = NativeWgpuRenderer::new(width, height).await?;
    renderer
        .render_overlay_surface_frame_for_test(snapshot, sources)
        .await
}

pub async fn render_native_wgpu_frame_with_audio_waveforms(
    snapshot: &SceneSnapshot,
    sources: &HashMap<String, RgbaFrame>,
    waveforms: &[NativeAudioWaveformInput],
    width: u32,
    height: u32,
) -> Result<RgbaFrame, NativeWgpuRenderError> {
    let renderer = NativeWgpuRenderer::new(width, height).await?;
    renderer
        .render_frame_stages_with_audio_waveforms(
            snapshot,
            sources,
            waveforms,
            &HashMap::new(),
            &HashMap::new(),
        )
        .await
        .map(|report| report.frame)
}

fn split_audio_waveform_sources(
    _snapshot: &SceneSnapshot,
    sources: &HashMap<String, RgbaFrame>,
    waveforms: &[NativeAudioWaveformInput],
) -> Result<
    (
        HashMap<String, RgbaFrame>,
        HashMap<String, NativeAudioReactiveSource>,
    ),
    NativeWgpuRenderError,
> {
    let generated_sources = sources.clone();
    let mut audio_reactive_sources = HashMap::new();
    for waveform in waveforms {
        if waveform.sample_rate == 0 {
            return Err(NativeWgpuRenderError::AudioWaveform(
                AudioWaveformSceneError::InvalidSampleRate,
            ));
        }
        if waveform.width == 0 || waveform.height == 0 {
            return Err(NativeWgpuRenderError::AudioWaveform(
                AudioWaveformSceneError::InvalidDimensions,
            ));
        }
        audio_reactive_sources.insert(
            waveform.media_id.clone(),
            NativeAudioReactiveSource {
                source: waveform.source.clone(),
                samples: waveform.samples.clone(),
                sample_rate: waveform.sample_rate,
                width: waveform.width,
                height: waveform.height,
                config_revision: 0,
            },
        );
    }

    Ok((generated_sources, audio_reactive_sources))
}

pub async fn render_native_wgpu_frame_to_shared_ring(
    snapshot: &SceneSnapshot,
    sources: &HashMap<String, RgbaFrame>,
    width: u32,
    height: u32,
    memory_id: &str,
    slot_count: u32,
    pts_frame: u64,
) -> Result<NativeWgpuSharedFrameReport, NativeWgpuRenderError> {
    let report = measure_native_wgpu_frame_stages(snapshot, sources, width, height).await?;
    frame_report_to_shared_ring(report, memory_id, slot_count, pts_frame)
}

pub async fn render_native_wgpu_frame_to_shared_ring_with_audio_waveforms(
    snapshot: &SceneSnapshot,
    sources: &HashMap<String, RgbaFrame>,
    waveforms: &[NativeAudioWaveformInput],
    width: u32,
    height: u32,
    memory_id: &str,
    slot_count: u32,
    pts_frame: u64,
) -> Result<NativeWgpuSharedFrameReport, NativeWgpuRenderError> {
    let renderer = NativeWgpuRenderer::new(width, height).await?;
    renderer
        .render_frame_to_shared_ring_with_audio_waveforms(
            snapshot,
            sources,
            waveforms,
            &HashMap::new(),
            &HashMap::new(),
            memory_id,
            slot_count,
            pts_frame,
        )
        .await
}

fn frame_report_to_shared_ring(
    report: NativeWgpuFrameReport,
    memory_id: &str,
    slot_count: u32,
    pts_frame: u64,
) -> Result<NativeWgpuSharedFrameReport, NativeWgpuRenderError> {
    let colour = ColourMetadata {
        primaries: "bt709".to_string(),
        transfer: "srgb".to_string(),
        matrix: "rgb".to_string(),
        range: "full".to_string(),
    };
    let layout = rgba8_srgb_ring_layout(memory_id, slot_count, report.width, report.height, colour)
        .map_err(NativeWgpuRenderError::SharedFrameLayout)?;
    let descriptor = layout.descriptor_for_slot(0).map_err(|error| {
        NativeWgpuRenderError::SharedFrameLayout(FrameRingLayoutBuildError::Layout(error))
    })?;
    let padded = pad_rgba_frame_for_stride(&report.frame, descriptor.stride_bytes)?;
    let slot_byte_len = usize::try_from(descriptor.byte_len)
        .map_err(|_| NativeWgpuRenderError::InvalidFrame(RgbaFrameError::DimensionOverflow))?;
    let ring = PosixSharedRing::create_with_slot_count(memory_id, slot_count, slot_byte_len)
        .map_err(NativeWgpuRenderError::SharedMemory)?;
    ring.write_frame(pts_frame, &padded)
        .map_err(NativeWgpuRenderError::SharedMemory)?;

    Ok(NativeWgpuSharedFrameReport {
        ring,
        slot_count,
        slot_byte_len: descriptor.byte_len,
        shared_frame: SharedFrame {
            descriptor,
            pts_frame,
        },
        timings: report.timings,
    })
}

pub async fn measure_native_wgpu_frame_stages(
    snapshot: &SceneSnapshot,
    sources: &HashMap<String, RgbaFrame>,
    width: u32,
    height: u32,
) -> Result<NativeWgpuFrameReport, NativeWgpuRenderError> {
    let total_start = Instant::now();
    let renderer = NativeWgpuRenderer::new(width, height).await?;
    let setup = total_start.elapsed();
    renderer
        .render_frame_stages_with_setup(
            snapshot,
            sources,
            setup,
            total_start,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
        )
        .await
}

pub async fn measure_native_wgpu_present_stages(
    snapshot: &SceneSnapshot,
    sources: &HashMap<String, RgbaFrame>,
    width: u32,
    height: u32,
) -> Result<NativeWgpuPresentReport, NativeWgpuRenderError> {
    let total_start = Instant::now();
    let renderer = NativeWgpuRenderer::new(width, height).await?;
    let setup = total_start.elapsed();
    renderer
        .present_frame_stages_with_setup(snapshot, sources, setup, total_start, &HashMap::new())
        .await
}

fn pad_rgba_frame_for_stride(
    frame: &RgbaFrame,
    stride_bytes: u32,
) -> Result<Vec<u8>, NativeWgpuRenderError> {
    let row_bytes = frame.width.checked_mul(SOURCE_BYTES_PER_PIXEL).ok_or(
        NativeWgpuRenderError::InvalidFrame(RgbaFrameError::DimensionOverflow),
    )?;
    if stride_bytes < row_bytes {
        return Err(NativeWgpuRenderError::InvalidFrame(
            RgbaFrameError::InvalidByteLength {
                expected: row_bytes as usize,
                actual: stride_bytes as usize,
            },
        ));
    }

    let padded_len = u64::from(stride_bytes)
        .checked_mul(u64::from(frame.height))
        .ok_or(NativeWgpuRenderError::InvalidFrame(
            RgbaFrameError::DimensionOverflow,
        ))?;
    let padded_len = usize::try_from(padded_len)
        .map_err(|_| NativeWgpuRenderError::InvalidFrame(RgbaFrameError::DimensionOverflow))?;
    let mut padded = vec![0; padded_len];
    let row_bytes = row_bytes as usize;
    let stride_bytes = stride_bytes as usize;

    for row in 0..frame.height as usize {
        let source_start = row * row_bytes;
        let source_end = source_start + row_bytes;
        let destination_start = row * stride_bytes;
        let destination_end = destination_start + row_bytes;
        padded[destination_start..destination_end]
            .copy_from_slice(&frame.pixels[source_start..source_end]);
    }

    Ok(padded)
}

/// Which composite pipeline a `PreparedClip`'s bind group was built against.
/// `PreparedClip` itself is otherwise pipeline-agnostic (a bare
/// `wgpu::BindGroup`), so `encode_prepared_clips` needs this tag to know
/// whether to `set_pipeline(&self.pipeline)` (RGBA) or
/// `set_pipeline(&self.nv12_pipeline)` (Phase 4c Stage 2 zero-copy NV12)
/// before drawing each clip -- production scenes can mix both in one pass.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ClipPipelineKind {
    Rgba,
    Nv12,
}

struct PreparedClip {
    bind_group: wgpu::BindGroup,
    pipeline_kind: ClipPipelineKind,
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct RenderParams {
    opacity: f32,
    gain: f32,
    colour_aberration_offset_x: f32,
    colour_aberration_offset_y: f32,
    outline_colour_r: f32,
    outline_colour_g: f32,
    outline_colour_b: f32,
    outline_thickness: f32,
    outline_opacity: f32,
    wipe_edge: f32,
    wipe_progress: f32,
    clipping_top: f32,
    clipping_bottom: f32,
    clipping_left: f32,
    clipping_right: f32,
    clipping_angle: f32,
    spot_light_colour_r: f32,
    spot_light_colour_g: f32,
    spot_light_colour_b: f32,
    spot_light_centre_x: f32,
    spot_light_centre_y: f32,
    spot_light_radius: f32,
    spot_light_intensity: f32,
    displacement_amount_x: f32,
    displacement_amount_y: f32,
    displacement_size: f32,
    displacement_strength: f32,
    fake_dof_focus_x: f32,
    fake_dof_focus_y: f32,
    fake_dof_focus_radius: f32,
    fake_dof_blur: f32,
    fake_dof_strength: f32,
    auto_blur_angle: f32,
    auto_blur_radius: f32,
    auto_blur_strength: f32,
    auto_blur_colour_shift: f32,
    stretch_angle: f32,
    stretch_amount: f32,
    stretch_strength: f32,
    multi_slicer_angle: f32,
    multi_slicer_offset: f32,
    multi_slicer_slices: f32,
    multi_slicer_expansion: f32,
    multi_slicer_strength: f32,
    oct_transform_scale: f32,
    oct_transform_rotation: f32,
    oct_transform_vertex_count: f32,
    oct_transform_warp: f32,
    oct_transform_strength: f32,
    area_expand_top: f32,
    area_expand_bottom: f32,
    area_expand_left: f32,
    area_expand_right: f32,
    area_expand_fill: f32,
    colour_correction_brightness: f32,
    colour_correction_contrast: f32,
    colour_correction_saturation: f32,
    colour_correction_hue: f32,
    blur_radius: f32,
    blur_strength: f32,
    drop_shadow_colour_r: f32,
    drop_shadow_colour_g: f32,
    drop_shadow_colour_b: f32,
    drop_shadow_offset_x: f32,
    drop_shadow_offset_y: f32,
    drop_shadow_opacity: f32,
    gradient_overlay_direction: f32,
    gradient_overlay_stop_a: f32,
    gradient_overlay_stop_b: f32,
    gradient_overlay_is_radial: f32,
    gradient_overlay_colour_a_r: f32,
    gradient_overlay_colour_a_g: f32,
    gradient_overlay_colour_a_b: f32,
    gradient_overlay_colour_a_a: f32,
    gradient_overlay_colour_b_r: f32,
    gradient_overlay_colour_b_g: f32,
    gradient_overlay_colour_b_b: f32,
    gradient_overlay_colour_b_a: f32,
    gradient_overlay_bounds_x: f32,
    gradient_overlay_bounds_y: f32,
    gradient_overlay_bounds_width: f32,
    gradient_overlay_bounds_height: f32,
    source_width: f32,
    source_height: f32,
    translation_x: f32,
    translation_y: f32,
    scale_x: f32,
    scale_y: f32,
    sampling_mode: f32,
    rotation_cos: f32,
    rotation_sin: f32,
    _padding6: f32,
    _padding7: f32,
    _padding8: f32,
    _padding9: f32,
    _padding10: f32,
}

fn sampling_mode_value(sampling: SamplingMode) -> f32 {
    match sampling {
        SamplingMode::Nearest => 0.0,
        SamplingMode::Bilinear => 1.0,
    }
}

/// `clip`（transform/opacity/effects）と、アップロード済みソーステクスチャの
/// 実サイズから共有フラグメントシェーダ用の `RenderParams` を組み立てる。
/// RGBA クリップ・NV12 クリップの双方から呼ばれる（Phase 4b で NV12 対応の
/// ために抽出。挙動は抽出前と完全に同一）。
fn build_render_params(
    clip: &EvaluatedClip,
    rotation_radians: f32,
    prepared_width: u32,
    prepared_height: u32,
) -> RenderParams {
    RenderParams {
        opacity: clip.opacity,
        gain: clip
            .effects
            .iter()
            .fold(1.0, |gain, effect| gain * effect_gain(effect)),
        colour_aberration_offset_x: effect_colour_aberration_offset(clip, |effect| match effect {
            Effect::ColourAberration { offset_x, .. } => Some(*offset_x),
            _ => None,
        }),
        colour_aberration_offset_y: effect_colour_aberration_offset(clip, |effect| match effect {
            Effect::ColourAberration { offset_y, .. } => Some(*offset_y),
            _ => None,
        }),
        outline_colour_r: outline_colour_component(clip, 0),
        outline_colour_g: outline_colour_component(clip, 1),
        outline_colour_b: outline_colour_component(clip, 2),
        outline_thickness: outline_thickness(clip),
        outline_opacity: outline_opacity(clip),
        wipe_edge: wipe_edge(clip),
        wipe_progress: wipe_progress(clip),
        clipping_top: clipping_extent(clip, |effect| match effect {
            Effect::Clipping { top, .. } => Some(*top),
            _ => None,
        }),
        clipping_bottom: clipping_extent(clip, |effect| match effect {
            Effect::Clipping { bottom, .. } => Some(*bottom),
            _ => None,
        }),
        clipping_left: clipping_extent(clip, |effect| match effect {
            Effect::Clipping { left, .. } => Some(*left),
            _ => None,
        }),
        clipping_right: clipping_extent(clip, |effect| match effect {
            Effect::Clipping { right, .. } => Some(*right),
            _ => None,
        }),
        clipping_angle: clipping_angle(clip),
        spot_light_colour_r: spot_light_colour_component(clip, 0),
        spot_light_colour_g: spot_light_colour_component(clip, 1),
        spot_light_colour_b: spot_light_colour_component(clip, 2),
        spot_light_centre_x: spot_light_centre_component(clip, 0),
        spot_light_centre_y: spot_light_centre_component(clip, 1),
        spot_light_radius: spot_light_radius(clip),
        spot_light_intensity: spot_light_intensity(clip),
        displacement_amount_x: displacement_amount_component(clip, 0),
        displacement_amount_y: displacement_amount_component(clip, 1),
        displacement_size: displacement_size(clip),
        displacement_strength: displacement_strength(clip),
        fake_dof_focus_x: fake_dof_focus_component(clip, 0),
        fake_dof_focus_y: fake_dof_focus_component(clip, 1),
        fake_dof_focus_radius: fake_dof_focus_radius(clip),
        fake_dof_blur: fake_dof_blur(clip),
        fake_dof_strength: fake_dof_strength(clip),
        auto_blur_angle: auto_blur_angle(clip),
        auto_blur_radius: auto_blur_radius(clip),
        auto_blur_strength: auto_blur_strength(clip),
        auto_blur_colour_shift: auto_blur_colour_shift(clip),
        stretch_angle: stretch_angle(clip),
        stretch_amount: stretch_amount(clip),
        stretch_strength: stretch_strength(clip),
        multi_slicer_angle: multi_slicer_angle(clip),
        multi_slicer_offset: multi_slicer_offset(clip),
        multi_slicer_slices: multi_slicer_slices(clip),
        multi_slicer_expansion: multi_slicer_expansion(clip),
        multi_slicer_strength: multi_slicer_strength(clip),
        oct_transform_scale: oct_transform_scale(clip),
        oct_transform_rotation: oct_transform_rotation(clip),
        oct_transform_vertex_count: oct_transform_vertex_count(clip),
        oct_transform_warp: oct_transform_warp(clip),
        oct_transform_strength: oct_transform_strength(clip),
        area_expand_top: area_expand_extent(clip, |effect| match effect {
            Effect::AreaExpand { top, .. } => Some(*top),
            _ => None,
        }),
        area_expand_bottom: area_expand_extent(clip, |effect| match effect {
            Effect::AreaExpand { bottom, .. } => Some(*bottom),
            _ => None,
        }),
        area_expand_left: area_expand_extent(clip, |effect| match effect {
            Effect::AreaExpand { left, .. } => Some(*left),
            _ => None,
        }),
        area_expand_right: area_expand_extent(clip, |effect| match effect {
            Effect::AreaExpand { right, .. } => Some(*right),
            _ => None,
        }),
        area_expand_fill: area_expand_fill(clip),
        colour_correction_brightness: colour_correction_brightness(clip),
        colour_correction_contrast: colour_correction_contrast(clip),
        colour_correction_saturation: colour_correction_saturation(clip),
        colour_correction_hue: colour_correction_hue(clip),
        blur_radius: blur_radius(clip),
        blur_strength: blur_strength(clip),
        drop_shadow_colour_r: drop_shadow_colour_component(clip, 0),
        drop_shadow_colour_g: drop_shadow_colour_component(clip, 1),
        drop_shadow_colour_b: drop_shadow_colour_component(clip, 2),
        drop_shadow_offset_x: drop_shadow_offset_component(clip, 0),
        drop_shadow_offset_y: drop_shadow_offset_component(clip, 1),
        drop_shadow_opacity: drop_shadow_opacity(clip),
        gradient_overlay_direction: gradient_overlay_direction(clip),
        gradient_overlay_stop_a: gradient_overlay_stop_a(clip),
        gradient_overlay_stop_b: gradient_overlay_stop_b(clip),
        gradient_overlay_is_radial: gradient_overlay_is_radial(clip),
        gradient_overlay_colour_a_r: gradient_overlay_colour_a_component(clip, 0),
        gradient_overlay_colour_a_g: gradient_overlay_colour_a_component(clip, 1),
        gradient_overlay_colour_a_b: gradient_overlay_colour_a_component(clip, 2),
        gradient_overlay_colour_a_a: gradient_overlay_colour_a_component(clip, 3),
        gradient_overlay_colour_b_r: gradient_overlay_colour_b_component(clip, 0),
        gradient_overlay_colour_b_g: gradient_overlay_colour_b_component(clip, 1),
        gradient_overlay_colour_b_b: gradient_overlay_colour_b_component(clip, 2),
        gradient_overlay_colour_b_a: gradient_overlay_colour_b_component(clip, 3),
        gradient_overlay_bounds_x: gradient_overlay_bounds_x(clip),
        gradient_overlay_bounds_y: gradient_overlay_bounds_y(clip),
        gradient_overlay_bounds_width: gradient_overlay_bounds_width(clip),
        gradient_overlay_bounds_height: gradient_overlay_bounds_height(clip),
        source_width: prepared_width as f32,
        source_height: prepared_height as f32,
        translation_x: clip.transform.translation_x,
        translation_y: clip.transform.translation_y,
        scale_x: clip.transform.scale_x,
        scale_y: clip.transform.scale_y,
        sampling_mode: sampling_mode_value(clip.transform.sampling),
        rotation_cos: rotation_radians.cos(),
        rotation_sin: rotation_radians.sin(),
        _padding6: 0.0,
        _padding7: 0.0,
        _padding8: 0.0,
        _padding9: 0.0,
        _padding10: 0.0,
    }
}

fn create_pipeline(device: &wgpu::Device) -> wgpu::RenderPipeline {
    create_pipeline_for_format(device, OUTPUT_FORMAT)
}

fn choose_live_surface_format(formats: &[wgpu::TextureFormat]) -> wgpu::TextureFormat {
    formats
        .iter()
        .copied()
        .find(|format| *format == wgpu::TextureFormat::Bgra8UnormSrgb)
        .or_else(|| {
            formats
                .iter()
                .copied()
                .find(|format| *format == wgpu::TextureFormat::Rgba8UnormSrgb)
        })
        .or_else(|| {
            formats
                .iter()
                .copied()
                .find(|format| *format == wgpu::TextureFormat::Bgra8Unorm)
        })
        .unwrap_or_else(|| formats[0])
}

/// Bug D — live surface の compositor 合成 alpha_mode を選ぶ。
/// `capabilities.alpha_modes.first()` は macOS で `Opaque` になり得て、その場合
/// `LoadOp::Clear(TRANSPARENT)` が下層まで届かず overlay 越しに WebGPU
/// presenter を見せられない。PreMultiplied を最優先、次点 PostMultiplied、
/// どちらも無ければ既存動作を維持するために `alpha_modes.first()` に落ちる。
fn choose_live_surface_alpha_mode(
    alpha_modes: &[wgpu::CompositeAlphaMode],
) -> wgpu::CompositeAlphaMode {
    alpha_modes
        .iter()
        .copied()
        .find(|mode| *mode == wgpu::CompositeAlphaMode::PreMultiplied)
        .or_else(|| {
            alpha_modes
                .iter()
                .copied()
                .find(|mode| *mode == wgpu::CompositeAlphaMode::PostMultiplied)
        })
        .or_else(|| alpha_modes.first().copied())
        .unwrap_or(wgpu::CompositeAlphaMode::Auto)
}

fn choose_live_surface_present_mode(present_modes: &[wgpu::PresentMode]) -> wgpu::PresentMode {
    present_modes
        .iter()
        .copied()
        .find(|mode| *mode == wgpu::PresentMode::Immediate)
        .or_else(|| {
            present_modes
                .iter()
                .copied()
                .find(|mode| *mode == wgpu::PresentMode::Mailbox)
        })
        .or_else(|| {
            present_modes
                .iter()
                .copied()
                .find(|mode| *mode == wgpu::PresentMode::Fifo)
        })
        .unwrap_or(wgpu::PresentMode::Fifo)
}

fn create_pipeline_for_format(
    device: &wgpu::Device,
    output_format: wgpu::TextureFormat,
) -> wgpu::RenderPipeline {
    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("UXFD native wgpu bind group layout"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: false },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
        ],
    });
    create_pipeline_for_format_with_layout(device, output_format, &bind_group_layout)
}

fn create_pipeline_for_format_with_layout(
    device: &wgpu::Device,
    output_format: wgpu::TextureFormat,
    bind_group_layout: &wgpu::BindGroupLayout,
) -> wgpu::RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("UXFD native wgpu shader"),
        source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(include_str!(
            "../../shared-renderer/shaders/solid_composite.wgsl"
        ))),
    });
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("UXFD native wgpu pipeline layout"),
        bind_group_layouts: &[&bind_group_layout],
        push_constant_ranges: &[],
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("UXFD native wgpu pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: "vs_main",
            buffers: &[],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: "fs_main",
            targets: &[Some(wgpu::ColorTargetState {
                format: output_format,
                blend: Some(wgpu::BlendState {
                    color: wgpu::BlendComponent {
                        src_factor: wgpu::BlendFactor::One,
                        dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                        operation: wgpu::BlendOperation::Add,
                    },
                    alpha: wgpu::BlendComponent {
                        src_factor: wgpu::BlendFactor::One,
                        dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                        operation: wgpu::BlendOperation::Add,
                    },
                }),
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
    })
}

/// wgpu の既定挙動では、error scope で捕捉されない Validation Error は
/// `panic!` する（wgpu-0.20.1 の `default_error_handler`）。今回の実機バグは
/// まさにこの経路（`Device::create_texture` の Dimension 超過）で発生し、
/// sidecar プロセスごと落ちて Electron main の EPIPE クラッシュへ連鎖した。
/// device の上限修正・CPU側縮小フォールバックで根本原因は解消済みだが、
/// 将来の回帰や未知の Validation Error に備え、`on_uncaptured_error` で
/// panic の代わりにログ出力へ切り替える防御層を追加する。
fn install_uncaptured_error_logging(device: &wgpu::Device, device_label: &'static str) {
    device.on_uncaptured_error(Box::new(move |error| {
        eprintln!("[{device_label}] wgpu uncaptured error (continuing without panic): {error}");
    }));
}

fn required_limits_for_frame(
    adapter: &wgpu::Adapter,
    width: u32,
    height: u32,
) -> Result<wgpu::Limits, NativeWgpuRenderError> {
    let adapter_limits = adapter.limits();
    let required_texture_dimension = width.max(height);
    if required_texture_dimension > adapter_limits.max_texture_dimension_2d {
        return Err(NativeWgpuRenderError::FrameSizeExceedsAdapterLimit {
            width,
            height,
            max_texture_dimension_2d: adapter_limits.max_texture_dimension_2d,
        });
    }

    // 出力フレーム（width/height）はデバイス生成時点で分かっているサイズに過ぎず、
    // 実際にレンダリングされるソース（PSDレイヤー等）はこれより大きい可能性がある。
    // downlevel既定値（2048）や出力フレームサイズに丸めてしまうと、Apple Silicon の
    // Metal（実際は16384まで対応）でも device が2048に制限され、後続の
    // prepare_clip でのソーステクスチャ生成が wgpu Validation Error で panic する。
    // そのためadapterが対応する実上限をそのままdeviceへ要求する。
    Ok(wgpu::Limits {
        max_texture_dimension_2d: adapter_limits.max_texture_dimension_2d,
        ..wgpu::Limits::downlevel_defaults()
    })
}

/// ソースが `max_dimension` を超える場合、アスペクト比を維持したまま
/// バイリニア補間で縮小する。device の max_texture_dimension_2d を超える
/// ソース（巨大PSD等）をそのまま `create_texture` へ渡すと wgpu Validation
/// Error で panic するため、GPU テクスチャ生成前に呼び出して panic を防ぐ。
/// 上限以内の場合はコピーせずそのまま返す。
fn downscale_rgba_frame_to_fit(source: &RgbaFrame, max_dimension: u32) -> RgbaFrame {
    let longer_side = source.width.max(source.height);
    if longer_side <= max_dimension || max_dimension == 0 {
        return source.clone();
    }

    let scale = f64::from(max_dimension) / f64::from(longer_side);
    let target_width = ((f64::from(source.width) * scale).round() as u32).max(1);
    let target_height = ((f64::from(source.height) * scale).round() as u32).max(1);

    let mut pixels = vec![0_u8; (target_width as usize) * (target_height as usize) * 4];
    let source_width = source.width as f64;
    let source_height = source.height as f64;

    for destination_y in 0..target_height {
        // ターゲットの各テクセル中心を元画像空間へ逆写像する。
        let source_y =
            ((destination_y as f64 + 0.5) / f64::from(target_height)) * source_height - 0.5;
        let source_y = source_y.clamp(0.0, source_height - 1.0);
        let y0 = source_y.floor() as u32;
        let y1 = (y0 + 1).min(source.height - 1);
        let fy = source_y - f64::from(y0);

        for destination_x in 0..target_width {
            let source_x =
                ((destination_x as f64 + 0.5) / f64::from(target_width)) * source_width - 0.5;
            let source_x = source_x.clamp(0.0, source_width - 1.0);
            let x0 = source_x.floor() as u32;
            let x1 = (x0 + 1).min(source.width - 1);
            let fx = source_x - f64::from(x0);

            let p00 = read_rgba_texel(source, x0, y0);
            let p10 = read_rgba_texel(source, x1, y0);
            let p01 = read_rgba_texel(source, x0, y1);
            let p11 = read_rgba_texel(source, x1, y1);

            let destination_offset =
                ((destination_y as usize) * (target_width as usize) + destination_x as usize) * 4;
            for channel in 0..4 {
                let top = f64::from(p00[channel]) * (1.0 - fx) + f64::from(p10[channel]) * fx;
                let bottom = f64::from(p01[channel]) * (1.0 - fx) + f64::from(p11[channel]) * fx;
                let value = (top * (1.0 - fy) + bottom * fy).round().clamp(0.0, 255.0) as u8;
                pixels[destination_offset + channel] = value;
            }
        }
    }

    RgbaFrame::from_rgba8(target_width, target_height, pixels)
        .expect("downscaled frame byte length must match computed dimensions")
}

fn read_rgba_texel(source: &RgbaFrame, x: u32, y: u32) -> [u8; 4] {
    let offset = ((y as usize) * (source.width as usize) + x as usize) * 4;
    [
        source.pixels[offset],
        source.pixels[offset + 1],
        source.pixels[offset + 2],
        source.pixels[offset + 3],
    ]
}

fn create_output_texture(device: &wgpu::Device, width: u32, height: u32) -> wgpu::Texture {
    create_output_texture_for_format(device, width, height, OUTPUT_FORMAT)
}

fn create_output_texture_for_format(
    device: &wgpu::Device,
    width: u32,
    height: u32,
    output_format: wgpu::TextureFormat,
) -> wgpu::Texture {
    device.create_texture(&wgpu::TextureDescriptor {
        label: Some("UXFD native wgpu output texture"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: output_format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    })
}

fn copy_live_surface_texture_to_readback(
    encoder: &mut wgpu::CommandEncoder,
    texture: &wgpu::Texture,
    buffer: &wgpu::Buffer,
    width: u32,
    height: u32,
) {
    let padded_bytes_per_row = padded_bytes_per_row(width);
    encoder.copy_texture_to_buffer(
        wgpu::ImageCopyTexture {
            texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::ImageCopyBuffer {
            buffer,
            layout: wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(padded_bytes_per_row),
                rows_per_image: Some(height),
            },
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );
}

/// クリップの GPU ソーステクスチャを新規作成して即アップロードする
/// （`get_or_upload_media_texture` のキャッシュミス経路専用）。旧 `prepare_clip`
/// のテクスチャ生成部分をそのまま切り出したもので、挙動に変更はない。
fn create_and_upload_source_texture(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    source: &RgbaFrame,
) -> wgpu::Texture {
    let source_texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("UXFD native wgpu source texture"),
        size: wgpu::Extent3d {
            width: source.width,
            height: source.height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        wgpu::ImageCopyTexture {
            texture: &source_texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &source.pixels,
        wgpu::ImageDataLayout {
            offset: 0,
            bytes_per_row: Some(source.width * SOURCE_BYTES_PER_PIXEL),
            rows_per_image: Some(source.height),
        },
        wgpu::Extent3d {
            width: source.width,
            height: source.height,
            depth_or_array_layers: 1,
        },
    );
    source_texture
}

/// クリップ 1 枚分の uniform buffer と bind group を毎フレーム軽量に組み立てる
/// （テクスチャ自体は使い回すので `create_texture`/`write_texture` を含まない）。
/// 旧 `prepare_clip` のうち uniform/bind group 生成部分をそのまま切り出したもの。
fn build_prepared_clip_bind_group(
    device: &wgpu::Device,
    bind_group_layout: &wgpu::BindGroupLayout,
    texture_view: &wgpu::TextureView,
    params: RenderParams,
) -> PreparedClip {
    let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("UXFD native wgpu params buffer"),
        contents: bytemuck::bytes_of(&params),
        usage: wgpu::BufferUsages::UNIFORM,
    });

    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("UXFD native wgpu bind group"),
        layout: bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(texture_view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: uniform_buffer.as_entire_binding(),
            },
        ],
    });

    PreparedClip {
        bind_group,
        pipeline_kind: ClipPipelineKind::Rgba,
    }
}

/// 残像診断用 — RGBA8 フレームの alpha != 0（非透明）ピクセル数を数える。
/// `readback_to_rgba8` は BGRA サーフェスも RGBA 順へ正規化済みで alpha は index 3。
fn count_non_transparent_pixels(frame: &RgbaFrame) -> u64 {
    frame
        .pixels
        .chunks_exact(4)
        .filter(|pixel| pixel[3] != 0)
        .count() as u64
}

fn create_readback_buffer(device: &wgpu::Device, width: u32, height: u32) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("UXFD native wgpu readback buffer"),
        size: u64::from(padded_bytes_per_row(width) * height),
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    })
}

fn readback_to_rgba8(
    device: &wgpu::Device,
    buffer: &wgpu::Buffer,
    texture_format: wgpu::TextureFormat,
    width: u32,
    height: u32,
) -> Result<RgbaFrame, NativeWgpuRenderError> {
    let slice = buffer.slice(..);
    let (sender, receiver) = mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        let _ = sender.send(result);
    });
    device.poll(wgpu::Maintain::Wait);
    receiver
        .recv()
        .map_err(|_| NativeWgpuRenderError::BufferMap)?
        .map_err(|_| NativeWgpuRenderError::BufferMap)?;

    let mapped = slice.get_mapped_range();
    let padded_row = padded_bytes_per_row(width) as usize;
    let unpadded_row = (width * OUTPUT_BYTES_PER_PIXEL) as usize;
    let mut pixels = Vec::with_capacity((width as usize) * (height as usize) * 4);

    for row_index in 0..height as usize {
        let row_start = row_index * padded_row;
        let row = &mapped[row_start..row_start + unpadded_row];
        pixels.extend(normalise_texture_copy_to_rgba8(texture_format, row));
    }

    drop(mapped);
    buffer.unmap();

    RgbaFrame::from_rgba8(width, height, pixels).map_err(NativeWgpuRenderError::InvalidFrame)
}

fn normalise_texture_copy_to_rgba8(texture_format: wgpu::TextureFormat, row: &[u8]) -> Vec<u8> {
    if matches!(
        texture_format,
        wgpu::TextureFormat::Bgra8Unorm | wgpu::TextureFormat::Bgra8UnormSrgb
    ) {
        let mut pixels = Vec::with_capacity(row.len());
        for pixel in row.chunks_exact(4) {
            pixels.extend_from_slice(&[pixel[2], pixel[1], pixel[0], pixel[3]]);
        }
        return pixels;
    }

    row.to_vec()
}

fn wait_for_submitted_work(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
) -> Result<(), NativeWgpuRenderError> {
    let (sender, receiver) = mpsc::channel();
    queue.on_submitted_work_done(move || {
        let _ = sender.send(());
    });
    device.poll(wgpu::Maintain::Wait);
    receiver
        .recv()
        .map_err(|_| NativeWgpuRenderError::BufferMap)
}

fn padded_bytes_per_row(width: u32) -> u32 {
    let unpadded = width * OUTPUT_BYTES_PER_PIXEL;
    unpadded.div_ceil(COPY_BYTES_PER_ROW_ALIGNMENT) * COPY_BYTES_PER_ROW_ALIGNMENT
}

fn effect_gain(effect: &Effect) -> f32 {
    match effect {
        Effect::LinearGain { gain } => *gain,
        Effect::ColourAberration { .. } => 1.0,
        Effect::Outline { .. } => 1.0,
        Effect::Wipe { .. } => 1.0,
        Effect::Clipping { .. } => 1.0,
        Effect::SpotLight { .. } => 1.0,
        Effect::DisplacementMap { .. } => 1.0,
        Effect::FakeDof { .. } => 1.0,
        Effect::AutoBlur { .. } => 1.0,
        Effect::Stretch { .. } => 1.0,
        Effect::MultiSlicer { .. } => 1.0,
        Effect::OctTransform { .. } => 1.0,
        Effect::AreaExpand { .. } => 1.0,
        Effect::ColourCorrection { .. } => 1.0,
        Effect::Blur { .. } => 1.0,
        Effect::DropShadow { .. } => 1.0,
        Effect::GradientOverlay { .. } => 1.0,
    }
}

fn drop_shadow_colour_component(clip: &uxfd_rust_core::EvaluatedClip, index: usize) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::DropShadow { colour, .. } => Some(colour[index]),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn drop_shadow_offset_component(clip: &uxfd_rust_core::EvaluatedClip, index: usize) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::DropShadow {
                offset_x, offset_y, ..
            } => Some(if index == 0 { *offset_x } else { *offset_y }),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn drop_shadow_opacity(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::DropShadow { opacity, .. } => Some(*opacity),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn blur_radius(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Blur { radius, .. } => Some(*radius),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .max(0.0)
}

/// 旧 PIXI `GroupGradientFilter` 相当の uniform 抽出。effect が無いときは
/// bounds_width/height が 0 のため shader 側で無効化される。
fn gradient_overlay_direction(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::GradientOverlay {
                direction_degrees, ..
            } => Some(direction_degrees.to_radians()),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn gradient_overlay_stop_a(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::GradientOverlay { stop_a, .. } => Some(*stop_a),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn gradient_overlay_stop_b(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::GradientOverlay { stop_b, .. } => Some(*stop_b),
            _ => None,
        })
        .last()
        .unwrap_or(1.0)
        .clamp(0.0, 1.0)
}

fn gradient_overlay_is_radial(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::GradientOverlay { is_radial, .. } => Some(if *is_radial { 1.0 } else { 0.0 }),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn gradient_overlay_colour_a_component(clip: &uxfd_rust_core::EvaluatedClip, index: usize) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::GradientOverlay { colour_a, .. } => Some(colour_a[index]),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn gradient_overlay_colour_b_component(clip: &uxfd_rust_core::EvaluatedClip, index: usize) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::GradientOverlay { colour_b, .. } => Some(colour_b[index]),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn gradient_overlay_bounds_x(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::GradientOverlay { bounds_x, .. } => Some(*bounds_x),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn gradient_overlay_bounds_y(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::GradientOverlay { bounds_y, .. } => Some(*bounds_y),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn gradient_overlay_bounds_width(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::GradientOverlay { bounds_width, .. } => Some(*bounds_width),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .max(0.0)
}

fn gradient_overlay_bounds_height(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::GradientOverlay { bounds_height, .. } => Some(*bounds_height),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .max(0.0)
}

fn blur_strength(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Blur { strength, .. } => Some(*strength),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

/// PIXI.ColorMatrixFilter の呼び出し順（hue→saturate→contrast→brightness、
/// multiply 合成）を再現するための uniform 抽出。effect が無いときは
/// 恒等変換（brightness 1 / contrast 0 / saturation 0 / hue 0）を返す。
fn colour_correction_brightness(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::ColourCorrection { brightness, .. } => Some(*brightness),
            _ => None,
        })
        .last()
        .unwrap_or(1.0)
        .max(0.0)
}

fn colour_correction_contrast(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::ColourCorrection { contrast, .. } => Some(*contrast),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn colour_correction_saturation(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::ColourCorrection { saturation, .. } => Some(*saturation),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn colour_correction_hue(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::ColourCorrection { hue_degrees, .. } => Some(hue_degrees.to_radians()),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn effect_colour_aberration_offset<F>(clip: &uxfd_rust_core::EvaluatedClip, pick: F) -> f32
where
    F: Fn(&Effect) -> Option<f32>,
{
    clip.effects.iter().filter_map(pick).sum::<f32>().max(0.0)
}

fn outline_colour_component(clip: &uxfd_rust_core::EvaluatedClip, index: usize) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Outline { colour, .. } => Some(colour[index]),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn outline_thickness(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Outline { thickness, .. } => Some(*thickness),
            _ => None,
        })
        .sum::<f32>()
        .max(0.0)
}

fn outline_opacity(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Outline { opacity, .. } => Some(*opacity),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn wipe_edge(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Wipe { edge, .. } => Some(match edge {
                WipeEdge::Left => 0.0,
                WipeEdge::Right => 1.0,
                WipeEdge::Top => 2.0,
                WipeEdge::Bottom => 3.0,
            }),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn wipe_progress(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Wipe { progress, .. } => Some(*progress),
            _ => None,
        })
        .last()
        .unwrap_or(1.0)
        .clamp(0.0, 1.0)
}

fn clipping_extent<F>(clip: &uxfd_rust_core::EvaluatedClip, pick: F) -> f32
where
    F: Fn(&Effect) -> Option<f32>,
{
    clip.effects.iter().filter_map(pick).sum::<f32>().max(0.0)
}

fn clipping_angle(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Clipping { angle_degrees, .. } => Some(angle_degrees.to_radians()),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn spot_light_colour_component(clip: &uxfd_rust_core::EvaluatedClip, index: usize) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::SpotLight { colour, .. } => Some(colour[index]),
            _ => None,
        })
        .last()
        .unwrap_or(1.0)
        .clamp(0.0, 1.0)
}

fn spot_light_centre_component(clip: &uxfd_rust_core::EvaluatedClip, index: usize) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::SpotLight {
                centre_x, centre_y, ..
            } => Some(if index == 0 { *centre_x } else { *centre_y }),
            _ => None,
        })
        .last()
        .unwrap_or(0.5)
        .clamp(0.0, 1.0)
}

fn spot_light_radius(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::SpotLight { radius, .. } => Some(*radius),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .max(0.0)
}

fn spot_light_intensity(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::SpotLight { intensity, .. } => Some(*intensity),
            _ => None,
        })
        .sum::<f32>()
        .max(0.0)
}

fn displacement_amount_component(clip: &uxfd_rust_core::EvaluatedClip, index: usize) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::DisplacementMap {
                amount_x, amount_y, ..
            } => Some(if index == 0 { *amount_x } else { *amount_y }),
            _ => None,
        })
        .sum::<f32>()
        .max(0.0)
}

fn displacement_size(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::DisplacementMap { size, .. } => Some(*size),
            _ => None,
        })
        .last()
        .unwrap_or(1.0)
        .max(1.0)
}

fn displacement_strength(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::DisplacementMap { strength, .. } => Some(*strength),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn fake_dof_focus_component(clip: &uxfd_rust_core::EvaluatedClip, index: usize) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::FakeDof {
                focus_x, focus_y, ..
            } => Some(if index == 0 { *focus_x } else { *focus_y }),
            _ => None,
        })
        .last()
        .unwrap_or(0.5)
        .clamp(0.0, 1.0)
}

fn fake_dof_focus_radius(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::FakeDof { focus_radius, .. } => Some(*focus_radius),
            _ => None,
        })
        .last()
        .unwrap_or(0.25)
        .clamp(0.01, 1.0)
}

fn fake_dof_blur(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::FakeDof { blur, .. } => Some(*blur),
            _ => None,
        })
        .sum::<f32>()
        .max(0.0)
}

fn fake_dof_strength(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::FakeDof { strength, .. } => Some(*strength),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn auto_blur_angle(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::AutoBlur { angle_degrees, .. } => Some(angle_degrees.to_radians()),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn auto_blur_radius(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::AutoBlur { radius, .. } => Some(*radius),
            _ => None,
        })
        .sum::<f32>()
        .max(0.0)
}

fn auto_blur_strength(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::AutoBlur { strength, .. } => Some(*strength),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn auto_blur_colour_shift(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::AutoBlur { colour_shift, .. } => Some(*colour_shift),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn stretch_angle(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Stretch { angle_degrees, .. } => Some(angle_degrees.to_radians()),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn stretch_amount(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Stretch { amount, .. } => Some(*amount),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .max(0.0)
}

fn stretch_strength(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Stretch { strength, .. } => Some(*strength),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn multi_slicer_angle(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::MultiSlicer { angle_degrees, .. } => Some(angle_degrees.to_radians()),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn multi_slicer_offset(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::MultiSlicer { offset, .. } => Some(*offset),
            _ => None,
        })
        .sum::<f32>()
        .max(0.0)
}

fn multi_slicer_slices(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::MultiSlicer { slices, .. } => Some(*slices as f32),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .max(0.0)
}

fn multi_slicer_expansion(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::MultiSlicer { expansion, .. } => Some(*expansion),
            _ => None,
        })
        .sum::<f32>()
        .max(0.0)
}

fn multi_slicer_strength(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::MultiSlicer { strength, .. } => Some(*strength),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn oct_transform_scale(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::OctTransform { scale, .. } => Some(*scale),
            _ => None,
        })
        .last()
        .unwrap_or(1.0)
        .max(0.01)
}

fn oct_transform_rotation(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::OctTransform {
                rotation_degrees, ..
            } => Some(rotation_degrees.to_radians()),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn oct_transform_vertex_count(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::OctTransform { vertex_count, .. } => Some(*vertex_count as f32),
            _ => None,
        })
        .last()
        .unwrap_or(8.0)
        .max(3.0)
}

fn oct_transform_warp(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::OctTransform { warp, .. } => Some(*warp),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .max(0.0)
}

fn oct_transform_strength(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::OctTransform { strength, .. } => Some(*strength),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn area_expand_extent<F>(clip: &uxfd_rust_core::EvaluatedClip, pick: F) -> f32
where
    F: Fn(&Effect) -> Option<f32>,
{
    clip.effects.iter().filter_map(pick).sum::<f32>().max(0.0)
}

fn area_expand_fill(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::AreaExpand { fill, .. } => Some(if *fill { 1.0 } else { 0.0 }),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn live_surface_exposes_nv12_scene_present_boundary() {
        let _present =
            NativeWgpuLiveSurfaceRenderer::present_scene_with_decoration_and_nv12_to_surface_texture::<
                RgbaFrame,
            >;
    }

    fn request_test_adapter() -> wgpu::Adapter {
        let instance = wgpu::Instance::default();
        pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None,
            force_fallback_adapter: false,
        }))
        .expect("test environment must expose a wgpu adapter")
    }

    #[test]
    fn required_limits_for_frame_uses_full_adapter_texture_dimension_budget() {
        // Bug: 出力フレーム（例: 1920x1080）のみを基準に max_texture_dimension_2d を
        // 決めていたため、adapter が 16384 まで対応していても downlevel既定値の
        // 2048 に device が制限され、後続の PSD ソーステクスチャ生成（2700px 等）が
        // wgpu Validation Error で panic していた。adapter の実上限をそのまま
        // 尊重すべきなので、出力フレームサイズに関わらず adapter 上限を要求する。
        let adapter = request_test_adapter();
        let adapter_limits = adapter.limits();

        let limits = required_limits_for_frame(&adapter, 1920, 1080)
            .expect("1920x1080 output frame must not exceed adapter limits");

        assert_eq!(
            limits.max_texture_dimension_2d,
            adapter_limits.max_texture_dimension_2d
        );
    }

    #[test]
    fn required_limits_for_frame_rejects_output_frame_exceeding_adapter_limit() {
        let adapter = request_test_adapter();
        let adapter_limits = adapter.limits();
        let oversized = adapter_limits.max_texture_dimension_2d + 1;

        let result = required_limits_for_frame(&adapter, oversized, 1080);

        assert!(matches!(
            result,
            Err(NativeWgpuRenderError::FrameSizeExceedsAdapterLimit { .. })
        ));
    }

    #[test]
    fn install_uncaptured_error_logging_prevents_panic_on_validation_error() {
        // wgpu既定では error scope に捕捉されない Validation Error は panic
        // する（default_error_handler）。install_uncaptured_error_logging を
        // 呼んだ device では、同種の Validation Error（例: create_texture の
        // Dimension 超過）が発生してもログ出力のみでpanicしないことを固定する。
        // これは限界修正・縮小フォールバックが将来回帰した場合の防御層。
        let adapter = request_test_adapter();
        let adapter_limits = adapter.limits();
        let (device, _queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("test device for uncaptured error logging"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_defaults(),
            },
            None,
        ))
        .expect("device request must succeed");
        install_uncaptured_error_logging(&device, "test device for uncaptured error logging");

        let oversized_dimension = adapter_limits.max_texture_dimension_2d.max(2048) + 1;
        // downlevel既定値（2048）を要求したdeviceへ、意図的に上限超過の
        // テクスチャを作成させる。ここでは downscale フォールバックを経由
        // しないため、以前は panic していたパスを直接踏む。
        let _texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("intentionally oversized test texture"),
            size: wgpu::Extent3d {
                width: oversized_dimension
                    .min(wgpu::Limits::downlevel_defaults().max_texture_dimension_2d + 4096),
                height: 4,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        // panic せずここまで到達できれば成功。
        device.poll(wgpu::Maintain::Wait);
    }

    #[test]
    fn downscale_rgba_frame_to_fit_leaves_frame_within_limit_untouched() {
        let source = RgbaFrame::from_rgba8(2, 3, vec![9; 2 * 3 * 4]).unwrap();

        let result = downscale_rgba_frame_to_fit(&source, 2048);

        assert_eq!(result, source);
    }

    #[test]
    fn downscale_rgba_frame_to_fit_shrinks_oversized_frame_preserving_aspect_ratio() {
        // 巨大PSD（例:2700x1800）が device の max_texture_dimension_2d を超えるとき、
        // panic ではなく縮小して描画継続する契約。長辺を上限に収め、アスペクト比を
        // 維持すること。
        let width = 2700_u32;
        let height = 1800_u32;
        let source = RgbaFrame::from_rgba8(
            width,
            height,
            vec![128; (width as usize) * (height as usize) * 4],
        )
        .unwrap();

        let result = downscale_rgba_frame_to_fit(&source, 2048);

        assert!(result.width <= 2048);
        assert!(result.height <= 2048);
        assert_eq!(result.width.max(result.height), 2048);
        // アスペクト比 (3:2) を維持していること。
        let original_ratio = width as f64 / height as f64;
        let result_ratio = result.width as f64 / result.height as f64;
        assert!((original_ratio - result_ratio).abs() < 0.01);
        assert_eq!(
            result.pixels.len(),
            (result.width as usize) * (result.height as usize) * 4
        );
    }

    #[test]
    fn downscale_rgba_frame_to_fit_never_produces_zero_sized_dimension() {
        let source = RgbaFrame::from_rgba8(1, 10_000, vec![0; 10_000 * 4]).unwrap();

        let result = downscale_rgba_frame_to_fit(&source, 2048);

        assert!(result.width >= 1);
        assert!(result.height >= 1);
        assert!(result.height <= 2048);
    }

    #[test]
    fn bgra_surface_copy_bytes_are_normalised_to_rgba8() {
        let pixels = normalise_texture_copy_to_rgba8(
            wgpu::TextureFormat::Bgra8Unorm,
            &[1, 2, 3, 255, 10, 20, 30, 128],
        );

        assert_eq!(pixels, vec![3, 2, 1, 255, 30, 20, 10, 128]);
    }

    #[test]
    fn rgba_surface_copy_bytes_are_kept_as_rgba8() {
        let pixels = normalise_texture_copy_to_rgba8(
            wgpu::TextureFormat::Rgba8UnormSrgb,
            &[1, 2, 3, 255, 10, 20, 30, 128],
        );

        assert_eq!(pixels, vec![1, 2, 3, 255, 10, 20, 30, 128]);
    }

    #[test]
    fn live_surface_format_prefers_srgb_for_export_parity() {
        let format = choose_live_surface_format(&[
            wgpu::TextureFormat::Bgra8Unorm,
            wgpu::TextureFormat::Bgra8UnormSrgb,
        ]);

        assert_eq!(format, wgpu::TextureFormat::Bgra8UnormSrgb);
    }

    #[test]
    fn live_surface_present_mode_prefers_immediate_for_preview_latency() {
        let present_mode = choose_live_surface_present_mode(&[
            wgpu::PresentMode::Fifo,
            wgpu::PresentMode::Immediate,
        ]);

        assert_eq!(present_mode, wgpu::PresentMode::Immediate);
    }

    #[test]
    fn live_surface_alpha_mode_prefers_premultiplied_for_transparent_clear() {
        // Bug D — `capabilities.alpha_modes.first()` は macOS で `Opaque` を返しうる。
        // その場合 `clear_native_overlay_live_surface` が透明 clear しても
        // wgpu 側で alpha が破棄されて compositor に届かない。PreMultiplied を
        // 明示的に優先することで overlay 越しに下層 WebGPU presenter が見える。
        let alpha_mode = choose_live_surface_alpha_mode(&[
            wgpu::CompositeAlphaMode::Opaque,
            wgpu::CompositeAlphaMode::PreMultiplied,
            wgpu::CompositeAlphaMode::PostMultiplied,
        ]);

        assert_eq!(alpha_mode, wgpu::CompositeAlphaMode::PreMultiplied);
    }

    #[test]
    fn live_surface_alpha_mode_falls_back_to_post_multiplied_when_pre_multiplied_absent() {
        let alpha_mode = choose_live_surface_alpha_mode(&[
            wgpu::CompositeAlphaMode::Opaque,
            wgpu::CompositeAlphaMode::PostMultiplied,
        ]);

        assert_eq!(alpha_mode, wgpu::CompositeAlphaMode::PostMultiplied);
    }

    #[test]
    fn live_surface_alpha_mode_falls_back_to_first_available_when_neither_multiplied_variant_present(
    ) {
        // 実機環境で PreMultiplied / PostMultiplied のどちらも返らないケース
        // （macOS 以外の platform や wgpu backend）では既存動作を維持する。
        let alpha_mode = choose_live_surface_alpha_mode(&[wgpu::CompositeAlphaMode::Auto]);

        assert_eq!(alpha_mode, wgpu::CompositeAlphaMode::Auto);
    }

    fn solid_scene(clip_id: &str, media_id: &str) -> (SceneSnapshot, HashMap<String, RgbaFrame>) {
        let snapshot = SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![uxfd_rust_core::EvaluatedClip {
                clip_id: clip_id.to_string(),
                track_id: "track-1".to_string(),
                media_id: media_id.to_string(),
                source_frame: 0,
                z_index: 0,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let sources = HashMap::from([(
            media_id.to_string(),
            RgbaFrame::from_rgba8(2, 2, vec![10; 2 * 2 * 4]).expect("valid source frame"),
        )]);
        (snapshot, sources)
    }

    #[test]
    fn particle_source_is_rasterised_on_gpu_without_rgba_upload() {
        let renderer = match pollster::block_on(NativeWgpuRenderer::new(64, 64)) {
            Ok(renderer) => renderer,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping GPU particle test: no GPU adapter available");
                return;
            }
            Err(error) => panic!("renderer creation failed: {error:?}"),
        };
        let mut snapshot = SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![uxfd_rust_core::EvaluatedClip {
                clip_id: "particle-clip".to_string(),
                track_id: "track-1".to_string(),
                media_id: "particle-media".to_string(),
                source_frame: 0,
                z_index: 0,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let params = uxfd_rust_core::parse_generated_particle_source(
            r##"{"generator":"standard-particle","seed":93,"particle_count":8,"spread":16,"speed":20,"size":3,"colour":"#80d8ff","lifetime_seconds":2}"##,
        )
        .expect("valid particle source");
        let mut particle_sources = HashMap::from([(
            "particle-media".to_string(),
            NativeParticleSource {
                params,
                width: 64,
                height: 64,
                source_frame: 0,
                config_revision: 7,
            },
        )]);
        let rgba_sources: HashMap<String, RgbaFrame> = HashMap::new();

        let render =
            |renderer: &NativeWgpuRenderer,
             snapshot: &SceneSnapshot,
             particle_sources: &HashMap<String, NativeParticleSource>| {
                let (prepared, _) = renderer
                    .prepare_scene_clips_with_upload_fence(
                        snapshot,
                        &rgba_sources,
                        &HashMap::new(),
                        particle_sources,
                        &HashMap::new(),
                        &HashMap::new(),
                        &HashMap::new(),
                        &HashMap::new(),
                        true,
                        &HashMap::new(),
                    )
                    .expect("particle preparation must succeed without an RGBA source");
                let mut encoder =
                    renderer
                        .device
                        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                            label: Some("UXFD particle test composite encoder"),
                        });
                let output_view = renderer
                    .output_texture
                    .create_view(&wgpu::TextureViewDescriptor::default());
                renderer.encode_prepared_clips(&mut encoder, &output_view, &prepared);
                renderer.queue.submit(Some(encoder.finish()));
                renderer
                    .read_output_texture_to_rgba8()
                    .expect("particle output readback must succeed")
            };

        let first = render(&renderer, &snapshot, &particle_sources);
        assert!(
            first.pixels.chunks_exact(4).any(|pixel| pixel[3] != 0),
            "GPU particle pass must produce visible pixels"
        );

        snapshot.frame_index = 30;
        snapshot.clips[0].source_frame = 30;
        particle_sources
            .get_mut("particle-media")
            .expect("particle source exists")
            .source_frame = 30;
        let second = render(&renderer, &snapshot, &particle_sources);

        assert_ne!(
            first.pixels, second.pixels,
            "source-frame changes must move particles on the GPU"
        );
        assert_eq!(
            renderer.particle_renderer.stats(),
            (1, 2),
            "animation must reuse one GPU texture and run one source pass per frame"
        );
        assert_eq!(
            renderer.media_texture_cache_stats(),
            (0, 0),
            "procedural particles must never enter the CPU RGBA upload cache"
        );
    }

    #[test]
    fn audio_waveform_source_is_rasterised_on_gpu_and_reuses_its_texture() {
        let renderer = match pollster::block_on(NativeWgpuRenderer::new(4, 4)) {
            Ok(renderer) => renderer,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping GPU audio waveform test: no GPU adapter available");
                return;
            }
            Err(error) => panic!("renderer creation failed: {error:?}"),
        };
        let snapshot = SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![uxfd_rust_core::EvaluatedClip {
                clip_id: "waveform-clip".to_string(),
                track_id: "track-1".to_string(),
                media_id: "waveform-media".to_string(),
                source_frame: 0,
                z_index: 0,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let waveform = NativeAudioReactiveSource {
            source: AudioWaveformSource::from_json(
                r##"{"generator":"audio-waveform-r","target_audio_id":"audio-1","target_source":"/tmp/music.wav","sample_window_seconds":1,"colour":"#00ff00","thickness":1,"amplitude":1}"##,
            )
            .expect("valid waveform source"),
            samples: vec![-1.0, 1.0, -1.0, 1.0],
            sample_rate: 4,
            width: 4,
            height: 4,
            config_revision: 7,
        };
        let audio_sources = HashMap::from([("waveform-media".to_string(), waveform)]);
        let rgba_sources: HashMap<String, RgbaFrame> = HashMap::new();

        let render = |renderer: &NativeWgpuRenderer| {
            let (prepared, _) = renderer
                .prepare_scene_clips_with_upload_fence(
                    &snapshot,
                    &rgba_sources,
                    &HashMap::new(),
                    &HashMap::new(),
                    &audio_sources,
                    &HashMap::new(),
                    &HashMap::new(),
                    &HashMap::new(),
                    true,
                    &HashMap::new(),
                )
                .expect("waveform preparation must succeed without an RGBA source");
            let mut encoder =
                renderer
                    .device
                    .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                        label: Some("UXFD audio waveform test composite encoder"),
                    });
            let output_view = renderer
                .output_texture
                .create_view(&wgpu::TextureViewDescriptor::default());
            renderer.encode_prepared_clips(&mut encoder, &output_view, &prepared);
            renderer.queue.submit(Some(encoder.finish()));
            renderer
                .read_output_texture_to_rgba8()
                .expect("audio waveform output readback must succeed")
        };

        let first = render(&renderer);
        let second = render(&renderer);
        assert!(
            first
                .pixels
                .chunks_exact(4)
                .any(|pixel| pixel == [0, 255, 0, 255]),
            "GPU waveform pass must produce visible waveform pixels"
        );
        assert_eq!(
            renderer.audio_reactive_renderer.stats(),
            (1, 2),
            "two PCM windows must reuse one GPU texture and run two source passes"
        );
        assert_eq!(first.pixels, second.pixels);
        assert_eq!(
            renderer.media_texture_cache_stats(),
            (0, 0),
            "GPU waveforms must never enter the CPU RGBA upload cache"
        );
    }

    #[test]
    fn getcolor_source_is_generated_on_gpu_and_reuses_its_texture() {
        let renderer = match pollster::block_on(NativeWgpuRenderer::new(16, 16)) {
            Ok(renderer) => renderer,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping GPU GetColor test: no GPU adapter available");
                return;
            }
            Err(error) => panic!("renderer creation failed: {error:?}"),
        };
        let snapshot = SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![uxfd_rust_core::EvaluatedClip {
                clip_id: "getcolor-clip".to_string(),
                track_id: "track-1".to_string(),
                media_id: "getcolor-media".to_string(),
                source_frame: 0,
                z_index: 0,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let sample_frame = RgbaFrame::from_rgba8(
            2,
            2,
            vec![
                255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
            ],
        )
        .expect("valid GetColor sample frame");
        let source = NativeGetColorSource {
            source: r##"{"generator":"getcolor-v2r-dot-field","columns":2,"rows":2,"dot_size":6,"dot_shape":"circle","stroke_width":0,"size_influence":0.5,"luminance_influence":0.5,"hue_shift_degrees":0,"alternate_rows":false,"foreground_colour":"#ffffff","secondary_colour":"#808080","background_colour":"#000000","source_image":"/tmp/sample.png","sample_strength":1,"sample_hue_shift_degrees":0,"seed":93}"##.to_string(),
            sample_frame: Some(Arc::new(sample_frame)),
            width: 16,
            height: 16,
            config_revision: 7,
        };
        let getcolor_sources = HashMap::from([("getcolor-media".to_string(), source)]);
        let rgba_sources: HashMap<String, RgbaFrame> = HashMap::new();

        let render = |renderer: &NativeWgpuRenderer| {
            let (prepared, _) = renderer
                .prepare_scene_clips_with_upload_fence(
                    &snapshot,
                    &rgba_sources,
                    &HashMap::new(),
                    &HashMap::new(),
                    &HashMap::new(),
                    &getcolor_sources,
                    &HashMap::new(),
                    &HashMap::new(),
                    true,
                    &HashMap::new(),
                )
                .expect("GetColor preparation must succeed without a generated RGBA source");
            let mut encoder =
                renderer
                    .device
                    .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                        label: Some("UXFD GetColor test composite encoder"),
                    });
            let output_view = renderer
                .output_texture
                .create_view(&wgpu::TextureViewDescriptor::default());
            renderer.encode_prepared_clips(&mut encoder, &output_view, &prepared);
            renderer.queue.submit(Some(encoder.finish()));
            renderer
                .read_output_texture_to_rgba8()
                .expect("GetColor output readback must succeed")
        };

        let first = render(&renderer);
        let second = render(&renderer);
        assert!(
            first
                .pixels
                .chunks_exact(4)
                .any(|pixel| { pixel[3] > 0 && (pixel[0] > 0 || pixel[1] > 0 || pixel[2] > 0) }),
            "GPU GetColor pass must produce sampled coloured dots"
        );
        assert_eq!(first.pixels, second.pixels);
        assert_eq!(
            renderer.getcolor_renderer.stats(),
            (1, 1),
            "unchanged GetColor configuration must reuse one GPU texture and one source pass"
        );
        assert_eq!(
            renderer.media_texture_cache_stats(),
            (0, 0),
            "GPU GetColor output must never enter the CPU RGBA upload cache"
        );
    }

    #[test]
    fn hksy_source_is_generated_on_gpu_and_reuses_its_texture() {
        let renderer = match pollster::block_on(NativeWgpuRenderer::new(16, 16)) {
            Ok(renderer) => renderer,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping GPU HKSY test: no GPU adapter available");
                return;
            }
            Err(error) => panic!("renderer creation failed: {error:?}"),
        };
        let snapshot = SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![uxfd_rust_core::EvaluatedClip {
                clip_id: "hksy-clip".to_string(),
                track_id: "track-1".to_string(),
                media_id: "hksy-media".to_string(),
                source_frame: 0,
                z_index: 0,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let source = NativeHksySource {
            source: r##"{"generator":"hksy-checker-grid","pattern":"checker-grid","cell_size":8,"line_width":2,"checker_enabled":true,"grid_enabled":true,"foreground_colour":"#ff0000","secondary_colour":"#00ff00","background_colour":"#0000ff","palette_colours":null,"separate_interval":null,"separate_line_width":null,"anchor_points":null,"round_caps":null,"max_join_distance":null}"##.to_string(),
            width: 16,
            height: 16,
            config_revision: 9,
        };
        let hksy_sources = HashMap::from([("hksy-media".to_string(), source)]);
        let rgba_sources: HashMap<String, RgbaFrame> = HashMap::new();

        let render = |renderer: &NativeWgpuRenderer| {
            let (prepared, _) = renderer
                .prepare_scene_clips_with_upload_fence(
                    &snapshot,
                    &rgba_sources,
                    &HashMap::new(),
                    &HashMap::new(),
                    &HashMap::new(),
                    &HashMap::new(),
                    &hksy_sources,
                    &HashMap::new(),
                    true,
                    &HashMap::new(),
                )
                .expect("HKSY preparation must succeed without a generated RGBA source");
            let mut encoder =
                renderer
                    .device
                    .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                        label: Some("UXFD HKSY test composite encoder"),
                    });
            let output_view = renderer
                .output_texture
                .create_view(&wgpu::TextureViewDescriptor::default());
            renderer.encode_prepared_clips(&mut encoder, &output_view, &prepared);
            renderer.queue.submit(Some(encoder.finish()));
            renderer
                .read_output_texture_to_rgba8()
                .expect("HKSY output readback must succeed")
        };

        let first = render(&renderer);
        let second = render(&renderer);
        assert!(
            first
                .pixels
                .chunks_exact(4)
                .any(|pixel| pixel[1] > pixel[0] && pixel[1] > pixel[2]),
            "GPU HKSY pass must produce green grid pixels"
        );
        assert_eq!(first.pixels, second.pixels);
        assert_eq!(
            renderer.hksy_renderer.stats(),
            (1, 1),
            "unchanged HKSY configuration must reuse one GPU texture and one source pass"
        );
        assert_eq!(
            renderer.media_texture_cache_stats(),
            (0, 0),
            "GPU HKSY output must never enter the CPU RGBA upload cache"
        );
    }

    #[test]
    fn hksy_gpu_source_supports_diamond_measured_grid_and_anchor_line() {
        let renderer = match pollster::block_on(NativeWgpuRenderer::new(32, 32)) {
            Ok(renderer) => renderer,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping specialised GPU HKSY test: no GPU adapter available");
                return;
            }
            Err(error) => panic!("renderer creation failed: {error:?}"),
        };
        let snapshot = SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![uxfd_rust_core::EvaluatedClip {
                clip_id: "hksy-specialised-clip".to_string(),
                track_id: "track-1".to_string(),
                media_id: "hksy-specialised-media".to_string(),
                source_frame: 0,
                z_index: 0,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let rgba_sources: HashMap<String, RgbaFrame> = HashMap::new();
        let render = |source: NativeHksySource| {
            let hksy_sources = HashMap::from([("hksy-specialised-media".to_string(), source)]);
            let (prepared, _) = renderer
                .prepare_scene_clips_with_upload_fence(
                    &snapshot,
                    &rgba_sources,
                    &HashMap::new(),
                    &HashMap::new(),
                    &HashMap::new(),
                    &HashMap::new(),
                    &hksy_sources,
                    &HashMap::new(),
                    true,
                    &HashMap::new(),
                )
                .expect("specialised HKSY preparation must succeed");
            let mut encoder =
                renderer
                    .device
                    .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                        label: Some("UXFD specialised HKSY test composite encoder"),
                    });
            let output_view = renderer
                .output_texture
                .create_view(&wgpu::TextureViewDescriptor::default());
            renderer.encode_prepared_clips(&mut encoder, &output_view, &prepared);
            renderer.queue.submit(Some(encoder.finish()));
            renderer
                .read_output_texture_to_rgba8()
                .expect("specialised HKSY output readback must succeed")
        };

        let diamond = render(NativeHksySource {
            source: r##"{"generator":"hksy-checker-grid","pattern":"diamond","cell_size":8,"line_width":4,"checker_enabled":false,"grid_enabled":false,"foreground_colour":"#ff0000","secondary_colour":"#00ff00","background_colour":"#0000ff","palette_colours":null,"separate_interval":null,"separate_line_width":null,"anchor_points":null,"round_caps":null,"max_join_distance":null}"##.to_string(),
            width: 32,
            height: 32,
            config_revision: 1,
        });
        assert!(diamond.pixels.chunks_exact(4).any(|pixel| pixel[3] == 0));
        assert!(diamond
            .pixels
            .chunks_exact(4)
            .any(|pixel| pixel[0] > 200 && pixel[3] > 0));

        let measured = render(NativeHksySource {
            source: r##"{"generator":"hksy-checker-grid","pattern":"measured-grid","cell_size":8,"line_width":1,"checker_enabled":false,"grid_enabled":false,"foreground_colour":"#ff0000","secondary_colour":"#00ff00","background_colour":"#0000ff","palette_colours":null,"separate_interval":2,"separate_line_width":3,"anchor_points":null,"round_caps":null,"max_join_distance":null}"##.to_string(),
            width: 32,
            height: 32,
            config_revision: 2,
        });
        assert!(measured
            .pixels
            .chunks_exact(4)
            .any(|pixel| pixel[2] > 200 && pixel[3] > 0));
        assert!(measured
            .pixels
            .chunks_exact(4)
            .any(|pixel| pixel[0] > 200 && pixel[3] > 0));

        let anchor = render(NativeHksySource {
            source: r##"{"generator":"hksy-checker-grid","pattern":"anchor-line","cell_size":8,"line_width":4,"checker_enabled":false,"grid_enabled":false,"foreground_colour":"#ff0000","secondary_colour":"#00ff00","background_colour":"#0000ff","palette_colours":null,"separate_interval":null,"separate_line_width":null,"anchor_points":[{"x":-8,"y":0},{"x":8,"y":0}],"round_caps":true,"max_join_distance":100}"##.to_string(),
            width: 32,
            height: 32,
            config_revision: 3,
        });
        assert!(anchor.pixels.chunks_exact(4).any(|pixel| pixel[3] == 0));
        assert!(anchor
            .pixels
            .chunks_exact(4)
            .any(|pixel| pixel[0] > 200 && pixel[3] > 0));
        assert_eq!(renderer.hksy_renderer.stats(), (3, 3));
    }

    #[test]
    fn simple_tube_source_is_generated_on_gpu_and_reuses_its_texture() {
        let renderer = match pollster::block_on(NativeWgpuRenderer::new(64, 48)) {
            Ok(renderer) => renderer,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping GPU SimpleTube test: no GPU adapter available");
                return;
            }
            Err(error) => panic!("renderer creation failed: {error:?}"),
        };
        let snapshot = SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![uxfd_rust_core::EvaluatedClip {
                clip_id: "simple-tube-clip".to_string(),
                track_id: "track-1".to_string(),
                media_id: "simple-tube-media".to_string(),
                source_frame: 0,
                z_index: 0,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let source = NativeSimpleTubeSource {
            source: r##"{"generator":"simple-tube-93","radius":28,"depth":32,"segments":12,"rings":6,"twist_degrees":45,"random_amount":0,"stroke_width":2,"colour":"#ff0000","secondary_colour":"#00ff00","colour_pattern":"ring","fog_strength":0,"fog_colour":"#ffffff","seed":93,"torus":false}"##.to_string(),
            width: 64,
            height: 48,
            config_revision: 11,
        };
        let simple_tube_sources = HashMap::from([("simple-tube-media".to_string(), source)]);
        let rgba_sources: HashMap<String, RgbaFrame> = HashMap::new();

        let render = |renderer: &NativeWgpuRenderer| {
            let (prepared, _) = renderer
                .prepare_scene_clips_with_upload_fence(
                    &snapshot,
                    &rgba_sources,
                    &HashMap::new(),
                    &HashMap::new(),
                    &HashMap::new(),
                    &HashMap::new(),
                    &HashMap::new(),
                    &simple_tube_sources,
                    true,
                    &HashMap::new(),
                )
                .expect("SimpleTube preparation must succeed without a generated RGBA source");
            let mut encoder =
                renderer
                    .device
                    .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                        label: Some("UXFD SimpleTube test composite encoder"),
                    });
            let output_view = renderer
                .output_texture
                .create_view(&wgpu::TextureViewDescriptor::default());
            renderer.encode_prepared_clips(&mut encoder, &output_view, &prepared);
            renderer.queue.submit(Some(encoder.finish()));
            renderer
                .read_output_texture_to_rgba8()
                .expect("SimpleTube output readback must succeed")
        };

        let first = render(&renderer);
        let second = render(&renderer);
        assert!(first.pixels.chunks_exact(4).any(|pixel| pixel[3] == 0));
        assert!(first
            .pixels
            .chunks_exact(4)
            .any(|pixel| pixel[0] > 200 && pixel[3] > 0));
        assert!(first
            .pixels
            .chunks_exact(4)
            .any(|pixel| pixel[1] > 200 && pixel[3] > 0));
        assert_eq!(first.pixels, second.pixels);
        assert_eq!(
            renderer.simple_tube_renderer.stats(),
            (1, 1),
            "unchanged SimpleTube configuration must reuse one GPU texture and one source pass"
        );
        assert_eq!(
            renderer.media_texture_cache_stats(),
            (0, 0),
            "GPU SimpleTube output must never enter the CPU RGBA upload cache"
        );
    }

    #[test]
    fn simple_tube_gpu_source_supports_torus_mode() {
        let renderer = match pollster::block_on(NativeWgpuRenderer::new(64, 48)) {
            Ok(renderer) => renderer,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping GPU SimpleTube torus test: no GPU adapter available");
                return;
            }
            Err(error) => panic!("renderer creation failed: {error:?}"),
        };
        let snapshot = SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![uxfd_rust_core::EvaluatedClip {
                clip_id: "simple-torus-clip".to_string(),
                track_id: "track-1".to_string(),
                media_id: "simple-torus-media".to_string(),
                source_frame: 0,
                z_index: 0,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let simple_tube_sources = HashMap::from([(
            "simple-torus-media".to_string(),
            NativeSimpleTubeSource {
                source: r##"{"generator":"simple-tube-93","radius":28,"depth":32,"segments":16,"rings":8,"twist_degrees":30,"random_amount":0,"stroke_width":2,"colour":"#ff0000","secondary_colour":"#00ff00","colour_pattern":"ring","fog_strength":0,"fog_colour":"#ffffff","seed":93,"torus":true}"##.to_string(),
                width: 64,
                height: 48,
                config_revision: 12,
            },
        )]);
        let rgba_sources: HashMap<String, RgbaFrame> = HashMap::new();
        let (prepared, _) = renderer
            .prepare_scene_clips_with_upload_fence(
                &snapshot,
                &rgba_sources,
                &HashMap::new(),
                &HashMap::new(),
                &HashMap::new(),
                &HashMap::new(),
                &HashMap::new(),
                &simple_tube_sources,
                true,
                &HashMap::new(),
            )
            .expect("SimpleTube torus preparation must succeed");
        let mut encoder = renderer
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("UXFD SimpleTube torus test composite encoder"),
            });
        let output_view = renderer
            .output_texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        renderer.encode_prepared_clips(&mut encoder, &output_view, &prepared);
        renderer.queue.submit(Some(encoder.finish()));
        let frame = renderer
            .read_output_texture_to_rgba8()
            .expect("SimpleTube torus output readback must succeed");

        assert!(frame.pixels.chunks_exact(4).any(|pixel| pixel[3] == 0));
        assert!(frame
            .pixels
            .chunks_exact(4)
            .any(|pixel| pixel[0] > 200 && pixel[3] > 0));
        assert!(frame
            .pixels
            .chunks_exact(4)
            .any(|pixel| pixel[1] > 200 && pixel[3] > 0));
        assert_eq!(renderer.simple_tube_renderer.stats(), (1, 1));
    }

    #[test]
    fn focus_lines_plus_source_is_generated_on_gpu_and_reuses_static_bucket() {
        let renderer = match pollster::block_on(NativeWgpuRenderer::new(64, 48)) {
            Ok(renderer) => renderer,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping GPU FocusLinesPlus test: no GPU adapter available");
                return;
            }
            Err(error) => panic!("renderer creation failed: {error:?}"),
        };
        let snapshot = SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![uxfd_rust_core::EvaluatedClip {
                clip_id: "focus-lines-clip".to_string(),
                track_id: "track-1".to_string(),
                media_id: "focus-lines-media".to_string(),
                source_frame: 0,
                z_index: 0,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let focus_lines_sources = HashMap::from([(
            "focus-lines-media".to_string(),
            NativeFocusLinesSource {
                source: r##"{"generator":"focus-lines-plus","ray_width":2.5,"gap":6,"centre_radius":8,"rotation_degrees":15,"centre_x":32,"centre_y":24,"centre_jitter_percent":0,"seed":93,"keyframe_interval":0,"line_colour":"#ff8000"}"##.to_string(),
                width: 64,
                height: 48,
                source_frame: 0,
                config_revision: 13,
            },
        )]);
        let rgba_sources: HashMap<String, RgbaFrame> = HashMap::new();
        let render = |renderer: &NativeWgpuRenderer| {
            let (prepared, _) = renderer
                .prepare_scene_clips_with_upload_fence(
                    &snapshot,
                    &rgba_sources,
                    &HashMap::new(),
                    &HashMap::new(),
                    &HashMap::new(),
                    &HashMap::new(),
                    &HashMap::new(),
                    &HashMap::new(),
                    &focus_lines_sources,
                    true,
                    &HashMap::new(),
                )
                .expect("FocusLinesPlus preparation must succeed without CPU RGBA");
            let mut encoder =
                renderer
                    .device
                    .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                        label: Some("UXFD FocusLinesPlus test composite encoder"),
                    });
            let output_view = renderer
                .output_texture
                .create_view(&wgpu::TextureViewDescriptor::default());
            renderer.encode_prepared_clips(&mut encoder, &output_view, &prepared);
            renderer.queue.submit(Some(encoder.finish()));
            renderer
                .read_output_texture_to_rgba8()
                .expect("FocusLinesPlus output readback must succeed")
        };

        let first = render(&renderer);
        let second = render(&renderer);
        assert!(first.pixels.chunks_exact(4).any(|pixel| pixel[3] == 0));
        assert!(first
            .pixels
            .chunks_exact(4)
            .any(|pixel| pixel[0] > 200 && pixel[1] > 70 && pixel[3] > 0));
        assert_eq!(first.pixels, second.pixels);
        assert_eq!(renderer.focus_lines_renderer.stats(), (1, 1));
        assert_eq!(renderer.media_texture_cache_stats(), (0, 0));
    }

    #[test]
    fn audio_sphere_source_is_rasterised_on_gpu_and_reuses_its_texture() {
        let renderer = match pollster::block_on(NativeWgpuRenderer::new(64, 64)) {
            Ok(renderer) => renderer,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping GPU audio sphere test: no GPU adapter available");
                return;
            }
            Err(error) => panic!("renderer creation failed: {error:?}"),
        };
        let snapshot = SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![uxfd_rust_core::EvaluatedClip {
                clip_id: "audio-sphere-clip".to_string(),
                track_id: "track-1".to_string(),
                media_id: "audio-sphere-media".to_string(),
                source_frame: 0,
                z_index: 0,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let waveform = NativeAudioWaveformInput {
            media_id: "audio-sphere-media".to_string(),
            source: AudioWaveformSource::from_json(
                r##"{"generator":"audio-sphere-93","target_audio_id":"audio-1","target_source":"/tmp/music.wav","sample_window_seconds":0.1,"colour":"#36c2ff","columns":8,"rows":6,"base_radius":22,"audio_influence":0.6,"point_size":2,"polygon_size":0.35,"random_amount":0.05,"seed":93}"##,
            )
            .expect("valid audio sphere source"),
            samples: vec![0.8; 64],
            sample_rate: 64,
            width: 64,
            height: 64,
        };

        let first = pollster::block_on(renderer.render_frame_stages_with_audio_waveforms(
            &snapshot,
            &HashMap::new(),
            std::slice::from_ref(&waveform),
            &HashMap::new(),
            &HashMap::new(),
        ))
        .expect("first audio sphere frame must render");
        let second = pollster::block_on(renderer.render_frame_stages_with_audio_waveforms(
            &snapshot,
            &HashMap::new(),
            &[waveform],
            &HashMap::new(),
            &HashMap::new(),
        ))
        .expect("second audio sphere frame must render");

        assert!(
            first.frame.pixels.chunks_exact(4).any(|pixel| pixel[3] > 0),
            "GPU audio sphere pass must produce visible pixels"
        );
        assert_eq!(first.frame.pixels, second.frame.pixels);
        assert_eq!(
            renderer.audio_reactive_renderer.stats(),
            (1, 2),
            "two PCM windows must reuse one GPU texture and run two source passes"
        );
        assert_eq!(
            renderer.media_texture_cache_stats(),
            (0, 0),
            "GPU audio spheres must never enter the CPU RGBA upload cache"
        );
    }

    #[test]
    fn audio_waveform_gpu_source_rejects_invalid_dimensions_before_texture_creation() {
        let snapshot = SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: Vec::new(),
        };
        let waveform = NativeAudioWaveformInput {
            media_id: "waveform-media".to_string(),
            source: AudioWaveformSource::from_json(
                r##"{"generator":"audio-waveform-r","target_audio_id":"audio-1","target_source":"/tmp/music.wav","sample_window_seconds":1,"colour":"#00ff00","thickness":1,"amplitude":1}"##,
            )
            .expect("valid waveform source"),
            samples: vec![0.0],
            sample_rate: 48_000,
            width: 0,
            height: 4,
        };

        let error = split_audio_waveform_sources(&snapshot, &HashMap::new(), &[waveform])
            .expect_err("zero-width GPU source must preserve the CPU validation contract");
        assert!(matches!(
            error,
            NativeWgpuRenderError::AudioWaveform(
                uxfd_rust_core::AudioWaveformSceneError::InvalidDimensions
            )
        ));
    }

    #[test]
    fn audio_waveform_gpu_source_rejects_invalid_sample_rate_before_buffer_upload() {
        let snapshot = SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: Vec::new(),
        };
        let waveform = NativeAudioWaveformInput {
            media_id: "waveform-media".to_string(),
            source: AudioWaveformSource::from_json(
                r##"{"generator":"audio-waveform-r","target_audio_id":"audio-1","target_source":"/tmp/music.wav","sample_window_seconds":1,"colour":"#00ff00","thickness":1,"amplitude":1}"##,
            )
            .expect("valid waveform source"),
            samples: vec![0.0],
            sample_rate: 0,
            width: 4,
            height: 4,
        };

        let error = split_audio_waveform_sources(&snapshot, &HashMap::new(), &[waveform])
            .expect_err("zero sample rate must preserve the CPU validation contract");
        assert!(matches!(
            error,
            NativeWgpuRenderError::AudioWaveform(
                uxfd_rust_core::AudioWaveformSceneError::InvalidSampleRate
            )
        ));
    }

    #[test]
    fn prepare_base_scene_clips_cached_pairs_prepared_clips_with_sorted_z_index() {
        // `prepare_scene_clips_with_upload_fence` は内部で clip を z_index 昇順に
        // 並べ替えたクローンを prepare するため、prepared clip の並びは
        // 呼び出し元の `snapshot.clips`（元の順序）とは対応しない。
        // `prepare_base_scene_clips_cached` は各 prepared clip をソート後の
        // z_index と正しくペアにして返す契約を、入力を意図的に降順（未ソート）
        // にして固定する。
        let renderer = match pollster::block_on(NativeWgpuRenderer::new(4, 4)) {
            Ok(renderer) => renderer,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping z_index pairing test: no GPU adapter available");
                return;
            }
            Err(error) => panic!("renderer creation failed: {error:?}"),
        };
        let source = RgbaFrame::from_rgba8(2, 2, vec![10; 2 * 2 * 4]).expect("valid frame");
        let snapshot = SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![
                uxfd_rust_core::EvaluatedClip {
                    clip_id: "clip-high".to_string(),
                    track_id: "track-1".to_string(),
                    media_id: "source-1".to_string(),
                    source_frame: 0,
                    z_index: 9,
                    transform: uxfd_rust_core::Transform::identity(),
                    opacity: 1.0,
                    effects: Vec::new(),
                },
                uxfd_rust_core::EvaluatedClip {
                    clip_id: "clip-low".to_string(),
                    track_id: "track-1".to_string(),
                    media_id: "source-1".to_string(),
                    source_frame: 0,
                    z_index: 1,
                    transform: uxfd_rust_core::Transform::identity(),
                    opacity: 1.0,
                    effects: Vec::new(),
                },
            ],
        };
        let sources = HashMap::from([("source-1".to_string(), source)]);

        let (prepared, _) = renderer
            .prepare_base_scene_clips_cached(1, &snapshot, &sources, &HashMap::new())
            .expect("prepare must succeed even with unsorted z_index input");

        let z_indices: Vec<u32> = prepared.iter().map(|(z, _)| *z).collect();
        assert_eq!(
            z_indices,
            vec![1, 9],
            "prepared clip / z_index pairs must be in ascending z_index order \
             regardless of the input snapshot's clip order"
        );
    }

    #[test]
    fn prepare_base_scene_clips_cached_skips_texture_upload_on_same_generation() {
        // タスク3: 同一シーン世代の再 present（=デコレーションだけ変わった場合）
        // では create_texture / write_texture / create_bind_group を行わず、
        // 前回 prepare した Arc<PreparedClip> をそのまま再利用すること。
        // ここでは prepare 呼び出し自体のキャッシュ hit/miss カウンタで固定する
        // （実際の GPU リソース再生成有無を直接観測する術がないため、
        // 「同じ generation では新規 prepare 経路を通らない」という契約を
        // カウンタ経由で担保する）。
        let renderer = match pollster::block_on(NativeWgpuRenderer::new(4, 4)) {
            Ok(renderer) => renderer,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping prepared scene cache test: no GPU adapter available");
                return;
            }
            Err(error) => panic!("renderer creation failed: {error:?}"),
        };
        let (snapshot, sources) = solid_scene("clip-1", "source-1");

        let (first_clips, first_upload) = renderer
            .prepare_base_scene_clips_cached(1, &snapshot, &sources, &HashMap::new())
            .expect("first prepare (miss) must succeed");
        assert_eq!(renderer.prepared_scene_cache_stats(), (0, 1));
        assert_eq!(first_clips.len(), 1);

        let (second_clips, second_upload) = renderer
            .prepare_base_scene_clips_cached(1, &snapshot, &sources, &HashMap::new())
            .expect("second prepare with same generation (hit) must succeed");
        assert_eq!(
            renderer.prepared_scene_cache_stats(),
            (1, 1),
            "same generation re-present must hit the cache exactly once"
        );
        assert_eq!(
            second_upload,
            Duration::ZERO,
            "cache hit must skip upload entirely"
        );
        assert!(
            first_upload >= Duration::ZERO,
            "first (miss) upload measurement must be recorded"
        );
        assert!(
            Arc::ptr_eq(&first_clips[0].1, &second_clips[0].1),
            "cache hit must return the exact same GPU resource (Arc), not a fresh prepare"
        );
    }

    #[test]
    fn prepare_base_scene_clips_cached_reprepares_on_generation_change() {
        // シーンが変わったら（generation が進んだら）invalidate されて
        // 通常どおり prepare し直すこと。
        let renderer = match pollster::block_on(NativeWgpuRenderer::new(4, 4)) {
            Ok(renderer) => renderer,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!(
                    "skipping prepared scene cache invalidation test: no GPU adapter available"
                );
                return;
            }
            Err(error) => panic!("renderer creation failed: {error:?}"),
        };
        let (snapshot, sources) = solid_scene("clip-1", "source-1");

        let (first_clips, _) = renderer
            .prepare_base_scene_clips_cached(1, &snapshot, &sources, &HashMap::new())
            .expect("first prepare must succeed");
        assert_eq!(renderer.prepared_scene_cache_stats(), (0, 1));

        let (second_clips, _) = renderer
            .prepare_base_scene_clips_cached(2, &snapshot, &sources, &HashMap::new())
            .expect("prepare with new generation must succeed");
        assert_eq!(
            renderer.prepared_scene_cache_stats(),
            (0, 2),
            "generation change must invalidate the cache and re-prepare (miss)"
        );
        assert!(
            !Arc::ptr_eq(&first_clips[0].1, &second_clips[0].1),
            "generation change must produce a fresh GPU resource, not reuse the stale one"
        );
    }

    #[test]
    fn live_scene_generation_change_reuses_media_texture_when_revision_is_unchanged() {
        let Some(renderer) = create_test_renderer("live scene revision cache test") else {
            return;
        };
        let (mut snapshot, sources) = solid_scene("clip-1", "generated-hksy");
        let revisions = HashMap::from([("generated-hksy".to_string(), 42_u64)]);

        renderer
            .prepare_base_scene_clips_cached(1, &snapshot, &sources, &revisions)
            .expect("first live scene prepare must succeed");
        assert_eq!(renderer.prepared_scene_cache_stats(), (0, 1));
        assert_eq!(renderer.media_texture_cache_stats(), (0, 1));

        snapshot.clips[0].transform.translation_x = 32.0;
        renderer
            .prepare_base_scene_clips_cached(2, &snapshot, &sources, &revisions)
            .expect("changed live scene generation must re-prepare safely");

        assert_eq!(
            renderer.prepared_scene_cache_stats(),
            (0, 2),
            "transform change must rebuild the prepared clip for the new live scene generation"
        );
        assert_eq!(
            renderer.media_texture_cache_stats(),
            (1, 1),
            "unchanged media revision must reuse the GPU texture across live scene generations"
        );
    }

    #[test]
    fn prepared_clip_is_shared_via_arc_without_deep_cloning_gpu_resource() {
        // タスク2: last_scene の deep clone 廃止に伴い、prepared clip は
        // Arc で共有できる（cheap clone）ことを型レベルで固定する。
        // PreparedClip 自体（wgpu::BindGroup）は Clone を実装しないため、
        // Vec<Arc<PreparedClip>> の clone が「ポインタコピーのみ」で完結する
        // ことを確認する。
        let renderer = match pollster::block_on(NativeWgpuRenderer::new(4, 4)) {
            Ok(renderer) => renderer,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping Arc sharing test: no GPU adapter available");
                return;
            }
            Err(error) => panic!("renderer creation failed: {error:?}"),
        };
        let (snapshot, sources) = solid_scene("clip-1", "source-1");
        let (prepared_clips, _) = renderer
            .prepare_base_scene_clips_cached(1, &snapshot, &sources, &HashMap::new())
            .expect("prepare must succeed");

        let cloned = prepared_clips.clone();

        // strong_count は「戻り値の Vec」「cloned」「内部キャッシュ」の 3 箇所分。
        // ここで確認したいのは新規 GPU リソースが増えていないこと（clone しても
        // strong_count が Vec の複製数ぶんきっちり増えるだけで、bind_group が
        // 複製されていないこと）。
        assert_eq!(Arc::strong_count(&prepared_clips[0].1), 3);
        assert!(Arc::ptr_eq(&prepared_clips[0].1, &cloned[0].1));
    }

    /// `media_id` を 2 件持つシーンを作る。`entries` は `(clip_id, media_id)`。
    /// 各 media は 2x2 の単色ソースフレーム（テストごとに内容差は不要）。
    fn multi_clip_scene(entries: &[(&str, &str)]) -> (SceneSnapshot, HashMap<String, RgbaFrame>) {
        let clips = entries
            .iter()
            .enumerate()
            .map(
                |(index, (clip_id, media_id))| uxfd_rust_core::EvaluatedClip {
                    clip_id: clip_id.to_string(),
                    track_id: "track-1".to_string(),
                    media_id: media_id.to_string(),
                    source_frame: 0,
                    z_index: index as u32,
                    transform: uxfd_rust_core::Transform::identity(),
                    opacity: 1.0,
                    effects: Vec::new(),
                },
            )
            .collect();
        let snapshot = SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips,
        };
        let mut sources = HashMap::new();
        for (_, media_id) in entries {
            sources.entry(media_id.to_string()).or_insert_with(|| {
                RgbaFrame::from_rgba8(2, 2, vec![20; 2 * 2 * 4]).expect("valid source frame")
            });
        }
        (snapshot, sources)
    }

    fn create_test_renderer(label: &str) -> Option<NativeWgpuRenderer> {
        match pollster::block_on(NativeWgpuRenderer::new(4, 4)) {
            Ok(renderer) => Some(renderer),
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping {label}: no GPU adapter available");
                None
            }
            Err(error) => panic!("renderer creation failed: {error:?}"),
        }
    }

    #[test]
    fn media_texture_cache_hits_when_revision_is_unchanged_across_transform_only_edits() {
        // タスク Phase 3a: ドラッグ中（transform だけが変わる）でも、内容が
        // 同じ media は create_texture/write_texture を再実行しないこと。
        // 「同じ revision で 2 回目は必ずキャッシュ hit」という契約をカウンタで固定する。
        let Some(renderer) = create_test_renderer("media texture cache hit test") else {
            return;
        };
        let (mut snapshot, sources) = solid_scene("clip-1", "image-1");
        let content_revisions = HashMap::from([("image-1".to_string(), 7u64)]);

        let (first_clips, _) = renderer
            .prepare_scene_clips(&snapshot, &sources, &content_revisions)
            .expect("first prepare (miss) must succeed");
        assert_eq!(renderer.media_texture_cache_stats(), (0, 1));

        // transform だけを変える（ドラッグ相当）。revision は据え置き。
        snapshot.clips[0].transform.translation_x = 42.0;
        let (second_clips, second_upload) = renderer
            .prepare_scene_clips(&snapshot, &sources, &content_revisions)
            .expect("second prepare (hit) must succeed");
        assert_eq!(
            renderer.media_texture_cache_stats(),
            (1, 1),
            "unchanged revision must hit the media texture cache exactly once"
        );
        assert!(
            second_upload < Duration::from_millis(1) || renderer.media_texture_cache_stats().0 == 1,
            "cache hit path must not repeat the texture upload"
        );
        // bind group 自体は毎フレーム transform 用に作り直すため Arc は別物だが、
        // それはキャッシュ hit / miss の判定とは無関係（ここでは hit/miss
        // カウンタで texture 再アップロード有無を担保している）。
        assert_eq!(first_clips.len(), 1);
        assert_eq!(second_clips.len(), 1);
    }

    #[test]
    fn media_texture_cache_reuploads_only_the_media_whose_revision_changed() {
        // 動画フレームが進む（shared memory frame descriptor の generation が
        // 変わる）ケースを revision 変化で模擬する。動画側だけがミスになり、
        // 静止画側はヒットし続けること（＝その media だけ再アップロード）。
        let Some(renderer) = create_test_renderer("media texture cache selective reupload test")
        else {
            return;
        };
        let (snapshot, sources) =
            multi_clip_scene(&[("clip-video", "video-1"), ("clip-image", "image-1")]);

        let mut content_revisions = HashMap::from([
            ("video-1".to_string(), 1u64),
            ("image-1".to_string(), 100u64),
        ]);
        renderer
            .prepare_scene_clips(&snapshot, &sources, &content_revisions)
            .expect("first prepare must succeed");
        assert_eq!(
            renderer.media_texture_cache_stats(),
            (0, 2),
            "first frame: both media are misses"
        );

        // video-1 のフレームが進む（generation 相当の revision が変わる）。
        // image-1 は静止画のまま（revision 不変）。
        content_revisions.insert("video-1".to_string(), 2u64);
        renderer
            .prepare_scene_clips(&snapshot, &sources, &content_revisions)
            .expect("second prepare must succeed");
        assert_eq!(
            renderer.media_texture_cache_stats(),
            (1, 3),
            "second frame: only the media whose revision changed (video-1) is re-uploaded; \
             image-1 must hit"
        );
    }

    #[test]
    fn media_texture_cache_evicts_entries_unreferenced_for_the_idle_frame_limit() {
        // クリップ削除・シーンクリア後、GPU テクスチャがいつまでも保持され続けない
        // こと（不参照が続いた media は退避される）を固定する。
        let Some(renderer) = create_test_renderer("media texture cache eviction test") else {
            return;
        };
        let (snapshot, sources) = solid_scene("clip-1", "image-1");
        let content_revisions = HashMap::from([("image-1".to_string(), 1u64)]);

        renderer
            .prepare_scene_clips(&snapshot, &sources, &content_revisions)
            .expect("initial prepare must succeed");
        assert_eq!(renderer.media_texture_cache_len(), 1);

        // クリップが消えた（シーンから image-1 が参照されなくなった）状態を
        // idle 上限を超えるフレーム数ぶん繰り返す。
        let empty_snapshot = SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: Vec::new(),
        };
        for _ in 0..=MEDIA_TEXTURE_CACHE_IDLE_FRAME_LIMIT {
            renderer
                .prepare_scene_clips(
                    &empty_snapshot,
                    &HashMap::<String, RgbaFrame>::new(),
                    &HashMap::new(),
                )
                .expect("prepare of empty scene must succeed");
        }

        assert_eq!(
            renderer.media_texture_cache_len(),
            0,
            "media unreferenced for longer than the idle frame limit must be evicted"
        );

        // 退避後に再度参照すると必ずミスになること（本当に GPU リソースが
        // 解放され、単なる会計上のズレではないことの確認）。
        let (_, misses_before) = renderer.media_texture_cache_stats();
        renderer
            .prepare_scene_clips(&snapshot, &sources, &content_revisions)
            .expect("re-referencing evicted media must succeed");
        let (_, misses_after) = renderer.media_texture_cache_stats();
        assert_eq!(
            misses_after,
            misses_before + 1,
            "re-referencing an evicted media_id must miss and re-upload"
        );
    }

    #[test]
    fn resize_output_keeps_media_texture_cache_alive_and_renders_are_correct() {
        // リサイズ（ペインサイズ変更）のたびにレンダラごと（＝全クリップの GPU
        // リソース）を破棄していた旧実装と異なり、`resize_output` は
        // 出力サイズ依存リソースだけを作り直し、per-media テクスチャキャッシュは
        // 生き残ること、かつリサイズ後の描画結果が正しいサイズで得られることを
        // 固定する。
        let Some(mut renderer) = create_test_renderer("resize_output cache survival test") else {
            return;
        };
        let (snapshot, sources) = solid_scene("clip-1", "image-1");
        let content_revisions = HashMap::from([("image-1".to_string(), 1u64)]);

        renderer
            .prepare_scene_clips(&snapshot, &sources, &content_revisions)
            .expect("prepare before resize must succeed");
        assert_eq!(renderer.media_texture_cache_stats(), (0, 1));

        renderer
            .resize_output(8, 6)
            .expect("resize_output must succeed within adapter limits");
        assert_eq!(renderer.width(), 8);
        assert_eq!(renderer.height(), 6);

        // リサイズ後も同じ revision の media は引き続きキャッシュ hit すること。
        renderer
            .prepare_scene_clips(&snapshot, &sources, &content_revisions)
            .expect("prepare after resize must succeed");
        assert_eq!(
            renderer.media_texture_cache_stats(),
            (1, 1),
            "resize must not invalidate the per-media GPU texture cache"
        );

        // リサイズ後の実際のレンダリングも新しいサイズで正しく完走すること。
        let report = pollster::block_on(renderer.render_frame_stages(&snapshot, &sources))
            .expect("render after resize must succeed");
        assert_eq!(report.width, 8);
        assert_eq!(report.height, 6);
        assert_eq!(report.frame.width, 8);
        assert_eq!(report.frame.height, 6);
    }

    #[test]
    fn empty_scene_present_produces_a_fully_transparent_offscreen_frame() {
        // 残像調査の post_clear 不変条件（headless で固定できる部分）:
        // clip 0 件の空シーン（透明クリア相当）を present すると、描画結果は
        // 全ピクセル alpha=0 になること。clear（present_cached_scene_with_decoration
        // 経由の空シーン present）で drawable が透明化される契約の native 側担保。
        // これが崩れると post_clear_non_transparent が非0になり残像の native 原因
        // （clear render のバグ）になる。offscreen（output_texture）経路のため
        // swapchain 保持は再現しないが、clear render 自体の正しさは固定できる。
        let renderer = match pollster::block_on(NativeWgpuRenderer::new(8, 8)) {
            Ok(renderer) => renderer,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping empty scene transparency test: no GPU adapter available");
                return;
            }
            Err(error) => panic!("renderer creation failed: {error:?}"),
        };
        let empty_snapshot = SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: Vec::new(),
        };
        let empty_sources: HashMap<String, RgbaFrame> = HashMap::new();

        let frame = pollster::block_on(
            renderer.render_overlay_surface_frame_for_test(&empty_snapshot, &empty_sources),
        )
        .expect("empty scene present must succeed");

        assert_eq!(
            count_non_transparent_pixels(&frame),
            0,
            "an empty scene present must clear the drawable to fully transparent \
             (post_clear invariant for the residual-frame fix)"
        );
    }

    // Phase 4b: NV12 IOSurface import・GPU 合成のテスト。実 IOSurface を
    // 使うため macOS(Metal) 限定。
    #[cfg(target_os = "macos")]
    mod nv12_iosurface {
        use super::*;

        // ITU-R BT.601 / BT.709 の YCbCr→RGB 変換を CPU で再現する参照実装。
        // `shared-renderer/shaders/nv12_composite.wgsl` の
        // `nv12_ycbcr_to_rgb`/`load_source_linear` と数式を一致させてある。
        // 出力フォーマットが `Rgba8UnormSrgb` のため、ここで返す値は
        // (GPU がシェーダ内で linear へ変換してブレンドした後、書き込み時に
        // 再び sRGB へエンコードし直すので) readback される sRGB8 バイトと
        // 直接比較できる。
        fn nv12_reference_srgb_bytes(
            y_raw: u8,
            cb_raw: u8,
            cr_raw: u8,
            colour_range: Nv12ColourRange,
            colour_matrix: Nv12ColourMatrix,
        ) -> [u8; 3] {
            let y = y_raw as f32 / 255.0;
            let cb = cb_raw as f32 / 255.0;
            let cr = cr_raw as f32 / 255.0;

            let (y_n, cb_n, cr_n) = match colour_range {
                Nv12ColourRange::Full => (y, cb - 0.5, cr - 0.5),
                Nv12ColourRange::Video => (
                    ((y * 255.0 - 16.0) / 219.0).clamp(0.0, 1.0),
                    ((cb * 255.0 - 128.0) / 224.0).clamp(-0.5, 0.5),
                    ((cr * 255.0 - 128.0) / 224.0).clamp(-0.5, 0.5),
                ),
            };

            let (r, g, b) = match colour_matrix {
                Nv12ColourMatrix::Bt709 => (
                    y_n + 1.5748 * cr_n,
                    y_n - 0.187_324 * cb_n - 0.468_124 * cr_n,
                    y_n + 1.8556 * cb_n,
                ),
                Nv12ColourMatrix::Bt601 => (
                    y_n + 1.402 * cr_n,
                    y_n - 0.344_136 * cb_n - 0.714_136 * cr_n,
                    y_n + 1.772 * cb_n,
                ),
                // BT.2020 has no distinct coefficients in production either
                // (see `nv12::pipeline::Nv12Params::new`): treated the same
                // as BT.709 here too, so this reference oracle still agrees
                // with the shader for BT.2020-tagged fixtures.
                Nv12ColourMatrix::Bt2020 => (
                    y_n + 1.5748 * cr_n,
                    y_n - 0.187_324 * cb_n - 0.468_124 * cr_n,
                    y_n + 1.8556 * cb_n,
                ),
            };

            let to_byte = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
            [to_byte(r), to_byte(g), to_byte(b)]
        }

        fn identity_nv12_clip(clip_id: &str, media_id: &str, z_index: u32) -> EvaluatedClip {
            EvaluatedClip {
                clip_id: clip_id.to_string(),
                track_id: "track-1".to_string(),
                media_id: media_id.to_string(),
                source_frame: 0,
                z_index,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }
        }

        fn assert_pixels_close(
            actual: &RgbaFrame,
            expected: &RgbaFrame,
            tolerance: i32,
            context: &str,
        ) {
            assert_eq!(actual.width, expected.width, "{context}: width mismatch");
            assert_eq!(actual.height, expected.height, "{context}: height mismatch");
            for (index, (a, e)) in actual.pixels.iter().zip(expected.pixels.iter()).enumerate() {
                let diff = (*a as i32 - *e as i32).abs();
                assert!(
                    diff <= tolerance,
                    "{context}: byte {index} differs by {diff} (actual={a}, expected={e}, tolerance={tolerance})"
                );
            }
        }

        fn new_test_renderer(width: u32, height: u32) -> Option<NativeWgpuRenderer> {
            match pollster::block_on(NativeWgpuRenderer::new(width, height)) {
                Ok(renderer) => Some(renderer),
                Err(NativeWgpuRenderError::AdapterUnavailable) => {
                    eprintln!("skipping nv12 test: no GPU adapter available");
                    None
                }
                Err(error) => panic!("renderer creation failed: {error:?}"),
            }
        }

        #[test]
        fn solid_colour_bt601_video_range_matches_cpu_reference() {
            let Some(renderer) = new_test_renderer(4, 4) else {
                return;
            };
            let colour_range = Nv12ColourRange::Video;
            let colour_matrix = Nv12ColourMatrix::Bt601;
            let (y_value, cb_value, cr_value) = (180_u8, 90_u8, 200_u8);

            let buffer = nv12_fixture::SyntheticNv12Buffer::new(
                4,
                4,
                nv12_fixture::K_CV_PIXEL_FORMAT_TYPE_420YP_CB_CR8_BI_PLANAR_VIDEO_RANGE,
                |_row, _col| y_value,
                |_row, _col| (cb_value, cr_value),
            );

            let layers = vec![SceneLayer {
                clip: identity_nv12_clip("clip-nv12", "media-nv12", 0),
                content: SceneLayerContent::Nv12 {
                    source: Nv12IoSurfaceSource {
                        surface_id: buffer.surface_id,
                        width: buffer.width,
                        height: buffer.height,
                        colour_range,
                        colour_matrix,
                    },
                    revision: 1,
                },
            }];

            let frame = pollster::block_on(renderer.render_layers_to_rgba(&layers))
                .expect("nv12 solid colour render must succeed");

            let [r, g, b] =
                nv12_reference_srgb_bytes(y_value, cb_value, cr_value, colour_range, colour_matrix);
            for pixel in frame.pixels.chunks_exact(4) {
                assert!(
                    (pixel[0] as i32 - r as i32).abs() <= 2
                        && (pixel[1] as i32 - g as i32).abs() <= 2
                        && (pixel[2] as i32 - b as i32).abs() <= 2
                        && pixel[3] == 255,
                    "nv12 BT.601 video-range solid colour mismatch: got {pixel:?}, expected [{r}, {g}, {b}, 255]"
                );
            }
        }

        #[test]
        fn solid_colour_bt709_full_range_matches_cpu_reference() {
            let Some(renderer) = new_test_renderer(4, 4) else {
                return;
            };
            let colour_range = Nv12ColourRange::Full;
            let colour_matrix = Nv12ColourMatrix::Bt709;
            let (y_value, cb_value, cr_value) = (60_u8, 180_u8, 40_u8);

            let buffer = nv12_fixture::SyntheticNv12Buffer::new(
                4,
                4,
                nv12_fixture::K_CV_PIXEL_FORMAT_TYPE_420YP_CB_CR8_BI_PLANAR_FULL_RANGE,
                |_row, _col| y_value,
                |_row, _col| (cb_value, cr_value),
            );

            let layers = vec![SceneLayer {
                clip: identity_nv12_clip("clip-nv12", "media-nv12", 0),
                content: SceneLayerContent::Nv12 {
                    source: Nv12IoSurfaceSource {
                        surface_id: buffer.surface_id,
                        width: buffer.width,
                        height: buffer.height,
                        colour_range,
                        colour_matrix,
                    },
                    revision: 1,
                },
            }];

            let frame = pollster::block_on(renderer.render_layers_to_rgba(&layers))
                .expect("nv12 solid colour render must succeed");

            let [r, g, b] =
                nv12_reference_srgb_bytes(y_value, cb_value, cr_value, colour_range, colour_matrix);
            for pixel in frame.pixels.chunks_exact(4) {
                assert!(
                    (pixel[0] as i32 - r as i32).abs() <= 2
                        && (pixel[1] as i32 - g as i32).abs() <= 2
                        && (pixel[2] as i32 - b as i32).abs() <= 2
                        && pixel[3] == 255,
                    "nv12 BT.709 full-range solid colour mismatch: got {pixel:?}, expected [{r}, {g}, {b}, 255]"
                );
            }
        }

        #[test]
        fn gradient_matches_cpu_reference_within_tolerance() {
            let width = 8_u32;
            let height = 4_u32;
            let Some(renderer) = new_test_renderer(width, height) else {
                return;
            };
            let colour_range = Nv12ColourRange::Video;
            let colour_matrix = Nv12ColourMatrix::Bt601;

            // 列ごとに Y を変化させた水平グラデーション。Cb/Cr は一定
            // （無彩色）にして、輝度グラデーションが正しく変換されることを
            // 確認する。
            let y_for_col = |col: u32| -> u8 {
                let ratio = col as f32 / (width - 1) as f32;
                (16.0 + ratio * (235.0 - 16.0)).round() as u8
            };
            let cb_value = 128_u8;
            let cr_value = 128_u8;

            let buffer = nv12_fixture::SyntheticNv12Buffer::new(
                width,
                height,
                nv12_fixture::K_CV_PIXEL_FORMAT_TYPE_420YP_CB_CR8_BI_PLANAR_VIDEO_RANGE,
                |_row, col| y_for_col(col),
                |_row, _col| (cb_value, cr_value),
            );

            let layers = vec![SceneLayer {
                clip: identity_nv12_clip("clip-nv12", "media-nv12", 0),
                content: SceneLayerContent::Nv12 {
                    source: Nv12IoSurfaceSource {
                        surface_id: buffer.surface_id,
                        width: buffer.width,
                        height: buffer.height,
                        colour_range,
                        colour_matrix,
                    },
                    revision: 1,
                },
            }];

            let frame = pollster::block_on(renderer.render_layers_to_rgba(&layers))
                .expect("nv12 gradient render must succeed");

            for row in 0..height {
                for col in 0..width {
                    // シェーダは pixel/2（整数除算）で chroma を最近傍サンプル
                    // する。CPU 参照でも同じ規則で対応する chroma 値を選ぶ
                    // （このグラデーションは chroma 一定なのでどの列でも同じ値）。
                    let y_value = y_for_col(col);
                    let [r, g, b] = nv12_reference_srgb_bytes(
                        y_value,
                        cb_value,
                        cr_value,
                        colour_range,
                        colour_matrix,
                    );
                    let index = ((row * width + col) * 4) as usize;
                    let pixel = &frame.pixels[index..index + 4];
                    assert!(
                        (pixel[0] as i32 - r as i32).abs() <= 2
                            && (pixel[1] as i32 - g as i32).abs() <= 2
                            && (pixel[2] as i32 - b as i32).abs() <= 2,
                        "nv12 gradient mismatch at (row={row}, col={col}): got {pixel:?}, expected [{r}, {g}, {b}]"
                    );
                }
            }
        }

        #[test]
        fn compositing_with_rgba_clip_matches_two_rgba_clip_reference() {
            let width = 4_u32;
            let height = 4_u32;
            let Some(renderer) = new_test_renderer(width, height) else {
                return;
            };
            let colour_range = Nv12ColourRange::Video;
            let colour_matrix = Nv12ColourMatrix::Bt601;
            let (y_value, cb_value, cr_value) = (200_u8, 100_u8, 90_u8);
            let [bottom_r, bottom_g, bottom_b] =
                nv12_reference_srgb_bytes(y_value, cb_value, cr_value, colour_range, colour_matrix);

            let buffer = nv12_fixture::SyntheticNv12Buffer::new(
                width,
                height,
                nv12_fixture::K_CV_PIXEL_FORMAT_TYPE_420YP_CB_CR8_BI_PLANAR_VIDEO_RANGE,
                |_row, _col| y_value,
                |_row, _col| (cb_value, cr_value),
            );

            let mut top_clip = identity_nv12_clip("clip-rgba-top", "media-rgba-top", 1);
            top_clip.opacity = 0.5;
            let top_rgba = RgbaFrame::from_rgba8(
                width,
                height,
                std::iter::repeat([30_u8, 200_u8, 60_u8, 255_u8])
                    .take((width * height) as usize)
                    .flatten()
                    .collect(),
            )
            .expect("valid top rgba frame");

            let mixed_layers = vec![
                SceneLayer {
                    clip: identity_nv12_clip("clip-nv12-bottom", "media-nv12-bottom", 0),
                    content: SceneLayerContent::Nv12 {
                        source: Nv12IoSurfaceSource {
                            surface_id: buffer.surface_id,
                            width: buffer.width,
                            height: buffer.height,
                            colour_range,
                            colour_matrix,
                        },
                        revision: 1,
                    },
                },
                SceneLayer {
                    clip: top_clip.clone(),
                    content: SceneLayerContent::Rgba(top_rgba.clone()),
                },
            ];

            let bottom_rgba_equivalent = RgbaFrame::from_rgba8(
                width,
                height,
                std::iter::repeat([bottom_r, bottom_g, bottom_b, 255_u8])
                    .take((width * height) as usize)
                    .flatten()
                    .collect(),
            )
            .expect("valid bottom rgba reference frame");
            let reference_layers = vec![
                SceneLayer {
                    clip: identity_nv12_clip("clip-rgba-bottom", "media-rgba-bottom", 0),
                    content: SceneLayerContent::Rgba(bottom_rgba_equivalent),
                },
                SceneLayer {
                    clip: top_clip,
                    content: SceneLayerContent::Rgba(top_rgba),
                },
            ];

            let mixed_frame = pollster::block_on(renderer.render_layers_to_rgba(&mixed_layers))
                .expect("nv12+rgba compositing render must succeed");
            let reference_frame =
                pollster::block_on(renderer.render_layers_to_rgba(&reference_layers))
                    .expect("rgba+rgba reference render must succeed");

            assert_pixels_close(
                &mixed_frame,
                &reference_frame,
                2,
                "nv12 clip composited under an rgba clip must match an equivalent all-rgba composite",
            );
        }

        #[test]
        fn unchanged_revision_reuses_imported_plane_textures() {
            let Some(renderer) = new_test_renderer(4, 4) else {
                return;
            };
            let buffer = nv12_fixture::SyntheticNv12Buffer::new(
                4,
                4,
                nv12_fixture::K_CV_PIXEL_FORMAT_TYPE_420YP_CB_CR8_BI_PLANAR_VIDEO_RANGE,
                |_row, _col| 128,
                |_row, _col| (128, 128),
            );
            let source = Nv12IoSurfaceSource {
                surface_id: buffer.surface_id,
                width: buffer.width,
                height: buffer.height,
                colour_range: Nv12ColourRange::Video,
                colour_matrix: Nv12ColourMatrix::Bt601,
            };
            let layers = vec![SceneLayer {
                clip: identity_nv12_clip("clip-nv12", "media-nv12", 0),
                content: SceneLayerContent::Nv12 {
                    source,
                    revision: 7,
                },
            }];

            pollster::block_on(renderer.render_layers_to_rgba(&layers))
                .expect("first nv12 render must succeed (cache miss expected)");
            assert_eq!(renderer.nv12_texture_cache_stats(), (0, 1));
            assert_eq!(renderer.nv12_texture_cache_len(), 1);

            pollster::block_on(renderer.render_layers_to_rgba(&layers)).expect(
                "second nv12 render with unchanged revision must succeed (cache hit expected)",
            );
            assert_eq!(
                renderer.nv12_texture_cache_stats(),
                (1, 1),
                "unchanged (surface_id, revision) must hit the plane texture cache and skip re-import"
            );
            assert_eq!(renderer.nv12_texture_cache_len(), 1);

            // revision が変われば再 import（ミス）になる。
            let layers_new_revision = vec![SceneLayer {
                clip: identity_nv12_clip("clip-nv12", "media-nv12", 0),
                content: SceneLayerContent::Nv12 {
                    source,
                    revision: 8,
                },
            }];
            pollster::block_on(renderer.render_layers_to_rgba(&layers_new_revision))
                .expect("nv12 render with new revision must succeed (cache miss expected)");
            assert_eq!(renderer.nv12_texture_cache_stats(), (1, 2));
        }

        // Phase 4c Stage 2: `render_layers_to_rgba` above is the Phase 4b
        // demo entry point that never touches the production `SceneSnapshot`
        // path. These tests instead exercise the actual production chain
        // (`render_frame_stages_with_audio_waveforms` ->
        // `prepare_scene_clips_with_upload_fence`) that
        // `rust-backend/src/native_render.rs` calls for
        // `render.nativeSharedFrame`.

        fn empty_snapshot_with_clip(clip: EvaluatedClip) -> SceneSnapshot {
            SceneSnapshot {
                frame_index: 0,
                colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
                clips: vec![clip],
            }
        }

        #[test]
        fn production_path_renders_nv12_only_clip_with_no_rgba_sources_entry() {
            let Some(renderer) = new_test_renderer(4, 4) else {
                return;
            };
            let colour_range = Nv12ColourRange::Video;
            let colour_matrix = Nv12ColourMatrix::Bt601;
            let (y_value, cb_value, cr_value) = (180_u8, 90_u8, 200_u8);
            let buffer = nv12_fixture::SyntheticNv12Buffer::new(
                4,
                4,
                nv12_fixture::K_CV_PIXEL_FORMAT_TYPE_420YP_CB_CR8_BI_PLANAR_VIDEO_RANGE,
                |_row, _col| y_value,
                |_row, _col| (cb_value, cr_value),
            );

            let snapshot =
                empty_snapshot_with_clip(identity_nv12_clip("clip-nv12", "media-nv12", 0));
            let nv12_sources = HashMap::from([(
                "media-nv12".to_string(),
                Nv12IoSurfaceRef {
                    surface_id: buffer.surface_id,
                    width: buffer.width,
                    height: buffer.height,
                    colour_range,
                    colour_matrix,
                    revision: 1,
                },
            )]);

            // `sources` (the RGBA map) is deliberately empty: a media_id
            // resolved via `nv12_sources` must never be required to also
            // have an RGBA entry -- that is precisely the CPU->GPU bridge
            // Stage 2 removes.
            let report = pollster::block_on(renderer.render_frame_stages_with_audio_waveforms(
                &snapshot,
                &HashMap::new(),
                &[],
                &HashMap::new(),
                &nv12_sources,
            ))
            .expect("production path must render an nv12-only clip without an RGBA sources entry");

            let [r, g, b] =
                nv12_reference_srgb_bytes(y_value, cb_value, cr_value, colour_range, colour_matrix);
            for pixel in report.frame.pixels.chunks_exact(4) {
                assert!(
                    (pixel[0] as i32 - r as i32).abs() <= 2
                        && (pixel[1] as i32 - g as i32).abs() <= 2
                        && (pixel[2] as i32 - b as i32).abs() <= 2
                        && pixel[3] == 255,
                    "production nv12 path mismatch: got {pixel:?}, expected [{r}, {g}, {b}, 255]"
                );
            }
        }

        #[test]
        fn production_path_mixes_nv12_and_rgba_clips_matching_all_rgba_reference() {
            let Some(renderer) = new_test_renderer(4, 4) else {
                return;
            };
            let colour_range = Nv12ColourRange::Video;
            let colour_matrix = Nv12ColourMatrix::Bt601;
            let (y_value, cb_value, cr_value) = (200_u8, 100_u8, 90_u8);
            let [bottom_r, bottom_g, bottom_b] =
                nv12_reference_srgb_bytes(y_value, cb_value, cr_value, colour_range, colour_matrix);
            let buffer = nv12_fixture::SyntheticNv12Buffer::new(
                4,
                4,
                nv12_fixture::K_CV_PIXEL_FORMAT_TYPE_420YP_CB_CR8_BI_PLANAR_VIDEO_RANGE,
                |_row, _col| y_value,
                |_row, _col| (cb_value, cr_value),
            );

            let mut top_clip = identity_nv12_clip("clip-rgba-top", "media-rgba-top", 1);
            top_clip.opacity = 0.5;
            let top_rgba = RgbaFrame::from_rgba8(
                4,
                4,
                std::iter::repeat([30_u8, 200_u8, 60_u8, 255_u8])
                    .take(16)
                    .flatten()
                    .collect(),
            )
            .expect("valid top rgba frame");

            let mixed_snapshot = SceneSnapshot {
                frame_index: 0,
                colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
                clips: vec![
                    identity_nv12_clip("clip-nv12-bottom", "media-nv12-bottom", 0),
                    top_clip.clone(),
                ],
            };
            let nv12_sources = HashMap::from([(
                "media-nv12-bottom".to_string(),
                Nv12IoSurfaceRef {
                    surface_id: buffer.surface_id,
                    width: buffer.width,
                    height: buffer.height,
                    colour_range,
                    colour_matrix,
                    revision: 1,
                },
            )]);
            let mixed_sources = HashMap::from([("media-rgba-top".to_string(), top_rgba.clone())]);

            let reference_snapshot = SceneSnapshot {
                frame_index: 0,
                colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
                clips: vec![
                    identity_nv12_clip("clip-rgba-bottom", "media-rgba-bottom", 0),
                    top_clip,
                ],
            };
            let bottom_rgba_equivalent = RgbaFrame::from_rgba8(
                4,
                4,
                std::iter::repeat([bottom_r, bottom_g, bottom_b, 255_u8])
                    .take(16)
                    .flatten()
                    .collect(),
            )
            .expect("valid bottom rgba reference frame");
            let reference_sources = HashMap::from([
                ("media-rgba-bottom".to_string(), bottom_rgba_equivalent),
                ("media-rgba-top".to_string(), top_rgba),
            ]);

            let mixed_report =
                pollster::block_on(renderer.render_frame_stages_with_audio_waveforms(
                    &mixed_snapshot,
                    &mixed_sources,
                    &[],
                    &HashMap::new(),
                    &nv12_sources,
                ))
                .expect("production nv12+rgba mixed render must succeed");
            let reference_report =
                pollster::block_on(renderer.render_frame_stages_with_audio_waveforms(
                    &reference_snapshot,
                    &reference_sources,
                    &[],
                    &HashMap::new(),
                    &HashMap::new(),
                ))
                .expect("production all-rgba reference render must succeed");

            assert_pixels_close(
                &mixed_report.frame,
                &reference_report.frame,
                2,
                "production path: nv12 clip composited with an rgba clip must match an equivalent \
                 all-rgba composite",
            );
        }

        #[test]
        fn production_path_reuses_nv12_texture_cache_across_calls_with_unchanged_revision() {
            let Some(renderer) = new_test_renderer(4, 4) else {
                return;
            };
            let buffer = nv12_fixture::SyntheticNv12Buffer::new(
                4,
                4,
                nv12_fixture::K_CV_PIXEL_FORMAT_TYPE_420YP_CB_CR8_BI_PLANAR_VIDEO_RANGE,
                |_row, _col| 128,
                |_row, _col| (128, 128),
            );
            let snapshot =
                empty_snapshot_with_clip(identity_nv12_clip("clip-nv12", "media-nv12", 0));
            let source = Nv12IoSurfaceRef {
                surface_id: buffer.surface_id,
                width: buffer.width,
                height: buffer.height,
                colour_range: Nv12ColourRange::Video,
                colour_matrix: Nv12ColourMatrix::Bt601,
                revision: 7,
            };
            let nv12_sources = HashMap::from([("media-nv12".to_string(), source)]);

            pollster::block_on(renderer.render_frame_stages_with_audio_waveforms(
                &snapshot,
                &HashMap::new(),
                &[],
                &HashMap::new(),
                &nv12_sources,
            ))
            .expect("first production nv12 render must succeed (cache miss expected)");
            assert_eq!(renderer.nv12_texture_cache_stats(), (0, 1));

            pollster::block_on(renderer.render_frame_stages_with_audio_waveforms(
                &snapshot,
                &HashMap::new(),
                &[],
                &HashMap::new(),
                &nv12_sources,
            ))
            .expect("second production nv12 render with unchanged revision must succeed");
            assert_eq!(
                renderer.nv12_texture_cache_stats(),
                (1, 1),
                "unchanged (surface_id, revision) must hit the plane texture cache via the \
                 production path too"
            );
        }

        /// テスト専用: IOSurface-backed NV12 CVPixelBuffer を合成する。
        /// デコード側（AVAssetReader）とは独立した synthetic フィクスチャで、
        /// production の import 経路（`IOSurfaceLookup` 経由）が実運用と
        /// 同じ形の入力（CVPixelBuffer から取り出した IOSurface）を正しく
        /// 扱えることを検証する。
        mod nv12_fixture {
            use core_foundation::base::{CFType, CFTypeRef, TCFType};
            use core_foundation::dictionary::CFDictionary;
            use core_foundation::string::{CFString, CFStringRef};
            use std::ffi::c_void;

            type CVPixelBufferRef = *mut c_void;
            type IOSurfaceRef = *mut c_void;
            type CVReturn = i32;
            type OSType = u32;

            pub(super) const K_CV_PIXEL_FORMAT_TYPE_420YP_CB_CR8_BI_PLANAR_VIDEO_RANGE: OSType =
                0x3432_3076; // '420v'
            pub(super) const K_CV_PIXEL_FORMAT_TYPE_420YP_CB_CR8_BI_PLANAR_FULL_RANGE: OSType =
                0x3432_3066; // '420f'

            #[link(name = "CoreVideo", kind = "framework")]
            extern "C" {
                static kCVPixelBufferIOSurfacePropertiesKey: CFStringRef;
                fn CVPixelBufferCreate(
                    allocator: CFTypeRef,
                    width: usize,
                    height: usize,
                    pixel_format_type: OSType,
                    pixel_buffer_attributes: CFTypeRef,
                    pixel_buffer_out: *mut CVPixelBufferRef,
                ) -> CVReturn;
                fn CVPixelBufferRelease(buffer: CVPixelBufferRef);
                fn CVPixelBufferGetIOSurface(buffer: CVPixelBufferRef) -> IOSurfaceRef;
                fn CVPixelBufferLockBaseAddress(buffer: CVPixelBufferRef, flags: u64) -> CVReturn;
                fn CVPixelBufferUnlockBaseAddress(buffer: CVPixelBufferRef, flags: u64)
                    -> CVReturn;
                fn CVPixelBufferGetBaseAddressOfPlane(
                    buffer: CVPixelBufferRef,
                    plane: usize,
                ) -> *mut c_void;
                fn CVPixelBufferGetBytesPerRowOfPlane(
                    buffer: CVPixelBufferRef,
                    plane: usize,
                ) -> usize;
            }

            #[link(name = "IOSurface", kind = "framework")]
            extern "C" {
                fn IOSurfaceGetID(surface: IOSurfaceRef) -> u32;
            }

            /// テスト用の IOSurface-backed NV12 `CVPixelBuffer`。Drop で解放する。
            pub(super) struct SyntheticNv12Buffer {
                pixel_buffer: CVPixelBufferRef,
                pub(super) surface_id: u32,
                pub(super) width: u32,
                pub(super) height: u32,
            }

            // CVPixelBufferRef は生ポインタだが、テストではシングルスレッド
            // かつ Drop まで所有権を保持するだけなので Send を明示する。
            unsafe impl Send for SyntheticNv12Buffer {}

            impl Drop for SyntheticNv12Buffer {
                fn drop(&mut self) {
                    unsafe { CVPixelBufferRelease(self.pixel_buffer) };
                }
            }

            impl SyntheticNv12Buffer {
                /// `width`/`height` は偶数であること（4:2:0 の要件）。
                /// `y_at`/`cbcr_at` は plane 内の (row, col) → 値。
                pub(super) fn new(
                    width: u32,
                    height: u32,
                    pixel_format_type: OSType,
                    y_at: impl Fn(u32, u32) -> u8,
                    cbcr_at: impl Fn(u32, u32) -> (u8, u8),
                ) -> Self {
                    assert_eq!(width % 2, 0, "NV12 width must be even");
                    assert_eq!(height % 2, 0, "NV12 height must be even");

                    let empty_props: CFDictionary<CFString, CFType> =
                        CFDictionary::from_CFType_pairs(&[]);
                    let key = unsafe {
                        CFString::wrap_under_get_rule(kCVPixelBufferIOSurfacePropertiesKey)
                    };
                    let attributes: CFDictionary<CFString, CFType> =
                        CFDictionary::from_CFType_pairs(&[(key, empty_props.as_CFType())]);

                    let mut pixel_buffer: CVPixelBufferRef = std::ptr::null_mut();
                    let status = unsafe {
                        CVPixelBufferCreate(
                            std::ptr::null(),
                            width as usize,
                            height as usize,
                            pixel_format_type,
                            attributes.as_concrete_TypeRef() as CFTypeRef,
                            &mut pixel_buffer,
                        )
                    };
                    assert_eq!(
                        status, 0,
                        "CVPixelBufferCreate must succeed for the NV12 test fixture"
                    );
                    assert!(!pixel_buffer.is_null());

                    let lock_status = unsafe { CVPixelBufferLockBaseAddress(pixel_buffer, 0) };
                    assert_eq!(lock_status, 0);

                    unsafe {
                        let y_base = CVPixelBufferGetBaseAddressOfPlane(pixel_buffer, 0) as *mut u8;
                        let y_stride = CVPixelBufferGetBytesPerRowOfPlane(pixel_buffer, 0);
                        for row in 0..height {
                            for col in 0..width {
                                let offset = row as usize * y_stride + col as usize;
                                *y_base.add(offset) = y_at(row, col);
                            }
                        }

                        let cbcr_base =
                            CVPixelBufferGetBaseAddressOfPlane(pixel_buffer, 1) as *mut u8;
                        let cbcr_stride = CVPixelBufferGetBytesPerRowOfPlane(pixel_buffer, 1);
                        let chroma_width = width / 2;
                        let chroma_height = height / 2;
                        for row in 0..chroma_height {
                            for col in 0..chroma_width {
                                let (cb, cr) = cbcr_at(row, col);
                                let offset = row as usize * cbcr_stride + col as usize * 2;
                                *cbcr_base.add(offset) = cb;
                                *cbcr_base.add(offset + 1) = cr;
                            }
                        }
                    }

                    unsafe { CVPixelBufferUnlockBaseAddress(pixel_buffer, 0) };

                    let surface_ref = unsafe { CVPixelBufferGetIOSurface(pixel_buffer) };
                    assert!(
                        !surface_ref.is_null(),
                        "CVPixelBufferCreate must produce an IOSurface-backed buffer \
                         (kCVPixelBufferIOSurfacePropertiesKey)"
                    );
                    let surface_id = unsafe { IOSurfaceGetID(surface_ref) };

                    Self {
                        pixel_buffer,
                        surface_id,
                        width,
                        height,
                    }
                }
            }
        }
    }
}
