use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use bytemuck::{Pod, Zeroable};
use uxfd_rust_core::AudioWaveformSource;
use wgpu::util::DeviceExt;

const AUDIO_REACTIVE_CACHE_IDLE_FRAME_LIMIT: u64 = 30;

/// 波形の現在位置から切り出された PCM window。`samples[0]` は常に現在の
/// source frame を表すため、renderer 側で timeline offset を再加算しない。
#[derive(Debug, Clone, PartialEq)]
pub struct NativeAudioReactiveSource {
    pub source: AudioWaveformSource,
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub width: u32,
    pub height: u32,
    pub config_revision: u64,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct AudioReactiveUniform {
    dimensions: [f32; 2],
    sample_len: u32,
    sample_step: u32,
    amplitude: f32,
    thickness: f32,
    mode: u32,
    columns: u32,
    rows: u32,
    sample_window_len: u32,
    audio_influence: f32,
    point_size: f32,
    random_amount: f32,
    _padding: f32,
    seed: u32,
    _seed_padding: [u32; 5],
    colour: [f32; 4],
}

struct AudioReactiveTextureEntry {
    config_revision: u64,
    source: AudioWaveformSource,
    sample_rate: u32,
    texture: wgpu::Texture,
    sample_buffer: wgpu::Buffer,
    sample_capacity: usize,
    width: u32,
    height: u32,
    idle_frames: u64,
}

#[derive(Default)]
struct AudioReactiveTextureCache {
    entries: HashMap<String, AudioReactiveTextureEntry>,
}

pub(crate) struct AudioReactiveGpuRenderer {
    pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    cache: Mutex<AudioReactiveTextureCache>,
    #[cfg(test)]
    texture_creations: std::sync::atomic::AtomicU64,
    #[cfg(test)]
    render_passes: std::sync::atomic::AtomicU64,
}

impl AudioReactiveGpuRenderer {
    pub(crate) fn new(device: &wgpu::Device) -> Self {
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("UXFD audio reactive source bind group layout"),
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
            label: Some("UXFD audio reactive source pipeline layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("UXFD audio reactive source shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("audio_reactive.wgsl").into()),
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("UXFD audio reactive source pipeline"),
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
            cache: Mutex::new(AudioReactiveTextureCache::default()),
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
        source: &NativeAudioReactiveSource,
    ) -> (wgpu::TextureView, u32, u32) {
        let mut cache = self
            .cache
            .lock()
            .expect("audio reactive cache mutex must not be poisoned");
        let sample_capacity = source.samples.len().max(1);
        let must_create = cache.entries.get(media_id).is_none_or(|entry| {
            entry.config_revision != source.config_revision
                || entry.source != source.source
                || entry.sample_rate != source.sample_rate
                || entry.width != source.width
                || entry.height != source.height
                || entry.sample_capacity < sample_capacity
        });
        if must_create {
            let initial_samples = padded_samples(&source.samples, sample_capacity);
            let sample_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("UXFD audio reactive PCM window"),
                contents: bytemuck::cast_slice(&initial_samples),
                usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            });
            let texture = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("UXFD audio reactive source texture"),
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
            cache.entries.insert(
                media_id.to_string(),
                AudioReactiveTextureEntry {
                    config_revision: source.config_revision,
                    source: source.source.clone(),
                    sample_rate: source.sample_rate,
                    texture,
                    sample_buffer,
                    sample_capacity,
                    width: source.width,
                    height: source.height,
                    idle_frames: 0,
                },
            );
            #[cfg(test)]
            self.texture_creations
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        }

        let entry = cache
            .entries
            .get_mut(media_id)
            .expect("audio reactive entry must exist after preparation");
        entry.idle_frames = 0;
        let samples = padded_samples(&source.samples, entry.sample_capacity);
        queue.write_buffer(&entry.sample_buffer, 0, bytemuck::cast_slice(&samples));
        let is_audio_sphere = source.source.generator == "audio-sphere-93";
        let columns = source.source.columns.unwrap_or(16).clamp(2, 64);
        let rows = source.source.rows.unwrap_or(12).clamp(2, 64);
        let sample_window_len = (source.source.sample_window_seconds * source.sample_rate as f32)
            .floor()
            .max(1.0) as u32;
        let uniform = AudioReactiveUniform {
            dimensions: [source.width as f32, source.height as f32],
            sample_len: source.samples.len().max(1) as u32,
            sample_step: (sample_window_len / source.width.max(1)).max(1),
            amplitude: source.source.amplitude.unwrap_or(1.0),
            thickness: source.source.thickness.unwrap_or(1.0),
            mode: u32::from(is_audio_sphere),
            columns,
            rows,
            sample_window_len,
            audio_influence: source.source.audio_influence.unwrap_or(0.6).max(0.0),
            point_size: source.source.point_size.unwrap_or(5.0).max(0.0),
            random_amount: source.source.random_amount.unwrap_or(0.05).max(0.0),
            _padding: 0.0,
            seed: source.source.seed.unwrap_or(93) as u32,
            _seed_padding: [0; 5],
            colour: parse_colour(&source.source.colour),
        };
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("UXFD audio reactive uniform"),
            contents: bytemuck::bytes_of(&uniform),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("UXFD audio reactive bind group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: entry.sample_buffer.as_entire_binding(),
                },
            ],
        });
        let view = entry
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("UXFD audio reactive source encoder"),
        });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("UXFD audio reactive source pass"),
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
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            let instance_count = if is_audio_sphere {
                columns.saturating_mul(rows)
            } else {
                source.width.max(1)
            };
            pass.draw(0..6, 0..instance_count);
        }
        queue.submit(Some(encoder.finish()));
        #[cfg(test)]
        self.render_passes
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        (view, entry.width, entry.height)
    }

    pub(crate) fn finish_frame(&self, touched_media_ids: &HashSet<String>) {
        let mut cache = self
            .cache
            .lock()
            .expect("audio reactive cache mutex must not be poisoned");
        cache.entries.retain(|media_id, entry| {
            if touched_media_ids.contains(media_id) {
                entry.idle_frames = 0;
                true
            } else {
                entry.idle_frames = entry.idle_frames.saturating_add(1);
                entry.idle_frames <= AUDIO_REACTIVE_CACHE_IDLE_FRAME_LIMIT
            }
        });
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

fn padded_samples(samples: &[f32], capacity: usize) -> Vec<f32> {
    let mut padded = vec![0.0; capacity];
    padded[..samples.len()].copy_from_slice(samples);
    padded
}

fn parse_colour(raw: &str) -> [f32; 4] {
    let value = raw.trim().strip_prefix('#').unwrap_or(raw.trim());
    if value.len() != 6 {
        return [0.0, 1.0, 0.0, 1.0];
    }
    let parse = |range: std::ops::Range<usize>| {
        u8::from_str_radix(&value[range], 16).unwrap_or(0) as f32 / 255.0
    };
    [parse(0..2), parse(2..4), parse(4..6), 1.0]
}
