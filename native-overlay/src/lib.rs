use napi_derive::napi;
use std::panic::{catch_unwind, AssertUnwindSafe};

#[napi(object)]
pub struct NativeOverlayAttachPayload {
    pub window_id: u32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale_factor: f64,
}

#[napi(object)]
pub struct NativeOverlayDetachPayload {
    pub window_id: u32,
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
    let _ = (
        payload.window_id,
        payload.x,
        payload.y,
        payload.width,
        payload.height,
        payload.scale_factor,
    );

    NativeOverlayResponse {
        success: true,
        attached: true,
        reason: None,
    }
}

fn detach_native_overlay_inner(payload: NativeOverlayDetachPayload) -> NativeOverlayResponse {
    let _ = payload.window_id;

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
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 360.0,
            scale_factor: 2.0,
        })
        .expect_err("zero width must be rejected");

        assert_eq!(error, "Native overlay size and scale factor must be positive.");
    }
}
