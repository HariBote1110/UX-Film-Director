#![allow(unexpected_cfgs)]

use core_graphics_types::geometry::{CGPoint, CGRect, CGSize};
use objc::declare::ClassDecl;
use objc::runtime::{Class, Object, Sel, BOOL, NO, YES};
use objc::{class, msg_send, sel, sel_impl, Encode, Encoding};
use std::collections::HashMap;
use std::sync::Mutex;

use crate::OverlayLayerContract;

/// parent NSView ポインタ（`usize` 化）→ geometry resync observer ポインタ
/// （`usize` 化）のレジストリ。`NSNotificationCenter` は observer を弱参照で
/// 保持するのみのため、呼び出し側（このクレート）が生存させ続ける必要がある。
/// detach 時にここから取り出して `removeObserver:` する。
static GEOMETRY_RESYNC_OBSERVERS: std::sync::OnceLock<Mutex<HashMap<usize, usize>>> =
    std::sync::OnceLock::new();

fn geometry_resync_observers() -> &'static Mutex<HashMap<usize, usize>> {
    GEOMETRY_RESYNC_OBSERVERS.get_or_init(|| Mutex::new(HashMap::new()))
}

const NATIVE_OVERLAY_VIEW_IDENTIFIER: &str = "UXFDNativeOverlayView";
const NATIVE_OVERLAY_PASSTHROUGH_VIEW_CLASS: &str = "UXFDNativeOverlayPassthroughView";
/// Bug E（ADR-013）— overlay の child NSWindow を識別するための `identifier`。
/// `NSWindow` にも `NSView` と同様 `identifier` プロパティがあり、detach 時に
/// parent の `childWindows` を走査して対象を一意に見分けるために使う。
const NATIVE_OVERLAY_CHILD_WINDOW_IDENTIFIER: &str = "UXFDNativeOverlayChildWindow";
/// parent window の move/resize 通知を受けて child window の geometry を手動
/// 再同期する observer オブジェクトのクラス名。`addChildWindow:ordered:` の
/// 既定追従を過信せず（計画書 §6）、フォールバックとして明示的に再計算する。
const NATIVE_OVERLAY_GEOMETRY_RESYNC_OBSERVER_CLASS: &str = "UXFDNativeOverlayGeometryResyncObserver";
/// resync observer の ivar 名: 監視対象の parent NSView（geometry 再計算の入力）。
const RESYNC_OBSERVER_IVAR_PARENT_VIEW: &str = "parentView";
/// resync observer の ivar 名: 再同期する対象の child NSWindow。
const RESYNC_OBSERVER_IVAR_CHILD_WINDOW: &str = "childWindow";

/// `NSWindowStyleMaskBorderless`（AppKit 定数、値 0）。
const NS_WINDOW_STYLE_MASK_BORDERLESS: usize = 0;
/// `NSBackingStoreBuffered`（AppKit 定数、値 2）。
const NS_BACKING_STORE_BUFFERED: usize = 2;
/// `NSWindowAbove`（`NSWindowOrderingMode`、値 1）。steady state での既定 order。
const NS_WINDOW_ABOVE: isize = 1;
/// `NSWindowBelow`（`NSWindowOrderingMode`、値 -1）。
/// Bug E（計画書 §4 Phase E2・§9 設計判断 3）— preview に重なる HTML UI が
/// 開いている間、child NSWindow をこの order で parent の背後に下げる。
/// `orderOut:`（完全に非表示化）ではなく order 下げを使うのは、GPU の
/// live surface present を止めずに再生を継続させるため。
const NS_WINDOW_BELOW: isize = -1;

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
        unregister_geometry_resync_observer(parent_view)?;
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

/// `NSWindowDidMoveNotification` / `NSWindowDidResizeNotification` 受信時に
/// 呼ばれ、observer の ivar（parentView / childWindow）から geometry を
/// 再計算して child window の frame に反映する。
extern "C" fn resync_child_window_geometry(this: &Object, _cmd: Sel, _notification: *mut Object) {
    unsafe {
        let parent_view_ivar: usize = *this.get_ivar(RESYNC_OBSERVER_IVAR_PARENT_VIEW);
        let child_window_ivar: usize = *this.get_ivar(RESYNC_OBSERVER_IVAR_CHILD_WINDOW);
        let parent_view = parent_view_ivar as *mut Object;
        let child_window = child_window_ivar as *mut Object;
        if parent_view.is_null() || child_window.is_null() {
            return;
        }

        let parent_window: *mut Object = msg_send![parent_view, window];
        if parent_window.is_null() {
            return;
        }

        // child NSWindow の現在サイズ（view_width/view_height 相当）はそのまま
        // 維持し、原点だけを parent の現在位置に合わせて再計算する。サイズ変更
        // （preview pane 自体のリサイズ）は re-attach 経路（新しい contract を
        // 渡す attach 呼び出し）が別途処理するため、ここでは扱わない。
        let current_frame: CGRect = msg_send![child_window, frame];
        let view_bounds: CGRect = msg_send![parent_view, bounds];
        let window_rect: CGRect = msg_send![
            parent_view,
            convertRect: view_bounds
            toView: std::ptr::null_mut::<Object>()
        ];
        let screen_rect: CGRect = msg_send![parent_window, convertRectToScreen: window_rect];

        let resynced_frame = CGRect::new(
            &CGPoint::new(screen_rect.origin.x, screen_rect.origin.y),
            &CGSize::new(current_frame.size.width, current_frame.size.height),
        );
        let () = msg_send![child_window, setFrame: resynced_frame display: YES];
    }
}

unsafe fn geometry_resync_observer_class() -> Result<&'static Class, &'static str> {
    if let Some(existing_class) = Class::get(NATIVE_OVERLAY_GEOMETRY_RESYNC_OBSERVER_CLASS) {
        return Ok(existing_class);
    }

    let superclass = appkit_class("NSObject")?;
    let mut declaration = ClassDecl::new(NATIVE_OVERLAY_GEOMETRY_RESYNC_OBSERVER_CLASS, superclass)
        .ok_or("Native overlay geometry resync observer class registration failed.")?;
    declaration.add_ivar::<usize>(RESYNC_OBSERVER_IVAR_PARENT_VIEW);
    declaration.add_ivar::<usize>(RESYNC_OBSERVER_IVAR_CHILD_WINDOW);
    declaration.add_method(
        sel!(resyncChildWindowGeometry:),
        resync_child_window_geometry as extern "C" fn(&Object, Sel, *mut Object),
    );
    Ok(declaration.register())
}

/// `parent_window` の `NSWindowDidMoveNotification` / `NSWindowDidResizeNotification`
/// を observer に登録し、child window の geometry を手動で再同期できるようにする。
/// `addChildWindow:ordered:` の既定追従を過信せず（計画書 §6: Mission Control /
/// Spaces 跨ぎ・フルスクリーン切替での外れリスク）のフォールバック経路。
///
/// 戻り値の observer オブジェクトは呼び出し側が保持し続ける必要がある
/// （NSNotificationCenter は弱参照で保持するのみ）。
unsafe fn register_geometry_resync_observer(
    parent_view: *mut Object,
    parent_window: *mut Object,
    child_window: *mut Object,
) -> Result<*mut Object, &'static str> {
    let observer_class = geometry_resync_observer_class()?;
    let observer: *mut Object = msg_send![observer_class, alloc];
    if observer.is_null() {
        return Err("Native overlay geometry resync observer allocation failed.");
    }
    let observer: *mut Object = msg_send![observer, init];
    if observer.is_null() {
        return Err("Native overlay geometry resync observer initialisation failed.");
    }
    (*observer).set_ivar(RESYNC_OBSERVER_IVAR_PARENT_VIEW, parent_view as usize);
    (*observer).set_ivar(RESYNC_OBSERVER_IVAR_CHILD_WINDOW, child_window as usize);

    let notification_centre_class = appkit_class("NSNotificationCenter")?;
    let default_centre: *mut Object = msg_send![notification_centre_class, defaultCenter];
    let move_notification_name = ns_string("NSWindowDidMoveNotification")?;
    let resize_notification_name = ns_string("NSWindowDidResizeNotification")?;
    let selector = sel!(resyncChildWindowGeometry:);

    let () = msg_send![
        default_centre,
        addObserver: observer
        selector: selector
        name: move_notification_name
        object: parent_window
    ];
    let () = msg_send![
        default_centre,
        addObserver: observer
        selector: selector
        name: resize_notification_name
        object: parent_window
    ];

    Ok(observer)
}

/// `parent_view` に紐づく geometry resync observer が登録済みなら、
/// `NSNotificationCenter` から `removeObserver:` して registry から取り除く。
/// 未登録なら何もしない（Fail Safe）。
unsafe fn unregister_geometry_resync_observer(parent_view: *mut Object) -> Result<(), &'static str> {
    let observer_ptr = {
        let mut observers = geometry_resync_observers()
            .lock()
            .map_err(|_| "Native overlay geometry resync observer registry is poisoned.")?;
        observers.remove(&(parent_view as usize))
    };

    let Some(observer_ptr) = observer_ptr else {
        return Ok(());
    };
    let observer = observer_ptr as *mut Object;
    if observer.is_null() {
        return Ok(());
    }

    let notification_centre_class = appkit_class("NSNotificationCenter")?;
    let default_centre: *mut Object = msg_send![notification_centre_class, defaultCenter];
    let () = msg_send![default_centre, removeObserver: observer];

    Ok(())
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
        // 前回の overlay NSView / child NSWindow / geometry resync observer が
        // 残らないようにする。
        unregister_geometry_resync_observer(parent_view)?;
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

        // Bug E（ADR-013・計画書 §6 リスク退避）— addChildWindow の既定追従を
        // 過信せず、parent window の移動・リサイズ通知を監視して child window
        // の geometry を手動で再同期するフォールバックを登録する。observer は
        // parent_view ポインタ単位でレジストリに保持し、detach で解放する。
        let observer = register_geometry_resync_observer(parent_view, parent_window, child_window)?;
        geometry_resync_observers()
            .lock()
            .map_err(|_| "Native overlay geometry resync observer registry is poisoned.")?
            .insert(parent_view as usize, observer as usize);

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

/// Bug E（計画書 §4 Phase E2・§9 設計判断 3）— overlay の child NSWindow の
/// z-order を切り替える。`obstructed=true` で `NSWindowBelow`（parent の
/// 背後）、`obstructed=false` で `NSWindowAbove`（steady state、最前面）に
/// `orderWindow:relativeTo:` する。`orderOut:`（完全非表示化）は使わない —
/// GPU の live surface present はこの呼び出しの影響を受けず、動画再生は
/// 継続する（表示位置だけが変わる）。
///
/// `view_handle` は attach が返した overlay NSView のハンドルで、
/// `set_overlay_view_contents_scale` / `set_overlay_view_opaque` と同じ
/// 引数形。実際に order を切り替えるのは overlay NSView の `window`
/// （= attach が addChildWindow した child NSWindow）である。
pub fn set_overlay_view_obstructed(view_handle: usize, obstructed: bool) {
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
        let child_window: *mut Object = msg_send![view, window];
        if child_window.is_null() {
            return;
        }
        let order = if obstructed { NS_WINDOW_BELOW } else { NS_WINDOW_ABOVE };
        let () = msg_send![child_window, orderWindow: order relativeTo: 0isize];
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

#[cfg(test)]
mod geometry_tests {
    use super::*;

    #[test]
    fn resolve_view_local_rect_keeps_coordinates_unchanged_when_parent_view_is_not_flipped() {
        // parent view が isFlipped=NO（AppKit 既定、bottom-left origin）の場合、
        // TS 側（buildNativeOverlayAttachRect）が既に bottom-left 前提で計算した
        // view_x/view_y はそのまま parent view のローカル座標として使ってよい。
        let (x, y, width, height) = resolve_view_local_rect_for_parent_bounds(
            12.0, 34.0, 200.0, 100.0, 600.0, false,
        );
        assert_eq!((x, y, width, height), (12.0, 34.0, 200.0, 100.0));
    }

    #[test]
    fn resolve_view_local_rect_flips_y_when_parent_view_is_flipped() {
        // Electron/Chromium の BrowserWindow contentView は isFlipped=YES
        // （top-left origin）で実装されている。TS 側は bottom-left 前提で
        // view_y を計算しているため、そのまま parent view のローカル座標として
        // 使うと二重反転（誤り）になる。isFlipped の場合は
        // `parent_bounds_height - view_y - view_height` で打ち消す必要がある。
        let parent_bounds_height = 600.0;
        let (x, y, width, height) = resolve_view_local_rect_for_parent_bounds(
            12.0, 34.0, 200.0, 100.0, parent_bounds_height, true,
        );
        assert_eq!(x, 12.0);
        assert_eq!(width, 200.0);
        assert_eq!(height, 100.0);
        // 600 - 34 - 100 = 466
        assert_eq!(y, 466.0);
    }

    #[test]
    fn resolve_view_local_rect_flip_is_involution_for_round_trip_bounds() {
        // flip 変換を二度適用すると元の値へ戻ることを固定する（変換式の対称性の
        // 健全性チェック）。attach と resync で同じ関数を使う設計の前提となる。
        let parent_bounds_height = 812.0;
        let (_, first_y, _, height) =
            resolve_view_local_rect_for_parent_bounds(0.0, 150.0, 400.0, 300.0, parent_bounds_height, true);
        let (_, round_trip_y, _, _) = resolve_view_local_rect_for_parent_bounds(
            0.0,
            first_y,
            400.0,
            height,
            parent_bounds_height,
            true,
        );
        assert_eq!(round_trip_y, 150.0);
    }

    #[test]
    fn attach_and_resync_share_the_same_view_local_rect_resolution_function() {
        // attach（create_overlay_child_window）と resync
        // （resync_child_window_geometry）が同じ座標変換式を使っていることを
        // ソースレベルで固定する。片方だけ resolve_view_local_rect_for_parent_bounds
        // 経由に修正され、もう片方が独自の（誤った）計算式のまま残るリグレッションを防ぐ。
        let source = include_str!("macos_overlay.rs");
        let occurrences = source
            .matches("resolve_view_local_rect_for_parent_bounds(")
            .count();
        assert!(
            occurrences >= 3,
            "expected resolve_view_local_rect_for_parent_bounds to be defined once and called from \
             both create_overlay_child_window (attach) and resync_child_window_geometry (resync); \
             found {occurrences} occurrences (including the fn definition itself)",
        );
    }

    #[test]
    fn resync_uses_contract_view_rect_offset_not_full_parent_bounds() {
        // resync_child_window_geometry が `parent_view.bounds` 全体
        // （オフセットを無視した (0,0,w,h)）を convertRect: の入力にしていると、
        // ウィンドウ移動・リサイズのたびに overlay が parent window の原点
        // （画面の一部にしか preview が無い場合は左下寄りの誤った位置）へ
        // 再配置されてしまう。resync は必ず attach 時と同じ contract 由来の
        // オフセット付き view rect（ivar に保持した view_x/y/width/height）を
        // 使うことを固定する。
        let source = include_str!("macos_overlay.rs");
        let resync_fn_start = source
            .find("fn resync_child_window_geometry")
            .expect("resync_child_window_geometry must exist");
        let resync_fn_source = &source[resync_fn_start..];
        let resync_fn_end = resync_fn_source
            .find("\n}\n")
            .map(|end| end + 3)
            .unwrap_or(resync_fn_source.len());
        let resync_fn_body = &resync_fn_source[..resync_fn_end];

        assert!(
            !resync_fn_body.contains("parent_view, bounds]"),
            "resync must not re-derive geometry from the full parent view bounds; it must reuse \
             the contract's view rect offset (ivar-stored view_x/y/width/height) so the overlay \
             stays aligned with the original attach rect instead of drifting to the parent's origin",
        );
    }
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
