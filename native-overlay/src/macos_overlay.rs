#![allow(unexpected_cfgs)]

use core_graphics_types::geometry::{CGPoint, CGRect, CGSize};
use objc::declare::ClassDecl;
use objc::runtime::{Class, Object, Sel, BOOL, NO, YES};
use objc::{class, msg_send, sel, sel_impl, Encode, Encoding};
use std::collections::HashMap;
use std::os::raw::c_void;
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
/// resync observer の ivar 名: attach 時に確立した contract 由来の view rect
/// （parent view のローカル座標、オフセット・サイズとも contract のまま）。
/// resync は `parent_view.bounds` 全体ではなく、必ずこのオフセット付き矩形を
/// 使って geometry を再計算する（`resolve_view_local_rect_for_parent_bounds`
/// と同じ関数を通す）。そうしないとウィンドウ移動・リサイズのたびに overlay が
/// parent window の原点付近へドリフトしてしまう。
const RESYNC_OBSERVER_IVAR_CONTRACT_VIEW_X: &str = "contractViewX";
const RESYNC_OBSERVER_IVAR_CONTRACT_VIEW_Y: &str = "contractViewY";
const RESYNC_OBSERVER_IVAR_CONTRACT_VIEW_WIDTH: &str = "contractViewWidth";
const RESYNC_OBSERVER_IVAR_CONTRACT_VIEW_HEIGHT: &str = "contractViewHeight";
/// resync observer の ivar 名: observer がまだ有効か（`NSWindowWillCloseNotification`
/// で `NO` に落とされていないか）。`parentView` / `childWindow` ivar は retain 済みで
/// メモリとしては生存し続けるが、対象ウィンドウが close 済みなら resync 本体を
/// 実行してはならない。late notification に対する構造的なガードとして使う。
const RESYNC_OBSERVER_IVAR_VALID: &str = "valid";

/// `NSWindowStyleMaskBorderless`（AppKit 定数、値 0）。
const NS_WINDOW_STYLE_MASK_BORDERLESS: usize = 0;
/// `NSBackingStoreBuffered`（AppKit 定数、値 2）。
const NS_BACKING_STORE_BUFFERED: usize = 2;
/// `NSWindowBelow`（`NSWindowOrderingMode`、値 -1）。hole-punch 方式（ADR
/// 追記）— overlay の child NSWindow は常にこの order で parent の背後に
/// 置く。parent 側が preview 矩形を透過するため、HTML 駆動 UI は一律
/// overlay より前面になる。
const NS_WINDOW_BELOW: isize = -1;
/// `NSViewWidthSizable`（`NSAutoresizingMaskOptions`、値 2）。
const NS_VIEW_WIDTH_SIZABLE: usize = 2;
/// `NSViewHeightSizable`（`NSAutoresizingMaskOptions`、値 16）。
const NS_VIEW_HEIGHT_SIZABLE: usize = 16;

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

/// TS 側（`buildNativeOverlayAttachRect`）は常に「bottom-left origin」の
/// bounds 座標系を前提に `contract.view_x` / `view_y` を計算している
/// （`y = contentHeight - top - height` という式自体が top-left → bottom-left
/// への変換を internal に含んでいる）。
///
/// しかし実際の parent NSView（Electron/Chromium が管理する BrowserWindow の
/// contentView）は `isFlipped == YES`（top-left origin）で実装されているのが
/// 通例で、この場合 TS 由来の bottom-left 前提の値をそのまま
/// `[parent_view convertRect:toView:nil]` に渡すと、AppKit 側が
/// `isFlipped` を見て「もう一度」flip 変換を行うため、二重反転で結果がずれる
/// （y が `parent_bounds_height - y - height` 分だけ狂う）。このズレ量は
/// parent view の bounds height（≒ ウィンドウサイズ）と view_y（≒ ウィンドウ内
/// での preview 位置）に依存するため、「特定のウィンドウ位置・サイズでは
/// 偶然ずれが相殺されて正しく見える」ことが起こり得る。
///
/// 本関数は `parent_view.isFlipped` を明示的に受け取り、flipped の場合だけ
/// y を打ち消し変換して、`convertRect:toView:nil` にそのまま渡せる
/// 「parent view 自身の実座標系での矩形」を返す純粋関数。objc 呼び出しに
/// 依存しないため、実機無しでユニットテスト可能。
///
/// `attach`（[`create_overlay_child_window`]）と `resync`
/// （[`resync_child_window_geometry`]）は必ず本関数を通して view rect を
/// 解決すること。片方だけ直接計算し直すと、ウィンドウ移動時にだけ異なる
/// 式が使われてさらにずれるリグレッションが再発する。
fn resolve_view_local_rect_for_parent_bounds(
    contract_view_x: f64,
    contract_view_y: f64,
    contract_view_width: f64,
    contract_view_height: f64,
    parent_view_bounds_height: f64,
    parent_view_is_flipped: bool,
) -> (f64, f64, f64, f64) {
    let resolved_y = if parent_view_is_flipped {
        parent_view_bounds_height - contract_view_y - contract_view_height
    } else {
        contract_view_y
    };
    (contract_view_x, resolved_y, contract_view_width, contract_view_height)
}

/// `parent_view` の `bounds` 座標系上に置くべき overlay の view local rect
/// （`convertRect:toView:nil` へそのまま渡せる形）を、`contract` 由来の
/// オフセット付き矩形と `parent_view.isFlipped` から解決する。
/// attach・resync の双方から呼ばれる共通経路。
unsafe fn resolve_overlay_view_local_rect(
    parent_view: *mut Object,
    contract_view_x: f64,
    contract_view_y: f64,
    contract_view_width: f64,
    contract_view_height: f64,
) -> CGRect {
    let view_bounds: CGRect = msg_send![parent_view, bounds];
    let is_flipped: BOOL = msg_send![parent_view, isFlipped];
    let (x, y, width, height) = resolve_view_local_rect_for_parent_bounds(
        contract_view_x,
        contract_view_y,
        contract_view_width,
        contract_view_height,
        view_bounds.size.height,
        is_flipped == YES,
    );
    if overlay_geometry_trace_enabled() {
        eprintln!(
            "[uxfd-native-overlay] geometry resolve: contract=({contract_view_x}, \
             {contract_view_y}, {contract_view_width}x{contract_view_height}) \
             parent_bounds_height={} parent_is_flipped={} -> local_rect=({x}, {y}, \
             {width}x{height})",
            view_bounds.size.height,
            is_flipped == YES,
        );
    }
    CGRect::new(&CGPoint::new(x, y), &CGSize::new(width, height))
}

/// Bug E 追加診断（`UXFD_OVERLAY_TRACE=1`）— attach / resync が計算した
/// child window の geometry を stderr へ出力する。実機でウィンドウ位置・
/// サイズ依存のずれを切り分けるための恒久診断（既定は無効）。
fn overlay_geometry_trace_enabled() -> bool {
    std::env::var("UXFD_OVERLAY_TRACE")
        .map(|value| value == "1")
        .unwrap_or(false)
}

unsafe fn trace_child_window_screen_frame(context: &str, screen_rect: CGRect) {
    if !overlay_geometry_trace_enabled() {
        return;
    }
    eprintln!(
        "[uxfd-native-overlay] {context}: child window screen frame = origin=({}, {}) size={}x{}",
        screen_rect.origin.x,
        screen_rect.origin.y,
        screen_rect.size.width,
        screen_rect.size.height,
    );
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

/// resync 本体（msg_send 群）を実行してよいかどうかを判定する純関数。
/// objc ランタイムに一切依存しないため実機無しでユニットテスト可能。
///
/// - `observer_valid` が `false`（`NSWindowWillCloseNotification` で無効化
///   済み）なら実行しない。
/// - `parent_view_ptr` / `child_window_ptr` が `0`（null 化された、または
///   そもそも未設定）でも実行しない。
///
/// これは「解放済みメモリを触らない」ことを保証するものではない
/// （それは呼び出し側で parent_view / child_window を retain することで
/// 担保する）。本関数が保証するのは「観測対象が論理的に無効だとわかって
/// いる場合は、そのメモリが有効であっても手を出さない」という上位の
/// 安全性である。
fn should_perform_geometry_resync(
    observer_valid: bool,
    parent_view_ptr: usize,
    child_window_ptr: usize,
) -> bool {
    observer_valid && parent_view_ptr != 0 && child_window_ptr != 0
}

/// `NSWindowWillCloseNotification` 受信時に呼ばれ、observer の
/// `RESYNC_OBSERVER_IVAR_VALID` を `NO` に落とす。parent window・child window
/// のどちらの close でも呼ばれるよう両方に登録する（`register_geometry_resync_observer`
/// 参照）。以降 `resync_child_window_geometry` は
/// `should_perform_geometry_resync` の判定により早期リターンする。
extern "C" fn invalidate_geometry_resync_observer(this: &Object, _cmd: Sel, _notification: *mut Object) {
    unsafe {
        // `extern "C" fn(&Object, ...)` は ObjC のインスタンスメソッド実装の
        // 慣例で `&Object` を受け取るが、ivar 書き込みには `&mut Object` が
        // 要る。self が指すオブジェクトを可変に書き換えてよいのは ObjC の
        // メソッド呼び出しとして当然のため、ここでのポインタキャストは安全。
        let this_mut = (this as *const Object as *mut Object).as_mut()
            .expect("resync observer self pointer must not be null inside its own method");
        this_mut.set_ivar(RESYNC_OBSERVER_IVAR_VALID, NO);
    }
}

/// `NSWindowDidMoveNotification` / `NSWindowDidResizeNotification` 受信時に
/// 呼ばれ、observer の ivar（parentView / childWindow / contract 由来の view
/// rect）から geometry を再計算して child window の frame に反映する。
///
/// 修正前は `parent_view.bounds` 全体（オフセット無視の `(0,0,w,h)`）を
/// `convertRect:toView:` に渡していたため、ウィンドウの移動・リサイズの
/// たびに overlay が parent window の原点（画面の一部にしか preview が無い
/// レイアウトでは左下寄りの誤った位置）へドリフトしていた。attach 時に
/// 確立した contract のオフセット付き view rect を ivar に保持し、それを
/// `resolve_view_local_rect_for_parent_bounds`（attach と共通）で解決してから
/// 変換することで、attach 直後の位置関係を移動・リサイズ後も維持する。
///
/// 実測クラッシュ（`EXC_BAD_ACCESS` / `objc_msgSend`、同一 faulting stack が
/// 5件）— アプリ終了時、AppKit が window を破棄する過程で
/// `NSWindowDidMoveNotification` / `NSWindowDidResizeNotification` が本
/// observer にまだ配送され得る。以前は ivar が生ポインタの `usize` 化のみで
/// `is_null()` しか見ておらず、解放済み（≠ null）ポインタを素通しして
/// `objc_msgSend` が dangling pointer を dereference していた。
/// `register_geometry_resync_observer` が parent_view / child_window を
/// retain するようになったため対象オブジェクトのメモリ自体は observer の
/// 生存中は解放されないが、それでも「論理的に close 済みの window に対して
/// geometry を書き込む」のは正しくない。`RESYNC_OBSERVER_IVAR_VALID` は
/// `NSWindowWillCloseNotification` で `NO` に落とされ、
/// `should_perform_geometry_resync` がそれを最初に検査することで、
/// late notification を安全に無視できるようにする。
extern "C" fn resync_child_window_geometry(this: &Object, _cmd: Sel, _notification: *mut Object) {
    unsafe {
        let observer_valid: BOOL = *this.get_ivar(RESYNC_OBSERVER_IVAR_VALID);
        let parent_view_ivar: usize = *this.get_ivar(RESYNC_OBSERVER_IVAR_PARENT_VIEW);
        let child_window_ivar: usize = *this.get_ivar(RESYNC_OBSERVER_IVAR_CHILD_WINDOW);
        if !should_perform_geometry_resync(observer_valid == YES, parent_view_ivar, child_window_ivar) {
            return;
        }
        let parent_view = parent_view_ivar as *mut Object;
        let child_window = child_window_ivar as *mut Object;

        let parent_window: *mut Object = msg_send![parent_view, window];
        if parent_window.is_null() {
            return;
        }

        let contract_view_x: f64 = *this.get_ivar(RESYNC_OBSERVER_IVAR_CONTRACT_VIEW_X);
        let contract_view_y: f64 = *this.get_ivar(RESYNC_OBSERVER_IVAR_CONTRACT_VIEW_Y);
        let contract_view_width: f64 = *this.get_ivar(RESYNC_OBSERVER_IVAR_CONTRACT_VIEW_WIDTH);
        let contract_view_height: f64 = *this.get_ivar(RESYNC_OBSERVER_IVAR_CONTRACT_VIEW_HEIGHT);

        let view_local_rect = resolve_overlay_view_local_rect(
            parent_view,
            contract_view_x,
            contract_view_y,
            contract_view_width,
            contract_view_height,
        );
        let window_rect: CGRect = msg_send![
            parent_view,
            convertRect: view_local_rect
            toView: std::ptr::null_mut::<Object>()
        ];
        let screen_rect: CGRect = msg_send![parent_window, convertRectToScreen: window_rect];
        trace_child_window_screen_frame("resync", screen_rect);

        let () = msg_send![child_window, setFrame: screen_rect display: YES];
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
    declaration.add_ivar::<f64>(RESYNC_OBSERVER_IVAR_CONTRACT_VIEW_X);
    declaration.add_ivar::<f64>(RESYNC_OBSERVER_IVAR_CONTRACT_VIEW_Y);
    declaration.add_ivar::<f64>(RESYNC_OBSERVER_IVAR_CONTRACT_VIEW_WIDTH);
    declaration.add_ivar::<f64>(RESYNC_OBSERVER_IVAR_CONTRACT_VIEW_HEIGHT);
    declaration.add_ivar::<BOOL>(RESYNC_OBSERVER_IVAR_VALID);
    declaration.add_method(
        sel!(resyncChildWindowGeometry:),
        resync_child_window_geometry as extern "C" fn(&Object, Sel, *mut Object),
    );
    declaration.add_method(
        sel!(invalidateGeometryResyncObserver:),
        invalidate_geometry_resync_observer as extern "C" fn(&Object, Sel, *mut Object),
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
    contract: &OverlayLayerContract,
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
    // resync は attach と同じ contract 由来のオフセット付き view rect を
    // 使う必要があるため（parent_view.bounds 全体ではない）、ivar に保持する。
    (*observer).set_ivar(RESYNC_OBSERVER_IVAR_CONTRACT_VIEW_X, contract.view_x);
    (*observer).set_ivar(RESYNC_OBSERVER_IVAR_CONTRACT_VIEW_Y, contract.view_y);
    (*observer).set_ivar(RESYNC_OBSERVER_IVAR_CONTRACT_VIEW_WIDTH, contract.view_width);
    (*observer).set_ivar(RESYNC_OBSERVER_IVAR_CONTRACT_VIEW_HEIGHT, contract.view_height);
    (*observer).set_ivar(RESYNC_OBSERVER_IVAR_VALID, YES);

    // クラッシュ実測（同一 faulting stack の EXC_BAD_ACCESS が5件）— 以前は
    // parent_view / child_window を生ポインタの `usize` 化のみで保持しており、
    // AppKit がこれらを close/dealloc した後に届いた late notification が
    // dangling pointer を dereference していた。observer の生存期間中は
    // 明示的に retain し、たとえ論理的に close 済みでもメモリとしては
    // observer が生きている間 dealloc されないようにする（対称的な release
    // は unregister_geometry_resync_observer 側）。
    let _retained_parent_view: *mut Object = msg_send![parent_view, retain];
    let _retained_child_window: *mut Object = msg_send![child_window, retain];

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

    // detach（before-quit を含む）が呼ばれずに parent window / child window の
    // どちらかが単独で close された場合に備えたフォールバック。retain により
    // メモリ自体は生存し続けるが、close 済みの window に対して geometry を
    // 書き込み続けるべきではないため、observer を明示的に無効化する。
    let will_close_notification_name = ns_string("NSWindowWillCloseNotification")?;
    let invalidate_selector = sel!(invalidateGeometryResyncObserver:);
    let () = msg_send![
        default_centre,
        addObserver: observer
        selector: invalidate_selector
        name: will_close_notification_name
        object: parent_window
    ];
    let () = msg_send![
        default_centre,
        addObserver: observer
        selector: invalidate_selector
        name: will_close_notification_name
        object: child_window
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

    // 以降 late notification が届いても resync 本体を実行させない
    // （register_geometry_resync_observer が retain した parent_view /
    // child_window をこの後 release するため、なおさら触らせてはならない）。
    (*observer).set_ivar(RESYNC_OBSERVER_IVAR_VALID, NO);

    let notification_centre_class = appkit_class("NSNotificationCenter")?;
    let default_centre: *mut Object = msg_send![notification_centre_class, defaultCenter];
    let () = msg_send![default_centre, removeObserver: observer];

    // register_geometry_resync_observer が取った retain（parent_view /
    // child_window）を対称的に release する。retain していなければここで
    // release すると over-release になるため、register と unregister は
    // 必ずペアで通ること（このレジストリの生成・削除自体がそれを担保する）。
    let parent_view_ivar: usize = *(*observer).get_ivar(RESYNC_OBSERVER_IVAR_PARENT_VIEW);
    let child_window_ivar: usize = *(*observer).get_ivar(RESYNC_OBSERVER_IVAR_CHILD_WINDOW);
    if parent_view_ivar != 0 {
        let retained_parent_view = parent_view_ivar as *mut Object;
        let () = msg_send![retained_parent_view, release];
    }
    if child_window_ivar != 0 {
        let retained_child_window = child_window_ivar as *mut Object;
        let () = msg_send![retained_child_window, release];
    }

    // alloc/init（register_geometry_resync_observer）で得た +1 の所有権を
    // release する。NSNotificationCenter は observer を弱参照でしか保持
    // していないため、ここで release しないと observer 自体が永久にリーク
    // していた（このバグ修正以前から存在していた既存のリーク）。
    let () = msg_send![observer, release];

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
        // に塗り替えても compositor が overlay 層を不透明扱いし、下層が
        // 常時不可視になる。opaque=NO を明示して transparent clear が
        // 下層まで抜けるようにする（hole-punch 方式では、抜けた先は
        // child window 自身の不透明・黒背景 — `create_overlay_child_window`
        // 参照）。
        apply_overlay_layer_opaque(overlay_view, false);

        let child_window = create_overlay_child_window(parent_view, contract)?;
        // overlay（Metal）view は child window の contentView を直接置き換える
        // のではなく、黒背景の layer-backed container view（contentView、
        // `create_overlay_child_window` 参照）の subview として追加する。
        // container の bounds いっぱいに追従させるため、frame は container
        // 全体を覆う local_frame のまま、autoresizing mask で
        // width/height sizable にする（geometry resync は container を
        // 抱える window 自体の `setFrame:display:` で行われる）。
        let container_view: *mut Object = msg_send![child_window, contentView];
        if container_view.is_null() {
            return Err("Native overlay child NSWindow contentView is unavailable.");
        }
        let () = msg_send![
            overlay_view,
            setAutoresizingMask: NS_VIEW_WIDTH_SIZABLE | NS_VIEW_HEIGHT_SIZABLE
        ];
        let () = msg_send![container_view, addSubview: overlay_view];

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
        // z-order 制御が可能になる。
        //
        // hole-punch 方式（ADR 追記）— parent BrowserWindow 側が preview 矩形を
        // 透過（背景色を transparent、レイアウト上その領域を空ける）し、overlay
        // の child NSWindow は常に parent の背後（`NS_WINDOW_BELOW`）に置く。
        // HTML 駆動 UI は常に parent 側の通常の view 階層に描かれるため、
        // z-order を切り替えなくても一律 overlay より前面になる。旧来の
        // 「既定は最前面、HTML UI と重なるときだけ order を下げる」トグル方式
        // （obstructed API・Bug E の Phase E2）は本設計により不要になった。
        let () = msg_send![parent_window, addChildWindow: child_window ordered: NS_WINDOW_BELOW];

        // Bug E（ADR-013・計画書 §6 リスク退避）— addChildWindow の既定追従を
        // 過信せず、parent window の移動・リサイズ通知を監視して child window
        // の geometry を手動で再同期するフォールバックを登録する。observer は
        // parent_view ポインタ単位でレジストリに保持し、detach で解放する。
        let observer =
            register_geometry_resync_observer(parent_view, parent_window, child_window, contract)?;
        geometry_resync_observers()
            .lock()
            .map_err(|_| "Native overlay geometry resync observer registry is poisoned.")?
            .insert(parent_view as usize, observer as usize);

        Ok(overlay_view_handle(overlay_view))
    }
}

/// overlay 用の borderless / transparent な child NSWindow を new し、geometry を
/// `contract` の view rect からスクリーン座標へ変換して設定する。
///
/// 座標変換式: `contract` の view rect（TS 側 `buildNativeOverlayAttachRect` が
/// bottom-left origin 前提で計算した `(view_x, view_y, view_width,
/// view_height)`）を、まず `resolve_view_local_rect_for_parent_bounds` で
/// `parent_view` 自身の実際の座標系（`isFlipped` 次第で bottom-left のことも
/// top-left のこともある）に解決してから、`convertRect:toView:nil` で parent
/// window 座標に変換し、window の `convertRectToScreen:` でスクリーン座標
/// （グローバル、bottom-left origin）に変換する。child NSWindow の `frame` は
/// このスクリーン座標矩形と一致させる。
///
/// 過去の不具合: この関数が `parent_view` の `isFlipped` を考慮せず
/// contract の値をそのまま `convertRect:` に渡していたため、Electron/
/// Chromium の contentView（通例 `isFlipped == YES`）では二重反転が起き、
/// overlay 全体（scene・選択枠を含む）がウィンドウの実際の位置に応じた
/// オフセット分だけ左下寄りにずれて表示されていた。
unsafe fn create_overlay_child_window(
    parent_view: *mut Object,
    contract: &OverlayLayerContract,
) -> Result<*mut Object, &'static str> {
    let parent_window: *mut Object = msg_send![parent_view, window];
    if parent_window.is_null() {
        return Err("Native overlay parent NSWindow is unavailable.");
    }

    // contract の view rect（TS 由来、bottom-left 前提）を、parent_view の実際の
    // isFlipped 状態に合わせて解決する。parent_view が isFlipped（Electron/
    // Chromium の contentView で通例）の場合、そのまま渡すと convertRect: 内部で
    // 二重に flip されてずれるため、ここで打ち消し変換を行う
    // （resolve_view_local_rect_for_parent_bounds を参照）。
    let view_local_rect = resolve_overlay_view_local_rect(
        parent_view,
        contract.view_x,
        contract.view_y,
        contract.view_width,
        contract.view_height,
    );
    // parent NSView のローカル座標 → parent NSWindow 座標（bottom-left origin）。
    let window_rect: CGRect = msg_send![parent_view, convertRect: view_local_rect toView: std::ptr::null_mut::<Object>()];
    // parent NSWindow 座標 → スクリーン座標（グローバル、bottom-left origin）。
    let screen_rect: CGRect = msg_send![parent_window, convertRectToScreen: window_rect];
    trace_child_window_screen_frame("attach", screen_rect);

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
    // hole-punch 方式: この child NSWindow は透過 Electron parent window の
    // 下層（below）に配置される。Metal layer 自体は非不透明のまま
    // （Bug D／`apply_overlay_layer_opaque`）で wgpu surface の
    // `Color::TRANSPARENT` クリアを保つが、その透明ピクセルが抜けた先は
    // デスクトップではなく不透明・黒でなければならない。
    //
    // 実機リグレッション: この黒塗りを window 自体の `setOpaque: YES` +
    // `blackColor` で行うと、`addChildWindow:ordered:NSWindowBelow` された
    // borderless child window が opaque になった途端、parent（Electron）
    // window が overlay を再アタッチする場面（例: NSOpenPanel クローズ後）で
    // app が deactivate し（key を失いメニューバーが暗くなる）、Stage Manager
    // 環境では app がサイドストリップへ押し出される不具合が実機で観測された。
    // window 自体は非不透明・透明背景のまま維持し（元の設計）、黒塗りは
    // contentView（layer-backed な container view）の layer.backgroundColor
    // で行う（下の container view 設定を参照）。
    let () = msg_send![child_window, setOpaque: NO];
    let clear_colour: *mut Object = msg_send![class!(NSColor), clearColor];
    let () = msg_send![child_window, setBackgroundColor: clear_colour];
    let () = msg_send![child_window, setHasShadow: NO];

    // window の既定 contentView を layer-backed な container view として使い、
    // その layer.backgroundColor を黒にする。overlay（Metal）view はこの
    // container の subview として追加され（`attach_overlay_view_to_parent`
    // 参照）、透明な surface ピクセルはこの container の不透明・黒 layer まで
    // 抜けるが、その先のデスクトップまでは抜けない。
    let container_view: *mut Object = msg_send![child_window, contentView];
    if !container_view.is_null() {
        let () = msg_send![container_view, setWantsLayer: YES];
        let container_layer: *mut Object = msg_send![container_view, layer];
        if !container_layer.is_null() {
            let black_colour: *mut Object = msg_send![class!(NSColor), blackColor];
            let black_layer_colour: *mut c_void = msg_send![black_colour, CGColor];
            let () = msg_send![container_layer, setBackgroundColor: black_layer_colour];
            let () = msg_send![container_layer, setOpaque: YES];
        }
    }
    // preview の操作（クリック/ドラッグ/スクラブ）は下層 WebView 側 React UI が
    // 一貫して処理する設計。既存 NSView の hitTest: nil 返しに加え、window
    // レベルでもマウスイベントを無視させ、child window 自身がイベントを奪う
    // 経路を完全に断つ。
    let () = msg_send![child_window, setIgnoresMouseEvents: YES];
    // key/main を奪わないことの確認（hole-punch 方式でも重要 — overlay は常に
    // parent の背後にあるが、万一 key window になるとメニュー/ショートカット
    // の受け手が overlay 側へ奪われる）。この child window は素の `NSWindow`
    // （styleMask は `NS_WINDOW_STYLE_MASK_BORDERLESS` のみ）で、独自の
    // `canBecomeKeyWindow` オーバーライドは持たない。AppKit の既定実装は
    // borderless window に対して `canBecomeKeyWindow`/`canBecomeMainWindow`
    // ともに `NO` を返すため、追加のオーバーライドは不要。
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
/// 実際に下層まで抜ける（hole-punch 方式では、抜けた先は child window
/// 自身の不透明・黒背景 — `create_overlay_child_window` 参照）。ただし
/// `contentsScale` と同じく wgpu が layer を差し替えるため、surface 構築後に
/// `set_overlay_view_opaque` で再適用する必要がある（Bug E）。attach 直後の
/// 一度きりの設定だけでは不十分。
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

#[cfg(test)]
mod geometry_resync_teardown_safety_tests {
    use super::*;

    // クラッシュ実測（`~/Library/Logs/DiagnosticReports/Electron-*.ips`、同一
    // faulting stack が5件）: アプリ終了時に
    // `resync_child_window_geometry`（macos_overlay.rs:252 付近）が既に解放済み
    // の child window ポインタへ `objc_msgSend` してSEGVする。原因は
    // `RESYNC_OBSERVER_IVAR_PARENT_VIEW` / `RESYNC_OBSERVER_IVAR_CHILD_WINDOW`
    // が生ポインタの `usize` 化のみで、参照先オブジェクトを retain していない
    // ことに加え、`before-quit` で detach が呼ばれないため
    // `unregister_geometry_resync_observer` も実行されないこと。
    //
    // 実機でのSEGVそのものは単体テストで再現できないため、ここでは
    // 「late notification が届いても安全に無視できる」契約を、実際の objc
    // ランタイムに依存しない純粋関数 `should_perform_geometry_resync` で
    // 固定する。

    #[test]
    fn resync_is_skipped_when_observer_has_been_invalidated() {
        // observer が invalid（NSWindowWillCloseNotification 経由で無効化済み）
        // なら、parent/child ポインタが非ゼロでも resync 本体（msg_send 群）を
        // 実行してはならない。
        assert!(!should_perform_geometry_resync(false, 0x1000, 0x2000));
    }

    #[test]
    fn resync_is_skipped_when_parent_view_pointer_is_zero() {
        assert!(!should_perform_geometry_resync(true, 0, 0x2000));
    }

    #[test]
    fn resync_is_skipped_when_child_window_pointer_is_zero() {
        assert!(!should_perform_geometry_resync(true, 0x1000, 0));
    }

    #[test]
    fn resync_proceeds_only_when_valid_and_both_pointers_are_non_zero() {
        assert!(should_perform_geometry_resync(true, 0x1000, 0x2000));
    }

    #[test]
    fn resync_checks_validity_before_any_further_dereference() {
        // ソースレベル固定: resync_child_window_geometry の本体が
        // should_perform_geometry_resync による早期リターンを、child_window
        // への setFrame:display:（実際のジオメトリ書き込み）より前に置いている
        // こと。順序を誤ると「無効化済みだが引き続き解放済みポインタへ触れる」
        // リグレッションになる。
        let source = include_str!("macos_overlay.rs");
        let fn_start = source
            .find("extern \"C\" fn resync_child_window_geometry")
            .expect("resync_child_window_geometry must exist");
        let fn_source = &source[fn_start..];
        let guard_pos = fn_source
            .find("should_perform_geometry_resync(")
            .expect("resync_child_window_geometry must call should_perform_geometry_resync");
        let set_frame_pos = fn_source
            .find("setFrame: screen_rect display: YES")
            .expect("resync_child_window_geometry must still set the child window frame");
        assert!(
            guard_pos < set_frame_pos,
            "should_perform_geometry_resync must be checked before the child window is touched",
        );
    }

    #[test]
    fn register_retains_parent_view_and_child_window_for_observer_lifetime() {
        // NSNotificationCenter は observer 引数を弱参照でしか保持しない
        // （ファイル先頭のコメント参照）。しかし observer の ivar に積む
        // parent_view / child_window 自体は、これまで一切 retain されて
        // いなかった。AppKit 側がこれらを close/dealloc した後でも通知が
        // 届き得るため（実測クラッシュの根本原因）、observer の生存期間中は
        // 明示的に retain して、たとえ論理的に閉じられていてもメモリとしては
        // 生存させ続ける必要がある。
        let source = include_str!("macos_overlay.rs");
        let fn_start = source
            .find("unsafe fn register_geometry_resync_observer")
            .expect("register_geometry_resync_observer must exist");
        let fn_source = &source[fn_start..];
        let fn_end = fn_source
            .find("\nunsafe fn unregister_geometry_resync_observer")
            .expect("register_geometry_resync_observer must precede unregister_geometry_resync_observer");
        let fn_body = &fn_source[..fn_end];

        assert!(
            fn_body.contains("parent_view, retain]"),
            "register_geometry_resync_observer must retain parent_view for the observer's lifetime",
        );
        assert!(
            fn_body.contains("child_window, retain]"),
            "register_geometry_resync_observer must retain child_window for the observer's lifetime",
        );
        assert!(
            fn_body.contains("NSWindowWillCloseNotification"),
            "register_geometry_resync_observer must also observe NSWindowWillCloseNotification so \
             a closing window can proactively invalidate the observer instead of relying solely on \
             explicit detach ordering",
        );
    }

    #[test]
    fn unregister_releases_the_retains_taken_at_register_time() {
        // register で取った retain を detach 側で対称的に release しないと、
        // 正常な detach → re-attach のたびに parent_view / child_window の
        // retain count が積み上がるリークになる。
        let source = include_str!("macos_overlay.rs");
        let fn_start = source
            .find("unsafe fn unregister_geometry_resync_observer")
            .expect("unregister_geometry_resync_observer must exist");
        let fn_source = &source[fn_start..];
        let fn_end = fn_source
            .find("\nfn attach_overlay_view_to_parent")
            .expect("unregister_geometry_resync_observer must precede attach_overlay_view_to_parent");
        let fn_body = &fn_source[..fn_end];

        assert!(
            fn_body.contains(", release]"),
            "unregister_geometry_resync_observer must release the retains taken when the observer \
             was registered (parent_view, child_window, and the observer object itself)",
        );
    }
}

#[cfg(test)]
mod hole_punch_order_tests {
    // hole-punch 方式（parent BrowserWindow が preview 矩形を透過し、overlay は
    // 常に parent の背後に置かれる設計）への切替を固定する契約テスト。旧
    // obstructed トグル（NSWindowAbove を steady state とし、HTML UI が重なる
    // ときだけ NSWindowBelow へ切り替える方式）はもう存在しない。

    #[test]
    fn attach_overlay_view_to_parent_orders_child_below_parent() {
        // hole-punch 方式では overlay child NSWindow は常に parent の背後に
        // 置かれ、HTML 駆動 UI が常に前面に来る。旧来の "既定は最前面"
        // （NSWindowAbove）ではなく、addChildWindow:ordered: へ渡す値そのものが
        // NSWindowBelow であることをソースレベルで固定する。
        let source = include_str!("macos_overlay.rs");
        let fn_start = source
            .find("fn attach_overlay_view_to_parent")
            .expect("attach_overlay_view_to_parent must exist");
        let fn_source = &source[fn_start..];
        let fn_end = fn_source
            .find("\n}\n")
            .map(|end| end + 3)
            .unwrap_or(fn_source.len());
        let fn_body = &fn_source[..fn_end];

        assert!(
            fn_body.contains("addChildWindow: child_window ordered: NS_WINDOW_BELOW"),
            "attach_overlay_view_to_parent must addChildWindow with NS_WINDOW_BELOW so the \
             overlay always stays behind the parent BrowserWindow (hole-punch design)",
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
