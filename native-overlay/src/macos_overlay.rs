#![allow(unexpected_cfgs)]

use core_graphics_types::geometry::{CGPoint, CGRect, CGSize};
use metal::MTLPixelFormat;
use objc::runtime::{Class, Object, BOOL, NO, YES};
use objc::{class, msg_send, sel, sel_impl};

pub fn attach_overlay_view(native_window_handle: &[u8]) -> Result<(), &'static str> {
    let parent_view = native_window_handle_to_parent_view(native_window_handle)?;
    attach_overlay_view_to_parent(parent_view)?;
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

fn attach_overlay_view_to_parent(parent_view: *mut Object) -> Result<(), &'static str> {
    if parent_view.is_null() {
        return Err("Native overlay parent NSView pointer is null.");
    }

    unsafe {
        let is_main_thread: BOOL = msg_send![class!(NSThread), isMainThread];
        if is_main_thread == NO {
            return Err("Native overlay AppKit attach must run on the main thread.");
        }

        let ns_view_class = appkit_class("NSView")?;
        let overlay_view: *mut Object = msg_send![ns_view_class, alloc];
        if overlay_view.is_null() {
            return Err("Native overlay NSView allocation failed.");
        }

        let parent_bounds: CGRect = msg_send![parent_view, bounds];
        let overlay_view: *mut Object = msg_send![overlay_view, initWithFrame: parent_bounds];
        if overlay_view.is_null() {
            return Err("Native overlay NSView initialisation failed.");
        }

        let layer_class = appkit_class("CAMetalLayer")?;
        let layer: *mut Object = msg_send![layer_class, new];
        if layer.is_null() {
            return Err("Native overlay CAMetalLayer allocation failed.");
        }

        let drawable_size = CGSize::new(parent_bounds.size.width, parent_bounds.size.height);
        let () = msg_send![layer, setPixelFormat: MTLPixelFormat::BGRA8Unorm as u64];
        let () = msg_send![layer, setDrawableSize: drawable_size];
        let () = msg_send![layer, setFrame: CGRect::new(&CGPoint::new(0.0, 0.0), &parent_bounds.size)];
        let () = msg_send![overlay_view, setWantsLayer: YES];
        let () = msg_send![overlay_view, setLayer: layer];
        let () = msg_send![parent_view, addSubview: overlay_view];
    }

    Ok(())
}
