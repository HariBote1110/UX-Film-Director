//! W0: 連続描画の実機検証。
//!
//! これまでの Windows プローブはすべて「1 フレーム描いて止まる」作りで、
//! `Windows_Port_Plan.md` Phase 0 が唯一の未測定リスクとして残していた
//! 「毎フレーム present し続けても破綻しないか」をここで潰す。
//!
//! 実物の Electron(Chromium) ウィンドウの上に overlay を乗せ、以下 4 フェーズを流す。
//!
//! - `baseline` : overlay は存在するが present しない。GPU/CPU の地の値を取るため。
//! - `static`   : 60fps 相当で連続 present。親には触らない。
//! - `move`     : 親ウィンドウを動かし続けながら present。overlay は毎フレーム追従。
//! - `resize`   : 親ウィンドウをリサイズし続けながら present。surface を reconfigure。
//!
//! 各フェーズでフレームタイム分布・acquire/present のブロック時間・z 順・
//! 合成後画素を記録し、最後に要約と CSV を出す。

use std::ffi::c_void;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use windows::core::{w, Interface};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    BitBlt, ClientToScreen, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject,
    GetDC, GetDeviceCaps, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS, HDC, SRCCOPY, VREFRESH,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, EnumWindows, FindWindowW, GetClientRect,
    GetWindowRect, PeekMessageW, RegisterClassW, SetForegroundWindow, SetWindowPos, ShowWindow,
    TranslateMessage, MSG, PM_REMOVE, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
    SW_SHOWNOACTIVATE, SW_SHOWNORMAL, WNDCLASSW, WS_EX_NOACTIVATE, WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW,
    WS_EX_TRANSPARENT, WS_POPUP,
};

const OV_DX: i32 = 60;
const OV_DY: i32 = 60;
const OV_W: u32 = 600;
const OV_H: u32 = 400;

/// 合成後画素を確認する y。上端 20px の可動バーを避ける。
const SAMPLE_Y: i32 = 200;
/// overlay ローカル x。不透明な緑バンドの中。
const SAMPLE_X_OPAQUE: i32 = 100;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Phase {
    Baseline,
    Static,
    ParentMove,
    ParentResize,
}

impl Phase {
    fn name(self) -> &'static str {
        match self {
            Phase::Baseline => "baseline",
            Phase::Static => "static",
            Phase::ParentMove => "move",
            Phase::ParentResize => "resize",
        }
    }
}

struct Sample {
    phase: Phase,
    elapsed_ms: f64,
    acquire_us: u64,
    encode_us: u64,
    present_us: u64,
    frame_us: u64,
}

#[derive(Default)]
struct Checks {
    zorder_ok: u32,
    zorder_bad: u32,
    zorder_unknown: u32,
    pixel_ok: u32,
    pixel_bad: u32,
    pixel_black: u32,
    reconfigures: u32,
    acquire_failures: u32,
    suboptimal: u32,
}

extern "system" fn overlay_wndproc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    const WM_NCHITTEST: u32 = 0x0084;
    const HTTRANSPARENT: isize = -1;
    if msg == WM_NCHITTEST {
        return LRESULT(HTTRANSPARENT);
    }
    unsafe { DefWindowProcW(hwnd, msg, wp, lp) }
}

unsafe fn drain_messages() {
    let mut msg = MSG::default();
    while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
        let _ = TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
}

unsafe fn pump(ms: u64) {
    let deadline = Instant::now() + Duration::from_millis(ms);
    while Instant::now() < deadline {
        drain_messages();
        std::thread::sleep(Duration::from_millis(4));
    }
}

// ---- z 順 ----------------------------------------------------------------

struct ZOrderScan {
    wanted: [HWND; 2],
    found: [Option<usize>; 2],
    index: usize,
}

unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let scan = &mut *(lparam.0 as *mut ZOrderScan);
    for slot in 0..2 {
        if hwnd == scan.wanted[slot] && scan.found[slot].is_none() {
            scan.found[slot] = Some(scan.index);
        }
    }
    scan.index += 1;
    BOOL(1)
}

/// `EnumWindows` は z 順（手前が先）で列挙する。overlay の index が base より
/// 小さければ overlay が手前。どちらかが見つからなければ判定不能とする。
unsafe fn overlay_is_above(overlay: HWND, base: HWND) -> Option<bool> {
    let mut scan = ZOrderScan {
        wanted: [overlay, base],
        found: [None, None],
        index: 0,
    };
    let _ = EnumWindows(Some(enum_proc), LPARAM(&mut scan as *mut _ as isize));
    match (scan.found[0], scan.found[1]) {
        (Some(o), Some(b)) => Some(o < b),
        _ => None,
    }
}

// ---- 画面キャプチャ ------------------------------------------------------

unsafe fn capture_pixel(x: i32, y: i32) -> Option<(u8, u8, u8)> {
    let screen: HDC = GetDC(None);
    if screen.is_invalid() {
        return None;
    }
    let mem = CreateCompatibleDC(screen);
    let mut info = BITMAPINFO::default();
    info.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: 1,
        biHeight: -1,
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        ..Default::default()
    };
    let mut bits: *mut c_void = std::ptr::null_mut();
    let dib = match CreateDIBSection(mem, &info, DIB_RGB_COLORS, &mut bits, None, 0) {
        Ok(handle) => handle,
        Err(_) => {
            let _ = DeleteDC(mem);
            ReleaseDC(None, screen);
            return None;
        }
    };
    let old = SelectObject(mem, dib);
    let blitted = BitBlt(mem, 0, 0, 1, 1, screen, x, y, SRCCOPY).is_ok();
    let px = std::slice::from_raw_parts(bits as *const u8, 4);
    let out = if blitted {
        Some((px[2], px[1], px[0]))
    } else {
        None
    };
    SelectObject(mem, old);
    let _ = DeleteObject(dib);
    let _ = DeleteDC(mem);
    ReleaseDC(None, screen);
    out
}

// ---- 統計 ----------------------------------------------------------------

fn percentile(sorted: &[u64], q: f64) -> u64 {
    if sorted.is_empty() {
        return 0;
    }
    let rank = ((sorted.len() - 1) as f64 * q).round() as usize;
    sorted[rank]
}

fn summarise(label: &str, values: &mut Vec<u64>) -> String {
    if values.is_empty() {
        return format!("{label:10} (no samples)");
    }
    values.sort_unstable();
    let sum: u64 = values.iter().sum();
    format!(
        "{label:10} n={:5} mean={:7.3}ms p50={:7.3} p95={:7.3} p99={:7.3} max={:7.3}",
        values.len(),
        sum as f64 / values.len() as f64 / 1000.0,
        percentile(values, 0.50) as f64 / 1000.0,
        percentile(values, 0.95) as f64 / 1000.0,
        percentile(values, 0.99) as f64 / 1000.0,
        values[values.len() - 1] as f64 / 1000.0,
    )
}

// ---- 本体 ----------------------------------------------------------------


/// nvidia-smi の CSV と突き合わせるための壁時計（epoch ミリ秒）。
fn epoch_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn main() {
    unsafe { run() }
}

unsafe fn run() {
    let args: Vec<String> = std::env::args().collect();
    let secs = |i: usize, default: u64| -> u64 {
        args.get(i)
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(default)
    };
    let baseline_secs = secs(1, 20);
    let static_secs = secs(2, 60);
    let move_secs = secs(3, 45);
    let resize_secs = secs(4, 45);
    let csv_path = args
        .get(5)
        .cloned()
        .unwrap_or_else(|| r"C:\Users\gzabu\uxfd-win-probe\sustained-frames.csv".to_string());
    // RDP 仮想ディスプレイでは refresh が 60Hz にならないため、Fifo だけでは
    // 「60fps 出せるか」を判定できない。Immediate で present 自体の上限も測る。
    let present_mode = match args.get(6).map(String::as_str).unwrap_or("fifo") {
        "immediate" => wgpu::PresentMode::Immediate,
        "mailbox" => wgpu::PresentMode::Mailbox,
        "fifo" => wgpu::PresentMode::Fifo,
        other => panic!("unknown present mode: {other}"),
    };

    let hinstance = GetModuleHandleW(None).unwrap();
    let overlay_class = WNDCLASSW {
        lpfnWndProc: Some(overlay_wndproc),
        hInstance: hinstance.into(),
        lpszClassName: w!("UXFDSustainedOverlay"),
        ..Default::default()
    };
    RegisterClassW(&overlay_class);

    let base = FindWindowW(w!("Chrome_WidgetWin_1"), w!("UX Film Director"))
        .expect("UX Film Director の Chromium ウィンドウが見つからない");
    println!("base (Electron) hwnd = {:?}", base.0);
    let _ = ShowWindow(base, SW_SHOWNORMAL);
    let _ = SetForegroundWindow(base);
    pump(1500);

    let refresh_hz = {
        let screen = GetDC(None);
        let hz = GetDeviceCaps(screen, VREFRESH);
        ReleaseDC(None, screen);
        hz
    };
    println!("display refresh = {refresh_hz} Hz");
    println!("probe start epoch_ms = {}", epoch_ms());
    println!("present mode = {present_mode:?}");

    let mut base_rect = RECT::default();
    let _ = GetWindowRect(base, &mut base_rect);
    let base_origin_x = base_rect.left;
    let base_origin_y = base_rect.top;
    let base_w = base_rect.right - base_rect.left;
    let base_h = base_rect.bottom - base_rect.top;
    println!("base window rect = ({base_origin_x}, {base_origin_y}) {base_w}x{base_h}");

    let mut client_origin = POINT { x: 0, y: 0 };
    let _ = ClientToScreen(base, &mut client_origin);
    let mut base_client0 = RECT::default();
    let _ = GetClientRect(base, &mut base_client0);
    let base_client_w0 = base_client0.right.max(1);
    let base_client_h0 = base_client0.bottom.max(1);
    println!("base client size = {base_client_w0}x{base_client_h0}");

    let overlay = CreateWindowExW(
        WS_EX_NOREDIRECTIONBITMAP | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
        w!("UXFDSustainedOverlay"),
        w!("overlay"),
        WS_POPUP,
        client_origin.x + OV_DX,
        client_origin.y + OV_DY,
        OV_W as i32,
        OV_H as i32,
        base,
        None,
        hinstance,
        None,
    )
    .expect("CreateWindowExW(overlay) failed");
    let _ = ShowWindow(overlay, SW_SHOWNOACTIVATE);
    pump(300);

    let dcomp: windows::Win32::Graphics::DirectComposition::IDCompositionDevice =
        windows::Win32::Graphics::DirectComposition::DCompositionCreateDevice(None)
            .expect("DCompositionCreateDevice failed");
    let target = dcomp
        .CreateTargetForHwnd(overlay, true)
        .expect("CreateTargetForHwnd failed");
    let visual = dcomp.CreateVisual().expect("CreateVisual failed");
    target.SetRoot(&visual).expect("SetRoot failed");

    let mut desc = wgpu::InstanceDescriptor::new_without_display_handle();
    desc.backends = wgpu::Backends::DX12;
    let instance = wgpu::Instance::new(desc);
    let surface = instance
        .create_surface_unsafe(wgpu::SurfaceTargetUnsafe::CompositionVisual(
            visual.as_raw() as *mut c_void
        ))
        .expect("create_surface_unsafe failed");
    let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::HighPerformance,
        compatible_surface: Some(&surface),
        force_fallback_adapter: false,
        apply_limit_buckets: false,
    }))
    .expect("no adapter");
    let info = adapter.get_info();
    println!("adapter = {} / {:?} / {:?}", info.name, info.backend, info.device_type);
    let (device, queue) =
        pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default()))
            .expect("request_device failed");

    let format = wgpu::TextureFormat::Bgra8Unorm;
    let mut surface_w = OV_W;
    let mut surface_h = OV_H;
    let mut configure = |w: u32, h: u32| {
        surface.configure(
            &device,
            &wgpu::SurfaceConfiguration {
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                format,
                width: w.max(1),
                height: h.max(1),
                present_mode,
                alpha_mode: wgpu::CompositeAlphaMode::PreMultiplied,
                color_space: wgpu::SurfaceColorSpace::Srgb,
                view_formats: vec![],
                desired_maximum_frame_latency: 2,
            },
        );
    };
    configure(surface_w, surface_h);

    let uniform = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("probe-uniform"),
        size: 16,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let bind_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: None,
        entries: &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }],
    });
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &bind_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: uniform.as_entire_binding(),
        }],
    });
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: None,
        bind_group_layouts: &[Some(&bind_layout)],
        immediate_size: 0,
    });
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: None,
        source: wgpu::ShaderSource::Wgsl(SHADER.into()),
    });
    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: None,
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs"),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs"),
            targets: &[Some(format.into())],
            compilation_options: Default::default(),
        }),
        primitive: Default::default(),
        depth_stencil: None,
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    });

    let mut samples: Vec<Sample> = Vec::with_capacity(64_000);
    let mut checks = Checks::default();
    let started = Instant::now();
    let mut next_check = Instant::now() + Duration::from_secs(1);
    let mut overlay_x = client_origin.x + OV_DX;
    let mut overlay_y = client_origin.y + OV_DY;

    let phases: [(Phase, u64); 4] = [
        (Phase::Baseline, baseline_secs),
        (Phase::Static, static_secs),
        (Phase::ParentMove, move_secs),
        (Phase::ParentResize, resize_secs),
    ];

    for (phase, duration) in phases {
        let phase_start = Instant::now();
        let phase_end = phase_start + Duration::from_secs(duration);
        println!(
            "--- phase {} start (+{:.1}s, {} s) epoch_ms={} ---",
            phase.name(),
            started.elapsed().as_secs_f64(),
            duration,
            epoch_ms()
        );

        while Instant::now() < phase_end {
            let loop_start = Instant::now();
            drain_messages();

            // 親ウィンドウの操作。1 フェーズ 1 変数にするため move と resize は分ける。
            let phase_t = phase_start.elapsed().as_secs_f64();
            match phase {
                Phase::ParentMove => {
                    let dx = (phase_t * 1.7).sin() * 160.0;
                    let dy = (phase_t * 1.1).cos() * 90.0;
                    let _ = SetWindowPos(
                        base,
                        None,
                        base_origin_x + dx as i32,
                        base_origin_y + dy as i32,
                        0,
                        0,
                        SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOSIZE,
                    );
                }
                Phase::ParentResize => {
                    let scale = 0.75 + 0.25 * (phase_t * 1.3).sin().abs();
                    let _ = SetWindowPos(
                        base,
                        None,
                        0,
                        0,
                        (base_w as f64 * scale) as i32,
                        (base_h as f64 * scale) as i32,
                        SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOMOVE,
                    );
                }
                _ => {}
            }

            // overlay を親の client 原点へ追従させる（W6 の本実装ではなく計測用の毎フレーム再計算）。
            if matches!(phase, Phase::ParentMove | Phase::ParentResize) {
                let mut origin = POINT { x: 0, y: 0 };
                let _ = ClientToScreen(base, &mut origin);
                let mut client = RECT::default();
                let _ = GetClientRect(base, &mut client);
                let want_x = origin.x + OV_DX;
                let want_y = origin.y + OV_DY;
                // overlay は親 client の縮尺に比例させる。move フェーズでは縮尺が 1 のままなので
                // reconfigure は起きず、resize フェーズだけが surface 再構成を踏む（1 フェーズ 1 変数）。
                let sx = client.right.max(1) as f64 / base_client_w0 as f64;
                let sy = client.bottom.max(1) as f64 / base_client_h0 as f64;
                let want_w = ((OV_W as f64 * sx) as i32).clamp(16, 4096) as u32;
                let want_h = ((OV_H as f64 * sy) as i32).clamp(16, 4096) as u32;
                if want_x != overlay_x || want_y != overlay_y || want_w != surface_w || want_h != surface_h {
                    overlay_x = want_x;
                    overlay_y = want_y;
                    let _ = SetWindowPos(
                        overlay,
                        None,
                        want_x,
                        want_y,
                        want_w as i32,
                        want_h as i32,
                        SWP_NOACTIVATE | SWP_NOZORDER,
                    );
                    if want_w != surface_w || want_h != surface_h {
                        surface_w = want_w;
                        surface_h = want_h;
                        configure(surface_w, surface_h);
                        checks.reconfigures += 1;
                    }
                }
            }

            if phase == Phase::Baseline {
                // present しない。地の値を取るだけ。
                std::thread::sleep(Duration::from_millis(8));
            } else {
                queue.write_buffer(
                    &uniform,
                    0,
                    bytemuck_cast(&[
                        started.elapsed().as_secs_f32(),
                        surface_w as f32,
                        surface_h as f32,
                        0.0,
                    ]),
                );

                let acquire_start = Instant::now();
                let frame = match surface.get_current_texture() {
                    wgpu::CurrentSurfaceTexture::Success(texture) => Some(texture),
                    wgpu::CurrentSurfaceTexture::Suboptimal(texture) => {
                        checks.suboptimal += 1;
                        Some(texture)
                    }
                    other => {
                        checks.acquire_failures += 1;
                        eprintln!("get_current_texture failed: {other:?}");
                        configure(surface_w, surface_h);
                        checks.reconfigures += 1;
                        None
                    }
                };
                let acquire_us = acquire_start.elapsed().as_micros() as u64;

                if let Some(frame) = frame {
                    let encode_start = Instant::now();
                    let view = frame.texture.create_view(&Default::default());
                    let mut encoder = device.create_command_encoder(&Default::default());
                    {
                        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                            label: None,
                            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                                view: &view,
                                depth_slice: None,
                                resolve_target: None,
                                ops: wgpu::Operations {
                                    load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                                    store: wgpu::StoreOp::Store,
                                },
                            })],
                            depth_stencil_attachment: None,
                            timestamp_writes: None,
                            occlusion_query_set: None,
                            multiview_mask: None,
                        });
                        pass.set_pipeline(&pipeline);
                        pass.set_bind_group(0, &bind_group, &[]);
                        pass.draw(0..3, 0..1);
                    }
                    queue.submit(Some(encoder.finish()));
                    let encode_us = encode_start.elapsed().as_micros() as u64;

                    let present_start = Instant::now();
                    queue.present(frame);
                    let _ = dcomp.Commit();
                    let present_us = present_start.elapsed().as_micros() as u64;

                    samples.push(Sample {
                        phase,
                        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
                        acquire_us,
                        encode_us,
                        present_us,
                        frame_us: loop_start.elapsed().as_micros() as u64,
                    });
                }
            }

            if Instant::now() >= next_check {
                next_check = Instant::now() + Duration::from_secs(1);
                match overlay_is_above(overlay, base) {
                    Some(true) => checks.zorder_ok += 1,
                    Some(false) => checks.zorder_bad += 1,
                    None => checks.zorder_unknown += 1,
                }
                if phase != Phase::Baseline {
                    match capture_pixel(overlay_x + SAMPLE_X_OPAQUE, overlay_y + SAMPLE_Y) {
                        Some((0, 0, 0)) => checks.pixel_black += 1,
                        Some((r, g, b)) => {
                            if r < 40 && g > 200 && b < 40 {
                                checks.pixel_ok += 1;
                            } else {
                                checks.pixel_bad += 1;
                                eprintln!(
                                    "pixel mismatch at +{:.1}s phase={}: R={r} G={g} B={b}",
                                    started.elapsed().as_secs_f64(),
                                    phase.name()
                                );
                            }
                        }
                        None => checks.pixel_black += 1,
                    }
                }
            }
        }
    }

    // 親ウィンドウを元の位置・サイズへ戻す。
    let _ = SetWindowPos(
        base,
        None,
        base_origin_x,
        base_origin_y,
        base_w,
        base_h,
        SWP_NOACTIVATE | SWP_NOZORDER,
    );

    println!();
    println!("=== summary (display {refresh_hz} Hz, present {present_mode:?}) ===");
    for phase in [Phase::Static, Phase::ParentMove, Phase::ParentResize] {
        let mut frame: Vec<u64> = samples
            .iter()
            .filter(|s| s.phase == phase)
            .map(|s| s.frame_us)
            .collect();
        let mut acquire: Vec<u64> = samples
            .iter()
            .filter(|s| s.phase == phase)
            .map(|s| s.acquire_us)
            .collect();
        let mut present: Vec<u64> = samples
            .iter()
            .filter(|s| s.phase == phase)
            .map(|s| s.present_us)
            .collect();
        let fps = if frame.is_empty() {
            0.0
        } else {
            1_000_000.0 / (frame.iter().sum::<u64>() as f64 / frame.len() as f64)
        };
        println!("[{}] mean fps = {:.2}", phase.name(), fps);
        println!("  {}", summarise("frame", &mut frame));
        println!("  {}", summarise("acquire", &mut acquire));
        println!("  {}", summarise("present", &mut present));
    }
    println!();
    println!(
        "z-order   above={} below={} unknown={}",
        checks.zorder_ok, checks.zorder_bad, checks.zorder_unknown
    );
    println!(
        "pixel     ok={} mismatch={} black/unavailable={}",
        checks.pixel_ok, checks.pixel_bad, checks.pixel_black
    );
    println!(
        "surface   reconfigures={} acquire_failures={} suboptimal={}",
        checks.reconfigures, checks.acquire_failures, checks.suboptimal
    );

    let mut csv = String::from("phase,elapsed_ms,acquire_us,encode_us,present_us,frame_us\n");
    for sample in &samples {
        csv.push_str(&format!(
            "{},{:.3},{},{},{},{}\n",
            sample.phase.name(),
            sample.elapsed_ms,
            sample.acquire_us,
            sample.encode_us,
            sample.present_us,
            sample.frame_us
        ));
    }
    match std::fs::write(&csv_path, csv) {
        Ok(()) => println!("csv saved: {csv_path} ({} rows)", samples.len()),
        Err(error) => eprintln!("csv write failed ({csv_path}): {error}"),
    }
}

/// 依存を増やさないための最小の f32 配列 -> バイト列変換。
fn bytemuck_cast(values: &[f32; 4]) -> &[u8] {
    unsafe { std::slice::from_raw_parts(values.as_ptr() as *const u8, 16) }
}

const SHADER: &str = r#"
struct Uniforms {
    time: f32,
    width: f32,
    height: f32,
    _pad: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
    return vec4<f32>(p[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) c: vec4<f32>) -> @location(0) vec4<f32> {
    // 上端 20px は可動バー。フレームが実際に更新されているかを目視・録画で確認する。
    if (c.y < 20.0) {
        let bar = fract(u.time * 0.5) * u.width;
        if (abs(c.x - bar) < 12.0) {
            return vec4<f32>(1.0, 1.0, 1.0, 1.0);
        }
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
    // 以下は固定バンド。画素チェックはここを見る。
    let x = c.x / u.width;
    if (x < 0.333) {
        return vec4<f32>(0.0, 1.0, 0.0, 1.0);
    } else if (x < 0.666) {
        return vec4<f32>(0.0, 0.0, 0.5, 0.5);
    }
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
}
"#;
