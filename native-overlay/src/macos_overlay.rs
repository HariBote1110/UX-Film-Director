#![allow(unexpected_cfgs)]

use core_graphics_types::geometry::{CGPoint, CGRect, CGSize};
use objc::declare::ClassDecl;
use objc::runtime::{Class, Object, Sel, BOOL, NO, YES};
use objc::{class, msg_send, sel, sel_impl, Encode, Encoding};

use crate::OverlayLayerContract;

const NATIVE_OVERLAY_VIEW_IDENTIFIER: &str = "UXFDNativeOverlayView";
const NATIVE_OVERLAY_PASSTHROUGH_VIEW_CLASS: &str = "UXFDNativeOverlayPassthroughView";
/// Bug E（ADR-013）— overlay の child NSWindow を識別するための `identifier`。
/// `NSWindow` にも `NSView` と同様 `identifier` プロパティがあり、detach 時に
/// parent の `childWindows` を走査して対象を一意に見分けるために使う。
const NATIVE_OVERLAY_CHILD_WINDOW_IDENTIFIER: &str = "UXFDNativeOverlayChildWindow";

/// `NSWindowStyleMaskBorderless`（AppKit 定数、値 0）。
const NS_WINDOW_STYLE_MASK_BORDERLESS: usize = 0;
/// `NSBackingStoreBuffered`（AppKit 定数、値 2）。
const NS_BACKING_STORE_BUFFERED: usize = 2;
/// `NSWindowAbove`（`NSWindowOrderingMode`、値 1）。steady state での既定 order。
const NS_WINDOW_ABOVE: isize = 1;

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

        // Bug E（ADR-013）— child NSWindow 化に伴い、attach で確立した
        // addChildWindow: の親子関係を対称的に removeChildWindow: で解除する。
        // removeFromSuperview だけでは parent NSWindow の childWindows に
        // 残ったままになり、次回 attach まで解放されない。
        remove_existing_overlay_child_window(parent_view)?;
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

        // Bug E（ADR-013）— 既存の detach 経路（parent の subviews / childWindows 走査）を
        // 呼んでおき、re-attach（サイズ変更・DPI 変更などで attach が再実行されるケース）で
        // 前回の overlay NSView / child NSWindow が残らないようにする。
        remove_existing_overlay_view(parent_view)?;
        remove_existing_overlay_child_window(parent_view)?;

        let ns_view_class = overlay_passthrough_view_class()?;
        let overlay_view: *mut Object = msg_send![ns_view_class, alloc];
        if overlay_view.is_null() {
            return Err("Native overlay NSView allocation failed.");
        }

        // child NSWindow のコンテンツ座標系は window ローカル（原点 0,0）にする。
        // スクリーン上の実際の位置・サイズは window 自体の frame で表現するため、
        // ここでの view frame は `(0, 0, view_width, view_height)` で固定でよい。
        let local_frame = CGRect::new(
            &CGPoint::new(0.0, 0.0),
            &CGSize::new(contract.view_width, contract.view_height),
        );
        let overlay_view: *mut Object = msg_send![overlay_view, initWithFrame: local_frame];
        if overlay_view.is_null() {
            return Err("Native overlay NSView initialisation failed.");
        }
        let identifier = ns_string(NATIVE_OVERLAY_VIEW_IDENTIFIER)?;
        let () = msg_send![overlay_view, setIdentifier: identifier];
        let () = msg_send![overlay_view, setWantsLayer: YES];
        // Metal layer は `contentsScale` を明示しないと既定値 1.0 のままで、HiDPI 環境では
        // drawable のうち `bounds × 1.0` ピクセル分（=左下 1/4）しか画面に貼り出されない。
        // `wgpu` の surface 構築前にも layer を一度初期化しておき、`contentsScale` を contract で正本化する。
        apply_overlay_layer_contents_scale(overlay_view, contract.contents_scale);
        // Bug D — Metal layer は既定 `opaque = YES` で、これでは
        // `clear_native_overlay_live_surface` が drawable を全 pixel alpha=0
        // に塗り替えても compositor が overlay 層を不透明扱いし、下層
        // WebView / WebGPU presenter は常時不可視になる。opaque=NO を明示して
        // transparent clear が下層まで抜けるようにする。
        apply_overlay_layer_opaque(overlay_view, false);

        let child_window = create_overlay_child_window(parent_view, contract)?;
        let () = msg_send![child_window, setContentView: overlay_view];

        let parent_window: *mut Object = msg_send![parent_view, window];
        if parent_window.is_null() {
            return Err("Native overlay parent NSWindow is unavailable.");
        }
        // Bug E（ADR-013）— overlay を main BrowserWindow の contentView subview では
        // なく、独立した child NSWindow として parent に addChildWindow する。
        // macOS の z-order は「同一 NSWindow 内の view 階層」と「複数 NSWindow 間の
        // window order」が独立軸のため、subview のままでは HTML 駆動 UI
        // （context menu / popover / tooltip / modal / dropdown）を一律 overlay より
        // 上に置くことが構造的に不可能だった。child window 化により OS 任せの
        // z-order 切替（Phase E2 の order 下げ/上げ）が可能になる。
        // 既定 order は `NSWindowAbove`（steady state。overlay は最前面）。
        let () = msg_send![parent_window, addChildWindow: child_window ordered: NS_WINDOW_ABOVE];

        Ok(overlay_view_handle(overlay_view))
    }
}

/// overlay 用の borderless / transparent な child NSWindow を new し、geometry を
/// `contract` の view rect（parent NSView のローカル座標、AppKit の bottom-left
/// origin）からスクリーン座標へ変換して設定する。
///
/// 座標変換式: `parent_view` の bounds 上の矩形 `(view_x, view_y, view_width,
/// view_height)` を `convertRect:toView:nil` で parent window 座標に変換し、
/// window の `convertRectToScreen:` でスクリーン座標（グローバル、bottom-left
/// origin）に変換する。child NSWindow の `frame` はこのスクリーン座標矩形と
/// 一致させる。
unsafe fn create_overlay_child_window(
    parent_view: *mut Object,
    contract: &OverlayLayerContract,
) -> Result<*mut Object, &'static str> {
    let parent_window: *mut Object = msg_send![parent_view, window];
    if parent_window.is_null() {
        return Err("Native overlay parent NSWindow is unavailable.");
    }

    let view_local_rect = CGRect::new(
        &CGPoint::new(contract.view_x, contract.view_y),
        &CGSize::new(contract.view_width, contract.view_height),
    );
    // parent NSView のローカル座標 → parent NSWindow 座標（bottom-left origin）。
    let window_rect: CGRect = msg_send![parent_view, convertRect: view_local_rect toView: std::ptr::null_mut::<Object>()];
    // parent NSWindow 座標 → スクリーン座標（グローバル、bottom-left origin）。
    let screen_rect: CGRect = msg_send![parent_window, convertRectToScreen: window_rect];

    let window_class = appkit_class("NSWindow")?;
    let child_window: *mut Object = msg_send![window_class, alloc];
    if child_window.is_null() {
        return Err("Native overlay child NSWindow allocation failed.");
    }
    let child_window: *mut Object = msg_send![
        child_window,
        initWithContentRect: screen_rect
        styleMask: NS_WINDOW_STYLE_MASK_BORDERLESS
        backing: NS_BACKING_STORE_BUFFERED
        defer: NO
    ];
    if child_window.is_null() {
        return Err("Native overlay child NSWindow initialisation failed.");
    }

    let identifier = ns_string(NATIVE_OVERLAY_CHILD_WINDOW_IDENTIFIER)?;
    let () = msg_send![child_window, setIdentifier: identifier];
    // 動画再生中の preview は不透明部分と透明部分が混在するため、window 自体を
    // 非不透明・背景透明にしないと overlay に覆われていない領域が黒く塗られる。
    let () = msg_send![child_window, setOpaque: NO];
    let clear_colour: *mut Object = msg_send![class!(NSColor), clearColor];
    let () = msg_send![child_window, setBackgroundColor: clear_colour];
    let () = msg_send![child_window, setHasShadow: NO];
    // preview の操作（クリック/ドラッグ/スクラブ）は下層 WebView 側 React UI が
    // 一貫して処理する設計。既存 NSView の hitTest: nil 返しに加え、window
    // レベルでもマウスイベントを無視させ、child window 自身がイベントを奪う
    // 経路を完全に断つ。
    let () = msg_send![child_window, setIgnoresMouseEvents: YES];
    // Mission Control / Spaces 切替時に parent window に追従させる。
    let parent_collection_behavior: usize = msg_send![parent_window, collectionBehavior];
    let () = msg_send![child_window, setCollectionBehavior: parent_collection_behavior];

    Ok(child_window)
}

/// overlay NSView の現在 layer に対して `setContentsScale:` を反映する。
/// `wgpu` の `create_surface_unsafe` は内部で layer を Metal layer に差し替えるため、
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

/// overlay NSView の現在 layer に対して `setOpaque:` を反映する。
/// `wgpu` の `create_surface_unsafe` は `contentsScale` と同じく layer を Metal layer に
/// 差し替えるため、attach 直後の設定だけでは足りず、surface 構築後にも本関数を再度
/// 呼び出して `opaque` を上書きする必要がある（Bug E）。
pub fn set_overlay_view_opaque(view_handle: usize, opaque: bool) {
    if view_handle == 0 {
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
        apply_overlay_layer_opaque(view, opaque);
    }
}

/// Bug D — Metal layer の `opaque` プロパティを反映する。
/// `false` を渡すと `setOpaque: NO` が発行され、compositor は overlay 層の
/// alpha を尊重するようになり、`LoadOp::Clear(TRANSPARENT)` の結果が
/// 実際に下層まで抜ける。ただし `contentsScale` と同じく wgpu が layer を
/// 差し替えるため、surface 構築後に `set_overlay_view_opaque` で再適用する
/// 必要がある（Bug E）。attach 直後の一度きりの設定だけでは不十分。
unsafe fn apply_overlay_layer_opaque(view: *mut Object, opaque: bool) {
    if view.is_null() {
        return;
    }
    let layer: *mut Object = msg_send![view, layer];
    if layer.is_null() {
        return;
    }
    let objc_bool: BOOL = if opaque { YES } else { NO };
    let () = msg_send![layer, setOpaque: objc_bool];
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

/// Bug E（ADR-013）— parent NSWindow の `childWindows` を走査し、identifier が
/// 一致する overlay child NSWindow を `removeChildWindow:` で親子関係から外し、
/// `close` で解放する。attach の re-attach パス、detach の両方から呼ばれる。
unsafe fn remove_existing_overlay_child_window(parent_view: *mut Object) -> Result<(), &'static str> {
    let parent_window: *mut Object = msg_send![parent_view, window];
    if parent_window.is_null() {
        return Ok(());
    }

    let child_windows: *mut Object = msg_send![parent_window, childWindows];
    if child_windows.is_null() {
        return Ok(());
    }

    let count: usize = msg_send![child_windows, count];
    let expected_identifier = ns_string(NATIVE_OVERLAY_CHILD_WINDOW_IDENTIFIER)?;
    for index in (0..count).rev() {
        let child_window: *mut Object = msg_send![child_windows, objectAtIndex: index];
        if child_window.is_null() {
            continue;
        }
        let identifier: *mut Object = msg_send![child_window, identifier];
        if identifier.is_null() {
            continue;
        }
        let matches: BOOL = msg_send![identifier, isEqualToString: expected_identifier];
        if matches == YES {
            let () = msg_send![parent_window, removeChildWindow: child_window];
            let () = msg_send![child_window, close];
        }
    }

    Ok(())
}
