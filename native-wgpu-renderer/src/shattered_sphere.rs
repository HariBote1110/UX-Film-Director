use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;

use bytemuck::{Pod, Zeroable};
use serde::Deserialize;
use wgpu::util::DeviceExt;

const SHATTERED_SPHERE_CACHE_IDLE_FRAME_LIMIT: u64 = 30;
const SHATTERED_SPHERE_CACHE_MAX_BYTES: usize = 512 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct NativeShatteredSphereSource {
    pub source: String,
    pub width: u32,
    pub height: u32,
    pub source_frame: u64,
    pub config_revision: u64,
}

// shattered_sphere は R3 batch6 で rust-core
// (`uxfd-rust-core::schema::ShatteredSphereObjectFields`) の camelCase wire
// フォーマットへ統一済み。`generator` タグは廃止され、重力も
// `gravityX`/`gravityY`/`gravityZ` の3フィールドに分解されたため、
// この構造体では旧 `[f32; 3]` 表現ではなく個別フィールドで受け取る
// （フィールド名/case のみを rust-core にミラーする）。
#[derive(Debug, Deserialize)]
struct ShatteredSphereParams {
    #[serde(rename = "fractureAmount")]
    fracture_amount: f32,
    delay: f32,
    radius: f32,
    #[serde(rename = "limitDistance")]
    limit_distance: f32,
    thickness: f32,
    #[serde(rename = "fragmentSize")]
    fragment_size: f32,
    #[serde(rename = "randomShape")]
    random_shape: f32,
    speed: f32,
    impact: f32,
    #[serde(rename = "gravityX")]
    gravity_x: f32,
    #[serde(rename = "gravityY")]
    gravity_y: f32,
    #[serde(rename = "gravityZ")]
    gravity_z: f32,
    spin: f32,
    #[serde(rename = "directionDiffusion")]
    direction_diffusion: f32,
    colour: String,
    seed: i64,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct ShatteredSphereUniform {
    dimensions_frame_radius: [f32; 4],
    fracture_delay_thickness_size: [f32; 4],
    motion: [f32; 4],
    gravity_diffusion: [f32; 4],
    colour: [f32; 4],
    seed_grid: [u32; 4],
}

struct ShatteredSphereTextureEntry {
    config_revision: u64,
    source_frame: u64,
    texture: wgpu::Texture,
    width: u32,
    height: u32,
    byte_len: usize,
    idle_frames: u64,
}

#[derive(Default)]
struct ShatteredSphereTextureCache {
    entries: HashMap<String, ShatteredSphereTextureEntry>,
    order: VecDeque<String>,
    total_bytes: usize,
}

pub(crate) struct ShatteredSphereGpuRenderer {
    pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    cache: Mutex<ShatteredSphereTextureCache>,
    #[cfg(test)]
    texture_creations: std::sync::atomic::AtomicU64,
    #[cfg(test)]
    render_passes: std::sync::atomic::AtomicU64,
}

impl ShatteredSphereGpuRenderer {
    pub(crate) fn new(device: &wgpu::Device) -> Self {
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("UXFD ShatteredSphere bind group layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("UXFD ShatteredSphere pipeline layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("UXFD ShatteredSphere shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shattered_sphere.wgsl").into()),
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("UXFD ShatteredSphere pipeline"),
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
            cache: Mutex::new(ShatteredSphereTextureCache::default()),
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
        source: &NativeShatteredSphereSource,
    ) -> Result<(wgpu::TextureView, u32, u32), String> {
        let params: ShatteredSphereParams = serde_json::from_str(&source.source)
            .map_err(|error| format!("Invalid ShatteredSphere source JSON: {error}"))?;
        validate_source(source, &params)?;
        let uniform = build_uniform(source, &params)?;
        let grid_size = uniform.seed_grid[2];
        let instance_count = grid_size
            .checked_mul(grid_size)
            .ok_or_else(|| "ShatteredSphere instance count overflows.".to_string())?;

        let mut cache = self
            .cache
            .lock()
            .map_err(|_| "ShatteredSphere cache mutex is poisoned.".to_string())?;
        let cached = cache.entries.get_mut(media_id).and_then(|entry| {
            if entry.config_revision != source.config_revision
                || entry.width != source.width
                || entry.height != source.height
            {
                return None;
            }

            entry.idle_frames = 0;
            let view = entry
                .texture
                .create_view(&wgpu::TextureViewDescriptor::default());
            let width = entry.width;
            let height = entry.height;
            let render_required = entry.source_frame != source.source_frame;
            entry.source_frame = source.source_frame;
            Some((view, width, height, render_required))
        });

        if let Some((view, width, height, render_required)) = cached {
            if render_required {
                render_source(
                    device,
                    queue,
                    &self.pipeline,
                    &self.bind_group_layout,
                    &view,
                    uniform,
                    instance_count,
                );
                #[cfg(test)]
                self.render_passes
                    .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            }
            touch_cache_order(&mut cache.order, media_id);
            return Ok((view, width, height));
        }

        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("UXFD ShatteredSphere source texture"),
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
        render_source(
            device,
            queue,
            &self.pipeline,
            &self.bind_group_layout,
            &view,
            uniform,
            instance_count,
        );

        let byte_len = source.width as usize * source.height as usize * 4;
        if let Some(previous) = cache.entries.remove(media_id) {
            cache.total_bytes = cache.total_bytes.saturating_sub(previous.byte_len);
        }
        cache.total_bytes = cache.total_bytes.saturating_add(byte_len);
        cache.entries.insert(
            media_id.to_string(),
            ShatteredSphereTextureEntry {
                config_revision: source.config_revision,
                source_frame: source.source_frame,
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
                        (entry.idle_frames > SHATTERED_SPHERE_CACHE_IDLE_FRAME_LIMIT)
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

fn render_source(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    pipeline: &wgpu::RenderPipeline,
    bind_group_layout: &wgpu::BindGroupLayout,
    view: &wgpu::TextureView,
    uniform: ShatteredSphereUniform,
    instance_count: u32,
) {
    let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("UXFD ShatteredSphere uniform"),
        contents: bytemuck::bytes_of(&uniform),
        usage: wgpu::BufferUsages::UNIFORM,
    });
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("UXFD ShatteredSphere bind group"),
        layout: bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: uniform_buffer.as_entire_binding(),
        }],
    });
    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("UXFD ShatteredSphere source encoder"),
    });
    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("UXFD ShatteredSphere source pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view,
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
        pass.set_pipeline(pipeline);
        pass.set_bind_group(0, &bind_group, &[]);
        pass.draw(0..12, 0..instance_count);
    }
    queue.submit(Some(encoder.finish()));
}

fn validate_source(
    source: &NativeShatteredSphereSource,
    params: &ShatteredSphereParams,
) -> Result<(), String> {
    if source.width == 0 || source.height == 0 {
        return Err("ShatteredSphere dimensions must be positive.".to_string());
    }
    if !params.fracture_amount.is_finite()
        || !(0.0..=5000.0).contains(&params.fracture_amount)
        || !params.delay.is_finite()
        || !(0.0..=1000.0).contains(&params.delay)
        || !params.radius.is_finite()
        || !(1.0..=10000.0).contains(&params.radius)
        || !params.limit_distance.is_finite()
        || !(0.0..=10000.0).contains(&params.limit_distance)
        || !params.thickness.is_finite()
        || !(0.0..=1000.0).contains(&params.thickness)
        || !params.fragment_size.is_finite()
        || !(1.0..=1000.0).contains(&params.fragment_size)
        || !params.random_shape.is_finite()
        || !(0.0..=100.0).contains(&params.random_shape)
        || !params.speed.is_finite()
        || !(0.0..=1000.0).contains(&params.speed)
        || !params.impact.is_finite()
        || !(0.0..=1000.0).contains(&params.impact)
        || [params.gravity_x, params.gravity_y, params.gravity_z]
            .iter()
            .any(|value| !value.is_finite() || !(-1000.0..=1000.0).contains(value))
        || !params.spin.is_finite()
        || !(0.0..=1000.0).contains(&params.spin)
        || !params.direction_diffusion.is_finite()
        || !(0.0..=1000.0).contains(&params.direction_diffusion)
    {
        return Err("ShatteredSphere parameters are invalid.".to_string());
    }
    parse_colour(&params.colour).map(|_| ())
}

fn build_uniform(
    source: &NativeShatteredSphereSource,
    params: &ShatteredSphereParams,
) -> Result<ShatteredSphereUniform, String> {
    let radius = params
        .radius
        .min(source.width.min(source.height) as f32 * 0.48)
        .max(1.0);
    let grid_size = ((radius * 2.0) / params.fragment_size)
        .ceil()
        .clamp(2.0, 64.0) as u32;
    let seed = params.seed as u64;
    Ok(ShatteredSphereUniform {
        dimensions_frame_radius: [
            source.width as f32,
            source.height as f32,
            source.source_frame as f32,
            radius,
        ],
        fracture_delay_thickness_size: [
            params.fracture_amount,
            params.delay,
            params.thickness,
            params.fragment_size,
        ],
        motion: [
            params.limit_distance,
            params.speed,
            params.impact,
            params.spin,
        ],
        gravity_diffusion: [
            params.gravity_x,
            params.gravity_y,
            params.direction_diffusion,
            params.random_shape,
        ],
        colour: parse_colour(&params.colour)?,
        seed_grid: [seed as u32, (seed >> 32) as u32, grid_size, 0],
    })
}

fn parse_colour(raw: &str) -> Result<[f32; 4], String> {
    let value = raw.trim().strip_prefix('#').unwrap_or(raw.trim());
    if value.len() != 6 || !value.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err(format!("Invalid ShatteredSphere colour '{raw}'."));
    }
    let parse = |range: std::ops::Range<usize>| {
        u8::from_str_radix(&value[range], 16)
            .map(|channel| channel as f32 / 255.0)
            .map_err(|_| format!("Invalid ShatteredSphere colour '{raw}'."))
    };
    Ok([parse(0..2)?, parse(2..4)?, parse(4..6)?, 1.0])
}

fn touch_cache_order(order: &mut VecDeque<String>, media_id: &str) {
    order.retain(|candidate| candidate != media_id);
    order.push_back(media_id.to_string());
}

fn remove_cache_entry(cache: &mut ShatteredSphereTextureCache, media_id: &str) {
    if let Some(entry) = cache.entries.remove(media_id) {
        cache.total_bytes = cache.total_bytes.saturating_sub(entry.byte_len);
    }
    cache.order.retain(|candidate| candidate != media_id);
}

fn evict_over_budget(cache: &mut ShatteredSphereTextureCache) {
    while cache.total_bytes > SHATTERED_SPHERE_CACHE_MAX_BYTES {
        let Some(media_id) = cache.order.pop_front() else {
            break;
        };
        if let Some(entry) = cache.entries.remove(&media_id) {
            cache.total_bytes = cache.total_bytes.saturating_sub(entry.byte_len);
        }
    }
}
