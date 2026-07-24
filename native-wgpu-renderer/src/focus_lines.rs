use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;

use bytemuck::{Pod, Zeroable};
use serde::Deserialize;
use uxfd_rust_core::{focus_lines_frame_bucket, generated_particle_unit};
use wgpu::util::DeviceExt;

const FOCUS_LINES_CACHE_IDLE_FRAME_LIMIT: u64 = 30;
const FOCUS_LINES_CACHE_MAX_BYTES: usize = 512 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct NativeFocusLinesSource {
    pub source: String,
    pub width: u32,
    pub height: u32,
    pub source_frame: u64,
    pub config_revision: u64,
}

#[derive(Debug, Deserialize)]
struct FocusLinesParams {
    generator: String,
    ray_width: f32,
    gap: f32,
    centre_radius: f32,
    rotation_degrees: f32,
    centre_x: f32,
    centre_y: f32,
    centre_jitter_percent: f32,
    seed: i64,
    keyframe_interval: u64,
    line_colour: String,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct FocusLinesUniform {
    dimensions: [f32; 2],
    _padding: [f32; 2],
    colour: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct FocusLinesQuad {
    points: [[f32; 2]; 4],
}

struct FocusLinesTextureEntry {
    config_revision: u64,
    texture: wgpu::Texture,
    width: u32,
    height: u32,
    byte_len: usize,
    idle_frames: u64,
}

#[derive(Default)]
struct FocusLinesTextureCache {
    entries: HashMap<String, FocusLinesTextureEntry>,
    order: VecDeque<String>,
    total_bytes: usize,
}

pub(crate) struct FocusLinesGpuRenderer {
    pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    cache: Mutex<FocusLinesTextureCache>,
    #[cfg(test)]
    texture_creations: std::sync::atomic::AtomicU64,
    #[cfg(test)]
    render_passes: std::sync::atomic::AtomicU64,
}

impl FocusLinesGpuRenderer {
    pub(crate) fn new(device: &wgpu::Device) -> Self {
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("UXFD FocusLinesPlus bind group layout"),
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
            ],
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("UXFD FocusLinesPlus pipeline layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("UXFD FocusLinesPlus shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("focus_lines.wgsl").into()),
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("UXFD FocusLinesPlus pipeline"),
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
        });
        Self {
            pipeline,
            bind_group_layout,
            cache: Mutex::new(FocusLinesTextureCache::default()),
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
        source: &NativeFocusLinesSource,
    ) -> Result<(wgpu::TextureView, u32, u32), String> {
        let mut cache = self
            .cache
            .lock()
            .map_err(|_| "FocusLinesPlus cache mutex is poisoned.".to_string())?;
        if let Some(entry) = cache.entries.get_mut(media_id) {
            if entry.config_revision == source.config_revision
                && entry.width == source.width
                && entry.height == source.height
            {
                entry.idle_frames = 0;
                let hit = (
                    entry
                        .texture
                        .create_view(&wgpu::TextureViewDescriptor::default()),
                    entry.width,
                    entry.height,
                );
                touch_cache_order(&mut cache.order, media_id);
                return Ok(hit);
            }
        }

        let params: FocusLinesParams = serde_json::from_str(&source.source)
            .map_err(|error| format!("Invalid FocusLinesPlus source JSON: {error}"))?;
        validate_source(source, &params)?;
        let colour = parse_colour(&params.line_colour)?;
        let quads = build_quads(source, &params);
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("UXFD FocusLinesPlus source texture"),
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
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let uniform = FocusLinesUniform {
            dimensions: [source.width as f32, source.height as f32],
            _padding: [0.0; 2],
            colour,
        };
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("UXFD FocusLinesPlus uniform"),
            contents: bytemuck::bytes_of(&uniform),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let quad_buffer_contents: &[FocusLinesQuad] = if quads.is_empty() {
            &[FocusLinesQuad::zeroed()]
        } else {
            &quads
        };
        let quad_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("UXFD FocusLinesPlus quads"),
            contents: bytemuck::cast_slice(quad_buffer_contents),
            usage: wgpu::BufferUsages::STORAGE,
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("UXFD FocusLinesPlus bind group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: quad_buffer.as_entire_binding(),
                },
            ],
        });
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("UXFD FocusLinesPlus source encoder"),
        });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("UXFD FocusLinesPlus source pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
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
            if !quads.is_empty() {
                pass.set_pipeline(&self.pipeline);
                pass.set_bind_group(0, &bind_group, &[]);
                pass.draw(0..6, 0..quads.len() as u32);
            }
        }
        queue.submit(Some(encoder.finish()));

        let byte_len = source.width as usize * source.height as usize * 4;
        if let Some(previous) = cache.entries.remove(media_id) {
            cache.total_bytes = cache.total_bytes.saturating_sub(previous.byte_len);
        }
        cache.total_bytes = cache.total_bytes.saturating_add(byte_len);
        cache.entries.insert(
            media_id.to_string(),
            FocusLinesTextureEntry {
                config_revision: source.config_revision,
                texture,
                width: source.width,
                height: source.height,
                byte_len,
                idle_frames: 0,
            },
        );
        touch_cache_order(&mut cache.order, media_id);
        evict_over_budget(&mut cache);
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
            let stale_media_ids = cache
                .entries
                .iter_mut()
                .filter_map(|(media_id, entry)| {
                    if touched_media_ids.contains(media_id) {
                        entry.idle_frames = 0;
                        None
                    } else {
                        entry.idle_frames = entry.idle_frames.saturating_add(1);
                        (entry.idle_frames > FOCUS_LINES_CACHE_IDLE_FRAME_LIMIT)
                            .then(|| media_id.clone())
                    }
                })
                .collect::<Vec<_>>();
            for media_id in stale_media_ids {
                remove_cache_entry(&mut cache, &media_id);
            }
            evict_over_budget(&mut cache);
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

fn validate_source(
    source: &NativeFocusLinesSource,
    params: &FocusLinesParams,
) -> Result<(), String> {
    if source.width == 0 || source.height == 0 {
        return Err("FocusLinesPlus dimensions must be positive.".to_string());
    }
    if params.generator != "focus-lines-plus"
        || !params.ray_width.is_finite()
        || !(0.1..=10.0).contains(&params.ray_width)
        || !params.gap.is_finite()
        || !(1.0..=20.0).contains(&params.gap)
        || !params.centre_radius.is_finite()
        || !(0.0..=800.0).contains(&params.centre_radius)
        || !params.rotation_degrees.is_finite()
        || !(-720.0..=720.0).contains(&params.rotation_degrees)
        || !params.centre_x.is_finite()
        || !params.centre_y.is_finite()
        || !params.centre_jitter_percent.is_finite()
        || !(0.0..=100.0).contains(&params.centre_jitter_percent)
    {
        return Err("FocusLinesPlus parameters are invalid.".to_string());
    }
    Ok(())
}

fn build_quads(source: &NativeFocusLinesSource, params: &FocusLinesParams) -> Vec<FocusLinesQuad> {
    let max_x = params.centre_x.max(source.width as f32 - params.centre_x);
    let max_y = params.centre_y.max(source.height as f32 - params.centre_y);
    let outer_radius = (max_x * max_x + max_y * max_y).sqrt() * 1.25;
    let rotation = params.rotation_degrees.to_radians();
    let frame_bucket = focus_lines_frame_bucket(params.keyframe_interval, source.source_frame);
    let seed = (params.seed as u64).wrapping_add(frame_bucket.wrapping_mul(0x517c_c1b7_2722_0a95));
    let centre_jitter_radius = params.centre_radius * params.centre_jitter_percent / 100.0;
    let jitter_angle = generated_particle_unit(seed, 0, 21) * std::f32::consts::TAU;
    let jitter_distance = generated_particle_unit(seed, 0, 22) * centre_jitter_radius;
    let centre_x = params.centre_x + jitter_angle.cos() * jitter_distance;
    let centre_y = params.centre_y + jitter_angle.sin() * jitter_distance;

    let mut quads = Vec::new();
    let mut cursor = 0.0_f32;
    let mut index = 1_u32;
    while cursor <= 100.0 && index < 512 {
        let gap = generated_particle_unit(seed, index, 0) * params.gap;
        let ray_width = generated_particle_unit(seed, index, 1) * params.ray_width;
        let start = cursor + gap;
        let end = (start + ray_width).min(100.0);
        if end > start {
            let start_angle = rotation + std::f32::consts::TAU * start / 100.0;
            let end_angle = rotation + std::f32::consts::TAU * end / 100.0;
            let mid_angle = (start_angle + end_angle) * 0.5;
            quads.push(FocusLinesQuad {
                points: [
                    [
                        centre_x + params.centre_radius * mid_angle.cos(),
                        centre_y + params.centre_radius * mid_angle.sin(),
                    ],
                    [
                        centre_x + outer_radius * start_angle.cos(),
                        centre_y + outer_radius * start_angle.sin(),
                    ],
                    [
                        centre_x + outer_radius * mid_angle.cos(),
                        centre_y + outer_radius * mid_angle.sin(),
                    ],
                    [
                        centre_x + outer_radius * end_angle.cos(),
                        centre_y + outer_radius * end_angle.sin(),
                    ],
                ],
            });
        }
        cursor = end;
        index += 1;
    }
    quads
}

fn parse_colour(raw: &str) -> Result<[f32; 4], String> {
    let value = raw.trim().strip_prefix('#').unwrap_or(raw.trim());
    if value.len() != 6 {
        return Err(format!("Invalid FocusLinesPlus colour '{raw}'."));
    }
    let parse = |range: std::ops::Range<usize>| {
        u8::from_str_radix(&value[range], 16)
            .map(|channel| channel as f32 / 255.0)
            .map_err(|_| format!("Invalid FocusLinesPlus colour '{raw}'."))
    };
    Ok([parse(0..2)?, parse(2..4)?, parse(4..6)?, 1.0])
}

fn touch_cache_order(order: &mut VecDeque<String>, media_id: &str) {
    order.retain(|candidate| candidate != media_id);
    order.push_back(media_id.to_string());
}

fn remove_cache_entry(cache: &mut FocusLinesTextureCache, media_id: &str) {
    if let Some(entry) = cache.entries.remove(media_id) {
        cache.total_bytes = cache.total_bytes.saturating_sub(entry.byte_len);
    }
    cache.order.retain(|candidate| candidate != media_id);
}

fn evict_over_budget(cache: &mut FocusLinesTextureCache) {
    while cache.total_bytes > FOCUS_LINES_CACHE_MAX_BYTES {
        let Some(media_id) = cache.order.pop_front() else {
            break;
        };
        if let Some(entry) = cache.entries.remove(&media_id) {
            cache.total_bytes = cache.total_bytes.saturating_sub(entry.byte_len);
        }
    }
}
