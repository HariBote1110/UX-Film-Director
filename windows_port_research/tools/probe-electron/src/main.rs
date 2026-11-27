//! 実物の Electron(Chromium) ウィンドウの上に overlay を乗せる検証。
//!
//! probe-crosswindow との違いは、下のウィンドウが GDI で描いた代役ではなく
//! **実際に走っている UX Film Director の Chromium ウィンドウ**である点。
//! Chromium 自身も DirectComposition を使っているため、z-order 競合・
//! ちらつき・合成の可否をここで初めて実物で確認できる。

use std::ffi::c_void;
use windows::core::{w, Interface};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::DirectComposition::{
    DCompositionCreateDevice, IDCompositionDevice, IDCompositionTarget, IDCompositionVisual,
};
use windows::Win32::Graphics::Gdi::{
    BitBlt, ClientToScreen, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HDC, SRCCOPY,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, FindWindowW, GetClientRect, PeekMessageW,
    RegisterClassW, SetForegroundWindow, ShowWindow, TranslateMessage, WindowFromPoint, MSG,
    PM_REMOVE, SW_SHOWNOACTIVATE, SW_SHOWNORMAL, WNDCLASSW, WS_EX_NOACTIVATE,
    WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT, WS_POPUP,
};

const OV_W: u32 = 600;
const OV_H: u32 = 400;
const OV_DX: i32 = 60;
const OV_DY: i32 = 60;

/// overlay 用。macOS の `hitTest:` nil 返しに相当する。
/// `WS_EX_TRANSPARENT` だけではヒットテストが抜けないため、`WM_NCHITTEST` に
/// `HTTRANSPARENT` を返して明示的に下のウィンドウへ委ねる。
extern "system" fn overlay_wndproc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    const WM_NCHITTEST: u32 = 0x0084;
    const HTTRANSPARENT: isize = -1;
    if msg == WM_NCHITTEST {
        return LRESULT(HTTRANSPARENT);
    }
    unsafe { DefWindowProcW(hwnd, msg, wp, lp) }
}

fn pump(ms: u64) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(ms);
    let mut msg = MSG::default();
    while std::time::Instant::now() < deadline {
        unsafe {
            while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
}

fn main() {
    unsafe { run() }
}

unsafe fn run() {
    let hinstance = GetModuleHandleW(None).unwrap();
    let overlay_class = WNDCLASSW {
        lpfnWndProc: Some(overlay_wndproc),
        hInstance: hinstance.into(),
        lpszClassName: w!("UXFDCrossOverlay"),
        ..Default::default()
    };
    RegisterClassW(&overlay_class);

    let base = FindWindowW(w!("Chrome_WidgetWin_1"), w!("UX Film Director"))
        .expect("UX Film Director の Chromium ウィンドウが見つからない");
    println!("target (Electron) hwnd = {:?}", base.0);
    let _ = ShowWindow(base, SW_SHOWNORMAL);
    let _ = SetForegroundWindow(base);
    pump(1500);

    let mut origin = POINT { x: 0, y: 0 };
    let _ = ClientToScreen(base, &mut origin);
    let mut client = RECT::default();
    let _ = GetClientRect(base, &mut client);
    println!("base client origin (screen) = ({}, {}), size = {}x{}", origin.x, origin.y, client.right, client.bottom);

    let overlay = CreateWindowExW(
        WS_EX_NOREDIRECTIONBITMAP | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
        w!("UXFDCrossOverlay"),
        w!("overlay"),
        WS_POPUP,
        origin.x + OV_DX,
        origin.y + OV_DY,
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

    let dcomp: IDCompositionDevice =
        DCompositionCreateDevice(None).expect("DCompositionCreateDevice failed");
    let target: IDCompositionTarget = dcomp
        .CreateTargetForHwnd(overlay, true)
        .expect("CreateTargetForHwnd failed");
    let visual: IDCompositionVisual = dcomp.CreateVisual().expect("CreateVisual failed");
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
    let (device, queue) =
        pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default()))
            .expect("request_device failed");

    let format = wgpu::TextureFormat::Bgra8Unorm;
    surface.configure(
        &device,
        &wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: OV_W,
            height: OV_H,
            present_mode: wgpu::PresentMode::Fifo,
            alpha_mode: wgpu::CompositeAlphaMode::PreMultiplied,
            color_space: wgpu::SurfaceColorSpace::Srgb,
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        },
    );

    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: None,
        source: wgpu::ShaderSource::Wgsl(SHADER.into()),
    });
    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: None,
        layout: None,
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

    let frame = match surface.get_current_texture() {
        wgpu::CurrentSurfaceTexture::Success(t) | wgpu::CurrentSurfaceTexture::Suboptimal(t) => t,
        other => panic!("get_current_texture failed: {other:?}"),
    };
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
        pass.draw(0..3, 0..1);
    }
    queue.submit(Some(encoder.finish()));
    queue.present(frame);
    dcomp.Commit().expect("Commit failed");
    pump(1500);

    // ---- クリック透過 (WS_EX_TRANSPARENT) ----
    println!("--- hit test (WindowFromPoint) ---");
    println!("base hwnd = {:?}, overlay hwnd = {:?}", base.0, overlay.0);
    for (label, cx, cy) in [
        ("inside overlay / opaque green", OV_DX + 100, OV_DY + 200),
        ("inside overlay / transparent", OV_DX + 520, OV_DY + 200),
        ("outside overlay", 20, 500),
    ] {
        let p = POINT { x: origin.x + cx, y: origin.y + cy };
        let hit = WindowFromPoint(p);
        let who = if hit == base { "base" } else if hit == overlay { "OVERLAY" } else { "other" };
        println!("{label:32} -> {who} ({:?})", hit.0);
    }

    // ---- 画面キャプチャ（ウィンドウ間合成の結果）----
    let cap_w = client.right;
    let cap_h = client.bottom;
    let px = capture_screen(origin.x, origin.y, cap_w, cap_h);
    println!("--- composited pixels from SCREEN (base-client coords, y=200) ---");
    for (label, x) in [
        ("opaque green", OV_DX + 100),
        ("50% blue over Chromium", OV_DX + 300),
        ("transparent -> Chromium", OV_DX + 520),
        ("outside overlay (Chromium)", 20),
    ] {
        let idx = ((200 * cap_w + x) * 4) as usize;
        println!("{label:24} x={x:4} -> R={:3} G={:3} B={:3}", px[idx + 2], px[idx + 1], px[idx]);
    }
    let mut rgba = Vec::with_capacity((cap_w * cap_h * 4) as usize);
    for c in px.chunks_exact(4) {
        rgba.extend_from_slice(&[c[2], c[1], c[0], 255]);
    }
    let path = r"C:\Users\gzabu\uxfd-win-probe\electron-overlay.png";
    image::save_buffer(path, &rgba, cap_w as u32, cap_h as u32, image::ColorType::Rgba8)
        .expect("save png failed");
    println!("saved: {path}");
    pump(500);
}

unsafe fn capture_screen(x: i32, y: i32, w: i32, h: i32) -> Vec<u8> {
    let screen: HDC = GetDC(None);
    let mem = CreateCompatibleDC(screen);
    let mut info = BITMAPINFO::default();
    info.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: w,
        biHeight: -h,
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        ..Default::default()
    };
    let mut bits: *mut c_void = std::ptr::null_mut();
    let dib = CreateDIBSection(mem, &info, DIB_RGB_COLORS, &mut bits, None, 0)
        .expect("CreateDIBSection failed");
    let old = SelectObject(mem, dib);
    let _ = BitBlt(mem, 0, 0, w, h, screen, x, y, SRCCOPY);
    let out = std::slice::from_raw_parts(bits as *const u8, (w * h * 4) as usize).to_vec();
    SelectObject(mem, old);
    let _ = DeleteObject(dib);
    let _ = DeleteDC(mem);
    ReleaseDC(None, screen);
    out
}

const SHADER: &str = r#"
@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
    return vec4<f32>(p[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) c: vec4<f32>) -> @location(0) vec4<f32> {
    let x = c.x / 600.0;
    if (x < 0.333) {
        return vec4<f32>(0.0, 1.0, 0.0, 1.0);
    } else if (x < 0.666) {
        return vec4<f32>(0.0, 0.0, 0.5, 0.5);
    }
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
}
"#;
