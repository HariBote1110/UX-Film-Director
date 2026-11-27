//! Windows で「透過 overlay が実際に下の内容と合成されて見えるか」を確かめる。
//!
//! 1つの WS_EX_NOREDIRECTIONBITMAP ウィンドウの DirectComposition visual tree に
//!   下: 不透明の市松模様（wgpu swapchain, alpha_mode = Opaque）
//!   上: 3バンド（不透明の緑 / premultiplied 50% 青 / 完全透明）（alpha_mode = PreMultiplied）
//! を積み、DWM が合成した結果を PrintWindow(PW_RENDERFULLCONTENT) で取得する。
//! 透明バンドで下の市松が見えれば、透過合成が効いている。

use std::ffi::c_void;
use windows::core::{w, Interface};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::DirectComposition::{
    DCompositionCreateDevice, IDCompositionDevice, IDCompositionTarget, IDCompositionVisual,
};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC, SelectObject,
    BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HDC,
};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, PeekMessageW, RegisterClassW, ShowWindow,
    TranslateMessage, MSG, PM_REMOVE, SW_SHOWNOACTIVATE, WNDCLASSW, WS_EX_NOACTIVATE,
    WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT, WS_POPUP,
};

const W: u32 = 600;
const H: u32 = 400;

extern "system" fn wndproc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
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
    let class = WNDCLASSW {
        lpfnWndProc: Some(wndproc),
        hInstance: hinstance.into(),
        lpszClassName: w!("UXFDProbeComposite"),
        ..Default::default()
    };
    RegisterClassW(&class);

    let hwnd = CreateWindowExW(
        WS_EX_NOREDIRECTIONBITMAP | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
        w!("UXFDProbeComposite"),
        w!("composite"),
        WS_POPUP,
        120,
        120,
        W as i32,
        H as i32,
        None,
        None,
        hinstance,
        None,
    )
    .expect("CreateWindowExW failed");
    let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    pump(200);

    let dcomp: IDCompositionDevice =
        DCompositionCreateDevice(None).expect("DCompositionCreateDevice failed");
    let target: IDCompositionTarget = dcomp
        .CreateTargetForHwnd(hwnd, true)
        .expect("CreateTargetForHwnd failed");
    let root: IDCompositionVisual = dcomp.CreateVisual().expect("CreateVisual(root) failed");
    let bottom: IDCompositionVisual = dcomp.CreateVisual().expect("CreateVisual(bottom) failed");
    let top: IDCompositionVisual = dcomp.CreateVisual().expect("CreateVisual(top) failed");
    target.SetRoot(&root).expect("SetRoot failed");
    root.AddVisual(&bottom, false, None).expect("AddVisual(bottom) failed");
    // 参照 visual を明示して「bottom の前面」に置く。None + insertAbove の
    // 解釈はリスト順の向きに依存して紛らわしいため使わない。
    root.AddVisual(&top, true, &bottom).expect("AddVisual(top) failed");

    let mut desc = wgpu::InstanceDescriptor::new_without_display_handle();
    desc.backends = wgpu::Backends::DX12;
    let instance = wgpu::Instance::new(desc);

    let surface_bottom = instance
        .create_surface_unsafe(wgpu::SurfaceTargetUnsafe::CompositionVisual(
            bottom.as_raw() as *mut c_void
        ))
        .expect("create_surface_unsafe(bottom) failed");
    let surface_top = instance
        .create_surface_unsafe(wgpu::SurfaceTargetUnsafe::CompositionVisual(
            top.as_raw() as *mut c_void
        ))
        .expect("create_surface_unsafe(top) failed");

    let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::HighPerformance,
        compatible_surface: Some(&surface_top),
        force_fallback_adapter: false,
        apply_limit_buckets: false,
    }))
    .expect("no adapter");
    let (device, queue) =
        pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default()))
            .expect("request_device failed");

    let format = wgpu::TextureFormat::Bgra8Unorm;
    let make_config = |alpha| wgpu::SurfaceConfiguration {
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        format,
        width: W,
        height: H,
        present_mode: wgpu::PresentMode::Fifo,
        alpha_mode: alpha,
        color_space: wgpu::SurfaceColorSpace::Srgb,
        view_formats: vec![],
        desired_maximum_frame_latency: 2,
    };
    surface_bottom.configure(&device, &make_config(wgpu::CompositeAlphaMode::Opaque));
    surface_top.configure(&device, &make_config(wgpu::CompositeAlphaMode::PreMultiplied));
    println!("bottom = Opaque, top = PreMultiplied : configured");

    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: None,
        source: wgpu::ShaderSource::Wgsl(SHADER.into()),
    });
    let make_pipeline = |entry: &str| {
        device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
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
                entry_point: Some(entry),
                targets: &[Some(format.into())],
                compilation_options: Default::default(),
            }),
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        })
    };
    let pipeline_checker = make_pipeline("fs_checker");
    let pipeline_bands = make_pipeline("fs_bands");

    for (surface, pipeline, label) in [
        (&surface_bottom, &pipeline_checker, "bottom"),
        (&surface_top, &pipeline_bands, "top"),
    ] {
        let frame = match surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(t) | wgpu::CurrentSurfaceTexture::Suboptimal(t) => t,
            other => panic!("get_current_texture({label}) failed: {other:?}"),
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
            pass.set_pipeline(pipeline);
            pass.draw(0..3, 0..1);
        }
        queue.submit(Some(encoder.finish()));
        queue.present(frame);
    }
    dcomp.Commit().expect("Commit failed");
    pump(1500);

    const PW_RENDERFULLCONTENT: u32 = 0x00000002;
    let px = print_window(hwnd, W as i32, H as i32, PRINT_WINDOW_FLAGS(PW_RENDERFULLCONTENT));

    println!("--- composited pixels (y=100) ---");
    for (label, x) in [
        ("opaque green band", 100u32),
        ("50% blue over checker", 300),
        ("transparent -> checker", 520),
    ] {
        let idx = ((100 * W + x) * 4) as usize;
        println!(
            "{label:24} x={x:3} -> R={:3} G={:3} B={:3}",
            px[idx + 2],
            px[idx + 1],
            px[idx]
        );
    }

    let mut rgba = Vec::with_capacity((W * H * 4) as usize);
    for c in px.chunks_exact(4) {
        rgba.extend_from_slice(&[c[2], c[1], c[0], 255]);
    }
    let path = r"C:\Users\gzabu\uxfd-win-probe\composite.png";
    image::save_buffer(path, &rgba, W, H, image::ColorType::Rgba8).expect("save png failed");
    println!("saved: {path}");
}

unsafe fn print_window(hwnd: HWND, w: i32, h: i32, flags: PRINT_WINDOW_FLAGS) -> Vec<u8> {
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
    if !PrintWindow(hwnd, mem, flags).as_bool() {
        println!("  (PrintWindow returned FALSE)");
    }
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
fn fs_checker(@builtin(position) c: vec4<f32>) -> @location(0) vec4<f32> {
    let cell = vec2<i32>(i32(c.x) / 40, i32(c.y) / 40);
    if ((cell.x + cell.y) % 2 == 0) {
        return vec4<f32>(1.0, 0.0, 1.0, 1.0);   // マゼンタ
    }
    return vec4<f32>(1.0, 1.0, 0.0, 1.0);       // イエロー
}

@fragment
fn fs_bands(@builtin(position) c: vec4<f32>) -> @location(0) vec4<f32> {
    let x = c.x / 600.0;
    if (x < 0.333) {
        return vec4<f32>(0.0, 1.0, 0.0, 1.0);   // 不透明の緑
    } else if (x < 0.666) {
        return vec4<f32>(0.0, 0.0, 0.5, 0.5);   // premultiplied 50% 青
    }
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);       // 完全透明
}
"#;
