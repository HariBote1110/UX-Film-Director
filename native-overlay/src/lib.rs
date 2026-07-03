#![allow(unexpected_cfgs)]

use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use std::collections::HashMap;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use uxfd_golden_harness::{compare_rgba_frames, load_rgba_png, ComparisonThresholds, RgbaFrame};
use uxfd_native_wgpu_renderer::{render_native_wgpu_frame, NativeWgpuLiveSurfaceRenderer};
use uxfd_rust_core::{ColourPipeline, EvaluatedClip, SamplingMode, SceneSnapshot, Transform};
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

#[napi(object)]
pub struct NativeOverlaySharedFramePresentPayload {
    pub window_id: u32,
    pub native_window_handle: Option<Buffer>,
    pub media_id: String,
    pub snapshot: Option<NativeOverlaySceneSnapshotPayload>,
    pub media: Option<Vec<NativeOverlaySceneMediaPayload>>,
    pub slot_count: u32,
    pub frame: NativeOverlaySharedFramePayload,
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
pub struct NativeOverlaySceneMediaPayload {
    pub id: String,
    pub kind: String,
    pub source: String,
    pub width: u32,
    pub height: u32,
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

pub struct NativeOverlayLiveSurfaceRenderer {
    window_id: u32,
    drawable_width: u32,
    drawable_height: u32,
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
            view_handle,
            renderer,
        })
    }

    fn present_upload_frame(
        &mut self,
        upload: &OverlayUploadFrame,
        scene: Option<&NativeOverlaySceneSource>,
    ) -> Result<Option<OverlayLiveSurfaceDiagnostics>, String> {
        let _window_id = self.window_id;
        #[cfg(target_os = "macos")]
        let _view_handle = self.view_handle;
        let (snapshot, sources) = upload_frame_to_scene_sources(
            upload,
            scene,
            self.drawable_width,
            self.drawable_height,
        )?;
        if live_surface_readback_trace_enabled() {
            let report = pollster::block_on(
                self.renderer
                    .present_scene_to_surface_texture_with_readback(&snapshot, &sources),
            )
            .map_err(|error| format!("Native overlay live surface present failed: {error:?}"))?;
            let live_readback_export_max_channel_delta =
                compare_live_overlay_readback_with_export(&report.frame, &snapshot, &sources)?;
            return Ok(Some(live_surface_diagnostics_from_frame_report(
                report,
                Some(live_readback_export_max_channel_delta),
            )));
        }

        let report = pollster::block_on(
            self.renderer
                .present_scene_to_surface_texture(&snapshot, &sources),
        )
        .map_err(|error| format!("Native overlay live surface present failed: {error:?}"))?;
        Ok(Some(OverlayLiveSurfaceDiagnostics {
            live_prepared_clip_count: report.prepared_clip_count,
            live_readback_non_transparent_pixels: 0,
            live_readback_checksum: 0,
            live_readback_export_max_channel_delta: None,
        }))
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
    let mut renderers = LIVE_OVERLAY_RENDERERS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| "Native overlay live renderer registry is poisoned.".to_string())?;
    let renderer = renderers
        .get_mut(&window_id)
        .ok_or_else(|| "Native overlay live surface is not attached.".to_string())?;
    let (snapshot, sources) = build_empty_scene_snapshot_for_transparent_clear();
    pollster::block_on(
        renderer
            .renderer
            .present_scene_to_surface_texture(&snapshot, &sources),
    )
    .map_err(|error| format!("Native overlay live surface transparent clear failed: {error:?}"))?;
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
    let mut renderers = LIVE_OVERLAY_RENDERERS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| "Native overlay live renderer registry is poisoned.".to_string())?;
    let renderer = renderers
        .get_mut(&window_id)
        .ok_or_else(|| "Native overlay live surface is not attached.".to_string())?;
    let live_diagnostics = renderer.present_upload_frame(&upload, request.scene.as_ref())?;

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
    let fit_scale = if scene.canvas_width == 0 || scene.canvas_height == 0 {
        1.0
    } else {
        (drawable_width as f32 / scene.canvas_width as f32)
            .min(drawable_height as f32 / scene.canvas_height as f32)
    };
    let offset_x = (drawable_width as f32 - scene.canvas_width as f32 * fit_scale) * 0.5;
    let offset_y = (drawable_height as f32 - scene.canvas_height as f32 * fit_scale) * 0.5;
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

fn live_surface_readback_trace_enabled() -> bool {
    std::env::var("UXFD_NATIVE_OVERLAY_READBACK_TRACE")
        .ok()
        .as_deref()
        == Some("1")
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
    let frame = RgbaFrame::from_rgba8(upload.width, upload.height, upload.pixels.clone())
        .map_err(|error| format!("Native overlay upload frame is invalid: {error:?}"))?;
    let mut sources = scene
        .map(load_overlay_image_sources_for_scene)
        .transpose()?
        .unwrap_or_default();
    sources.insert(upload.media_id.clone(), frame);
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
/// 等方スケールなので回転角・アスペクト比には影響しない。
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

    let fit_scale = (drawable_width as f32 / canvas_width as f32)
        .min(drawable_height as f32 / canvas_height as f32);
    let fitted_width = canvas_width as f32 * fit_scale;
    let fitted_height = canvas_height as f32 * fit_scale;
    let offset_x = (drawable_width as f32 - fitted_width) * 0.5;
    let offset_y = (drawable_height as f32 - fitted_height) * 0.5;

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
        effects: Vec::new(),
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

    static SHM_NAME_COUNTER: AtomicU64 = AtomicU64::new(0);

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
