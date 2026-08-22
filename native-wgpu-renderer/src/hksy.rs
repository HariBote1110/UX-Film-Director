use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;

use bytemuck::{Pod, Zeroable};
use serde::Deserialize;
use wgpu::util::DeviceExt;

const HKSY_CACHE_IDLE_FRAME_LIMIT: u64 = 30;
const HKSY_CACHE_MAX_BYTES: usize = 512 * 1024 * 1024;
const HKSY_MAX_PALETTE_COLOURS: usize = 16;
const HKSY_MAX_ANCHOR_POINTS: usize = 16;

#[derive(Debug, Clone)]
pub struct NativeHksySource {
    pub source: String,
    pub width: u32,
    pub height: u32,
    pub config_revision: u64,
}

#[derive(Debug, Clone, Copy, Deserialize)]
struct HksyAnchorPoint {
    x: f32,
    y: f32,
}

// hksy_checker_grid は R3 batch3 で rust-core
// (`uxfd-rust-core::schema::HksyCheckerGridObjectFields`) の camelCase
// wire フォーマットへ統一済み。`generator` タグは廃止されたため、この構造体
// では受け取らない（フィールド名/case のみを rust-core にミラーする）。
#[derive(Debug, Deserialize)]
struct HksyParams {
    #[serde(default)]
    pattern: Option<String>,
    #[serde(rename = "cellSize")]
    cell_size: u32,
    #[serde(rename = "lineWidth")]
    line_width: u32,
    #[serde(rename = "checkerEnabled")]
    checker_enabled: bool,
    #[serde(rename = "gridEnabled")]
    grid_enabled: bool,
    #[serde(rename = "foregroundColour")]
    foreground_colour: String,
    #[serde(rename = "secondaryColour")]
    secondary_colour: String,
    #[serde(rename = "backgroundColour")]
    background_colour: String,
    #[serde(rename = "paletteColours", default)]
    palette_colours: Option<Vec<String>>,
    #[serde(rename = "separateInterval", default)]
    separate_interval: Option<u32>,
    #[serde(rename = "separateLineWidth", default)]
    separate_line_width: Option<u32>,
    #[serde(rename = "anchorPoints", default)]
    anchor_points: Option<Vec<HksyAnchorPoint>>,
    #[serde(rename = "roundCaps", default)]
    round_caps: Option<bool>,
    #[serde(rename = "maxJoinDistance", default)]
    max_join_distance: Option<f32>,
}

// hologram は R3 batch6 で rust-core (`uxfd-rust-core::schema::HologramObjectFields`)
// の camelCase wire フォーマットへ統一済み。`generator` タグは廃止されたため、
// この構造体では受け取らない（フィールド名/case のみを rust-core にミラーする）。
#[derive(Debug, Deserialize)]
struct HologramParams {
    #[serde(rename = "tileSize")]
    tile_size: u32,
    #[serde(rename = "rotationDegrees")]
    rotation_degrees: f32,
    #[serde(rename = "gradientAngleDegrees")]
    gradient_angle_degrees: f32,
    #[serde(rename = "colourMode")]
    colour_mode: u32,
    #[serde(rename = "tintColour")]
    tint_colour: String,
}

// hksy_checker_grid と hologram はどちらも `generator` タグを持たなくなった
// ため、`tileSize` キーの有無で振り分ける（hksy_checker_grid には存在しない
// hologram 固有のフィールド）。
#[derive(Debug, Deserialize)]
struct GeneratedSourceKind {
    #[serde(rename = "tileSize", default)]
    tile_size: Option<u32>,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct HksyFillUniform {
    dimensions: [f32; 2],
    cell_size: f32,
    line_radius: f32,
    pattern: u32,
    checker_enabled: u32,
    grid_enabled: u32,
    palette_count: u32,
    foreground: [f32; 4],
    secondary: [f32; 4],
    background: [f32; 4],
    palette: [[f32; 4]; HKSY_MAX_PALETTE_COLOURS],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct HologramUniform {
    dimensions: [f32; 2],
    tile_size: f32,
    colour_mode: u32,
    rotation: [f32; 2],
    gradient: [f32; 2],
    tint: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct HksyLineInstance {
    start: [f32; 2],
    end: [f32; 2],
    radius: f32,
    _padding: [f32; 3],
    colour: [f32; 4],
}

struct HksyTextureEntry {
    config_revision: u64,
    texture: wgpu::Texture,
    width: u32,
    height: u32,
    byte_len: usize,
    idle_frames: u64,
}

#[derive(Default)]
struct HksyTextureCache {
    entries: HashMap<String, HksyTextureEntry>,
    order: VecDeque<String>,
    total_bytes: usize,
}

pub(crate) struct HksyGpuRenderer {
    fill_pipeline: wgpu::RenderPipeline,
    fill_bind_group_layout: wgpu::BindGroupLayout,
    hologram_pipeline: wgpu::RenderPipeline,
    line_pipeline: wgpu::RenderPipeline,
    line_bind_group_layout: wgpu::BindGroupLayout,
    cache: Mutex<HksyTextureCache>,
    #[cfg(test)]
    texture_creations: std::sync::atomic::AtomicU64,
    #[cfg(test)]
    render_passes: std::sync::atomic::AtomicU64,
}

impl HksyGpuRenderer {
    pub(crate) fn new(device: &wgpu::Device) -> Self {
        let fill_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("UXFD HKSY fill bind group layout"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                }],
            });
        let fill_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("UXFD HKSY fill pipeline layout"),
            bind_group_layouts: &[&fill_bind_group_layout],
            push_constant_ranges: &[],
        });
        let fill_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("UXFD HKSY fill shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("hksy_fill.wgsl").into()),
        });
        let fill_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("UXFD HKSY fill pipeline"),
            layout: Some(&fill_layout),
            vertex: wgpu::VertexState {
                module: &fill_shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &fill_shader,
                entry_point: Some("fs_main"),
                targets: &[Some(hksy_colour_target())],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });
        let hologram_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("UXFD hologram fill shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("hologram_fill.wgsl").into()),
        });
        let hologram_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("UXFD hologram fill pipeline"),
            layout: Some(&fill_layout),
            vertex: wgpu::VertexState {
                module: &hologram_shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &hologram_shader,
                entry_point: Some("fs_main"),
                targets: &[Some(hksy_colour_target())],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        let line_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("UXFD HKSY line bind group layout"),
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
        let line_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("UXFD HKSY line pipeline layout"),
            bind_group_layouts: &[&line_bind_group_layout],
            push_constant_ranges: &[],
        });
        let line_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("UXFD HKSY line shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("hksy_lines.wgsl").into()),
        });
        let line_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("UXFD HKSY line pipeline"),
            layout: Some(&line_layout),
            vertex: wgpu::VertexState {
                module: &line_shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &line_shader,
                entry_point: Some("fs_main"),
                targets: &[Some(hksy_colour_target())],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        Self {
            fill_pipeline,
            fill_bind_group_layout,
            hologram_pipeline,
            line_pipeline,
            line_bind_group_layout,
            cache: Mutex::new(HksyTextureCache::default()),
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
        source: &NativeHksySource,
    ) -> Result<(wgpu::TextureView, u32, u32), String> {
        let mut cache = self
            .cache
            .lock()
            .map_err(|_| "HKSY cache mutex is poisoned.".to_string())?;
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

        let source_kind: GeneratedSourceKind = serde_json::from_str(&source.source)
            .map_err(|error| format!("Invalid generated fill source JSON: {error}"))?;
        if source_kind.tile_size.is_some() {
            let params: HologramParams = serde_json::from_str(&source.source)
                .map_err(|error| format!("Invalid Hologram source JSON: {error}"))?;
            validate_hologram_source(source, &params)?;
            let tint = parse_colour(&params.tint_colour)?;
            let rotation = params.rotation_degrees.to_radians();
            let gradient = params.gradient_angle_degrees.to_radians();
            let uniform = HologramUniform {
                dimensions: [source.width as f32, source.height as f32],
                tile_size: params.tile_size as f32,
                colour_mode: params.colour_mode,
                rotation: [rotation.cos(), rotation.sin()],
                gradient: [gradient.cos(), gradient.sin()],
                tint,
            };
            let texture = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("UXFD hologram source texture"),
                size: wgpu::Extent3d {
                    width: source.width,
                    height: source.height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                    | wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            });
            let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
            let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("UXFD hologram fill uniform"),
                contents: bytemuck::bytes_of(&uniform),
                usage: wgpu::BufferUsages::UNIFORM,
            });
            let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("UXFD hologram fill bind group"),
                layout: &self.fill_bind_group_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                }],
            });
            let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("UXFD hologram source encoder"),
            });
            {
                let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("UXFD hologram source pass"),
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
                pass.set_pipeline(&self.hologram_pipeline);
                pass.set_bind_group(0, &bind_group, &[]);
                pass.draw(0..6, 0..1);
            }
            queue.submit(Some(encoder.finish()));
            insert_rendered_texture(&mut cache, media_id, source, texture);
            #[cfg(test)]
            {
                self.texture_creations
                    .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                self.render_passes
                    .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            }
            return Ok((view, source.width, source.height));
        }

        let params: HksyParams = serde_json::from_str(&source.source)
            .map_err(|error| format!("Invalid HKSY source JSON: {error}"))?;
        validate_source(source, &params)?;
        let pattern = pattern_code(&params);
        let foreground = parse_colour(&params.foreground_colour)?;
        let secondary = parse_colour(&params.secondary_colour)?;
        let background = parse_colour(&params.background_colour)?;
        let palette = parse_palette(&params)?;
        let uniform = build_fill_uniform(
            source, &params, pattern, foreground, secondary, background, &palette,
        );
        let line_instances = build_line_instances(source, &params, pattern, foreground, secondary)?;

        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("UXFD HKSY source texture"),
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
        let fill_uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("UXFD HKSY fill uniform"),
            contents: bytemuck::bytes_of(&uniform),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let fill_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("UXFD HKSY fill bind group"),
            layout: &self.fill_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: fill_uniform_buffer.as_entire_binding(),
            }],
        });
        let line_dimensions = [source.width as f32, source.height as f32, 0.0, 0.0];
        let line_uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("UXFD HKSY line dimensions"),
            contents: bytemuck::cast_slice(&line_dimensions),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let line_buffer_contents: &[HksyLineInstance] = if line_instances.is_empty() {
            &[HksyLineInstance::zeroed()]
        } else {
            &line_instances
        };
        let line_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("UXFD HKSY line instances"),
            contents: bytemuck::cast_slice(line_buffer_contents),
            usage: wgpu::BufferUsages::STORAGE,
        });
        let line_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("UXFD HKSY line bind group"),
            layout: &self.line_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: line_uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: line_buffer.as_entire_binding(),
                },
            ],
        });

        let clear_colour = if pattern == 2 {
            wgpu::Color {
                r: background[0] as f64,
                g: background[1] as f64,
                b: background[2] as f64,
                a: 1.0,
            }
        } else {
            wgpu::Color::TRANSPARENT
        };
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("UXFD HKSY source encoder"),
        });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("UXFD HKSY source pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(clear_colour),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                occlusion_query_set: None,
                timestamp_writes: None,
            });
            if pattern <= 1 {
                pass.set_pipeline(&self.fill_pipeline);
                pass.set_bind_group(0, &fill_bind_group, &[]);
                pass.draw(0..6, 0..1);
            }
            if !line_instances.is_empty() {
                pass.set_pipeline(&self.line_pipeline);
                pass.set_bind_group(0, &line_bind_group, &[]);
                pass.draw(0..6, 0..line_instances.len() as u32);
            }
        }
        queue.submit(Some(encoder.finish()));

        insert_rendered_texture(&mut cache, media_id, source, texture);
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
                        (entry.idle_frames > HKSY_CACHE_IDLE_FRAME_LIMIT).then(|| media_id.clone())
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

fn insert_rendered_texture(
    cache: &mut HksyTextureCache,
    media_id: &str,
    source: &NativeHksySource,
    texture: wgpu::Texture,
) {
    let byte_len = source.width as usize * source.height as usize * 4;
    if let Some(previous) = cache.entries.remove(media_id) {
        cache.total_bytes = cache.total_bytes.saturating_sub(previous.byte_len);
    }
    cache.total_bytes = cache.total_bytes.saturating_add(byte_len);
    cache.entries.insert(
        media_id.to_string(),
        HksyTextureEntry {
            config_revision: source.config_revision,
            texture,
            width: source.width,
            height: source.height,
            byte_len,
            idle_frames: 0,
        },
    );
    touch_cache_order(&mut cache.order, media_id);
    evict_over_budget(cache);
}

fn touch_cache_order(order: &mut VecDeque<String>, media_id: &str) {
    order.retain(|candidate| candidate != media_id);
    order.push_back(media_id.to_string());
}

fn remove_cache_entry(cache: &mut HksyTextureCache, media_id: &str) {
    if let Some(entry) = cache.entries.remove(media_id) {
        cache.total_bytes = cache.total_bytes.saturating_sub(entry.byte_len);
    }
    cache.order.retain(|candidate| candidate != media_id);
}

fn evict_over_budget(cache: &mut HksyTextureCache) {
    while cache.total_bytes > HKSY_CACHE_MAX_BYTES {
        let Some(media_id) = cache.order.pop_front() else {
            break;
        };
        if let Some(entry) = cache.entries.remove(&media_id) {
            cache.total_bytes = cache.total_bytes.saturating_sub(entry.byte_len);
        }
    }
}

fn hksy_colour_target() -> wgpu::ColorTargetState {
    wgpu::ColorTargetState {
        format: wgpu::TextureFormat::Rgba8Unorm,
        blend: None,
        write_mask: wgpu::ColorWrites::ALL,
    }
}

fn validate_source(source: &NativeHksySource, params: &HksyParams) -> Result<(), String> {
    if source.width == 0 || source.height == 0 {
        return Err("HKSY dimensions must be positive.".to_string());
    }
    if params.cell_size == 0 || params.cell_size > 1000 || params.line_width > 100 {
        return Err("HKSY cell_size or line_width is out of range.".to_string());
    }
    if let Some(pattern) = params.pattern.as_deref() {
        if !matches!(
            pattern,
            "checker-grid" | "diamond" | "measured-grid" | "anchor-line"
        ) {
            return Err("HKSY pattern is unsupported.".to_string());
        }
    }
    if let Some(colours) = params.palette_colours.as_ref() {
        if !(2..=HKSY_MAX_PALETTE_COLOURS).contains(&colours.len()) {
            return Err("HKSY palette must contain 2..16 colours.".to_string());
        }
    }
    if params
        .separate_interval
        .is_some_and(|value| value == 0 || value > 1000)
        || params.separate_line_width.is_some_and(|value| value > 100)
    {
        return Err("HKSY measured-grid parameters are out of range.".to_string());
    }
    if params.pattern.as_deref() == Some("anchor-line") {
        let points = params
            .anchor_points
            .as_ref()
            .ok_or_else(|| "HKSY anchor-line requires anchor_points.".to_string())?;
        if !(2..=HKSY_MAX_ANCHOR_POINTS).contains(&points.len())
            || points.iter().any(|point| {
                !point.x.is_finite()
                    || !point.y.is_finite()
                    || !(-1000.0..=1000.0).contains(&point.x)
                    || !(-1000.0..=1000.0).contains(&point.y)
            })
            || params.round_caps.is_none()
            || params
                .max_join_distance
                .is_none_or(|value| !value.is_finite() || !(0.0..=300.0).contains(&value))
        {
            return Err("HKSY anchor-line parameters are invalid.".to_string());
        }
    }
    Ok(())
}

fn validate_hologram_source(
    source: &NativeHksySource,
    params: &HologramParams,
) -> Result<(), String> {
    if source.width == 0 || source.height == 0 {
        return Err("Hologram dimensions must be positive.".to_string());
    }
    if !(10..=1000).contains(&params.tile_size) {
        return Err("Hologram tile_size must be 10..1000.".to_string());
    }
    if !params.rotation_degrees.is_finite() || !(-720.0..=720.0).contains(&params.rotation_degrees)
    {
        return Err("Hologram rotation_degrees must be -720..720.".to_string());
    }
    if !params.gradient_angle_degrees.is_finite()
        || !(-720.0..=720.0).contains(&params.gradient_angle_degrees)
    {
        return Err("Hologram gradient_angle_degrees must be -720..720.".to_string());
    }
    if params.colour_mode > 2 {
        return Err("Hologram colour_mode must be 0..2.".to_string());
    }
    parse_colour(&params.tint_colour)?;
    Ok(())
}

fn pattern_code(params: &HksyParams) -> u32 {
    match params.pattern.as_deref() {
        Some("diamond") => 1,
        Some("measured-grid") => 2,
        Some("anchor-line") => 3,
        _ => 0,
    }
}

fn build_fill_uniform(
    source: &NativeHksySource,
    params: &HksyParams,
    pattern: u32,
    foreground: [f32; 4],
    secondary: [f32; 4],
    background: [f32; 4],
    palette_colours: &[[f32; 4]],
) -> HksyFillUniform {
    let mut palette = [[0.0; 4]; HKSY_MAX_PALETTE_COLOURS];
    palette[..palette_colours.len()].copy_from_slice(palette_colours);
    HksyFillUniform {
        dimensions: [source.width as f32, source.height as f32],
        cell_size: params.cell_size as f32,
        line_radius: params.line_width as f32 * 0.5,
        pattern,
        checker_enabled: u32::from(params.checker_enabled),
        grid_enabled: u32::from(params.grid_enabled && params.line_width > 0),
        palette_count: palette_colours.len() as u32,
        foreground,
        secondary,
        background,
        palette,
    }
}

fn build_line_instances(
    source: &NativeHksySource,
    params: &HksyParams,
    pattern: u32,
    foreground: [f32; 4],
    secondary: [f32; 4],
) -> Result<Vec<HksyLineInstance>, String> {
    match pattern {
        2 => Ok(build_measured_grid_instances(
            source, params, foreground, secondary,
        )),
        3 => build_anchor_line_instances(source, params, foreground),
        _ => Ok(Vec::new()),
    }
}

fn build_measured_grid_instances(
    source: &NativeHksySource,
    params: &HksyParams,
    foreground: [f32; 4],
    secondary: [f32; 4],
) -> Vec<HksyLineInstance> {
    let centre_x = source.width as f32 * 0.5;
    let centre_y = source.height as f32 * 0.5;
    let max_distance = centre_x.max(centre_y);
    let interval = params.separate_interval.unwrap_or(5);
    let mut instances = Vec::new();
    let mut index = 0_u32;
    let mut position = 0.0_f32;
    while position <= max_distance + params.cell_size as f32 {
        let separate = index % interval == 0;
        let width = if separate {
            params.separate_line_width.unwrap_or(3)
        } else {
            params.line_width
        };
        if width > 0 {
            let colour = if separate { foreground } else { secondary };
            let radius = (width as f32 * 0.5).max(0.5);
            for sign in [-1.0_f32, 1.0_f32] {
                let x = centre_x + position * sign;
                let y = centre_y + position * sign;
                if x >= 0.0 && x <= source.width.saturating_sub(1) as f32 {
                    instances.push(line_instance(
                        [x, 0.0],
                        [x, source.height.saturating_sub(1) as f32],
                        radius,
                        colour,
                    ));
                }
                if y >= 0.0 && y <= source.height.saturating_sub(1) as f32 {
                    instances.push(line_instance(
                        [0.0, y],
                        [source.width.saturating_sub(1) as f32, y],
                        radius,
                        colour,
                    ));
                }
            }
        }
        index = index.saturating_add(1);
        position += params.cell_size as f32;
    }
    instances
}

fn build_anchor_line_instances(
    source: &NativeHksySource,
    params: &HksyParams,
    foreground: [f32; 4],
) -> Result<Vec<HksyLineInstance>, String> {
    let points = params
        .anchor_points
        .as_deref()
        .ok_or_else(|| "HKSY anchor-line requires anchor_points.".to_string())?
        .iter()
        .map(|point| {
            [
                source.width as f32 * 0.5 + point.x,
                source.height as f32 * 0.5 + point.y,
            ]
        })
        .collect::<Vec<_>>();
    let radius = (params.line_width as f32 * 0.5).max(0.5);
    let mut instances = points
        .windows(2)
        .map(|pair| line_instance(pair[0], pair[1], radius, foreground))
        .collect::<Vec<_>>();
    if params.round_caps.unwrap_or(true) {
        instances.extend(
            points
                .iter()
                .map(|point| line_instance(*point, *point, radius, foreground)),
        );
    }
    Ok(instances)
}

fn line_instance(
    start: [f32; 2],
    end: [f32; 2],
    radius: f32,
    colour: [f32; 4],
) -> HksyLineInstance {
    HksyLineInstance {
        start,
        end,
        radius,
        _padding: [0.0; 3],
        colour,
    }
}

fn parse_palette(params: &HksyParams) -> Result<Vec<[f32; 4]>, String> {
    params
        .palette_colours
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .map(|colour| parse_colour(colour))
        .collect()
}

fn parse_colour(raw: &str) -> Result<[f32; 4], String> {
    let value = raw.trim().strip_prefix('#').unwrap_or(raw.trim());
    if value.len() != 6 {
        return Err(format!("Invalid HKSY colour '{raw}'."));
    }
    let parse = |range: std::ops::Range<usize>| {
        u8::from_str_radix(&value[range], 16)
            .map(|channel| channel as f32 / 255.0)
            .map_err(|_| format!("Invalid HKSY colour '{raw}'."))
    };
    Ok([parse(0..2)?, parse(2..4)?, parse(4..6)?, 1.0])
}
