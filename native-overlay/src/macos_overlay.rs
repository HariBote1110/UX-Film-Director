use objc::runtime::Object;

pub fn attach_overlay_view(native_window_handle: &[u8]) -> Result<(), &'static str> {
    let parent_view = native_window_handle_to_parent_view(native_window_handle)?;
    let _ = parent_view;
    let _ = "CAMetalLayer";
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
