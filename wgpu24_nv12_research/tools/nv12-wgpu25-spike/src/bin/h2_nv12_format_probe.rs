//! H2 spike: is wgpu 24's first-class `wgpu::TextureFormat::NV12`
//! (`Features::TEXTURE_FORMAT_NV12`) usable on the Metal backend, as an
//! alternative to the hal-level IOSurface import hack validated in H1?
//!
//! Source reading of wgpu-hal 24.0.4 already strongly suggests "no": the
//! Metal `describe_format` function returns `Tfc::empty()` (zero
//! capabilities) for `Tf::NV12`
//! (wgpu-hal-24.0.4/src/metal/adapter.rs:272), and the pixel-format
//! conversion table has `Tf::NV12 => unreachable!()`
//! (wgpu-hal-24.0.4/src/metal/adapter.rs:1120) -- i.e. the Metal backend
//! never expects to be asked to actually create an NV12 texture. Only the
//! Vulkan and DX12 backends wire up `Tf::NV12` to a real native format
//! (`vulkan/conv.rs:78` -> `G8_B8R8_2PLANE_420_UNORM`,
//! `dx12/adapter.rs:320`).
//!
//! This probe empirically confirms the "no" from the *adapter feature
//! query* side (safe: does not attempt to create an actual NV12 texture,
//! which would hit the `unreachable!()` panic above -- that is a wgpu-hal
//! internal invariant, not something a well-behaved caller should trigger).

fn main() {
    pollster::block_on(run());
}

async fn run() {
    let instance = wgpu::Instance::default();
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None,
            force_fallback_adapter: false,
        })
        .await
        .expect("no adapter available");
    println!("[h2] adapter: {:?}", adapter.get_info());

    let adapter_features = adapter.features();
    let supports_nv12 = adapter_features.contains(wgpu::Features::TEXTURE_FORMAT_NV12);
    println!(
        "[h2] adapter.features().contains(TEXTURE_FORMAT_NV12) = {supports_nv12} \
         (Metal backend; expected false per wgpu-hal-24.0.4/src/metal/adapter.rs:272,1120)"
    );

    if supports_nv12 {
        println!("[h2] H2 VERDICT: unexpectedly SUPPORTED on this Metal adapter -- re-check hal source, hypothesis needs revision");
        return;
    }

    // Confirm request_device actually rejects the feature (belt-and-braces:
    // the adapter query above should already be authoritative, but this
    // shows the *consuming* API also refuses it, matching what a real
    // integration attempt would hit).
    let result = adapter
        .request_device(
            &wgpu::DeviceDescriptor {
                label: Some("h2 nv12-feature probe device"),
                required_features: wgpu::Features::TEXTURE_FORMAT_NV12,
                required_limits: wgpu::Limits::default(),
                memory_hints: wgpu::MemoryHints::default(),
            },
            None,
        )
        .await;

    match result {
        Ok(_) => {
            println!("[h2] H2 VERDICT: unexpectedly SUPPORTED -- request_device succeeded with TEXTURE_FORMAT_NV12 required_features on Metal");
        }
        Err(error) => {
            println!("[h2] request_device with required_features=TEXTURE_FORMAT_NV12 failed as expected: {error}");
            println!("[h2] H2 VERDICT: NOT APPLICABLE on Metal -- wgpu::TextureFormat::NV12 / Features::TEXTURE_FORMAT_NV12 is Vulkan/DX12-only in wgpu-hal 24.0.4; the Metal backend has zero support (Tfc::empty() capabilities, unreachable!() in the format-conversion table). The hal-level IOSurface import path validated in H1 remains the only way to get NV12/biplanar textures on Metal.");
        }
    }
}
