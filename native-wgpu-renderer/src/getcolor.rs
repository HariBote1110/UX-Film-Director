use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use bytemuck::{Pod, Zeroable};
use serde::Deserialize;
use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::generated_particle_unit;
use wgpu::util::DeviceExt;

const GETCOLOR_CACHE_IDLE_FRAME_LIMIT: u64 = 30;
const GETCOLOR_MAX_INSTANCE_COUNT: usize = 512 * 512;

#[derive(Debug, Clone)]
pub struct NativeGetColorSource {
    pub source: String,
    pub sample_frame: Option<Arc<RgbaFrame>>,
    pub width: u32,
    pub height: u32,
    pub config_revision: u64,
}

#[derive(Debug, Deserialize)]
struct GetColorParams {
    columns: u32,
    rows: u32,
    dot_size: f32,
    #[serde(default)]
    dot_shape: Option<String>,
    #[serde(default)]
    stroke_width: Option<f32>,
    size_influence: f32,
    luminance_influence: f32,
    hue_shift_degrees: f32,
    alternate_rows: bool,
    foreground_colour: String,
    secondary_colour: String,
    background_colour: String,
    #[serde(default)]
    sample_strength: Option<f32>,
    #[serde(default)]
    sample_hue_shift_degrees: Option<f32>,
    seed: i64,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct GetColorUniform {
    dimensions: [f32; 2],
    sample_dimensions: [f32; 2],
    stroke_width: f32,
    dot_shape: u32,
    sample_strength: f32,
    sample_hue_shift_degrees: f32,
    has_sample: u32,
    _padding: [u32; 3],
    background: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct GetColorInstance {
    centre: [f32; 2],
    radius: f32,
    u: f32,
    v: f32,
    _padding: [f32; 3],
    fallback_colour: [f32; 4],
}

struct GetColorTextureEntry {
    config_revision: u64,
    texture: wgpu::Texture,
    width: u32,
    height: u32,
    idle_frames: u64,
}

#[derive(Default)]
struct GetColorTextureCache {
    entries: HashMap<String, GetColorTextureEntry>,
}

pub(crate) struct GetColorGpuRenderer {
    pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    cache: Mutex<GetColorTextureCache>,
    #[cfg(test)]
    texture_creations: std::sync::atomic::AtomicU64,
    #[cfg(test)]
    render_passes: std::sync::atomic::AtomicU64,
}

impl GetColorGpuRenderer {
    pub(crate) fn new(device: &wgpu::Device) -> Self {
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("UXFD GetColor source bind group layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
            ],
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("UXFD GetColor source pipeline layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("UXFD GetColor source shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("getcolor.wgsl").into()),
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("UXFD GetColor source pipeline"),
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
                    format: wgpu::TextureFormat::Rgba8Unorm,
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
        Self {
            pipeline,
            bind_group_layout,
            cache: Mutex::new(GetColorTextureCache::default()),
            #[cfg(test)]
            texture_creations: std::sync::atomic::AtomicU64::new(0),
            #[cfg(test)]
            render_passes: std::sync::atomic::AtomicU64::new(0),
        }
    }

    pub(crate) fn prepare(
        &self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        media_id: &str,
        source: &NativeGetColorSource,
    ) -> Result<(wgpu::TextureView, u32, u32), String> {
        let mut cache = self
            .cache
            .lock()
            .map_err(|_| "GetColor cache mutex is poisoned.".to_string())?;
        if let Some(entry) = cache.entries.get_mut(media_id) {
            if entry.config_revision == source.config_revision
                && entry.width == source.width
                && entry.height == source.height
            {
                entry.idle_frames = 0;
                return Ok((
                    entry
                        .texture
                        .create_view(&wgpu::TextureViewDescriptor::default()),
                    entry.width,
                    entry.height,
                ));
            }
        }

        let params: GetColorParams = serde_json::from_str(&source.source)
            .map_err(|error| format!("Invalid GetColor source JSON: {error}"))?;
        validate_source(source, &params)?;
        let instances = build_instances(source, &params)?;
        let fallback = RgbaFrame::from_rgba8(1, 1, vec![0, 0, 0, 0])
            .map_err(|error| format!("GetColor fallback sample is invalid: {error:?}"))?;
        let sample = source.sample_frame.as_deref().unwrap_or(&fallback);
        let sample_texture = upload_sample_texture(device, queue, sample);
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("UXFD GetColor source texture"),
            size: wgpu::Extent3d {
                width: source.width,
                height: source.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let uniform = GetColorUniform {
            dimensions: [source.width as f32, source.height as f32],
            sample_dimensions: [sample.width as f32, sample.height as f32],
            stroke_width: params.stroke_width.unwrap_or(0.0),
            dot_shape: match params.dot_shape.as_deref() {
                Some("square") => 1,
                Some("diamond") => 2,
                _ => 0,
            },
            sample_strength: params.sample_strength.unwrap_or(1.0).clamp(0.0, 1.0),
            sample_hue_shift_degrees: params
                .sample_hue_shift_degrees
                .unwrap_or(0.0)
                .clamp(-720.0, 720.0),
            has_sample: u32::from(source.sample_frame.is_some()),
            _padding: [0; 3],
            background: parse_colour(&params.background_colour)?,
        };
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("UXFD GetColor uniform"),
            contents: bytemuck::bytes_of(&uniform),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let instance_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("UXFD GetColor dot instances"),
            contents: bytemuck::cast_slice(&instances),
            usage: wgpu::BufferUsages::STORAGE,
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let sample_view = sample_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("UXFD GetColor bind group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: instance_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&sample_view),
                },
            ],
        });
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("UXFD GetColor source encoder"),
        });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("UXFD GetColor source pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: uniform.background[0] as f64,
                            g: uniform.background[1] as f64,
                            b: uniform.background[2] as f64,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                occlusion_query_set: None,
                timestamp_writes: None,
            });
            if !instances.is_empty() {
                pass.set_pipeline(&self.pipeline);
                pass.set_bind_group(0, &bind_group, &[]);
                pass.draw(0..6, 0..instances.len() as u32);
            }
        }
        queue.submit(Some(encoder.finish()));
        cache.entries.insert(
            media_id.to_string(),
            GetColorTextureEntry {
                config_revision: source.config_revision,
                texture,
                width: source.width,
                height: source.height,
                idle_frames: 0,
            },
        );
        #[cfg(test)]
        {
            self.texture_creations
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            self.render_passes
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        }
        Ok((view, source.width, source.height))
    }

    pub(crate) fn finish_frame(&self, touched_media_ids: &HashSet<String>) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.entries.retain(|media_id, entry| {
                if touched_media_ids.contains(media_id) {
                    entry.idle_frames = 0;
                    true
                } else {
                    entry.idle_frames = entry.idle_frames.saturating_add(1);
                    entry.idle_frames <= GETCOLOR_CACHE_IDLE_FRAME_LIMIT
                }
            });
        }
    }

    #[cfg(test)]
    pub(crate) fn stats(&self) -> (u64, u64) {
        (
            self.texture_creations
                .load(std::sync::atomic::Ordering::Relaxed),
            self.render_passes
                .load(std::sync::atomic::Ordering::Relaxed),
        )
    }
}

fn validate_source(source: &NativeGetColorSource, params: &GetColorParams) -> Result<(), String> {
    if source.width == 0 || source.height == 0 {
        return Err("GetColor dimensions must be positive.".to_string());
    }
    let instance_count = params.columns as usize * params.rows as usize;
    if params.columns == 0
        || params.rows == 0
        || instance_count == 0
        || instance_count > GETCOLOR_MAX_INSTANCE_COUNT
    {
        return Err("GetColor grid must contain at most 512x512 dots.".to_string());
    }
    if !params.dot_size.is_finite()
        || !params.size_influence.is_finite()
        || !params.luminance_influence.is_finite()
        || !params.hue_shift_degrees.is_finite()
    {
        return Err("GetColor numeric parameters must be finite.".to_string());
    }
    Ok(())
}

fn build_instances(
    source: &NativeGetColorSource,
    params: &GetColorParams,
) -> Result<Vec<GetColorInstance>, String> {
    if params.dot_size <= 0.0 {
        return Ok(Vec::new());
    }
    let foreground = parse_colour(&params.foreground_colour)?;
    let secondary = parse_colour(&params.secondary_colour)?;
    let cell_width = source.width as f32 / params.columns as f32;
    let cell_height = source.height as f32 / params.rows as f32;
    let max_radius = (cell_width.min(cell_height) * 0.48).max(0.5);
    let base_radius = (params.dot_size * 0.5).min(max_radius);
    let mut instances = Vec::with_capacity(params.columns as usize * params.rows as usize);
    for row in 0..params.rows {
        for column in 0..params.columns {
            let index = row.saturating_mul(params.columns).saturating_add(column);
            let u = if params.columns > 1 {
                column as f32 / (params.columns - 1) as f32
            } else {
                0.5
            };
            let v = if params.rows > 1 {
                row as f32 / (params.rows - 1) as f32
            } else {
                0.5
            };
            let random = generated_particle_unit(params.seed as u64, index, 11);
            let hue_wave =
                ((u + params.hue_shift_degrees / 360.0) * std::f32::consts::TAU).sin() * 0.5 + 0.5;
            let luminance = ((u * 0.35) + ((1.0 - v) * 0.35) + (random * 0.2) + (hue_wave * 0.1))
                .clamp(0.0, 1.0);
            let radius_factor = (1.0 - params.size_influence)
                + params.size_influence * (0.35 + luminance * params.luminance_influence);
            let radius = (base_radius * radius_factor).clamp(0.5, max_radius);
            let offset_x = if params.alternate_rows && row % 2 == 1 {
                cell_width * 0.5
            } else {
                0.0
            };
            let centre_x = (column as f32 + 0.5) * cell_width + offset_x;
            if centre_x >= source.width as f32 {
                continue;
            }
            instances.push(GetColorInstance {
                centre: [centre_x, (row as f32 + 0.5) * cell_height],
                radius,
                u,
                v,
                _padding: [0.0; 3],
                fallback_colour: if luminance >= 0.55 {
                    foreground
                } else {
                    secondary
                },
            });
        }
    }
    Ok(instances)
}

fn upload_sample_texture(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    sample: &RgbaFrame,
) -> wgpu::Texture {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("UXFD GetColor sample texture"),
        size: wgpu::Extent3d {
            width: sample.width,
            height: sample.height,
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
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &sample.pixels,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(sample.width * 4),
            rows_per_image: Some(sample.height),
        },
        wgpu::Extent3d {
            width: sample.width,
            height: sample.height,
            depth_or_array_layers: 1,
        },
    );
    texture
}

fn parse_colour(raw: &str) -> Result<[f32; 4], String> {
    let value = raw.trim().strip_prefix('#').unwrap_or(raw.trim());
    if value.len() != 6 {
        return Err(format!("Invalid GetColor colour '{raw}'."));
    }
    let parse = |range: std::ops::Range<usize>| {
        u8::from_str_radix(&value[range], 16)
            .map(|channel| channel as f32 / 255.0)
            .map_err(|_| format!("Invalid GetColor colour '{raw}'."))
    };
    Ok([parse(0..2)?, parse(2..4)?, parse(4..6)?, 1.0])
}
