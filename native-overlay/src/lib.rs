#![allow(unexpected_cfgs)]

use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::time::Duration;
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
    pub slot_count: u32,
    pub frame: NativeOverlaySharedFramePayload,
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlaySharedFramePresentRequest {
    pub source: OverlaySharedFrameSource,
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
    let _ = payload.window_id;
    let native_window_handle = match native_window_handle_bytes(&payload) {
        Ok(bytes) => bytes,
        Err(reason) => return failure(reason),
    };
    let contract = match build_overlay_layer_contract(&payload) {
        Ok(contract) => contract,
        Err(reason) => return failure(reason),
    };
    #[cfg(target_os = "macos")]
    if let Err(reason) = macos_overlay::attach_overlay_view(&native_window_handle, &contract) {
        return failure(reason);
    }

    NativeOverlayResponse {
        success: true,
        attached: true,
        reason: None,
        release_frame: None,
    }
}

fn detach_native_overlay_inner(payload: NativeOverlayDetachPayload) -> NativeOverlayResponse {
    let _ = payload.window_id;
    let native_window_handle = match detach_native_window_handle_bytes(&payload) {
        Ok(bytes) => bytes,
        Err(reason) => return failure(reason),
    };
    #[cfg(target_os = "macos")]
    if let Err(reason) = macos_overlay::detach_overlay_view(&native_window_handle) {
        return failure(reason);
    }

    NativeOverlayResponse {
        success: true,
        attached: false,
        reason: None,
        release_frame: None,
    }
}

fn failure(reason: &str) -> NativeOverlayResponse {
    NativeOverlayResponse {
        success: false,
        attached: false,
        reason: Some(reason.to_string()),
        release_frame: None,
    }
}

fn present_native_overlay_shared_frame_inner(
    payload: NativeOverlaySharedFramePresentPayload,
) -> NativeOverlayResponse {
    let _ = payload.window_id;
    if let Err(reason) = present_native_window_handle_bytes(&payload) {
        return failure(reason);
    }
    let request = match overlay_present_request_from_payload(payload) {
        Ok(request) => request,
        Err(reason) => return failure(&reason),
    };
    match present_overlay_shared_frame_for_test(request) {
        Ok(response) => NativeOverlayResponse {
            success: response.success,
            attached: response.attached,
            reason: None,
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

fn overlay_present_request_from_payload(
    payload: NativeOverlaySharedFramePresentPayload,
) -> Result<OverlaySharedFramePresentRequest, String> {
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
    if descriptor.byte_offset != 0 {
        return Err("Native overlay shared frame byteOffset must be zero.".to_string());
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
        release_frame: Some(OverlayReleaseFramePayload {
            memory_id: descriptor.memory_id.clone(),
            slot_index: descriptor.slot_index,
            generation: upload.generation,
            pts_frame: upload.pts_frame,
            copy_out_state: "gpuUploadFenceSignalled".to_string(),
        }),
    })
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

    fn unique_shm_name() -> String {
        let micros = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_micros()
            % 1_000_000;
        format!("/uxfd-overlay{}-{micros}", std::process::id())
    }
}
