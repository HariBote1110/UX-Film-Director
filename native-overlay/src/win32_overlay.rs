#![allow(unexpected_cfgs)]

//! Windows 版 native overlay（`macos_overlay.rs` の対応物）。
//!
//! 構成は `markdown/Windows_Port_Plan.md` Phase 5（ADR-012）で確定済み:
//! Electron の HWND をオーナーにした `WS_POPUP` +
//! `WS_EX_NOREDIRECTIONBITMAP | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE`
//! ウィンドウを作り、そこへ DirectComposition visual を張って wgpu の
//! composition swapchain（`alpha_mode: PreMultiplied`）へ描画する。
//! クリック透過は `WM_NCHITTEST` → `HTTRANSPARENT` で行う。
//!
//! `windows_port_research/notes/sustained-present.md`（Phase 0 実機検証）で
//! 確定した制約:
//! - `get_current_texture` は vsync 待ちのブロック点（Fifo で p50 30.7ms）。
//!   UI スレッドで呼んではいけない。present と `IDCompositionDevice::Commit`
//!   自体は 0.15ms 程度で無視できる。
//! - resize 追従は surface reconfigure でよい（連続 8,445 回再構成、失敗ゼロ）。
//! - `AddVisual` は参照 visual を明示すること（本ファイルは root visual 1 枚
//!   のみを `SetRoot` するため `AddVisual` 自体を使わないが、Phase 6 で
//!   複数 visual を積む場合はこの落とし穴に注意する）。

use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::Mutex;

use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::DirectComposition::{
    DCompositionCreateDevice, IDCompositionDevice, IDCompositionTarget, IDCompositionVisual,
};
use windows::Win32::Graphics::Gdi::ClientToScreen as WinClientToScreen;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::GetCurrentProcessId;
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, RegisterClassW, SetWindowPos, ShowWindow, CS_HREDRAW,
    CS_VREDRAW, EVENT_OBJECT_LOCATIONCHANGE, HWND_BOTTOM, HWND_TOP, SWP_NOACTIVATE, SWP_NOMOVE,
    SWP_NOSIZE, SWP_NOZORDER, SW_SHOWNOACTIVATE, WINEVENT_OUTOFCONTEXT, WNDCLASSW,
    WS_EX_NOACTIVATE, WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT, WS_POPUP,
};

use crate::OverlayLayerContract;

/// `SetWinEventHook` のコールバックが `OBJID_WINDOW` / `CHILDID_SELF` を
/// 表す際に受け取る値（`windows` crate の Win32_UI_WindowsAndMessaging には
/// 定数として存在しないため、Win32 SDK のヘッダ値をそのまま定義する）。
const OBJID_WINDOW: i32 = 0;
const CHILDID_SELF: i32 = 0;

const NATIVE_OVERLAY_WINDOW_CLASS: &str = "UXFDNativeOverlayWindow";
const WM_NCHITTEST: u32 = 0x0084;
const HTTRANSPARENT: isize = -1;

/// owner HWND（`usize` 化）→ overlay に紐づくリソース一式のレジストリ。
/// `Send` 境界を明示するため `OverlayWindowResources` は Windows COM
/// インターフェースを保持するが、生成・破棄ともこのモジュール内の関数
/// （呼び出し元は napi の worker スレッド／メインスレッドいずれか単一）
/// からしか触らない契約なので `unsafe impl Send` で通す。
static OVERLAY_WINDOWS: std::sync::OnceLock<Mutex<HashMap<usize, OverlayWindowResources>>> =
    std::sync::OnceLock::new();

fn overlay_windows() -> &'static Mutex<HashMap<usize, OverlayWindowResources>> {
    OVERLAY_WINDOWS.get_or_init(|| Mutex::new(HashMap::new()))
}

struct OverlayWindowResources {
    overlay_hwnd: isize,
    #[allow(dead_code)]
    dcomp_device: IDCompositionDevice,
    #[allow(dead_code)]
    target: IDCompositionTarget,
    #[allow(dead_code)]
    visual: IDCompositionVisual,
}

// COM インターフェースのラッパーは既定では Send/Sync を実装しない。
// このモジュールが単一の登録テーブル経由でしか扱わない（実際の描画スレッド
// アクセスは `NativeWgpuLiveSurfaceRenderer` 側が握る）契約のもとで明示する。
unsafe impl Send for OverlayWindowResources {}

/// geometry resync（`markdown/Windows_Port_Plan.md` Phase 6）のために
/// owner HWND ごとに保持する状態。`SetWinEventHook`
/// （`EVENT_OBJECT_LOCATIONCHANGE`）のコールバックはグローバル関数
/// ポインタでしかフックできず、クロージャでキャプチャできないため、
/// 対象 owner を静的レジストリへ登録して owner HWND をキーに引く設計。
///
/// macOS 側の `GEOMETRY_RESYNC_OBSERVERS`（`macos_overlay.rs`）と同じ
/// 「レジストリに resync 用の状態を保持し、通知/イベントのたびに解決し直す」
/// 構造の Win32 対応物。
struct GeometryResyncHookState {
    hook: isize,
    overlay_hwnd: isize,
    owner_hwnd: isize,
    contract: OverlayLayerContract,
}

unsafe impl Send for GeometryResyncHookState {}

static GEOMETRY_RESYNC_HOOKS: std::sync::OnceLock<Mutex<HashMap<usize, GeometryResyncHookState>>> =
    std::sync::OnceLock::new();

fn geometry_resync_hooks() -> &'static Mutex<HashMap<usize, GeometryResyncHookState>> {
    GEOMETRY_RESYNC_HOOKS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// `SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE, ...)` のコールバック。
///
/// macOS は `NSWindowDidMoveNotification` / `NSWindowDidResizeNotification`
/// を購読すればよいが、Electron/Chromium が所有する HWND は
/// このクレート側でサブクラス化（`WNDPROC` の差し替え）することが
/// 安全ではない（Chromium 自身が `WNDPROC` を握っており、素朴な
/// `SetWindowLongPtr(GWLP_WNDPROC, ...)` は Chromium 側の実装と競合しうる）。
/// そのため `WM_MOVE`/`WM_SIZE`/`WM_WINDOWPOSCHANGED` を直接フックせず、
/// システム全体のアクセシビリティイベントである
/// `EVENT_OBJECT_LOCATIONCHANGE`（`WINEVENT_OUTOFCONTEXT`）を購読する。
/// この方式はウィンドウの移動・リサイズ・最小化・復元のいずれでも発火し、
/// DPI 変更（`WM_DPICHANGED`）でもウィンドウ矩形が変わるため同じイベントで
/// 拾える。owner を直接操作しないため Chromium との競合リスクが無い。
///
/// `WINEVENT_OUTOFCONTEXT` はフックを呼び出したスレッドのメッセージキュー経由
/// で非同期配送されるため、当該スレッドがメッセージポンプを回している必要が
/// ある。`attach_overlay_window` は Electron のメインプロセス（napi の
/// 同期呼び出し元）スレッドから呼ばれ、そのスレッドは Chromium の UI スレッド
/// として常時メッセージループを回しているため、この前提は満たされる
/// （`windows_port_research/notes/w5-attach-hang.md` で確認した
/// 「メッセージポンプ不在でも DirectComposition 自体は数秒で完了する」とは
/// 別の話で、こちらはイベント配送の前提）。実機での配送確認は
/// mainpc のみで可能（§Verification 参照）。
extern "system" fn geometry_resync_win_event_proc(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    id_object: i32,
    id_child: i32,
    _id_event_thread: u32,
    _dwms_event_time: u32,
) {
    if event != EVENT_OBJECT_LOCATIONCHANGE || id_object != OBJID_WINDOW || id_child != CHILDID_SELF
    {
        return;
    }
    let Ok(registry) = geometry_resync_hooks().lock() else {
        return;
    };
    let Some(state) = registry.get(&(hwnd.0 as usize)) else {
        // このイベントは登録済みの owner とは無関係なウィンドウのもの
        // （プロセス内の他ウィンドウ、あるいは owner の子孫）。
        return;
    };
    let owner = HWND(state.owner_hwnd as *mut c_void);
    let overlay = HWND(state.overlay_hwnd as *mut c_void);
    let contract = state.contract.clone();
    drop(registry);
    unsafe {
        resync_overlay_geometry(owner, overlay, &contract);
    }
}

/// owner の現在のクライアント原点・DPI から overlay の screen rect を
/// 再計算し、`SetWindowPos` で反映する。attach 時の初期配置
/// （[`attach_overlay_window`]）と resync（本関数）はどちらも
/// `resolve_overlay_screen_rect` を通すことで、二重に異なる式を持たない
/// （macOS 側 `resolve_overlay_view_local_rect` のコメント参照）。
unsafe fn resync_overlay_geometry(owner: HWND, overlay: HWND, contract: &OverlayLayerContract) {
    let Ok((origin_x, origin_y)) = owner_client_origin(owner) else {
        return;
    };
    let Ok(client_height) = owner_client_height(owner) else {
        return;
    };
    let dpi_scale_factor = dpi_scale_factor_from_dpi(GetDpiForWindow(owner));
    let (screen_x, screen_y, width, height) = resolve_overlay_screen_rect(
        origin_x,
        origin_y,
        contract.view_x,
        contract.view_y,
        contract.view_width,
        contract.view_height,
        dpi_scale_factor,
        client_height,
    );
    let _ = SetWindowPos(
        overlay,
        None,
        screen_x,
        screen_y,
        width,
        height,
        SWP_NOZORDER | SWP_NOACTIVATE,
    );
}

/// owner HWND の move/resize/DPI 変更に overlay を追従させる resync hook を
/// 登録する。`attach_overlay_window` の最後で 1 回だけ呼ばれる。
unsafe fn register_geometry_resync_hook(
    owner: HWND,
    overlay: HWND,
    contract: OverlayLayerContract,
) -> Result<(), String> {
    let process_id = GetCurrentProcessId();
    let hook = SetWinEventHook(
        EVENT_OBJECT_LOCATIONCHANGE,
        EVENT_OBJECT_LOCATIONCHANGE,
        None,
        Some(geometry_resync_win_event_proc),
        process_id,
        0,
        WINEVENT_OUTOFCONTEXT,
    );
    if hook.is_invalid() {
        return Err("Native overlay SetWinEventHook failed.".to_string());
    }
    let state = GeometryResyncHookState {
        hook: hook.0 as isize,
        overlay_hwnd: overlay.0 as isize,
        owner_hwnd: owner.0 as isize,
        contract,
    };
    let mut registry = geometry_resync_hooks()
        .lock()
        .map_err(|_| "Native overlay geometry resync hook registry is poisoned.".to_string())?;
    registry.insert(owner.0 as usize, state);
    Ok(())
}

/// Phase 7 (W7 Option B) 用の公開ラッパー。`attach_overlay_window` が
/// 非同期タスクの worker スレッドで実行された後、呼び出し元
/// （`AttachNativeOverlayTask::resolve`、必ず JS/main スレッド上）から
/// この関数を呼んで hook を登録する。失敗しても attach 自体は継続する
/// （追従できないだけで overlay 自体は初期位置に表示される、従来どおり）。
pub fn register_overlay_geometry_hook(
    native_window_handle: &[u8],
    overlay_hwnd: usize,
    contract: OverlayLayerContract,
) {
    let owner = match native_window_handle_to_owner_hwnd(native_window_handle) {
        Ok(owner) => owner,
        Err(reason) => {
            eprintln!("[uxfd-native-overlay] geometry resync hook owner resolve failed: {reason}");
            return;
        }
    };
    let overlay = HWND(overlay_hwnd as *mut c_void);
    unsafe {
        if let Err(reason) = register_geometry_resync_hook(owner, overlay, contract) {
            eprintln!("[uxfd-native-overlay] geometry resync hook registration failed: {reason}");
        }
    }
}

/// `detach_overlay_window` から呼ばれ、登録済みの resync hook を解除する。
unsafe fn unregister_geometry_resync_hook(owner: HWND) {
    let Ok(mut registry) = geometry_resync_hooks().lock() else {
        return;
    };
    if let Some(state) = registry.remove(&(owner.0 as usize)) {
        let _ = UnhookWinEvent(HWINEVENTHOOK(state.hook as *mut c_void));
    }
}

/// Bug E 相当（`markdown/Windows_Port_Plan.md` Phase 6）— overlay に隠れる
/// HTML UI を前面に出したいとき、overlay の z-order を一時的に下げる。
/// macOS の `set_overlay_view_obstructed`（child NSWindow の
/// `orderWindow:relativeTo:`）に対応する Win32 版。
///
/// `WS_POPUP` ウィンドウは `SetWindowPos` の `hWndInsertAfter` に
/// `HWND_BOTTOM`/`HWND_TOP` を渡すだけで z-order を切り替えられる
/// （owner に対する子孫関係は `CreateWindowExW` の `hWndParent` 引数で
/// 既に確立済みなので、`HWND_TOP`/`HWND_BOTTOM` は owner の子ウィンドウ群
/// の中での相対順として扱われる）。macOS 版のように「対象ウィンドウの
/// windowNumber を明示的に relativeTo: へ渡す」必要は Win32 には無い。
pub fn set_overlay_window_obstructed(overlay_hwnd: usize, obstructed: bool) {
    if overlay_hwnd == 0 {
        return;
    }
    let overlay = HWND(overlay_hwnd as *mut c_void);
    let insert_after = if obstructed { HWND_BOTTOM } else { HWND_TOP };
    unsafe {
        let _ = SetWindowPos(
            overlay,
            insert_after,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}

/// Electron の owner HWND のクライアント原点（スクリーン座標）と、
/// `OverlayLayerContract` のオフセット付き矩形（owner クライアントローカル
/// 座標、top-left origin — Win32 ネイティブの座標系はそもそも flip 不要）
/// から、overlay ウィンドウを置くべきスクリーン座標矩形を解決する純粋関数。
///
/// macOS 側の `resolve_view_local_rect_for_parent_bounds` と同じ役割
/// （attach 時の geometry 解決を実機依存 API から切り離してテストする）を
/// Win32 向けに移したもの。Win32 の座標系は top-left origin で統一されて
/// おり isFlipped 相当の分岐は不要なため、macOS 版より単純になる。
///
/// `dpi_scale_factor` は attach/resync いずれの呼び出しでも
/// `dpi_scale_factor_from_dpi(GetDpiForWindow(owner))` を渡すこと。
/// `contract.view_*` は TS 側で CSS px（論理ピクセル）として計算されている
/// ため（`contents_scale` と同じ位置づけ、`lib.rs` の
/// `OverlayLayerContract::contents_scale` 参照）、Win32 の物理ピクセル座標系
/// へ渡す前に DPI スケールを掛けて変換する必要がある。100% スケール
/// （`dpi_scale_factor == 1.0`）では従来どおり無変換になる。
///
/// Phase 6 で `attach`（1 回きりの解決）だけでなく親ウィンドウの
/// move/resize/DPI 変更を受けての resync からも呼ばれるようになった
/// （[`register_geometry_resync_hook`] 参照）。
///
/// `owner_client_height_px` は owner のクライアント領域の高さ（物理ピクセル、
/// `GetClientRect` で取得）。TS 側 `buildNativeOverlayAttachRect`
/// （`src/utils/nativeOverlayViewportGeometry.ts`）は
/// `y = contentHeight - viewportRect.top - viewportOffsetTop - height` という
/// 式で常に bottom-left origin の `contract.view_y` を計算しており、これは
/// macOS AppKit の `isFlipped` 前提を打ち消すための変換で、送信元コードは
/// Windows/macOS で分岐していない（`macos_overlay.rs` の
/// `resolve_view_local_rect_for_parent_bounds` 冒頭のコメント参照）。
/// そのため Win32 側でも「owner のクライアント高さを使って bottom-left →
/// top-left へ変換する」処理が必須で、これを省くと overlay の縦位置が
/// 実際の canvas 位置と無関係にずれ、canvas 領域を大きくはみ出して描画される
/// （2026-08 mainpc 実機で観測された「えげつないはみ出し」バグの原因）。
pub fn resolve_overlay_screen_rect(
    owner_client_origin_x: i32,
    owner_client_origin_y: i32,
    contract_view_x: f64,
    contract_view_y: f64,
    contract_view_width: f64,
    contract_view_height: f64,
    dpi_scale_factor: f64,
    owner_client_height_px: i32,
) -> (i32, i32, i32, i32) {
    let scaled_x = contract_view_x * dpi_scale_factor;
    let scaled_y = contract_view_y * dpi_scale_factor;
    let scaled_width = contract_view_width * dpi_scale_factor;
    let scaled_height = contract_view_height * dpi_scale_factor;
    let width = scaled_width.round().max(1.0) as i32;
    let height = scaled_height.round().max(1.0) as i32;
    // bottom-left origin (TS 由来) → top-left origin (owner client-local) への変換。
    // macOS の `resolve_view_local_rect_for_parent_bounds` の
    // `parent_view_bounds_height - contract_view_y - contract_view_height` と同じ式を、
    // 物理ピクセルへスケール済みの値同士で行う。
    let flipped_local_y = owner_client_height_px as f64 - scaled_y.round() - height as f64;
    let screen_x = owner_client_origin_x + scaled_x.round() as i32;
    let screen_y = owner_client_origin_y + flipped_local_y.round() as i32;
    (screen_x, screen_y, width, height)
}

/// Win32 の `GetDpiForWindow` が返す生の DPI 値（既定 96 = 100%）を
/// `resolve_overlay_screen_rect` に渡す倍率へ変換する純粋関数。
/// `USER_DEFAULT_SCREEN_DPI`（96）を基準にした単純な比率。
/// per-monitor DPI awareness（`markdown/Windows_Port_Plan.md` Phase 6）の
/// 計算そのものはこれだけで、実機依存なのは呼び出し元の
/// `GetDpiForWindow` 呼び出しだけ。mainpc は 100% スケール機なので
/// このスケーリング自体の実機高DPI検証は未実施（下記モジュール doc 参照）。
pub fn dpi_scale_factor_from_dpi(dpi: u32) -> f64 {
    const USER_DEFAULT_SCREEN_DPI: f64 = 96.0;
    if dpi == 0 {
        return 1.0;
    }
    dpi as f64 / USER_DEFAULT_SCREEN_DPI
}

extern "system" fn overlay_wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if msg == WM_NCHITTEST {
        // クリック透過。overlay は常に「そこには何もない」ものとして扱わせ、
        // 下の Chromium ウィンドウへヒットテストを通す。
        return LRESULT(HTTRANSPARENT);
    }
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

fn register_overlay_window_class() -> Result<(), String> {
    unsafe {
        let hinstance = GetModuleHandleW(None)
            .map_err(|error| format!("Native overlay GetModuleHandleW failed: {error:?}"))?;
        let class_name = to_wide_null(NATIVE_OVERLAY_WINDOW_CLASS);
        let class = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(overlay_wndproc),
            hInstance: hinstance.into(),
            lpszClassName: windows::core::PCWSTR(class_name.as_ptr()),
            ..Default::default()
        };
        // 2 回目以降の attach では ERROR_CLASS_ALREADY_EXISTS で失敗するのが
        // 正常系（プロセス生存中は 1 回登録すれば十分）なので、戻り値は無視する。
        let _ = RegisterClassW(&class);
        // class_name はこの関数を抜けると解放されるが、RegisterClassW は
        // `lpszClassName` を内部にコピーするため問題ない（Win32 の契約）。
        Ok(())
    }
}

fn to_wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn native_window_handle_to_owner_hwnd(native_window_handle: &[u8]) -> Result<HWND, String> {
    if native_window_handle.len() != std::mem::size_of::<usize>() {
        return Err("Native overlay window handle has an unexpected byte length.".to_string());
    }
    let mut pointer_bytes = [0_u8; std::mem::size_of::<usize>()];
    pointer_bytes.copy_from_slice(native_window_handle);
    let pointer = usize::from_ne_bytes(pointer_bytes);
    if pointer == 0 {
        return Err("Native overlay owner HWND is null.".to_string());
    }
    Ok(HWND(pointer as *mut c_void))
}

/// owner HWND のクライアント原点（スクリーン座標）を取得する。
unsafe fn owner_client_origin(owner: HWND) -> Result<(i32, i32), String> {
    let mut origin = windows::Win32::Foundation::POINT { x: 0, y: 0 };
    if !WinClientToScreen(owner, &mut origin).as_bool() {
        return Err("Native overlay ClientToScreen failed.".to_string());
    }
    Ok((origin.x, origin.y))
}

/// owner HWND のクライアント領域の高さ（物理ピクセル）を取得する。
/// `resolve_overlay_screen_rect` の bottom-left → top-left 変換
/// （TS 側 `buildNativeOverlayAttachRect` が送る bottom-left origin の
/// `contract.view_y` を打ち消すため）に必要。
unsafe fn owner_client_height(owner: HWND) -> Result<i32, String> {
    let mut rect = windows::Win32::Foundation::RECT::default();
    windows::Win32::UI::WindowsAndMessaging::GetClientRect(owner, &mut rect)
        .map_err(|error| format!("Native overlay GetClientRect failed: {error:?}"))?;
    Ok(rect.bottom - rect.top)
}

/// `attach_native_overlay_compute`（`lib.rs`）の Windows 分岐から呼ばれる。
/// overlay window を作成し、DirectComposition device/target/visual を
/// セットアップして root visual まで `SetRoot` する。戻り値は overlay HWND
/// を `usize` 化したもの（`NativeWgpuLiveSurfaceRenderer::from_hwnd` と
/// レンダラ側レジストリの両方が使う）。
pub fn attach_overlay_window(
    native_window_handle: &[u8],
    contract: &OverlayLayerContract,
) -> Result<(usize, IDCompositionDevice, IDCompositionVisual), String> {
    let owner = native_window_handle_to_owner_hwnd(native_window_handle)?;
    register_overlay_window_class()?;

    unsafe {
        let (origin_x, origin_y) = owner_client_origin(owner)?;
        let client_height = owner_client_height(owner)?;
        let dpi_scale_factor = dpi_scale_factor_from_dpi(GetDpiForWindow(owner));
        let (screen_x, screen_y, width, height) = resolve_overlay_screen_rect(
            origin_x,
            origin_y,
            contract.view_x,
            contract.view_y,
            contract.view_width,
            contract.view_height,
            dpi_scale_factor,
            client_height,
        );

        let hinstance = GetModuleHandleW(None)
            .map_err(|error| format!("Native overlay GetModuleHandleW failed: {error:?}"))?;
        let class_name = to_wide_null(NATIVE_OVERLAY_WINDOW_CLASS);
        let window_name = to_wide_null("UXFD Native Overlay");
        let overlay = CreateWindowExW(
            WS_EX_NOREDIRECTIONBITMAP | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            windows::core::PCWSTR(class_name.as_ptr()),
            windows::core::PCWSTR(window_name.as_ptr()),
            WS_POPUP,
            screen_x,
            screen_y,
            width,
            height,
            owner,
            None,
            hinstance,
            None,
        )
        .map_err(|error| format!("Native overlay CreateWindowExW failed: {error:?}"))?;

        let _ = ShowWindow(overlay, SW_SHOWNOACTIVATE);

        let dcomp_device: IDCompositionDevice = DCompositionCreateDevice(None)
            .map_err(|error| format!("Native overlay DCompositionCreateDevice failed: {error:?}"))?;
        let target = dcomp_device
            .CreateTargetForHwnd(overlay, true)
            .map_err(|error| format!("Native overlay CreateTargetForHwnd failed: {error:?}"))?;
        let visual = dcomp_device
            .CreateVisual()
            .map_err(|error| format!("Native overlay CreateVisual failed: {error:?}"))?;
        target
            .SetRoot(&visual)
            .map_err(|error| format!("Native overlay SetRoot failed: {error:?}"))?;

        let overlay_hwnd = overlay.0 as usize;
        let resources = OverlayWindowResources {
            overlay_hwnd: overlay.0 as isize,
            dcomp_device: dcomp_device.clone(),
            target,
            visual: visual.clone(),
        };
        let mut registry = overlay_windows()
            .lock()
            .map_err(|_| "Native overlay window registry is poisoned.".to_string())?;
        registry.insert(owner.0 as usize, resources);
        drop(registry);

        // Phase 6: 親ウィンドウの move/resize/最小化/復元/DPI 変更に overlay
        // を追従させる resync hook を登録する。
        //
        // Phase 7 (W7 Option B、非同期 attach 化): この登録は
        // `attach_overlay_window` の呼び出し元がここで直接行っていたが、
        // 非同期化後は `attach_overlay_window` 自体が napi の libuv
        // threadpool worker スレッド（AsyncTask::compute）から呼ばれる
        // ようになる。`SetWinEventHook(WINEVENT_OUTOFCONTEXT)` は
        // コールバックを受け取るために「登録したスレッドがメッセージポンプを
        // 持つこと」を要求するが、threadpool worker にはポンプが無い
        // （Electron main / JS スレッドにはある）。よってここでは
        // 登録しない。呼び出し元（`register_overlay_geometry_hook`、
        // AsyncTask::resolve から JS スレッド上で呼ばれる）に委譲する。
        Ok((overlay_hwnd, dcomp_device, visual))
    }
}

pub fn detach_overlay_window(native_window_handle: &[u8]) -> Result<(), String> {
    let owner = native_window_handle_to_owner_hwnd(native_window_handle)?;
    unsafe {
        unregister_geometry_resync_hook(owner);
    }
    let mut registry = overlay_windows()
        .lock()
        .map_err(|_| "Native overlay window registry is poisoned.".to_string())?;
    if let Some(resources) = registry.remove(&(owner.0 as usize)) {
        unsafe {
            let _ = windows::Win32::UI::WindowsAndMessaging::DestroyWindow(HWND(
                resources.overlay_hwnd as *mut c_void,
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod geometry_tests {
    use super::*;

    #[test]
    fn resolve_overlay_screen_rect_offsets_by_owner_client_origin() {
        // Win32 は screen 座標こそ top-left origin だが、contract.view_x/view_y
        // は TS 側 `buildNativeOverlayAttachRect`（src/utils/nativeOverlayViewportGeometry.ts）
        // が常に「bottom-left origin」で計算して送ってくる
        // （macOS AppKit の isFlipped 前提を打ち消すための式であり、
        // 送信元は Windows/macOS で分岐していない）。そのため Win32 側でも
        // macOS の `resolve_view_local_rect_for_parent_bounds` と同じ
        // 「owner クライアント高さを使って bottom-left → top-left へ変換する」
        // 処理が必要。owner client height を contract の view_height と
        // 同じ 400 に取ると、bottom-left の view_y=34 はちょうど
        // full-height 矩形の 34 == 400-34-366 ではなく、単純な
        // owner_client_height(400) - view_y(34) - view_height(400) = -34 になる
        // ケースを避けるため、owner のクライアント高さを view より大きい
        // 634（= view_y 34 + view_height 400 + 余白 200）に取り、
        // 期待 top-left y = owner_client_height - view_y - view_height = 200
        // となることを確認する。
        let (x, y, width, height) =
            resolve_overlay_screen_rect(100, 200, 12.0, 34.0, 600.0, 400.0, 1.0, 634);
        assert_eq!((x, y, width, height), (112, 200 + 200, 600, 400));
    }

    #[test]
    fn resolve_overlay_screen_rect_rounds_fractional_view_offsets() {
        let (x, y, width, height) =
            resolve_overlay_screen_rect(0, 0, 12.4, 34.6, 600.4, 400.6, 1.0, 1000);
        assert_eq!((x, y, width, height), (12, 1000 - 35 - 401, 600, 401));
    }

    #[test]
    fn resolve_overlay_screen_rect_clamps_size_to_at_least_one_pixel() {
        // 0 幅/高さの CreateWindowExW は未定義動作になりやすいので、
        // 最低 1px を保証する。
        let (_, _, width, height) =
            resolve_overlay_screen_rect(0, 0, 0.0, 0.0, 0.0, 0.0, 1.0, 0);
        assert_eq!((width, height), (1, 1));
    }

    #[test]
    fn resolve_overlay_screen_rect_scales_view_rect_by_dpi_factor() {
        // 150% スケール（144 DPI）では contract の view rect（論理ピクセル）
        // を 1.5 倍してから owner のクライアント原点（物理ピクセル）へ足す。
        // owner_client_height_px も物理ピクセルで渡され、bottom-left → top-left
        // 変換は物理ピクセル同士で行う。
        let (x, y, width, height) =
            resolve_overlay_screen_rect(100, 200, 12.0, 34.0, 600.0, 400.0, 1.5, 900);
        assert_eq!((x, y, width, height), (100 + 18, 200 + (900 - 51 - 600), 900, 600));
    }

    #[test]
    fn resolve_overlay_screen_rect_flips_bottom_left_contract_y_to_top_left_screen_y() {
        // buildNativeOverlayAttachRect の実例を模した回帰テスト:
        // contentHeight=800, viewportRect.top=100, height=600
        // -> contract.view_y = 800 - 100 - 600 = 100 (bottom-left 前提)
        // owner のクライアント高さも 800 (dpi=1.0) のとき、
        // 本来のウィンドウ内 top-left y は 100 に戻らなければならない。
        let contract_view_y = 800.0 - 100.0 - 600.0;
        let (_, y, _, _) =
            resolve_overlay_screen_rect(0, 0, 0.0, contract_view_y, 600.0, 600.0, 1.0, 800);
        assert_eq!(y, 100);
    }

    #[test]
    fn dpi_scale_factor_from_dpi_maps_96_to_one() {
        assert_eq!(dpi_scale_factor_from_dpi(96), 1.0);
    }

    #[test]
    fn dpi_scale_factor_from_dpi_maps_144_to_one_point_five() {
        assert_eq!(dpi_scale_factor_from_dpi(144), 1.5);
    }

    #[test]
    fn dpi_scale_factor_from_dpi_treats_zero_as_no_scale() {
        // GetDpiForWindow は失敗時に 0 を返すことがある。フォールバックとして
        // 100% スケール扱いにし、overlay サイズが 0 化するのを防ぐ。
        assert_eq!(dpi_scale_factor_from_dpi(0), 1.0);
    }
}
