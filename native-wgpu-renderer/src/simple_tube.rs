use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;

use bytemuck::{Pod, Zeroable};
use serde::Deserialize;
use wgpu::util::DeviceExt;

const SIMPLE_TUBE_CACHE_IDLE_FRAME_LIMIT: u64 = 30;
const SIMPLE_TUBE_CACHE_MAX_BYTES: usize = 512 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct NativeSimpleTubeSource {
    pub source: String,
    pub width: u32,
    pub height: u32,
    pub config_revision: u64,
}

// R3 で rust-core (`uxfd-rust-core::schema::SimpleTubeObjectFields`) が
// wire フォーマットの正本となった。native-wgpu-renderer は rust-core に
// 依存済みだが、`seed`/`colour_pattern` 等の下流計算が i64・非 Option を
// 前提にしているため、直接 ObjectFields を使わずフィールド名/case のみを
// ここでミラーする（幅/高さは NativeSimpleTubeSource 側で別途保持済みのため
// 未知フィールドとして無視される）。
#[derive(Debug, Deserialize)]
struct SimpleTubeParams {
    radius: f32,
    depth: f32,
    segments: u32,
    rings: u32,
    #[serde(rename = "twistDegrees")]
    twist_degrees: f32,
    #[serde(rename = "randomAmount")]
    random_amount: f32,
    #[serde(rename = "strokeWidth")]
    stroke_width: f32,
    colour: String,
    #[serde(rename = "secondaryColour")]
    secondary_colour: String,
    #[serde(rename = "colourPattern", default = "default_colour_pattern")]
    colour_pattern: String,
    #[serde(rename = "fogStrength", default)]
    fog_strength: f32,
    #[serde(rename = "fogColour", default = "default_fog_colour")]
    fog_colour: String,
    seed: i64,
    torus: bool,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct SimpleTubeLineInstance {
    start: [f32; 2],
    end: [f32; 2],
    radius: f32,
    _padding: [f32; 3],
    colour: [f32; 4],
}

struct SimpleTubeTextureEntry {
    config_revision: u64,
    texture: wgpu::Texture,
    width: u32,
    height: u32,
    byte_len: usize,
    idle_frames: u64,
}

#[derive(Default)]
struct SimpleTubeTextureCache {
    entries: HashMap<String, SimpleTubeTextureEntry>,
    order: VecDeque<String>,
    total_bytes: usize,
}

pub(crate) struct SimpleTubeGpuRenderer {
    pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    cache: Mutex<SimpleTubeTextureCache>,
    #[cfg(test)]
    texture_creations: std::sync::atomic::AtomicU64,
    #[cfg(test)]
    render_passes: std::sync::atomic::AtomicU64,
}

impl SimpleTubeGpuRenderer {
    pub(crate) fn new(device: &wgpu::Device) -> Self {
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("UXFD SimpleTube line bind group layout"),
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
            label: Some("UXFD SimpleTube line pipeline layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("UXFD SimpleTube line shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("hksy_lines.wgsl").into()),
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("UXFD SimpleTube line pipeline"),
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
            cache: Mutex::new(SimpleTubeTextureCache::default()),
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
        source: &NativeSimpleTubeSource,
    ) -> Result<(wgpu::TextureView, u32, u32), String> {
        let mut cache = self
            .cache
            .lock()
            .map_err(|_| "SimpleTube cache mutex is poisoned.".to_string())?;
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

        let params: SimpleTubeParams = serde_json::from_str(&source.source)
            .map_err(|error| format!("Invalid SimpleTube source JSON: {error}"))?;
        validate_source(source, &params)?;
        let instances = build_line_instances(source, &params)?;
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("UXFD SimpleTube source texture"),
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
            label: Some("UXFD SimpleTube dimensions"),
            contents: bytemuck::cast_slice(&dimensions),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let line_buffer_contents: &[SimpleTubeLineInstance] = if instances.is_empty() {
            &[SimpleTubeLineInstance::zeroed()]
        } else {
            &instances
        };
        let line_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("UXFD SimpleTube line instances"),
            contents: bytemuck::cast_slice(line_buffer_contents),
            usage: wgpu::BufferUsages::STORAGE,
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("UXFD SimpleTube line bind group"),
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
            label: Some("UXFD SimpleTube source encoder"),
        });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("UXFD SimpleTube source pass"),
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
            if !instances.is_empty() {
                pass.set_pipeline(&self.pipeline);
                pass.set_bind_group(0, &bind_group, &[]);
                pass.draw(0..6, 0..instances.len() as u32);
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
            SimpleTubeTextureEntry {
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
                        (entry.idle_frames > SIMPLE_TUBE_CACHE_IDLE_FRAME_LIMIT)
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
    source: &NativeSimpleTubeSource,
    params: &SimpleTubeParams,
) -> Result<(), String> {
    if source.width == 0 || source.height == 0 {
        return Err("SimpleTube dimensions must be positive.".to_string());
    }
    if !params.radius.is_finite()
        || !(0.0..=9000.0).contains(&params.radius)
        || !params.depth.is_finite()
        || !(-12000.0..=12000.0).contains(&params.depth)
        || !(3..=128).contains(&params.segments)
        || !(2..=128).contains(&params.rings)
        || !params.twist_degrees.is_finite()
        || !(-1800.0..=1800.0).contains(&params.twist_degrees)
        || !params.random_amount.is_finite()
        || !(-300.0..=300.0).contains(&params.random_amount)
        || !params.stroke_width.is_finite()
        || !(0.0..=200.0).contains(&params.stroke_width)
        || !matches!(params.colour_pattern.as_str(), "single" | "ring" | "depth")
        || !params.fog_strength.is_finite()
        || !(0.0..=1.0).contains(&params.fog_strength)
    {
        return Err("SimpleTube parameters are invalid.".to_string());
    }
    Ok(())
}

fn build_line_instances(
    source: &NativeSimpleTubeSource,
    tube: &SimpleTubeParams,
) -> Result<Vec<SimpleTubeLineInstance>, String> {
    let colour = parse_colour(&tube.colour)?;
    let secondary_colour = parse_colour(&tube.secondary_colour)?;
    let fog_colour = parse_colour(&tube.fog_colour)?;
    let centre_x = source.width as f32 * 0.5;
    let centre_y = source.height as f32 * 0.5;
    let radius_x = (tube.radius - 10.0)
        .max(1.0)
        .min(source.width as f32 * 0.45);
    let radius_y = (radius_x * 0.32).max(1.0).min(source.height as f32 * 0.3);
    let depth = tube.depth.abs().min(source.height as f32 * 0.85);
    let line_radius = (tube.stroke_width.max(0.5) * 0.5).max(0.5);

    if tube.torus {
        return Ok(build_torus_instances(
            tube,
            centre_x,
            centre_y,
            radius_x,
            radius_y,
            line_radius,
            colour,
            secondary_colour,
            fog_colour,
        ));
    }

    let ring_count = tube.rings.max(2);
    let segment_count = tube.segments.max(3);
    let top = centre_y - depth * 0.5;
    let step = depth / (ring_count - 1) as f32;
    let twist_total = tube.twist_degrees.to_radians();
    let mut instances = Vec::new();
    let mut rings = Vec::new();

    for ring_index in 0..ring_count {
        let phase = ring_index as f32 / (ring_count - 1) as f32;
        let y = top + step * ring_index as f32;
        let twist = twist_total * phase;
        let perspective = 0.82 + 0.18 * (1.0 - (phase - 0.5).abs() * 2.0);
        let points = ellipse_points(
            centre_x,
            y,
            radius_x * perspective,
            radius_y * perspective,
            segment_count,
            twist,
            tube.random_amount,
            tube.seed + ring_index as i64,
        );
        let ring_colour = colour_for_ring(
            tube,
            ring_index,
            ring_count,
            colour,
            secondary_colour,
            fog_colour,
        );
        append_closed_ring(&mut instances, &points, ring_colour, line_radius);
        rings.push(points);
    }

    for segment_index in 0..segment_count as usize {
        let depth_colour = colour_for_ring(
            tube,
            segment_index as u32,
            segment_count,
            colour,
            secondary_colour,
            fog_colour,
        );
        for pair in rings.windows(2) {
            instances.push(line_instance(
                pair[0][segment_index],
                pair[1][segment_index],
                line_radius,
                depth_colour,
            ));
        }
    }

    let centre_ring = ellipse_points(
        centre_x,
        centre_y,
        radius_x,
        radius_y,
        segment_count,
        twist_total * 0.5,
        tube.random_amount,
        tube.seed + 10_000,
    );
    let centre_colour = colour_for_ring(
        tube,
        ring_count / 2,
        ring_count,
        colour,
        secondary_colour,
        fog_colour,
    );
    append_closed_ring(&mut instances, &centre_ring, centre_colour, line_radius);
    instances.push(line_instance(
        [centre_x, top],
        [centre_x, top + depth],
        line_radius,
        secondary_colour,
    ));
    Ok(instances)
}

#[allow(clippy::too_many_arguments)]
fn build_torus_instances(
    tube: &SimpleTubeParams,
    centre_x: f32,
    centre_y: f32,
    radius_x: f32,
    radius_y: f32,
    line_radius: f32,
    colour: [f32; 4],
    secondary_colour: [f32; 4],
    fog_colour: [f32; 4],
) -> Vec<SimpleTubeLineInstance> {
    let segment_count = tube.segments.max(3);
    let ring_count = tube.rings.max(2);
    let outer_radius_x = radius_x.min(centre_x * 0.8);
    let outer_radius_y = radius_y.max(1.0).min(centre_y * 0.44);
    let points = ellipse_points(
        centre_x,
        centre_y,
        outer_radius_x,
        outer_radius_y,
        segment_count,
        tube.twist_degrees.to_radians(),
        tube.random_amount,
        tube.seed,
    );
    let mut instances = Vec::new();
    let ring_colour = colour_for_ring(tube, 0, 1, colour, secondary_colour, fog_colour);
    append_closed_ring(&mut instances, &points, ring_colour, line_radius);
    for ring_index in 0..ring_count {
        let phase = ring_index as f32 / ring_count as f32;
        let angle = phase * std::f32::consts::TAU;
        let point = [
            centre_x + outer_radius_x * angle.cos(),
            centre_y + outer_radius_y * angle.sin(),
        ];
        let spoke_colour = colour_for_ring(
            tube,
            ring_index,
            ring_count,
            colour,
            secondary_colour,
            fog_colour,
        );
        instances.push(line_instance(
            [centre_x, centre_y],
            point,
            line_radius,
            spoke_colour,
        ));
    }
    instances
}

fn append_closed_ring(
    instances: &mut Vec<SimpleTubeLineInstance>,
    points: &[[f32; 2]],
    colour: [f32; 4],
    radius: f32,
) {
    for pair in points.windows(2) {
        instances.push(line_instance(pair[0], pair[1], radius, colour));
    }
    if let (Some(first), Some(last)) = (points.first(), points.last()) {
        instances.push(line_instance(*last, *first, radius, colour));
    }
}

fn ellipse_points(
    centre_x: f32,
    centre_y: f32,
    radius_x: f32,
    radius_y: f32,
    segment_count: u32,
    twist: f32,
    random_amount: f32,
    seed: i64,
) -> Vec<[f32; 2]> {
    (0..segment_count)
        .map(|index| {
            let angle = (index as f32 / segment_count as f32) * std::f32::consts::TAU + twist;
            let jitter = if random_amount.abs() <= f32::EPSILON {
                0.0
            } else {
                deterministic_signed_noise(seed, index as i64) * random_amount * 0.01
            };
            let scale = (1.0 + jitter).max(0.1);
            [
                centre_x + angle.cos() * radius_x * scale,
                centre_y + angle.sin() * radius_y * scale,
            ]
        })
        .collect()
}

fn colour_for_ring(
    tube: &SimpleTubeParams,
    index: u32,
    count: u32,
    colour: [f32; 4],
    secondary_colour: [f32; 4],
    fog_colour: [f32; 4],
) -> [f32; 4] {
    let pattern_colour = match tube.colour_pattern.as_str() {
        "ring" if index % 2 == 1 => secondary_colour,
        "depth" => {
            let amount = if count <= 1 {
                0.0
            } else {
                index as f32 / (count - 1) as f32
            };
            mix_colour_u8(colour, secondary_colour, amount)
        }
        _ => colour,
    };
    mix_colour_u8(pattern_colour, fog_colour, tube.fog_strength)
}

fn mix_colour_u8(left: [f32; 4], right: [f32; 4], amount: f32) -> [f32; 4] {
    let amount = amount.clamp(0.0, 1.0);
    let mix_channel = |index: usize| {
        let left = (left[index] * 255.0).round();
        let right = (right[index] * 255.0).round();
        ((left * (1.0 - amount) + right * amount).round() / 255.0).clamp(0.0, 1.0)
    };
    [mix_channel(0), mix_channel(1), mix_channel(2), 1.0]
}

fn deterministic_signed_noise(seed: i64, index: i64) -> f32 {
    let mut value = (seed as u64)
        .wrapping_mul(6364136223846793005)
        .wrapping_add(index as u64)
        .wrapping_add(1442695040888963407);
    value ^= value >> 33;
    value = value.wrapping_mul(0xff51afd7ed558ccd);
    value ^= value >> 33;
    let unit = (value & 0xffff) as f32 / 65535.0;
    unit * 2.0 - 1.0
}

fn line_instance(
    start: [f32; 2],
    end: [f32; 2],
    radius: f32,
    colour: [f32; 4],
) -> SimpleTubeLineInstance {
    SimpleTubeLineInstance {
        start,
        end,
        radius,
        _padding: [0.0; 3],
        colour,
    }
}

fn parse_colour(raw: &str) -> Result<[f32; 4], String> {
    let value = raw.trim().strip_prefix('#').unwrap_or(raw.trim());
    if value.len() != 6 {
        return Err(format!("Invalid SimpleTube colour '{raw}'."));
    }
    let parse = |range: std::ops::Range<usize>| {
        u8::from_str_radix(&value[range], 16)
            .map(|channel| channel as f32 / 255.0)
            .map_err(|_| format!("Invalid SimpleTube colour '{raw}'."))
    };
    Ok([parse(0..2)?, parse(2..4)?, parse(4..6)?, 1.0])
}

fn default_colour_pattern() -> String {
    "single".to_string()
}

fn default_fog_colour() -> String {
    "#ffffff".to_string()
}

fn touch_cache_order(order: &mut VecDeque<String>, media_id: &str) {
    order.retain(|candidate| candidate != media_id);
    order.push_back(media_id.to_string());
}

fn remove_cache_entry(cache: &mut SimpleTubeTextureCache, media_id: &str) {
    if let Some(entry) = cache.entries.remove(media_id) {
        cache.total_bytes = cache.total_bytes.saturating_sub(entry.byte_len);
    }
    cache.order.retain(|candidate| candidate != media_id);
}

fn evict_over_budget(cache: &mut SimpleTubeTextureCache) {
    while cache.total_bytes > SIMPLE_TUBE_CACHE_MAX_BYTES {
        let Some(media_id) = cache.order.pop_front() else {
            break;
        };
        if let Some(entry) = cache.entries.remove(&media_id) {
            cache.total_bytes = cache.total_bytes.saturating_sub(entry.byte_len);
        }
    }
}
