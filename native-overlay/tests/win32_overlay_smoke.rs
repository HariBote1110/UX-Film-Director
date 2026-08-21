#![cfg(target_os = "windows")]

//! Windows 実機スモークテスト（Windows_Port_Plan.md Phase 5 / W5）。
//!
//! Electron の実プロセスを立てず、通常の top-level ウィンドウを「owner」役に
//! 見立てて `attach_native_overlay` / `detach_native_overlay`（`napi` 経由で
//! 公開されている入口そのもの）を実際に叩く。これにより
//! `win32_overlay::attach_overlay_window`（`CreateWindowExW` →
//! `DCompositionCreateDevice` → `CreateTargetForHwnd` → `CreateVisual` →
//! `SetRoot`）と `NativeWgpuLiveSurfaceRenderer::from_hwnd`
//! （`SurfaceTargetUnsafe::CompositionVisual` での wgpu surface 構築）を
//! 実 Windows ハードウェア上で通しで検証する。
//!
//! フル Electron E2E は W5 のスコープ外（計画書に明記）。ここでは
//! attach → detach の 1 往復のみを確認する（present の実測は
//! `windows_port_research/tools/probe-sustained` が別途担当）。

use napi::bindgen_prelude::Buffer;
use std::ffi::c_void;
use uxfd_native_overlay::{
    attach_native_overlay, detach_native_overlay, NativeOverlayAttachPayload,
    NativeOverlayDetachPayload,
};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, RegisterClassW, CS_HREDRAW, CS_VREDRAW,
    WNDCLASSW, WS_EX_LEFT, WS_OVERLAPPEDWINDOW,
};

fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

extern "system" fn owner_wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

#[test]
fn attach_and_detach_native_overlay_round_trip_on_real_hwnd() {
    unsafe {
        let hinstance = GetModuleHandleW(None).expect("GetModuleHandleW failed");
        let class_name = wide_null("UXFDW5SmokeOwnerWindow");
        let class = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(owner_wndproc),
            hInstance: hinstance.into(),
            lpszClassName: PCWSTR(class_name.as_ptr()),
            ..Default::default()
        };
        // 2 回目以降のテスト実行では ERROR_CLASS_ALREADY_EXISTS になるのが
        // 正常系なので戻り値は無視する。
        let _ = RegisterClassW(&class);

        let title = wide_null("UXFD W5 smoke owner");
        let owner: HWND = CreateWindowExW(
            WS_EX_LEFT,
            PCWSTR(class_name.as_ptr()),
            PCWSTR(title.as_ptr()),
            WS_OVERLAPPEDWINDOW,
            0,
            0,
            640,
            480,
            None,
            None,
            hinstance,
            None,
        )
        .expect("CreateWindowExW(owner) failed");
        assert!(!owner.0.is_null(), "owner HWND must be non-null");

        let handle_bytes = (owner.0 as usize).to_ne_bytes().to_vec();
        let window_id: u32 = 424_242;

        let attach_response = attach_native_overlay(NativeOverlayAttachPayload {
            window_id,
            native_window_handle: Some(Buffer::from(handle_bytes.clone())),
            x: 10.0,
            y: 20.0,
            width: 320.0,
            height: 240.0,
            scale_factor: 1.0,
        });
        assert!(
            attach_response.success,
            "attach_native_overlay must succeed on real Windows hardware, reason={:?}",
            attach_response.reason
        );
        assert!(attach_response.attached);

        let detach_response = detach_native_overlay(NativeOverlayDetachPayload {
            window_id,
            native_window_handle: Some(Buffer::from(handle_bytes)),
        });
        assert!(
            detach_response.success,
            "detach_native_overlay must succeed after a successful attach, reason={:?}",
            detach_response.reason
        );
        assert!(!detach_response.attached);

        let _ = DestroyWindow(owner);
    }
}

// `PCWSTR` の生存期間に依存するダミー参照を防ぐため、未使用 import 警告を
// 抑止するための no-op。テスト自体は上の1本のみ。
#[allow(dead_code)]
fn _silence_unused_import_lint(_ptr: *mut c_void) {}
