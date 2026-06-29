#![allow(unexpected_cfgs)]

use core_graphics_types::geometry::{CGPoint, CGRect, CGSize};
use metal::{
    Device, MetalLayerRef, MTLClearColor, MTLLoadAction, MTLPixelFormat, MTLStoreAction,
    RenderPassDescriptor,
};
use objc::runtime::{Class, Object, BOOL, NO, YES};
use objc::{class, msg_send, sel, sel_impl};

use crate::OverlayLayerContract;

const NATIVE_OVERLAY_VIEW_IDENTIFIER: &str = "UXFDNativeOverlayView";

pub fn attach_overlay_view(
    native_window_handle: &[u8],
    contract: &OverlayLayerContract,
) -> Result<(), &'static str> {
    let parent_view = native_window_handle_to_parent_view(native_window_handle)?;
    attach_overlay_view_to_parent(parent_view, contract)?;
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

fn attach_overlay_view_to_parent(
    parent_view: *mut Object,
    contract: &OverlayLayerContract,
) -> Result<(), &'static str> {
    if parent_view.is_null() {
        return Err("Native overlay parent NSView pointer is null.");
    }

    unsafe {
        let is_main_thread: BOOL = msg_send![class!(NSThread), isMainThread];
        if is_main_thread == NO {
            return Err("Native overlay AppKit attach must run on the main thread.");
        }

        remove_existing_overlay_view(parent_view)?;

        let ns_view_class = appkit_class("NSView")?;
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

        let layer_class = appkit_class("CAMetalLayer")?;
        let layer: *mut Object = msg_send![layer_class, new];
        if layer.is_null() {
            return Err("Native overlay CAMetalLayer allocation failed.");
        }

        let drawable_size = CGSize::new(
            f64::from(contract.drawable_width),
            f64::from(contract.drawable_height),
        );
        let () = msg_send![layer, setPixelFormat: MTLPixelFormat::BGRA8Unorm as u64];
        let () = msg_send![layer, setDrawableSize: drawable_size];
        let () = msg_send![layer, setFrame: CGRect::new(&CGPoint::new(0.0, 0.0), &overlay_frame.size)];
        let () = msg_send![overlay_view, setWantsLayer: YES];
        let () = msg_send![overlay_view, setLayer: layer];
        let () = msg_send![parent_view, addSubview: overlay_view];
        let layer_ref: &MetalLayerRef = std::mem::transmute(layer);
        present_fixed_colour(layer_ref)?;
    }

    Ok(())
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

fn present_fixed_colour(layer: &MetalLayerRef) -> Result<(), &'static str> {
    let Some(device) = Device::system_default() else {
        return Err("Native overlay Metal device is unavailable.");
    };
    layer.set_device(&device);
    layer.set_pixel_format(MTLPixelFormat::BGRA8Unorm);
    let Some(drawable) = layer.next_drawable() else {
        return Err("Native overlay CAMetalLayer drawable is unavailable.");
    };

    let render_pass_descriptor = RenderPassDescriptor::new();
    let colour_attachment = render_pass_descriptor
        .color_attachments()
        .object_at(0)
        .ok_or("Native overlay colour attachment is unavailable.")?;
    colour_attachment.set_texture(Some(drawable.texture()));
    colour_attachment.set_load_action(MTLLoadAction::Clear);
    colour_attachment.set_clear_color(MTLClearColor::new(0.1, 0.55, 0.95, 1.0));
    colour_attachment.set_store_action(MTLStoreAction::Store);

    let command_queue = device.new_command_queue();
    let command_buffer = command_queue.new_command_buffer();
    let encoder = command_buffer.new_render_command_encoder(render_pass_descriptor);
    encoder.end_encoding();
    command_buffer.present_drawable(drawable);
    command_buffer.commit();

    Ok(())
}
