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
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, RegisterClassW, ShowWindow, CS_HREDRAW, CS_VREDRAW,
    SW_SHOWNOACTIVATE, WNDCLASSW, WS_EX_NOACTIVATE, WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW,
    WS_EX_TRANSPARENT, WS_POPUP,
};

use crate::OverlayLayerContract;

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

/// Electron の owner HWND のクライアント原点（スクリーン座標）と、
/// `OverlayLayerContract` のオフセット付き矩形（owner クライアントローカル
/// 座標、top-left origin — Win32 ネイティブの座標系はそもそも flip 不要）
/// から、overlay ウィンドウを置くべきスクリーン座標矩形を解決する純粋関数。
///
/// macOS 側の `resolve_view_local_rect_for_parent_bounds` と同じ役割
/// （attach 時の geometry 解決を実機依存 API から切り離してテストする）を
/// Win32 向けに移したもの。Win32 の座標系は top-left origin で統一されて
/// おり isFlipped 相当の分岐は不要なため、macOS 版より単純になる。
/// 親追従（`WM_MOVE`/`WM_SIZE` resync）は Phase 6 の対象で、ここでは
/// attach 時点の 1 回分の解決だけを提供する。
pub fn resolve_overlay_screen_rect(
    owner_client_origin_x: i32,
    owner_client_origin_y: i32,
    contract_view_x: f64,
    contract_view_y: f64,
    contract_view_width: f64,
    contract_view_height: f64,
) -> (i32, i32, i32, i32) {
    let screen_x = owner_client_origin_x + contract_view_x.round() as i32;
    let screen_y = owner_client_origin_y + contract_view_y.round() as i32;
    let width = contract_view_width.round().max(1.0) as i32;
    let height = contract_view_height.round().max(1.0) as i32;
    (screen_x, screen_y, width, height)
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

/// `attach_native_overlay_inner` の Windows 分岐から呼ばれる。
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
        let (screen_x, screen_y, width, height) = resolve_overlay_screen_rect(
            origin_x,
            origin_y,
            contract.view_x,
            contract.view_y,
            contract.view_width,
            contract.view_height,
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
        Ok((overlay_hwnd, dcomp_device, visual))
    }
}

pub fn detach_overlay_window(native_window_handle: &[u8]) -> Result<(), String> {
    let owner = native_window_handle_to_owner_hwnd(native_window_handle)?;
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
        // Win32 は top-left origin 一本なので macOS の isFlipped 分岐は不要。
        // 単純にオーナーのクライアント原点へ view_x/view_y を足すだけでよい。
        let (x, y, width, height) =
            resolve_overlay_screen_rect(100, 200, 12.0, 34.0, 600.0, 400.0);
        assert_eq!((x, y, width, height), (112, 234, 600, 400));
    }

    #[test]
    fn resolve_overlay_screen_rect_rounds_fractional_view_offsets() {
        let (x, y, width, height) =
            resolve_overlay_screen_rect(0, 0, 12.4, 34.6, 600.4, 400.6);
        assert_eq!((x, y, width, height), (12, 35, 600, 401));
    }

    #[test]
    fn resolve_overlay_screen_rect_clamps_size_to_at_least_one_pixel() {
        // 0 幅/高さの CreateWindowExW は未定義動作になりやすいので、
        // 最低 1px を保証する。
        let (_, _, width, height) = resolve_overlay_screen_rect(0, 0, 0.0, 0.0, 0.0, 0.0);
        assert_eq!((width, height), (1, 1));
    }
}
