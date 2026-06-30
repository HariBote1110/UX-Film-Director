#![allow(unexpected_cfgs)]

use core_graphics_types::geometry::{CGPoint, CGRect, CGSize};
use objc::declare::ClassDecl;
use objc::runtime::{Class, Object, Sel, BOOL, NO, YES};
use objc::{class, msg_send, sel, sel_impl, Encode, Encoding};

use crate::OverlayLayerContract;

const NATIVE_OVERLAY_VIEW_IDENTIFIER: &str = "UXFDNativeOverlayView";
const NATIVE_OVERLAY_PASSTHROUGH_VIEW_CLASS: &str = "UXFDNativeOverlayPassthroughView";

#[repr(C)]
struct ObjcPoint {
    x: f64,
    y: f64,
}

unsafe impl Encode for ObjcPoint {
    fn encode() -> Encoding {
        unsafe { Encoding::from_str("{CGPoint=dd}") }
    }
}

pub fn attach_overlay_view(
    native_window_handle: &[u8],
    contract: &OverlayLayerContract,
) -> Result<usize, &'static str> {
    let parent_view = native_window_handle_to_parent_view(native_window_handle)?;
    attach_overlay_view_to_parent(parent_view, contract)
}

pub fn detach_overlay_view(native_window_handle: &[u8]) -> Result<(), &'static str> {
    let parent_view = native_window_handle_to_parent_view(native_window_handle)?;
    if parent_view.is_null() {
        return Err("Native overlay parent NSView pointer is null.");
    }

    unsafe {
        let is_main_thread: BOOL = msg_send![class!(NSThread), isMainThread];
        if is_main_thread == NO {
            return Err("Native overlay AppKit detach must run on the main thread.");
        }

        remove_existing_overlay_view(parent_view)?;
    }

    Ok(())
}

fn native_window_handle_to_parent_view(
    native_window_handle: &[u8],
) -> Result<*mut Object, &'static str> {
    if native_window_handle.len() != std::mem::size_of::<usize>() {
        return Err("Native overlay window handle has an unexpected byte length.");
    }

    let mut pointer_bytes = [0_u8; std::mem::size_of::<usize>()];
    pointer_bytes.copy_from_slice(native_window_handle);
    let pointer = usize::from_ne_bytes(pointer_bytes) as *mut Object;
    if pointer.is_null() {
        return Err("Native overlay parent NSView pointer is null.");
    }

    Ok(pointer)
}

unsafe fn appkit_class(name: &str) -> Result<&'static Class, &'static str> {
    Class::get(name).ok_or("Native overlay AppKit class is unavailable.")
}

extern "C" fn hit_test_passthrough(_this: &Object, _cmd: Sel, _point: ObjcPoint) -> *mut Object {
    std::ptr::null_mut()
}

unsafe fn overlay_passthrough_view_class() -> Result<&'static Class, &'static str> {
    if let Some(existing_class) = Class::get(NATIVE_OVERLAY_PASSTHROUGH_VIEW_CLASS) {
        return Ok(existing_class);
    }

    let superclass = appkit_class("NSView")?;
    let mut declaration = ClassDecl::new(NATIVE_OVERLAY_PASSTHROUGH_VIEW_CLASS, superclass)
        .ok_or("Native overlay passthrough NSView class registration failed.")?;
    declaration.add_method(
        sel!(hitTest:),
        hit_test_passthrough as extern "C" fn(&Object, Sel, ObjcPoint) -> *mut Object,
    );
    Ok(declaration.register())
}

fn attach_overlay_view_to_parent(
    parent_view: *mut Object,
    contract: &OverlayLayerContract,
) -> Result<usize, &'static str> {
    if parent_view.is_null() {
        return Err("Native overlay parent NSView pointer is null.");
    }

    unsafe {
        let is_main_thread: BOOL = msg_send![class!(NSThread), isMainThread];
        if is_main_thread == NO {
            return Err("Native overlay AppKit attach must run on the main thread.");
        }

        remove_existing_overlay_view(parent_view)?;

        let ns_view_class = overlay_passthrough_view_class()?;
        let overlay_view: *mut Object = msg_send![ns_view_class, alloc];
        if overlay_view.is_null() {
            return Err("Native overlay NSView allocation failed.");
        }

        let overlay_frame = CGRect::new(
            &CGPoint::new(contract.view_x, contract.view_y),
            &CGSize::new(contract.view_width, contract.view_height),
        );
        let overlay_view: *mut Object = msg_send![overlay_view, initWithFrame: overlay_frame];
        if overlay_view.is_null() {
            return Err("Native overlay NSView initialisation failed.");
        }
        let identifier = ns_string(NATIVE_OVERLAY_VIEW_IDENTIFIER)?;
        let () = msg_send![overlay_view, setIdentifier: identifier];
        let () = msg_send![overlay_view, setWantsLayer: YES];
        // CAMetalLayer は `contentsScale` を明示しないと既定値 1.0 のままで、HiDPI 環境では
        // drawable のうち `bounds × 1.0` ピクセル分（=左下 1/4）しか画面に貼り出されない。
        // `wgpu` の surface 構築前にも layer を一度初期化しておき、`contentsScale` を contract で正本化する。
        apply_overlay_layer_contents_scale(overlay_view, contract.contents_scale);

        let () = msg_send![parent_view, addSubview: overlay_view];
        Ok(overlay_view_handle(overlay_view))
    }
}

/// overlay NSView の現在 layer に対して `setContentsScale:` を反映する。
/// `wgpu` の `create_surface_unsafe` は内部で layer を CAMetalLayer に差し替えるため、
/// surface 構築後にも本関数を再度呼び出して `contentsScale` を上書きする必要がある。
pub fn set_overlay_view_contents_scale(view_handle: usize, contents_scale: f64) {
    if view_handle == 0 || !contents_scale.is_finite() || contents_scale <= 0.0 {
        return;
    }
    let view = view_handle as *mut Object;
    if view.is_null() {
        return;
    }
    unsafe {
        let is_main_thread: BOOL = msg_send![class!(NSThread), isMainThread];
        if is_main_thread == NO {
            return;
        }
        apply_overlay_layer_contents_scale(view, contents_scale);
    }
}

unsafe fn apply_overlay_layer_contents_scale(view: *mut Object, contents_scale: f64) {
    if view.is_null() {
        return;
    }
    let layer: *mut Object = msg_send![view, layer];
    if layer.is_null() {
        return;
    }
    let () = msg_send![layer, setContentsScale: contents_scale];
}

pub fn overlay_view_handle(view: *mut Object) -> usize {
    view as usize
}

unsafe fn ns_string(value: &str) -> Result<*mut Object, &'static str> {
    let ns_string_class = appkit_class("NSString")?;
    let string: *mut Object = msg_send![ns_string_class, alloc];
    if string.is_null() {
        return Err("Native overlay NSString allocation failed.");
    }
    let string: *mut Object = msg_send![
        string,
        initWithBytes: value.as_ptr()
        length: value.len()
        encoding: 4usize
    ];
    if string.is_null() {
        return Err("Native overlay NSString initialisation failed.");
    }
    Ok(string)
}

unsafe fn remove_existing_overlay_view(parent_view: *mut Object) -> Result<(), &'static str> {
    let subviews: *mut Object = msg_send![parent_view, subviews];
    if subviews.is_null() {
        return Ok(());
    }

    let count: usize = msg_send![subviews, count];
    let expected_identifier = ns_string(NATIVE_OVERLAY_VIEW_IDENTIFIER)?;
    for index in (0..count).rev() {
        let subview: *mut Object = msg_send![subviews, objectAtIndex: index];
        if subview.is_null() {
            continue;
        }
        let identifier: *mut Object = msg_send![subview, identifier];
        if identifier.is_null() {
            continue;
        }
        let matches: BOOL = msg_send![identifier, isEqualToString: expected_identifier];
        if matches == YES {
            let () = msg_send![subview, removeFromSuperview];
        }
    }

    Ok(())
}
