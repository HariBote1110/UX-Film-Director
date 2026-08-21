//! probe-wgpu020 と同じ質問を最新の wgpu 30 に対して投げる。
//! 「wgpu を上げれば DX12 の透過が通るようになるのか」を確定させる。

use std::ffi::c_void;
use windows::core::Interface;
use windows::Win32::Graphics::DirectComposition::{
    DCompositionCreateDevice, IDCompositionDevice, IDCompositionVisual,
};

fn main() {
    println!("== probe: wgpu 30 / DX12 composition visual ==");

    let dcomp_device: IDCompositionDevice =
        unsafe { DCompositionCreateDevice(None).expect("DCompositionCreateDevice failed") };
    let visual: IDCompositionVisual =
        unsafe { dcomp_device.CreateVisual().expect("CreateVisual failed") };
    let visual_ptr = visual.as_raw() as *mut c_void;
    println!("IDCompositionVisual = {visual_ptr:p}");

    let mut desc = wgpu::InstanceDescriptor::new_without_display_handle();
    desc.backends = wgpu::Backends::DX12;
    let instance = wgpu::Instance::new(desc);

    let surface = unsafe {
        instance.create_surface_unsafe(wgpu::SurfaceTargetUnsafe::CompositionVisual(visual_ptr))
    }
    .expect("create_surface_unsafe(CompositionVisual) failed");

    let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::HighPerformance,
        compatible_surface: Some(&surface),
        force_fallback_adapter: false,
        apply_limit_buckets: false,
    }))
    .expect("no adapter");

    let info = adapter.get_info();
    println!("adapter: {} / {:?} / {:?}", info.name, info.backend, info.device_type);

    let caps = surface.get_capabilities(&adapter);
    println!("formats       = {:?}", caps.formats);
    println!("present_modes = {:?}", caps.present_modes);
    println!("ALPHA_MODES   = {:?}", caps.alpha_modes);

    let (device, _queue) =
        pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default()))
            .expect("request_device failed");

    let format = caps.formats[0];
    for mode in [
        wgpu::CompositeAlphaMode::PreMultiplied,
        wgpu::CompositeAlphaMode::PostMultiplied,
        wgpu::CompositeAlphaMode::Inherit,
        wgpu::CompositeAlphaMode::Opaque,
    ] {
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: 256,
            height: 256,
            present_mode: caps.present_modes[0],
            alpha_mode: mode,
            color_space: wgpu::SurfaceColorSpace::Srgb,
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            surface.configure(&device, &config);
        }));
        println!(
            "configure(alpha_mode = {:?}) -> {}",
            mode,
            if result.is_ok() { "OK" } else { "FAILED" }
        );
    }
}
