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
        (Some(snapshot), Some(media)) => Some(NativeOverlaySceneSource {
            snapshot: scene_snapshot_from_payload(snapshot)?,
            media: media.into_iter().map(scene_media_from_payload).collect(),
        }),
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
        return Ok((scene.snapshot.clone(), sources));
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

pub fn load_overlay_image_sources_for_scene(
    scene: &NativeOverlaySceneSource,
) -> Result<HashMap<String, RgbaFrame>, String> {
    let mut sources = HashMap::new();
    for media in &scene.media {
        if media.kind != "Image" {
            continue;
        }
        let frame = load_rgba_png(&media.source)
            .map_err(|error| format!("Native overlay image source load failed: {error:?}"))?;
        validate_overlay_image_source_size(media, &frame)?;
        sources.insert(media.id.clone(), frame);
    }
    Ok(sources)
}

fn validate_overlay_image_source_size(
    media: &NativeOverlaySceneMedia,
    frame: &RgbaFrame,
) -> Result<(), String> {
    if frame.width == media.width && frame.height == media.height {
        return Ok(());
    }
    Err(format!(
        "Native overlay image source size mismatch for {}, expected {}x{}, got {}x{}.",
        media.id, media.width, media.height, frame.width, frame.height
    ))
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
    fn overlay_image_source_loader_rejects_declared_size_mismatch() {
        let image_path = unique_temp_path("overlay-image-mismatch", "png");
        let image = RgbaFrame::from_rgba8(2, 1, vec![255, 0, 0, 255, 0, 0, 255, 255])
            .expect("valid image frame");
        uxfd_golden_harness::save_rgba_png(&image_path, &image).expect("save image fixture");

        let error = load_overlay_image_sources_for_scene(&NativeOverlaySceneSource {
            snapshot: SceneSnapshot {
                frame_index: 0,
                colour: ColourPipeline::rec709_sdr_linear(),
                clips: Vec::new(),
            },
            media: vec![NativeOverlaySceneMedia {
                id: "image-1".to_string(),
                kind: "Image".to_string(),
                source: image_path.to_string_lossy().to_string(),
                width: 1,
                height: 1,
            }],
        })
        .expect_err("declared image size mismatch must be rejected");

        assert!(error.contains("Native overlay image source size mismatch"));
        let _ = std::fs::remove_file(image_path);
    }

    #[test]
    fn macos_overlay_view_is_click_through() {
        let source = include_str!("macos_overlay.rs");

        assert!(source.contains("UXFDNativeOverlayPassthroughView"));
        assert!(source.contains("hit_test_passthrough"));
        assert!(source.contains("sel!(hitTest:)"));
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
