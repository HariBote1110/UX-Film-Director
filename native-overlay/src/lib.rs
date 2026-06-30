#![allow(unexpected_cfgs)]

use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use std::panic::{catch_unwind, AssertUnwindSafe};

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
pub struct NativeOverlayResponse {
    pub success: bool,
    pub attached: bool,
    pub reason: Option<String>,
}

#[napi(object)]
pub struct NativeOverlayCapabilities {
    pub available: bool,
    pub reason: Option<String>,
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
    }
}

fn failure(reason: &str) -> NativeOverlayResponse {
    NativeOverlayResponse {
        success: false,
        attached: false,
        reason: Some(reason.to_string()),
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

        assert_eq!(error, "Native overlay size and scale factor must be positive.");
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

    fn unique_shm_name() -> String {
        let micros = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_micros()
            % 1_000_000;
        format!("/uxfd-overlay{}-{micros}", std::process::id())
    }
}
