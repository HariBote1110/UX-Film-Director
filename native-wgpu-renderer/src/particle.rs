use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use bytemuck::{Pod, Zeroable};
use uxfd_rust_core::{generated_particle_unit, GeneratedParticleParams};
use wgpu::util::DeviceExt;

const PARTICLE_CACHE_IDLE_FRAME_LIMIT: u64 = 30;

#[derive(Debug, Clone, PartialEq)]
pub struct NativeParticleSource {
    pub params: GeneratedParticleParams,
    pub width: u32,
    pub height: u32,
    pub source_frame: u64,
    pub config_revision: u64,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct ParticleInstance {
    direction_x: f32,
    direction_y: f32,
    distance: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct ParticleUniform {
    dimensions: [f32; 2],
    speed: f32,
    lifetime_seconds: f32,
    source_seconds: f32,
    particle_size: f32,
    _padding: [f32; 2],
    colour: [f32; 4],
}

struct ParticleTextureEntry {
    config_revision: u64,
    texture: wgpu::Texture,
    instance_buffer: wgpu::Buffer,
    instance_count: u32,
    width: u32,
    height: u32,
    idle_frames: u64,
}

#[derive(Default)]
struct ParticleTextureCache {
    entries: HashMap<String, ParticleTextureEntry>,
}

pub(crate) struct ParticleGpuRenderer {
    pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    cache: Mutex<ParticleTextureCache>,
    #[cfg(test)]
    texture_creations: std::sync::atomic::AtomicU64,
    #[cfg(test)]
    render_passes: std::sync::atomic::AtomicU64,
}

impl ParticleGpuRenderer {
    pub(crate) fn new(device: &wgpu::Device) -> Self {
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("UXFD particle source bind group layout"),
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
            label: Some("UXFD particle source pipeline layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("UXFD particle source shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("particle.wgsl").into()),
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("UXFD particle source pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: "vs_main",
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<ParticleInstance>() as u64,
                    step_mode: wgpu::VertexStepMode::Instance,
                    attributes: &wgpu::vertex_attr_array![0 => Float32x3],
                }],
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
            cache: Mutex::new(ParticleTextureCache::default()),
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
        source: &NativeParticleSource,
    ) -> (wgpu::TextureView, u32, u32) {
        let mut cache = self
            .cache
            .lock()
            .expect("particle texture cache mutex must not be poisoned");
        let must_create = cache.entries.get(media_id).is_none_or(|entry| {
            entry.config_revision != source.config_revision
                || entry.width != source.width
                || entry.height != source.height
        });
        if must_create {
            let instances = build_particle_instances(&source.params);
            let instance_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("UXFD particle source instances"),
                contents: bytemuck::cast_slice(&instances),
                usage: wgpu::BufferUsages::VERTEX,
            });
            let texture = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("UXFD particle source texture"),
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
                ParticleTextureEntry {
                    config_revision: source.config_revision,
                    texture,
                    instance_buffer,
                    instance_count: source.params.particle_count,
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
            .expect("particle texture entry must exist after preparation");
        entry.idle_frames = 0;
        let uniform = ParticleUniform {
            dimensions: [source.width as f32, source.height as f32],
            speed: source.params.speed,
            lifetime_seconds: source.params.lifetime_seconds,
            source_seconds: source.source_frame as f32 / 60.0,
            particle_size: source.params.size,
            _padding: [0.0; 2],
            colour: [
                source.params.colour[0] as f32 / 255.0,
                source.params.colour[1] as f32 / 255.0,
                source.params.colour[2] as f32 / 255.0,
                1.0,
            ],
        };
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("UXFD particle source uniform"),
            contents: bytemuck::bytes_of(&uniform),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("UXFD particle source bind group"),
            layout: &self.bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });
        let view = entry
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("UXFD particle source encoder"),
        });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("UXFD particle source pass"),
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
            pass.set_vertex_buffer(0, entry.instance_buffer.slice(..));
            pass.draw(0..6, 0..entry.instance_count);
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
            .expect("particle texture cache mutex must not be poisoned");
        cache.entries.retain(|media_id, entry| {
            if touched_media_ids.contains(media_id) {
                entry.idle_frames = 0;
                true
            } else {
                entry.idle_frames = entry.idle_frames.saturating_add(1);
                entry.idle_frames <= PARTICLE_CACHE_IDLE_FRAME_LIMIT
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

fn build_particle_instances(params: &GeneratedParticleParams) -> Vec<ParticleInstance> {
    (0..params.particle_count)
        .map(|index| {
            let angle = generated_particle_unit(params.seed, index, 0) * std::f32::consts::TAU;
            ParticleInstance {
                direction_x: angle.cos(),
                direction_y: angle.sin(),
                distance: generated_particle_unit(params.seed, index, 1) * params.spread,
            }
        })
        .collect()
}
