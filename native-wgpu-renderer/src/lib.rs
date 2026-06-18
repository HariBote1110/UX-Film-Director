use half::f16;
use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::mpsc;
use std::time::{Duration, Instant};
use uxfd_golden_harness::{RgbaFrame, RgbaFrameError};
use uxfd_rust_core::{Effect, SamplingMode, SceneSnapshot};
use uxfd_shared_memory_spike::PosixSharedRing;
use uxfd_sidecar_protocol::{
    rgba8_srgb_ring_layout, ColourMetadata, FrameRingLayoutBuildError, SharedFrame,
};
use wgpu::util::DeviceExt;

const OUTPUT_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;
const OUTPUT_BYTES_PER_PIXEL: u32 = 8;
const SOURCE_BYTES_PER_PIXEL: u32 = 4;
const COPY_BYTES_PER_ROW_ALIGNMENT: u32 = 256;

#[derive(Debug)]
pub enum NativeWgpuRenderError {
    AdapterUnavailable,
    RequestDevice(wgpu::RequestDeviceError),
    MissingSource {
        media_id: String,
    },
    SourceSizeMismatch {
        media_id: String,
        expected_width: u32,
        expected_height: u32,
        actual_width: u32,
        actual_height: u32,
    },
    FrameSizeExceedsAdapterLimit {
        width: u32,
        height: u32,
        max_texture_dimension_2d: u32,
    },
    UnsupportedTransform {
        clip_id: String,
    },
    SharedFrameLayout(FrameRingLayoutBuildError),
    SharedMemory(uxfd_shared_memory_spike::PosixShmError),
    BufferMap,
    InvalidFrame(RgbaFrameError),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NativeWgpuFrameStageTimings {
    pub setup: Duration,
    pub source_upload: Duration,
    pub render: Duration,
    pub readback_encode: Duration,
    pub steady_state: Duration,
    pub total: Duration,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeWgpuFrameReport {
    pub width: u32,
    pub height: u32,
    pub frame: RgbaFrame,
    pub timings: NativeWgpuFrameStageTimings,
}

#[derive(Debug)]
pub struct NativeWgpuSharedFrameReport {
    pub ring: PosixSharedRing,
    pub slot_count: u32,
    pub slot_byte_len: u64,
    pub shared_frame: SharedFrame,
    pub timings: NativeWgpuFrameStageTimings,
}

pub async fn render_native_wgpu_frame(
    snapshot: &SceneSnapshot,
    sources: &HashMap<String, RgbaFrame>,
    width: u32,
    height: u32,
) -> Result<RgbaFrame, NativeWgpuRenderError> {
    measure_native_wgpu_frame_stages(snapshot, sources, width, height)
        .await
        .map(|report| report.frame)
}

pub async fn render_native_wgpu_frame_to_shared_ring(
    snapshot: &SceneSnapshot,
    sources: &HashMap<String, RgbaFrame>,
    width: u32,
    height: u32,
    memory_id: &str,
    slot_count: u32,
    pts_frame: u64,
) -> Result<NativeWgpuSharedFrameReport, NativeWgpuRenderError> {
    let report = measure_native_wgpu_frame_stages(snapshot, sources, width, height).await?;
    let colour = ColourMetadata {
        primaries: "bt709".to_string(),
        transfer: "srgb".to_string(),
        matrix: "rgb".to_string(),
        range: "full".to_string(),
    };
    let layout = rgba8_srgb_ring_layout(memory_id, slot_count, width, height, colour)
        .map_err(NativeWgpuRenderError::SharedFrameLayout)?;
    let descriptor = layout.descriptor_for_slot(0).map_err(|error| {
        NativeWgpuRenderError::SharedFrameLayout(FrameRingLayoutBuildError::Layout(error))
    })?;
    let padded = pad_rgba_frame_for_stride(&report.frame, descriptor.stride_bytes)?;
    let slot_byte_len = usize::try_from(descriptor.byte_len)
        .map_err(|_| NativeWgpuRenderError::InvalidFrame(RgbaFrameError::DimensionOverflow))?;
    let ring = PosixSharedRing::create_with_slot_count(memory_id, slot_count, slot_byte_len)
        .map_err(NativeWgpuRenderError::SharedMemory)?;
    ring.write_frame(pts_frame, &padded)
        .map_err(NativeWgpuRenderError::SharedMemory)?;

    Ok(NativeWgpuSharedFrameReport {
        ring,
        slot_count,
        slot_byte_len: descriptor.byte_len,
        shared_frame: SharedFrame {
            descriptor,
            pts_frame,
        },
        timings: report.timings,
    })
}

pub async fn measure_native_wgpu_frame_stages(
    snapshot: &SceneSnapshot,
    sources: &HashMap<String, RgbaFrame>,
    width: u32,
    height: u32,
) -> Result<NativeWgpuFrameReport, NativeWgpuRenderError> {
    let total_start = Instant::now();
    let instance = wgpu::Instance::default();
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None,
            force_fallback_adapter: false,
        })
        .await
        .ok_or(NativeWgpuRenderError::AdapterUnavailable)?;
    let required_limits = required_limits_for_frame(&adapter, width, height)?;
    let (device, queue) = adapter
        .request_device(
            &wgpu::DeviceDescriptor {
                label: Some("UXFD native wgpu device"),
                required_features: wgpu::Features::empty(),
                required_limits,
            },
            None,
        )
        .await
        .map_err(NativeWgpuRenderError::RequestDevice)?;

    let pipeline = create_pipeline(&device);
    let output_texture = create_output_texture(&device, width, height);
    let bind_group_layout = pipeline.get_bind_group_layout(0);
    let readback_buffer = create_readback_buffer(&device, width, height);
    let setup = total_start.elapsed();

    let mut clips = snapshot.clips.clone();
    clips.sort_by_key(|clip| clip.z_index);

    let mut prepared_clips = Vec::with_capacity(clips.len());
    let upload_start = Instant::now();
    for clip in &clips {
        if clip.transform.rotation_degrees != 0.0
            || clip.transform.scale_x <= 0.0
            || clip.transform.scale_y <= 0.0
        {
            return Err(NativeWgpuRenderError::UnsupportedTransform {
                clip_id: clip.clip_id.clone(),
            });
        }

        let source =
            sources
                .get(&clip.media_id)
                .ok_or_else(|| NativeWgpuRenderError::MissingSource {
                    media_id: clip.media_id.clone(),
                })?;
        prepared_clips.push(prepare_clip(
            &device,
            &queue,
            &bind_group_layout,
            source,
            RenderParams {
                opacity: clip.opacity,
                gain: clip
                    .effects
                    .iter()
                    .fold(1.0, |gain, effect| gain * effect_gain(effect)),
                source_width: source.width as f32,
                source_height: source.height as f32,
                translation_x: clip.transform.translation_x,
                translation_y: clip.transform.translation_y,
                scale_x: clip.transform.scale_x,
                scale_y: clip.transform.scale_y,
                sampling_mode: sampling_mode_value(clip.transform.sampling),
                _padding: [0.0; 3],
            },
        ));
    }
    queue.submit(std::iter::empty());
    wait_for_submitted_work(&device, &queue)?;
    let source_upload = upload_start.elapsed();

    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("UXFD native wgpu encoder"),
    });

    let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());
    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("UXFD native wgpu render pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &output_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            occlusion_query_set: None,
            timestamp_writes: None,
        });

        pass.set_pipeline(&pipeline);
        for prepared_clip in &prepared_clips {
            pass.set_bind_group(0, &prepared_clip.bind_group, &[]);
            pass.draw(0..3, 0..1);
        }
    }
    let render_start = Instant::now();
    queue.submit(Some(encoder.finish()));
    wait_for_submitted_work(&device, &queue)?;
    let render = render_start.elapsed();

    let mut readback_encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("UXFD native wgpu readback encoder"),
    });

    let padded_bytes_per_row = padded_bytes_per_row(width);
    readback_encoder.copy_texture_to_buffer(
        wgpu::ImageCopyTexture {
            texture: &output_texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::ImageCopyBuffer {
            buffer: &readback_buffer,
            layout: wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(padded_bytes_per_row),
                rows_per_image: Some(height),
            },
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );

    let readback_encode_start = Instant::now();
    queue.submit(Some(readback_encoder.finish()));
    let frame = readback_to_rgba8(&device, &readback_buffer, width, height)?;
    let readback_encode = readback_encode_start.elapsed();

    Ok(NativeWgpuFrameReport {
        width,
        height,
        frame,
        timings: NativeWgpuFrameStageTimings {
            setup,
            source_upload,
            render,
            readback_encode,
            steady_state: source_upload + render + readback_encode,
            total: total_start.elapsed(),
        },
    })
}

fn pad_rgba_frame_for_stride(
    frame: &RgbaFrame,
    stride_bytes: u32,
) -> Result<Vec<u8>, NativeWgpuRenderError> {
    let row_bytes = frame.width.checked_mul(SOURCE_BYTES_PER_PIXEL).ok_or(
        NativeWgpuRenderError::InvalidFrame(RgbaFrameError::DimensionOverflow),
    )?;
    if stride_bytes < row_bytes {
        return Err(NativeWgpuRenderError::InvalidFrame(
            RgbaFrameError::InvalidByteLength {
                expected: row_bytes as usize,
                actual: stride_bytes as usize,
            },
        ));
    }

    let padded_len = u64::from(stride_bytes)
        .checked_mul(u64::from(frame.height))
        .ok_or(NativeWgpuRenderError::InvalidFrame(
            RgbaFrameError::DimensionOverflow,
        ))?;
    let padded_len = usize::try_from(padded_len)
        .map_err(|_| NativeWgpuRenderError::InvalidFrame(RgbaFrameError::DimensionOverflow))?;
    let mut padded = vec![0; padded_len];
    let row_bytes = row_bytes as usize;
    let stride_bytes = stride_bytes as usize;

    for row in 0..frame.height as usize {
        let source_start = row * row_bytes;
        let source_end = source_start + row_bytes;
        let destination_start = row * stride_bytes;
        let destination_end = destination_start + row_bytes;
        padded[destination_start..destination_end]
            .copy_from_slice(&frame.pixels[source_start..source_end]);
    }

    Ok(padded)
}

struct PreparedClip {
    bind_group: wgpu::BindGroup,
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct RenderParams {
    opacity: f32,
    gain: f32,
    source_width: f32,
    source_height: f32,
    translation_x: f32,
    translation_y: f32,
    scale_x: f32,
    scale_y: f32,
    sampling_mode: f32,
    _padding: [f32; 3],
}

fn sampling_mode_value(sampling: SamplingMode) -> f32 {
    match sampling {
        SamplingMode::Nearest => 0.0,
        SamplingMode::Bilinear => 1.0,
    }
}

fn create_pipeline(device: &wgpu::Device) -> wgpu::RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("UXFD native wgpu shader"),
        source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(include_str!(
            "../../shared-renderer/shaders/solid_composite.wgsl"
        ))),
    });

    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("UXFD native wgpu bind group layout"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: false },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
        ],
    });
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("UXFD native wgpu pipeline layout"),
        bind_group_layouts: &[&bind_group_layout],
        push_constant_ranges: &[],
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("UXFD native wgpu pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: "vs_main",
            buffers: &[],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: "fs_main",
            targets: &[Some(wgpu::ColorTargetState {
                format: OUTPUT_FORMAT,
                blend: Some(wgpu::BlendState {
                    color: wgpu::BlendComponent {
                        src_factor: wgpu::BlendFactor::One,
                        dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                        operation: wgpu::BlendOperation::Add,
                    },
                    alpha: wgpu::BlendComponent {
                        src_factor: wgpu::BlendFactor::One,
                        dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                        operation: wgpu::BlendOperation::Add,
                    },
                }),
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
    })
}

fn required_limits_for_frame(
    adapter: &wgpu::Adapter,
    width: u32,
    height: u32,
) -> Result<wgpu::Limits, NativeWgpuRenderError> {
    let adapter_limits = adapter.limits();
    let required_texture_dimension = width.max(height);
    if required_texture_dimension > adapter_limits.max_texture_dimension_2d {
        return Err(NativeWgpuRenderError::FrameSizeExceedsAdapterLimit {
            width,
            height,
            max_texture_dimension_2d: adapter_limits.max_texture_dimension_2d,
        });
    }

    Ok(wgpu::Limits {
        max_texture_dimension_2d: required_texture_dimension
            .max(wgpu::Limits::downlevel_defaults().max_texture_dimension_2d),
        ..wgpu::Limits::downlevel_defaults()
    })
}

fn create_output_texture(device: &wgpu::Device, width: u32, height: u32) -> wgpu::Texture {
    device.create_texture(&wgpu::TextureDescriptor {
        label: Some("UXFD native wgpu output texture"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: OUTPUT_FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    })
}

fn prepare_clip(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    bind_group_layout: &wgpu::BindGroupLayout,
    source: &RgbaFrame,
    params: RenderParams,
) -> PreparedClip {
    let source_texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("UXFD native wgpu source texture"),
        size: wgpu::Extent3d {
            width: source.width,
            height: source.height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        wgpu::ImageCopyTexture {
            texture: &source_texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &source.pixels,
        wgpu::ImageDataLayout {
            offset: 0,
            bytes_per_row: Some(source.width * SOURCE_BYTES_PER_PIXEL),
            rows_per_image: Some(source.height),
        },
        wgpu::Extent3d {
            width: source.width,
            height: source.height,
            depth_or_array_layers: 1,
        },
    );

    let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("UXFD native wgpu params buffer"),
        contents: bytemuck::bytes_of(&params),
        usage: wgpu::BufferUsages::UNIFORM,
    });

    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("UXFD native wgpu bind group"),
        layout: bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(
                    &source_texture.create_view(&wgpu::TextureViewDescriptor::default()),
                ),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: uniform_buffer.as_entire_binding(),
            },
        ],
    });

    PreparedClip { bind_group }
}

fn create_readback_buffer(device: &wgpu::Device, width: u32, height: u32) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("UXFD native wgpu readback buffer"),
        size: u64::from(padded_bytes_per_row(width) * height),
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    })
}

fn readback_to_rgba8(
    device: &wgpu::Device,
    buffer: &wgpu::Buffer,
    width: u32,
    height: u32,
) -> Result<RgbaFrame, NativeWgpuRenderError> {
    let slice = buffer.slice(..);
    let (sender, receiver) = mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        let _ = sender.send(result);
    });
    device.poll(wgpu::Maintain::Wait);
    receiver
        .recv()
        .map_err(|_| NativeWgpuRenderError::BufferMap)?
        .map_err(|_| NativeWgpuRenderError::BufferMap)?;

    let mapped = slice.get_mapped_range();
    let padded_row = padded_bytes_per_row(width) as usize;
    let unpadded_row = (width * OUTPUT_BYTES_PER_PIXEL) as usize;
    let mut pixels = Vec::with_capacity((width as usize) * (height as usize) * 4);

    for row_index in 0..height as usize {
        let row_start = row_index * padded_row;
        let row = &mapped[row_start..row_start + unpadded_row];
        for pixel in row.chunks_exact(OUTPUT_BYTES_PER_PIXEL as usize) {
            let red = f16::from_le_bytes([pixel[0], pixel[1]]).to_f32();
            let green = f16::from_le_bytes([pixel[2], pixel[3]]).to_f32();
            let blue = f16::from_le_bytes([pixel[4], pixel[5]]).to_f32();
            let alpha = f16::from_le_bytes([pixel[6], pixel[7]]).to_f32();
            pixels.extend(premultiplied_to_straight_rgba8(red, green, blue, alpha));
        }
    }

    drop(mapped);
    buffer.unmap();

    RgbaFrame::from_rgba8(width, height, pixels).map_err(NativeWgpuRenderError::InvalidFrame)
}

fn wait_for_submitted_work(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
) -> Result<(), NativeWgpuRenderError> {
    let (sender, receiver) = mpsc::channel();
    queue.on_submitted_work_done(move || {
        let _ = sender.send(());
    });
    device.poll(wgpu::Maintain::Wait);
    receiver
        .recv()
        .map_err(|_| NativeWgpuRenderError::BufferMap)
}

fn premultiplied_to_straight_rgba8(red: f32, green: f32, blue: f32, alpha: f32) -> [u8; 4] {
    if alpha <= 0.0 {
        return [0, 0, 0, 0];
    }

    [
        linear_to_srgb_u8(red / alpha),
        linear_to_srgb_u8(green / alpha),
        linear_to_srgb_u8(blue / alpha),
        encode_unorm8(alpha),
    ]
}

fn linear_to_srgb_u8(value: f32) -> u8 {
    let linear = value.clamp(0.0, 1.0);
    let encoded = if linear <= 0.003_130_8 {
        linear * 12.92
    } else {
        1.055 * linear.powf(1.0 / 2.4) - 0.055
    };

    encode_unorm8(encoded)
}

fn encode_unorm8(value: f32) -> u8 {
    (value.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn padded_bytes_per_row(width: u32) -> u32 {
    let unpadded = width * OUTPUT_BYTES_PER_PIXEL;
    unpadded.div_ceil(COPY_BYTES_PER_ROW_ALIGNMENT) * COPY_BYTES_PER_ROW_ALIGNMENT
}

fn effect_gain(effect: &Effect) -> f32 {
    match effect {
        Effect::LinearGain { gain } => *gain,
    }
}
