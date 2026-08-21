//! Windows 実機で DX12 の composition-visual surface が透過 alpha を
//! 受け付けるかを確かめる使い捨てプローブ。
//! 対象: UX Film Director が使っている wgpu 0.20 系。

use std::ffi::c_void;
use windows::core::Interface;
use windows::Win32::Graphics::DirectComposition::{
    DCompositionCreateDevice, IDCompositionDevice, IDCompositionVisual,
};

fn main() {
    println!("== probe: wgpu 0.20 / DX12 composition visual ==");

    let dcomp_device: IDCompositionDevice =
        unsafe { DCompositionCreateDevice(None).expect("DCompositionCreateDevice failed") };
    let visual: IDCompositionVisual =
        unsafe { dcomp_device.CreateVisual().expect("CreateVisual failed") };
    let visual_ptr = visual.as_raw() as *mut c_void;
    println!("IDCompositionVisual = {visual_ptr:p}");

    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: wgpu::Backends::DX12,
        flags: wgpu::InstanceFlags::default(),
        dx12_shader_compiler: wgpu::Dx12Compiler::default(),
        gles_minor_version: wgpu::Gles3MinorVersion::default(),
    });

    let surface = unsafe {
        instance.create_surface_unsafe(wgpu::SurfaceTargetUnsafe::CompositionVisual(visual_ptr))
    }
    .expect("create_surface_unsafe(CompositionVisual) failed");

    let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::HighPerformance,
        compatible_surface: Some(&surface),
        force_fallback_adapter: false,
    }))
    .expect("no adapter");

    let info = adapter.get_info();
    println!("adapter: {} / {:?} / {:?}", info.name, info.backend, info.device_type);
    println!("driver: {} {}", info.driver, info.driver_info);

    let caps = surface.get_capabilities(&adapter);
    println!("formats       = {:?}", caps.formats);
    println!("present_modes = {:?}", caps.present_modes);
    println!("ALPHA_MODES   = {:?}", caps.alpha_modes);

    let (device, _queue) = pollster::block_on(adapter.request_device(
        &wgpu::DeviceDescriptor {
            label: Some("probe device"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::default(),
        },
        None,
    ))
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
