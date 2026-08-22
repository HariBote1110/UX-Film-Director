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
use std::time::{Duration, Instant};
use uxfd_native_overlay::{
    attach_native_overlay, detach_native_overlay, NativeOverlayAttachPayload,
    NativeOverlayDetachPayload,
};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, FindWindowExW,
    GetWindowRect, PeekMessageW, RegisterClassW, SetWindowPos, TranslateMessage, CS_HREDRAW,
    CS_VREDRAW, MSG, PM_REMOVE, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER, WNDCLASSW, WS_EX_LEFT,
    WS_OVERLAPPEDWINDOW,
};

/// `win32_overlay.rs` の `NATIVE_OVERLAY_WINDOW_CLASS` と同じ値
/// （private const のためテスト側で複製している。変更時は両方直すこと）。
const NATIVE_OVERLAY_WINDOW_CLASS: &str = "UXFDNativeOverlayWindow";

/// テストプロセスにメッセージループが無いと、Phase 6 で追加した
/// `SetWinEventHook(..., WINEVENT_OUTOFCONTEXT)` のコールバックは配送されない
/// （`win32_overlay.rs` の `geometry_resync_win_event_proc` doc 参照）。
/// Electron の実プロセスは常に UI スレッドでメッセージポンプを回しているため
/// この前提は本番では自動的に満たされるが、このスモークテストでは明示的に
/// 短時間だけポンプを回して同じ状況を再現する。
fn pump_messages_briefly(duration: Duration) {
    let deadline = Instant::now() + duration;
    let mut msg = MSG::default();
    unsafe {
        while Instant::now() < deadline {
            while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}

unsafe fn find_overlay_window() -> Option<HWND> {
    let class_name = wide_null(NATIVE_OVERLAY_WINDOW_CLASS);
    FindWindowExW(None, None, PCWSTR(class_name.as_ptr()), None).ok()
}

unsafe fn window_rect(hwnd: HWND) -> RECT {
    let mut rect = RECT::default();
    let _ = GetWindowRect(hwnd, &mut rect);
    rect
}

fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

extern "system" fn owner_wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

#[test]
fn attach_and_detach_native_overlay_round_trip_on_real_hwnd() {
    eprintln!("[w5-hang] stage=test_begin");
    unsafe {
        eprintln!("[w5-hang] stage=get_module_handle_begin");
        let hinstance = GetModuleHandleW(None).expect("GetModuleHandleW failed");
        eprintln!("[w5-hang] stage=get_module_handle_end");
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
        eprintln!("[w5-hang] stage=owner_window_created hwnd={:?}", owner.0);

        let handle_bytes = (owner.0 as usize).to_ne_bytes().to_vec();
        let window_id: u32 = 424_242;

        eprintln!("[w5-hang] stage=attach_call_begin");
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
        eprintln!("[w5-hang] stage=attach_call_end success={}", attach_response.success);

        eprintln!("[w5-hang] stage=detach_call_begin");
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

/// Phase 6（geometry 追従）の実機検証。owner を `SetWindowPos` で実際に
/// 動かし、Phase 6 で追加した `EVENT_OBJECT_LOCATIONCHANGE` resync hook が
/// overlay の HWND を追従させることを確認する。
///
/// `SetWinEventHook(..., WINEVENT_OUTOFCONTEXT)` はフックを登録したスレッド
/// のメッセージキュー経由で配送されるため、[`pump_messages_briefly`] で
/// テストプロセス自身のメッセージポンプを明示的に回す（Electron 本番では
/// UI スレッドが常時ポンプを回しているため不要な工程だが、素の Win32 テスト
/// バイナリではこれが無いとフックが一切発火しない）。
#[test]
fn native_overlay_follows_owner_window_move_via_geometry_resync_hook() {
    unsafe {
        let hinstance = GetModuleHandleW(None).expect("GetModuleHandleW failed");
        let class_name = wide_null("UXFDW6GeometryFollowOwnerWindow");
        let class = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(owner_wndproc),
            hInstance: hinstance.into(),
            lpszClassName: PCWSTR(class_name.as_ptr()),
            ..Default::default()
        };
        let _ = RegisterClassW(&class);

        let title = wide_null("UXFD W6 geometry follow owner");
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
        let window_id: u32 = 424_243;

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

        let overlay = find_overlay_window().expect(
            "overlay window with class UXFDNativeOverlayWindow must exist after a successful attach",
        );
        let initial_rect = window_rect(overlay);
        eprintln!(
            "[w6-geometry-follow] initial overlay rect = ({}, {}, {}, {})",
            initial_rect.left, initial_rect.top, initial_rect.right, initial_rect.bottom
        );

        // owner を大きく動かす。resync が働けば overlay も同じ量だけ移動する
        // はず（owner のクライアント原点 + contract のオフセットは不変）。
        const MOVE_DELTA_X: i32 = 300;
        const MOVE_DELTA_Y: i32 = 150;
        let owner_rect_before = window_rect(owner);
        let target_x = owner_rect_before.left + MOVE_DELTA_X;
        let target_y = owner_rect_before.top + MOVE_DELTA_Y;
        let _ = SetWindowPos(
            owner,
            None,
            target_x,
            target_y,
            0,
            0,
            SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
        );

        // resync hook のコールバックが配送されるまでメッセージポンプを回しつつ
        // ポーリングする（最大 5 秒）。
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut followed_rect = window_rect(overlay);
        while Instant::now() < deadline {
            pump_messages_briefly(Duration::from_millis(100));
            followed_rect = window_rect(overlay);
            let observed_delta_x = followed_rect.left - initial_rect.left;
            let observed_delta_y = followed_rect.top - initial_rect.top;
            if observed_delta_x == MOVE_DELTA_X && observed_delta_y == MOVE_DELTA_Y {
                break;
            }
        }

        eprintln!(
            "[w6-geometry-follow] followed overlay rect = ({}, {}, {}, {})",
            followed_rect.left, followed_rect.top, followed_rect.right, followed_rect.bottom
        );
        assert_eq!(
            followed_rect.left - initial_rect.left,
            MOVE_DELTA_X,
            "overlay must follow the owner window's horizontal move within 5s"
        );
        assert_eq!(
            followed_rect.top - initial_rect.top,
            MOVE_DELTA_Y,
            "overlay must follow the owner window's vertical move within 5s"
        );

        let detach_response = detach_native_overlay(NativeOverlayDetachPayload {
            window_id,
            native_window_handle: Some(Buffer::from(handle_bytes)),
        });
        assert!(
            detach_response.success,
            "detach_native_overlay must succeed after a successful attach, reason={:?}",
            detach_response.reason
        );

        let _ = DestroyWindow(owner);
    }
}

// `PCWSTR` の生存期間に依存するダミー参照を防ぐため、未使用 import 警告を
// 抑止するための no-op。テスト自体は上の2本のみ。
#[allow(dead_code)]
fn _silence_unused_import_lint(_ptr: *mut c_void) {}
