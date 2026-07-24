use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;

use bytemuck::{Pod, Zeroable};
use serde::Deserialize;
use uxfd_rust_core::generated_particle_unit;
use wgpu::util::DeviceExt;

const CACHE_IDLE_FRAME_LIMIT: u64 = 30;
const CACHE_MAX_BYTES: usize = 512 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct NativeShakingPolygonSource {
    pub source: String,
    pub width: u32,
    pub height: u32,
    pub source_frame: u64,
    pub config_revision: u64,
}

#[derive(Debug, Deserialize)]
struct ShakingPolygonParams {
    generator: String,
    line_width: u32,
    vertex_count: u32,
    fixed_diameter: u32,
    vertical_distortion_percent: f32,
    repeat_count: u32,
    repeat_frequency: u32,
    fill: bool,
    jitter_range: f32,
    jitter_interval: u32,
    stepped: bool,
    colour: String,
    seed: i64,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct ShakingPolygonTriangle {
    points: [[f32; 2]; 3],
    _padding: [f32; 2],
    colour: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct ShakingPolygonLine {
    start: [f32; 2],
    end: [f32; 2],
    radius: f32,
    _padding: [f32; 3],
    colour: [f32; 4],
}

struct RepeatDrawRange {
    triangle_start: u32,
    triangle_count: u32,
    outline_start: u32,
    outline_count: u32,
    disc_start: u32,
    disc_count: u32,
}

struct ShakingPolygonGeometry {
    triangles: Vec<ShakingPolygonTriangle>,
    lines: Vec<ShakingPolygonLine>,
    repeats: Vec<RepeatDrawRange>,
}

struct TextureEntry {
    config_revision: u64,
    texture: wgpu::Texture,
    width: u32,
    height: u32,
    byte_len: usize,
    idle_frames: u64,
}

#[derive(Default)]
struct TextureCache {
    entries: HashMap<String, TextureEntry>,
    order: VecDeque<String>,
    total_bytes: usize,
}

pub(crate) struct ShakingPolygonGpuRenderer {
    triangle_pipeline: wgpu::RenderPipeline,
    line_pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    cache: Mutex<TextureCache>,
    #[cfg(test)]
    texture_creations: std::sync::atomic::AtomicU64,
    #[cfg(test)]
    render_passes: std::sync::atomic::AtomicU64,
}

impl ShakingPolygonGpuRenderer {
    pub(crate) fn new(device: &wgpu::Device) -> Self {
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("UXFD ShakingPolygon bind group layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
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
            label: Some("UXFD ShakingPolygon pipeline layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });
        let triangle_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("UXFD ShakingPolygon triangle shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shaking_polygon.wgsl").into()),
        });
        let line_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("UXFD ShakingPolygon line shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("hksy_lines.wgsl").into()),
        });
        let make_pipeline = |label, shader: &wgpu::ShaderModule| {
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some(label),
                layout: Some(&pipeline_layout),
                vertex: wgpu::VertexState {
                    module: shader,
                    entry_point: "vs_main",
                    buffers: &[],
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module: shader,
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
            })
        };
        Self {
            triangle_pipeline: make_pipeline(
                "UXFD ShakingPolygon triangle pipeline",
                &triangle_shader,
            ),
            line_pipeline: make_pipeline("UXFD ShakingPolygon line pipeline", &line_shader),
            bind_group_layout,
            cache: Mutex::new(TextureCache::default()),
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
        source: &NativeShakingPolygonSource,
    ) -> Result<(wgpu::TextureView, u32, u32), String> {
        let mut cache = self
            .cache
            .lock()
            .map_err(|_| "ShakingPolygon cache mutex is poisoned.".to_string())?;
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

        let params: ShakingPolygonParams = serde_json::from_str(&source.source)
            .map_err(|error| format!("Invalid ShakingPolygon source JSON: {error}"))?;
        validate_source(source, &params)?;
        let geometry = build_geometry(source, &params)?;
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("UXFD ShakingPolygon source texture"),
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
        let dimensions = [source.width as f32, source.height as f32, 0.0, 0.0];
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("UXFD ShakingPolygon dimensions"),
            contents: bytemuck::cast_slice(&dimensions),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let triangle_data: &[ShakingPolygonTriangle] = if geometry.triangles.is_empty() {
            &[ShakingPolygonTriangle::zeroed()]
        } else {
            &geometry.triangles
        };
        let triangle_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("UXFD ShakingPolygon triangles"),
            contents: bytemuck::cast_slice(triangle_data),
            usage: wgpu::BufferUsages::STORAGE,
        });
        let line_data: &[ShakingPolygonLine] = if geometry.lines.is_empty() {
            &[ShakingPolygonLine::zeroed()]
        } else {
            &geometry.lines
        };
        let line_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("UXFD ShakingPolygon lines"),
            contents: bytemuck::cast_slice(line_data),
            usage: wgpu::BufferUsages::STORAGE,
        });
        let triangle_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("UXFD ShakingPolygon triangle bind group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: triangle_buffer.as_entire_binding(),
                },
            ],
        });
        let line_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("UXFD ShakingPolygon line bind group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: line_buffer.as_entire_binding(),
                },
            ],
        });
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("UXFD ShakingPolygon source encoder"),
        });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("UXFD ShakingPolygon source pass"),
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
            for repeat in &geometry.repeats {
                if repeat.triangle_count > 0 {
                    pass.set_pipeline(&self.triangle_pipeline);
                    pass.set_bind_group(0, &triangle_bind_group, &[]);
                    pass.draw(
                        0..3,
                        repeat.triangle_start..repeat.triangle_start + repeat.triangle_count,
                    );
                }
                pass.set_pipeline(&self.line_pipeline);
                pass.set_bind_group(0, &line_bind_group, &[]);
                pass.draw(
                    0..6,
                    repeat.outline_start..repeat.outline_start + repeat.outline_count,
                );
                pass.draw(
                    0..6,
                    repeat.disc_start..repeat.disc_start + repeat.disc_count,
                );
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
            TextureEntry {
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
                        (entry.idle_frames > CACHE_IDLE_FRAME_LIMIT).then(|| media_id.clone())
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
    source: &NativeShakingPolygonSource,
    params: &ShakingPolygonParams,
) -> Result<(), String> {
    if source.width == 0
        || source.height == 0
        || params.generator != "shaking-polygon"
        || !(1..=100).contains(&params.line_width)
        || !(2..=16).contains(&params.vertex_count)
        || params.fixed_diameter > 2000
        || !params.vertical_distortion_percent.is_finite()
        || !(-100.0..=100.0).contains(&params.vertical_distortion_percent)
        || !(1..=100).contains(&params.repeat_count)
        || params.repeat_frequency == 0
        || !params.jitter_range.is_finite()
        || !(0.0..=2000.0).contains(&params.jitter_range)
        || params.jitter_interval == 0
    {
        return Err("ShakingPolygon parameters are invalid.".to_string());
    }
    Ok(())
}

fn build_geometry(
    source: &NativeShakingPolygonSource,
    params: &ShakingPolygonParams,
) -> Result<ShakingPolygonGeometry, String> {
    let rgb = parse_colour(&params.colour)?;
    let opaque = [rgb[0], rgb[1], rgb[2], 1.0];
    let translucent = [rgb[0], rgb[1], rgb[2], 96.0 / 255.0];
    let centre = (source.width as f32 * 0.5, source.height as f32 * 0.5);
    let base_radius = if params.fixed_diameter > 0 {
        params.fixed_diameter as f32 * 0.5
    } else {
        source.width.min(source.height) as f32 * 0.36
    }
    .min(source.width.min(source.height) as f32 * 0.48);
    let mut triangles = Vec::new();
    let mut lines = Vec::new();
    let mut repeats = Vec::with_capacity(params.repeat_count as usize);

    for repeat_index in 0..params.repeat_count {
        let rotation = if params.repeat_count <= 1 {
            0.0
        } else {
            repeat_index as f32 * std::f32::consts::TAU
                / (params.repeat_count * params.repeat_frequency) as f32
        };
        let points = polygon_points(params, source.source_frame, centre, base_radius, rotation);
        let triangle_start = triangles.len() as u32;
        if params.fill {
            for index in 0..points.len() {
                triangles.push(ShakingPolygonTriangle {
                    points: [
                        centre.into(),
                        points[index].into(),
                        points[(index + 1) % points.len()].into(),
                    ],
                    _padding: [0.0; 2],
                    colour: translucent,
                });
            }
        }
        let outline_start = lines.len() as u32;
        for index in 0..points.len() {
            lines.push(ShakingPolygonLine {
                start: points[index].into(),
                end: points[(index + 1) % points.len()].into(),
                radius: params.line_width as f32 * 0.5,
                _padding: [0.0; 3],
                colour: opaque,
            });
        }
        let disc_start = lines.len() as u32;
        for point in &points {
            lines.push(ShakingPolygonLine {
                start: (*point).into(),
                end: (*point).into(),
                radius: (params.line_width as f32 * 0.55).max(1.0),
                _padding: [0.0; 3],
                colour: opaque,
            });
        }
        repeats.push(RepeatDrawRange {
            triangle_start,
            triangle_count: triangles.len() as u32 - triangle_start,
            outline_start,
            outline_count: points.len() as u32,
            disc_start,
            disc_count: points.len() as u32,
        });
    }
    Ok(ShakingPolygonGeometry {
        triangles,
        lines,
        repeats,
    })
}

fn polygon_points(
    params: &ShakingPolygonParams,
    source_frame: u64,
    centre: (f32, f32),
    base_radius: f32,
    rotation: f32,
) -> Vec<(f32, f32)> {
    let interval = params.jitter_interval.max(1) as u64;
    let phase = source_frame / interval;
    let t = (source_frame % interval) as f32 / interval as f32;
    let eased_t = if params.stepped {
        0.0
    } else {
        t * t * (3.0 - 2.0 * t)
    };
    let vertical_scale = if params.vertical_distortion_percent < 0.0 {
        1.0 + params.vertical_distortion_percent / 100.0
    } else {
        1.0
    };
    let horizontal_scale = if params.vertical_distortion_percent > 0.0 {
        1.0 - params.vertical_distortion_percent / 100.0
    } else {
        1.0
    };
    let seed = params.seed as u64;
    (0..params.vertex_count)
        .map(|index| {
            let base_angle = rotation
                + index as f32 * std::f32::consts::TAU / params.vertex_count as f32
                + if params.vertex_count == 4 {
                    std::f32::consts::FRAC_PI_4
                } else {
                    0.0
                };
            let jitter_x0 = jitter_value(seed, index, phase, 0, params.jitter_range);
            let jitter_y0 = jitter_value(seed, index, phase, 1, params.jitter_range);
            let jitter_x1 = jitter_value(seed, index, phase + 1, 0, params.jitter_range);
            let jitter_y1 = jitter_value(seed, index, phase + 1, 1, params.jitter_range);
            let jitter_x = jitter_x0 + (jitter_x1 - jitter_x0) * eased_t;
            let jitter_y = jitter_y0 + (jitter_y1 - jitter_y0) * eased_t;
            (
                centre.0 + base_angle.sin() * base_radius * horizontal_scale + jitter_x,
                centre.1 - base_angle.cos() * base_radius * vertical_scale + jitter_y,
            )
        })
        .collect()
}

fn jitter_value(seed: u64, vertex_index: u32, phase: u64, lane: u64, range: f32) -> f32 {
    (generated_particle_unit(
        seed,
        vertex_index,
        phase.saturating_mul(13).saturating_add(lane),
    ) * 2.0
        - 1.0)
        * range
}

fn parse_colour(raw: &str) -> Result<[f32; 3], String> {
    let value = raw.trim().strip_prefix('#').unwrap_or(raw.trim());
    if value.len() != 6 {
        return Err(format!("Invalid ShakingPolygon colour '{raw}'."));
    }
    let parse = |range: std::ops::Range<usize>| {
        u8::from_str_radix(&value[range], 16)
            .map(|channel| channel as f32 / 255.0)
            .map_err(|_| format!("Invalid ShakingPolygon colour '{raw}'."))
    };
    Ok([parse(0..2)?, parse(2..4)?, parse(4..6)?])
}

fn touch_cache_order(order: &mut VecDeque<String>, media_id: &str) {
    order.retain(|candidate| candidate != media_id);
    order.push_back(media_id.to_string());
}

fn remove_cache_entry(cache: &mut TextureCache, media_id: &str) {
    if let Some(entry) = cache.entries.remove(media_id) {
        cache.total_bytes = cache.total_bytes.saturating_sub(entry.byte_len);
    }
    cache.order.retain(|candidate| candidate != media_id);
}

fn evict_over_budget(cache: &mut TextureCache) {
    while cache.total_bytes > CACHE_MAX_BYTES {
        let Some(media_id) = cache.order.pop_front() else {
            break;
        };
        if let Some(entry) = cache.entries.remove(&media_id) {
            cache.total_bytes = cache.total_bytes.saturating_sub(entry.byte_len);
        }
    }
}
