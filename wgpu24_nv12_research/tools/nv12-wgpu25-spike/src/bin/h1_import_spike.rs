//! H1 spike: does the NV12 IOSurface zero-copy import path
//! (`as_hal` -> `msg_send! newTextureWithDescriptor:iosurface:plane:` ->
//! `wgpu_hal::metal::Device::texture_from_raw` ->
//! `wgpu::Device::create_texture_from_hal`) still work under wgpu = "24.0.5"?
//!
//! Builds an 8x8 synthetic NV12 IOSurface-backed CVPixelBuffer with known
//! Y/Cb/Cr values, imports both planes zero-copy, samples them in a WGSL
//! fragment shader doing BT.709 video-range YCbCr->RGB conversion, renders to
//! an offscreen RGBA8Unorm target, reads it back, and compares against a CPU
//! reference. See wgpu24_nv12_research/notes/h1-hal-import-path.md.

use nv12_wgpu25_spike::{import_nv12_iosurface_textures, SyntheticNv12Buffer};

const WGSL: &str = r#"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> VertexOutput {
    // Fullscreen triangle.
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    var out: VertexOutput;
    let p = positions[index];
    out.position = vec4<f32>(p, 0.0, 1.0);
    out.uv = vec2<f32>((p.x + 1.0) * 0.5, 1.0 - (p.y + 1.0) * 0.5);
    return out;
}

@group(0) @binding(0) var y_tex: texture_2d<f32>;
@group(0) @binding(1) var cbcr_tex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let y_raw = textureSample(y_tex, samp, in.uv).r;
    let cbcr_raw = textureSample(cbcr_tex, samp, in.uv).rg;

    // BT.709, video (limited) range -- matches
    // shared-renderer/shaders/nv12_composite.wgsl::nv12_ycbcr_to_rgb.
    let y_n = clamp((y_raw * 255.0 - 16.0) / 219.0, 0.0, 1.0);
    let cb_n = clamp((cbcr_raw.x * 255.0 - 128.0) / 224.0, -0.5, 0.5);
    let cr_n = clamp((cbcr_raw.y * 255.0 - 128.0) / 224.0, -0.5, 0.5);

    let r = y_n + 1.5748 * cr_n;
    let g = y_n - 0.187324 * cb_n - 0.468124 * cr_n;
    let b = y_n + 1.8556 * cb_n;

    return vec4<f32>(clamp(r, 0.0, 1.0), clamp(g, 0.0, 1.0), clamp(b, 0.0, 1.0), 1.0);
}
"#;

fn cpu_reference_rgb(y_raw: u8, cb_raw: u8, cr_raw: u8) -> [u8; 3] {
    let y = y_raw as f32 / 255.0;
    let cb = cb_raw as f32 / 255.0;
    let cr = cr_raw as f32 / 255.0;

    let y_n = ((y * 255.0 - 16.0) / 219.0).clamp(0.0, 1.0);
    let cb_n = ((cb * 255.0 - 128.0) / 224.0).clamp(-0.5, 0.5);
    let cr_n = ((cr * 255.0 - 128.0) / 224.0).clamp(-0.5, 0.5);

    let r = y_n + 1.5748 * cr_n;
    let g = y_n - 0.187_324 * cb_n - 0.468_124 * cr_n;
    let b = y_n + 1.8556 * cb_n;

    let to_byte = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    [to_byte(r), to_byte(g), to_byte(b)]
}

fn main() {
    pollster::block_on(run());
}

async fn run() {
    // --- known Y/Cb/Cr values (solid colour, matches the production nv12
    // test fixture's style: single Y/Cb/Cr triple filling the whole plane).
    const WIDTH: u32 = 8;
    const HEIGHT: u32 = 8;
    const Y_VALUE: u8 = 180;
    const CB_VALUE: u8 = 90;
    const CR_VALUE: u8 = 200;

    let buffer = SyntheticNv12Buffer::new(
        WIDTH,
        HEIGHT,
        |_row, _col| Y_VALUE,
        |_row, _col| (CB_VALUE, CR_VALUE),
    );
    println!(
        "[h1] built SyntheticNv12Buffer surface_id={} {}x{}",
        buffer.surface_id, buffer.width, buffer.height
    );

    let instance = wgpu::Instance::default();
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None,
            force_fallback_adapter: false,
        })
        .await
        .expect("H1 FALSIFIED: no adapter available");
    println!("[h1] adapter: {:?}", adapter.get_info());

    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor {
            label: Some("h1 spike device"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::default(),
            memory_hints: wgpu::MemoryHints::default(),
            trace: wgpu::Trace::Off,
        })
        .await
        .expect("H1 FALSIFIED: request_device failed");

    // --- H1: zero-copy IOSurface import.
    let (y_texture, cbcr_texture) =
        import_nv12_iosurface_textures(&device, buffer.surface_id, buffer.width, buffer.height)
            .expect("H1 FALSIFIED: import_nv12_iosurface_textures failed");
    println!("[h1] import_nv12_iosurface_textures: OK (zero-copy IOSurface import succeeded)");

    let y_view = y_texture.create_view(&wgpu::TextureViewDescriptor::default());
    let cbcr_view = cbcr_texture.create_view(&wgpu::TextureViewDescriptor::default());
    let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
        mag_filter: wgpu::FilterMode::Nearest,
        min_filter: wgpu::FilterMode::Nearest,
        ..Default::default()
    });

    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("h1 nv12 shader"),
        source: wgpu::ShaderSource::Wgsl(WGSL.into()),
    });

    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("h1 bind group layout"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 2,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                count: None,
            },
        ],
    });

    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("h1 bind group"),
        layout: &bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&y_view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::TextureView(&cbcr_view),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: wgpu::BindingResource::Sampler(&sampler),
            },
        ],
    });

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("h1 pipeline layout"),
        bind_group_layouts: &[&bind_group_layout],
        push_constant_ranges: &[],
    });

    const OUT_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("h1 pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            buffers: &[],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            targets: &[Some(wgpu::ColorTargetState {
                format: OUT_FORMAT,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    });

    let output_texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("h1 output texture"),
        size: wgpu::Extent3d {
            width: WIDTH,
            height: HEIGHT,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: OUT_FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());

    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("h1 encoder"),
    });
    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("h1 render pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &output_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
        });
        pass.set_pipeline(&pipeline);
        pass.set_bind_group(0, &bind_group, &[]);
        pass.draw(0..3, 0..1);
    }

    // Readback: copy to a mappable buffer. 256-byte row alignment applies.
    let bytes_per_pixel = 4u32;
    let unpadded_bytes_per_row = WIDTH * bytes_per_pixel;
    let align = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
    let padded_bytes_per_row = (unpadded_bytes_per_row + align - 1) / align * align;

    let readback_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("h1 readback buffer"),
        size: (padded_bytes_per_row * HEIGHT) as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture: &output_texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: &readback_buffer,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(padded_bytes_per_row),
                rows_per_image: Some(HEIGHT),
            },
        },
        wgpu::Extent3d {
            width: WIDTH,
            height: HEIGHT,
            depth_or_array_layers: 1,
        },
    );

    queue.submit(Some(encoder.finish()));

    let slice = readback_buffer.slice(..);
    let (tx, rx) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        tx.send(result).unwrap();
    });
    device.poll(wgpu::PollType::Wait).expect("H1 FALSIFIED: device.poll failed");
    rx.recv().unwrap().expect("H1 FALSIFIED: buffer map failed");

    let data = slice.get_mapped_range();
    // Sample the centre pixel.
    let px = WIDTH / 2;
    let py = HEIGHT / 2;
    let row_start = (py * padded_bytes_per_row) as usize;
    let pixel_start = row_start + (px * bytes_per_pixel) as usize;
    let actual = [
        data[pixel_start],
        data[pixel_start + 1],
        data[pixel_start + 2],
    ];
    drop(data);
    readback_buffer.unmap();

    let expected = cpu_reference_rgb(Y_VALUE, CB_VALUE, CR_VALUE);

    println!("[h1] readback centre pixel actual={actual:?} expected={expected:?}");

    let tolerance = 2i32;
    let mut all_ok = true;
    for i in 0..3 {
        let diff = (actual[i] as i32 - expected[i] as i32).abs();
        if diff > tolerance {
            all_ok = false;
            println!(
                "[h1] MISMATCH channel {i}: actual={} expected={} diff={diff} (tolerance={tolerance})",
                actual[i], expected[i]
            );
        }
    }

    if all_ok {
        println!("[h1] H1 VERDICT: SUPPORTED (import + render + readback all matched within tolerance {tolerance})");
    } else {
        println!("[h1] H1 VERDICT: FALSIFIED (readback did not match expected values)");
        std::process::exit(1);
    }
}
