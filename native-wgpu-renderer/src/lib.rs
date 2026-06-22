use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::mpsc;
use std::time::{Duration, Instant};
use uxfd_golden_harness::{RgbaFrame, RgbaFrameError};
use uxfd_rust_core::{
    build_audio_waveform_line_strip, AudioWaveformSceneError, AudioWaveformSource, Effect,
    SamplingMode, SceneSnapshot, WipeEdge,
};
use uxfd_shared_memory_spike::PosixSharedRing;
use uxfd_sidecar_protocol::{
    rgba8_srgb_ring_layout, ColourMetadata, FrameFormat, FrameRingLayoutBuildError, SharedFrame,
};
use wgpu::util::DeviceExt;

const OUTPUT_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8UnormSrgb;
const OUTPUT_BYTES_PER_PIXEL: u32 = 4;
const SOURCE_BYTES_PER_PIXEL: u32 = 4;
const COPY_BYTES_PER_ROW_ALIGNMENT: u32 = 256;

pub fn native_wgpu_readback_frame_format() -> FrameFormat {
    FrameFormat::Rgba8Srgb
}

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
    AudioWaveform(AudioWaveformSceneError),
    BufferMap,
    InvalidFrame(RgbaFrameError),
}

#[derive(Debug, Clone, PartialEq)]
pub struct NativeAudioWaveformInput {
    pub media_id: String,
    pub source: AudioWaveformSource,
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub width: u32,
    pub height: u32,
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

pub struct NativeWgpuRenderer {
    width: u32,
    height: u32,
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    output_texture: wgpu::Texture,
    readback_buffer: wgpu::Buffer,
}

impl NativeWgpuRenderer {
    pub async fn new(width: u32, height: u32) -> Result<Self, NativeWgpuRenderError> {
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
        let bind_group_layout = pipeline.get_bind_group_layout(0);
        let output_texture = create_output_texture(&device, width, height);
        let readback_buffer = create_readback_buffer(&device, width, height);

        Ok(Self {
            width,
            height,
            device,
            queue,
            pipeline,
            bind_group_layout,
            output_texture,
            readback_buffer,
        })
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    pub async fn render_frame_stages(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
    ) -> Result<NativeWgpuFrameReport, NativeWgpuRenderError> {
        let total_start = Instant::now();
        self.render_frame_stages_with_setup(snapshot, sources, Duration::ZERO, total_start)
            .await
    }

    pub async fn render_frame_to_shared_ring(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
        memory_id: &str,
        slot_count: u32,
        pts_frame: u64,
    ) -> Result<NativeWgpuSharedFrameReport, NativeWgpuRenderError> {
        let report = self.render_frame_stages(snapshot, sources).await?;
        frame_report_to_shared_ring(report, memory_id, slot_count, pts_frame)
    }

    pub async fn render_frame_to_shared_ring_with_audio_waveforms(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
        waveforms: &[NativeAudioWaveformInput],
        memory_id: &str,
        slot_count: u32,
        pts_frame: u64,
    ) -> Result<NativeWgpuSharedFrameReport, NativeWgpuRenderError> {
        let report = self
            .render_frame_stages_with_audio_waveforms(snapshot, sources, waveforms)
            .await?;
        frame_report_to_shared_ring(report, memory_id, slot_count, pts_frame)
    }

    pub async fn render_frame_stages_with_audio_waveforms(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
        waveforms: &[NativeAudioWaveformInput],
    ) -> Result<NativeWgpuFrameReport, NativeWgpuRenderError> {
        let generated_sources = build_audio_waveform_sources(snapshot, sources, waveforms)?;
        self.render_frame_stages(snapshot, &generated_sources).await
    }

    async fn render_frame_stages_with_setup(
        &self,
        snapshot: &SceneSnapshot,
        sources: &HashMap<String, RgbaFrame>,
        setup: Duration,
        total_start: Instant,
    ) -> Result<NativeWgpuFrameReport, NativeWgpuRenderError> {
        let mut clips = snapshot.clips.clone();
        clips.sort_by_key(|clip| clip.z_index);

        let mut prepared_clips = Vec::with_capacity(clips.len());
        let upload_start = Instant::now();
        for clip in &clips {
            if !clip.transform.rotation_degrees.is_finite()
                || clip.transform.scale_x <= 0.0
                || clip.transform.scale_y <= 0.0
            {
                return Err(NativeWgpuRenderError::UnsupportedTransform {
                    clip_id: clip.clip_id.clone(),
                });
            }
            let rotation_radians = clip.transform.rotation_degrees.to_radians();

            let source = sources.get(&clip.media_id).ok_or_else(|| {
                NativeWgpuRenderError::MissingSource {
                    media_id: clip.media_id.clone(),
                }
            })?;
            prepared_clips.push(prepare_clip(
                &self.device,
                &self.queue,
                &self.bind_group_layout,
                source,
                RenderParams {
                    opacity: clip.opacity,
                    gain: clip
                        .effects
                        .iter()
                        .fold(1.0, |gain, effect| gain * effect_gain(effect)),
                    colour_aberration_offset_x: effect_colour_aberration_offset(clip, |effect| {
                        match effect {
                            Effect::ColourAberration { offset_x, .. } => Some(*offset_x),
                            _ => None,
                        }
                    }),
                    colour_aberration_offset_y: effect_colour_aberration_offset(clip, |effect| {
                        match effect {
                            Effect::ColourAberration { offset_y, .. } => Some(*offset_y),
                            _ => None,
                        }
                    }),
                    outline_colour_r: outline_colour_component(clip, 0),
                    outline_colour_g: outline_colour_component(clip, 1),
                    outline_colour_b: outline_colour_component(clip, 2),
                    outline_thickness: outline_thickness(clip),
                    outline_opacity: outline_opacity(clip),
                    wipe_edge: wipe_edge(clip),
                    wipe_progress: wipe_progress(clip),
                    clipping_top: clipping_extent(clip, |effect| match effect {
                        Effect::Clipping { top, .. } => Some(*top),
                        _ => None,
                    }),
                    clipping_bottom: clipping_extent(clip, |effect| match effect {
                        Effect::Clipping { bottom, .. } => Some(*bottom),
                        _ => None,
                    }),
                    clipping_left: clipping_extent(clip, |effect| match effect {
                        Effect::Clipping { left, .. } => Some(*left),
                        _ => None,
                    }),
                    clipping_right: clipping_extent(clip, |effect| match effect {
                        Effect::Clipping { right, .. } => Some(*right),
                        _ => None,
                    }),
                    clipping_angle: clipping_angle(clip),
                    spot_light_colour_r: spot_light_colour_component(clip, 0),
                    spot_light_colour_g: spot_light_colour_component(clip, 1),
                    spot_light_colour_b: spot_light_colour_component(clip, 2),
                    spot_light_centre_x: spot_light_centre_component(clip, 0),
                    spot_light_centre_y: spot_light_centre_component(clip, 1),
                    spot_light_radius: spot_light_radius(clip),
                    spot_light_intensity: spot_light_intensity(clip),
                    displacement_amount_x: displacement_amount_component(clip, 0),
                    displacement_amount_y: displacement_amount_component(clip, 1),
                    displacement_size: displacement_size(clip),
                    displacement_strength: displacement_strength(clip),
                    fake_dof_focus_x: fake_dof_focus_component(clip, 0),
                    fake_dof_focus_y: fake_dof_focus_component(clip, 1),
                    fake_dof_focus_radius: fake_dof_focus_radius(clip),
                    fake_dof_blur: fake_dof_blur(clip),
                    fake_dof_strength: fake_dof_strength(clip),
                    auto_blur_angle: auto_blur_angle(clip),
                    auto_blur_radius: auto_blur_radius(clip),
                    auto_blur_strength: auto_blur_strength(clip),
                    auto_blur_colour_shift: auto_blur_colour_shift(clip),
                    stretch_angle: stretch_angle(clip),
                    stretch_amount: stretch_amount(clip),
                    stretch_strength: stretch_strength(clip),
                    multi_slicer_angle: multi_slicer_angle(clip),
                    multi_slicer_offset: multi_slicer_offset(clip),
                    multi_slicer_slices: multi_slicer_slices(clip),
                    multi_slicer_expansion: multi_slicer_expansion(clip),
                    multi_slicer_strength: multi_slicer_strength(clip),
                    source_width: source.width as f32,
                    source_height: source.height as f32,
                    translation_x: clip.transform.translation_x,
                    translation_y: clip.transform.translation_y,
                    scale_x: clip.transform.scale_x,
                    scale_y: clip.transform.scale_y,
                    sampling_mode: sampling_mode_value(clip.transform.sampling),
                    rotation_cos: rotation_radians.cos(),
                    rotation_sin: rotation_radians.sin(),
                    _padding3: 0.0,
                    _padding4: 0.0,
                    _padding5: 0.0,
                    _padding6: 0.0,
                },
            ));
        }
        self.queue.submit(std::iter::empty());
        wait_for_submitted_work(&self.device, &self.queue)?;
        let source_upload = upload_start.elapsed();

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("UXFD native wgpu encoder"),
            });

        let output_view = self
            .output_texture
            .create_view(&wgpu::TextureViewDescriptor::default());
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

            pass.set_pipeline(&self.pipeline);
            for prepared_clip in &prepared_clips {
                pass.set_bind_group(0, &prepared_clip.bind_group, &[]);
                pass.draw(0..3, 0..1);
            }
        }
        let render_start = Instant::now();
        self.queue.submit(Some(encoder.finish()));
        wait_for_submitted_work(&self.device, &self.queue)?;
        let render = render_start.elapsed();

        let mut readback_encoder =
            self.device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("UXFD native wgpu readback encoder"),
                });

        let padded_bytes_per_row = padded_bytes_per_row(self.width);
        readback_encoder.copy_texture_to_buffer(
            wgpu::ImageCopyTexture {
                texture: &self.output_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::ImageCopyBuffer {
                buffer: &self.readback_buffer,
                layout: wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_bytes_per_row),
                    rows_per_image: Some(self.height),
                },
            },
            wgpu::Extent3d {
                width: self.width,
                height: self.height,
                depth_or_array_layers: 1,
            },
        );

        let readback_encode_start = Instant::now();
        self.queue.submit(Some(readback_encoder.finish()));
        let frame =
            readback_to_rgba8(&self.device, &self.readback_buffer, self.width, self.height)?;
        let readback_encode = readback_encode_start.elapsed();

        Ok(NativeWgpuFrameReport {
            width: self.width,
            height: self.height,
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

pub async fn render_native_wgpu_frame_with_audio_waveforms(
    snapshot: &SceneSnapshot,
    sources: &HashMap<String, RgbaFrame>,
    waveforms: &[NativeAudioWaveformInput],
    width: u32,
    height: u32,
) -> Result<RgbaFrame, NativeWgpuRenderError> {
    let generated_sources = build_audio_waveform_sources(snapshot, sources, waveforms)?;
    render_native_wgpu_frame(snapshot, &generated_sources, width, height).await
}

fn build_audio_waveform_sources(
    snapshot: &SceneSnapshot,
    sources: &HashMap<String, RgbaFrame>,
    waveforms: &[NativeAudioWaveformInput],
) -> Result<HashMap<String, RgbaFrame>, NativeWgpuRenderError> {
    let mut generated_sources = sources.clone();
    for waveform in waveforms {
        let source_frame = snapshot
            .clips
            .iter()
            .find(|clip| clip.media_id == waveform.media_id)
            .map(|clip| clip.source_frame)
            .unwrap_or(0);
        let frame = rasterise_audio_waveform_input(waveform, source_frame)?;
        generated_sources.insert(waveform.media_id.clone(), frame);
    }

    Ok(generated_sources)
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
    frame_report_to_shared_ring(report, memory_id, slot_count, pts_frame)
}

pub async fn render_native_wgpu_frame_to_shared_ring_with_audio_waveforms(
    snapshot: &SceneSnapshot,
    sources: &HashMap<String, RgbaFrame>,
    waveforms: &[NativeAudioWaveformInput],
    width: u32,
    height: u32,
    memory_id: &str,
    slot_count: u32,
    pts_frame: u64,
) -> Result<NativeWgpuSharedFrameReport, NativeWgpuRenderError> {
    let generated_sources = build_audio_waveform_sources(snapshot, sources, waveforms)?;
    render_native_wgpu_frame_to_shared_ring(
        snapshot,
        &generated_sources,
        width,
        height,
        memory_id,
        slot_count,
        pts_frame,
    )
    .await
}

fn rasterise_audio_waveform_input(
    input: &NativeAudioWaveformInput,
    source_frame: u64,
) -> Result<RgbaFrame, NativeWgpuRenderError> {
    if input.source.generator == "audio-sphere-93" {
        return rasterise_audio_sphere_input(input, source_frame);
    }
    let line = build_audio_waveform_line_strip(
        &input.source,
        &input.samples,
        input.sample_rate,
        source_frame,
        60,
        input.width,
        input.height,
    )
    .map_err(NativeWgpuRenderError::AudioWaveform)?;
    let mut pixels = vec![0_u8; input.width as usize * input.height as usize * 4];
    let colour = [
        float_colour_to_u8(line.colour[0]),
        float_colour_to_u8(line.colour[1]),
        float_colour_to_u8(line.colour[2]),
        float_colour_to_u8(line.colour[3]),
    ];
    let radius = ((line.thickness.max(1.0).round() as i32) - 1) / 2;

    for (x, y) in line.points {
        let x = x.round() as i32;
        let y = y.round() as i32;
        for offset_y in -radius..=radius {
            write_waveform_pixel(
                &mut pixels,
                input.width,
                input.height,
                x,
                y + offset_y,
                colour,
            );
        }
    }

    RgbaFrame::from_rgba8(input.width, input.height, pixels)
        .map_err(NativeWgpuRenderError::InvalidFrame)
}

fn rasterise_audio_sphere_input(
    input: &NativeAudioWaveformInput,
    source_frame: u64,
) -> Result<RgbaFrame, NativeWgpuRenderError> {
    if input.width == 0 || input.height == 0 || input.sample_rate == 0 {
        return RgbaFrame::from_rgba8(input.width, input.height, Vec::new())
            .map_err(NativeWgpuRenderError::InvalidFrame);
    }

    let columns = input.source.columns.unwrap_or(16).clamp(2, 64);
    let rows = input.source.rows.unwrap_or(12).clamp(2, 64);
    let base_radius = input.source.base_radius.unwrap_or(170.0).max(1.0);
    let audio_influence = input.source.audio_influence.unwrap_or(0.6).max(0.0);
    let point_size = input.source.point_size.unwrap_or(5.0).max(0.0);
    let random_amount = input.source.random_amount.unwrap_or(0.05).max(0.0);
    let seed = input.source.seed.unwrap_or(93) as u64;
    let colour = parse_audio_sphere_colour(&input.source.colour);
    let mut pixels = vec![0_u8; input.width as usize * input.height as usize * 4];
    let start_sample = ((source_frame as f32 / 60.0) * input.sample_rate as f32)
        .floor()
        .max(0.0) as usize;
    let window_len = (input.source.sample_window_seconds * input.sample_rate as f32)
        .floor()
        .max(1.0) as usize;
    let centre_x = input.width as f32 * 0.5;
    let centre_y = input.height as f32 * 0.5;
    let normalise_radius = base_radius.max(1.0);
    let projected_base_radius = input.width.min(input.height) as f32 * 0.38;

    for column in 0..columns {
        let spectrum_index = start_sample.saturating_add(
            ((column as usize * window_len) / columns as usize).min(window_len.saturating_sub(1)),
        );
        let sample = input
            .samples
            .get(spectrum_index)
            .copied()
            .unwrap_or_else(|| input.samples.get(column as usize).copied().unwrap_or(0.0))
            .abs()
            .clamp(0.0, 1.0);
        for row in 0..rows {
            let theta = std::f32::consts::PI * (column as f32 + 0.5) / columns as f32;
            let phi = std::f32::consts::TAU * row as f32 / rows as f32
                + deterministic_audio_sphere_unit(seed, column, row, 0) * random_amount;
            let expansion = 1.0 + sample * audio_influence;
            let sphere_radius = (base_radius / normalise_radius) * projected_base_radius * expansion;
            let x3 = theta.sin() * phi.cos();
            let y3 = theta.cos();
            let z3 = theta.sin() * phi.sin();
            let perspective = 0.72 + z3 * 0.28;
            let x = centre_x + x3 * sphere_radius * perspective;
            let y = centre_y + y3 * sphere_radius * perspective;
            let radius = (point_size * (0.65 + sample * 1.4) * perspective.max(0.35)).max(0.5);
            draw_filled_disc(
                &mut pixels,
                input.width,
                input.height,
                x,
                y,
                radius,
                colour,
            );
        }
    }

    RgbaFrame::from_rgba8(input.width, input.height, pixels)
        .map_err(NativeWgpuRenderError::InvalidFrame)
}

fn parse_audio_sphere_colour(raw: &str) -> [u8; 4] {
    let value = raw.trim().strip_prefix('#').unwrap_or(raw.trim());
    if value.len() != 6 {
        return [0x36, 0xc2, 0xff, 255];
    }
    let parse = |range: std::ops::Range<usize>| -> u8 {
        u8::from_str_radix(&value[range], 16).unwrap_or(0)
    };
    [parse(0..2), parse(2..4), parse(4..6), 255]
}

fn draw_filled_disc(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius: f32,
    colour: [u8; 4],
) {
    let min_x = (centre_x - radius).floor().max(0.0) as u32;
    let max_x = (centre_x + radius)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = (centre_y - radius).floor().max(0.0) as u32;
    let max_y = (centre_y + radius)
        .ceil()
        .min(height.saturating_sub(1) as f32) as u32;
    let radius_sq = radius * radius;
    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let dx = x as f32 + 0.5 - centre_x;
            let dy = y as f32 + 0.5 - centre_y;
            if dx * dx + dy * dy <= radius_sq {
                let offset = (y as usize * width as usize + x as usize) * 4;
                pixels[offset..offset + 4].copy_from_slice(&colour);
            }
        }
    }
}

fn deterministic_audio_sphere_unit(seed: u64, column: u32, row: u32, lane: u64) -> f32 {
    let mut value = seed
        ^ ((column as u64).wrapping_mul(0x9e37_79b9_7f4a_7c15))
        ^ ((row as u64).wrapping_mul(0xbf58_476d_1ce4_e5b9))
        ^ lane.wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^= value >> 30;
    value = value.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value ^= value >> 27;
    value = value.wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^= value >> 31;
    (value as f64 / u64::MAX as f64) as f32
}

fn write_waveform_pixel(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    colour: [u8; 4],
) {
    if x < 0 || y < 0 || x >= width as i32 || y >= height as i32 {
        return;
    }
    let index = ((y as u32 * width + x as u32) * 4) as usize;
    pixels[index..index + 4].copy_from_slice(&colour);
}

fn float_colour_to_u8(value: f32) -> u8 {
    (value.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn frame_report_to_shared_ring(
    report: NativeWgpuFrameReport,
    memory_id: &str,
    slot_count: u32,
    pts_frame: u64,
) -> Result<NativeWgpuSharedFrameReport, NativeWgpuRenderError> {
    let colour = ColourMetadata {
        primaries: "bt709".to_string(),
        transfer: "srgb".to_string(),
        matrix: "rgb".to_string(),
        range: "full".to_string(),
    };
    let layout = rgba8_srgb_ring_layout(memory_id, slot_count, report.width, report.height, colour)
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
    let renderer = NativeWgpuRenderer::new(width, height).await?;
    let setup = total_start.elapsed();
    renderer
        .render_frame_stages_with_setup(snapshot, sources, setup, total_start)
        .await
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
    colour_aberration_offset_x: f32,
    colour_aberration_offset_y: f32,
    outline_colour_r: f32,
    outline_colour_g: f32,
    outline_colour_b: f32,
    outline_thickness: f32,
    outline_opacity: f32,
    wipe_edge: f32,
    wipe_progress: f32,
    clipping_top: f32,
    clipping_bottom: f32,
    clipping_left: f32,
    clipping_right: f32,
    clipping_angle: f32,
    spot_light_colour_r: f32,
    spot_light_colour_g: f32,
    spot_light_colour_b: f32,
    spot_light_centre_x: f32,
    spot_light_centre_y: f32,
    spot_light_radius: f32,
    spot_light_intensity: f32,
    displacement_amount_x: f32,
    displacement_amount_y: f32,
    displacement_size: f32,
    displacement_strength: f32,
    fake_dof_focus_x: f32,
    fake_dof_focus_y: f32,
    fake_dof_focus_radius: f32,
    fake_dof_blur: f32,
    fake_dof_strength: f32,
    auto_blur_angle: f32,
    auto_blur_radius: f32,
    auto_blur_strength: f32,
    auto_blur_colour_shift: f32,
    stretch_angle: f32,
    stretch_amount: f32,
    stretch_strength: f32,
    multi_slicer_angle: f32,
    multi_slicer_offset: f32,
    multi_slicer_slices: f32,
    multi_slicer_expansion: f32,
    multi_slicer_strength: f32,
    source_width: f32,
    source_height: f32,
    translation_x: f32,
    translation_y: f32,
    scale_x: f32,
    scale_y: f32,
    sampling_mode: f32,
    rotation_cos: f32,
    rotation_sin: f32,
    _padding3: f32,
    _padding4: f32,
    _padding5: f32,
    _padding6: f32,
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
        pixels.extend_from_slice(row);
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

fn padded_bytes_per_row(width: u32) -> u32 {
    let unpadded = width * OUTPUT_BYTES_PER_PIXEL;
    unpadded.div_ceil(COPY_BYTES_PER_ROW_ALIGNMENT) * COPY_BYTES_PER_ROW_ALIGNMENT
}

fn effect_gain(effect: &Effect) -> f32 {
    match effect {
        Effect::LinearGain { gain } => *gain,
        Effect::ColourAberration { .. } => 1.0,
        Effect::Outline { .. } => 1.0,
        Effect::Wipe { .. } => 1.0,
        Effect::Clipping { .. } => 1.0,
        Effect::SpotLight { .. } => 1.0,
        Effect::DisplacementMap { .. } => 1.0,
        Effect::FakeDof { .. } => 1.0,
        Effect::AutoBlur { .. } => 1.0,
        Effect::Stretch { .. } => 1.0,
        Effect::MultiSlicer { .. } => 1.0,
    }
}

fn effect_colour_aberration_offset<F>(clip: &uxfd_rust_core::EvaluatedClip, pick: F) -> f32
where
    F: Fn(&Effect) -> Option<f32>,
{
    clip.effects.iter().filter_map(pick).sum::<f32>().max(0.0)
}

fn outline_colour_component(clip: &uxfd_rust_core::EvaluatedClip, index: usize) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Outline { colour, .. } => Some(colour[index]),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn outline_thickness(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Outline { thickness, .. } => Some(*thickness),
            _ => None,
        })
        .sum::<f32>()
        .max(0.0)
}

fn outline_opacity(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Outline { opacity, .. } => Some(*opacity),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn wipe_edge(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Wipe { edge, .. } => Some(match edge {
                WipeEdge::Left => 0.0,
                WipeEdge::Right => 1.0,
                WipeEdge::Top => 2.0,
                WipeEdge::Bottom => 3.0,
            }),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn wipe_progress(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Wipe { progress, .. } => Some(*progress),
            _ => None,
        })
        .last()
        .unwrap_or(1.0)
        .clamp(0.0, 1.0)
}

fn clipping_extent<F>(clip: &uxfd_rust_core::EvaluatedClip, pick: F) -> f32
where
    F: Fn(&Effect) -> Option<f32>,
{
    clip.effects.iter().filter_map(pick).sum::<f32>().max(0.0)
}

fn clipping_angle(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Clipping { angle_degrees, .. } => Some(angle_degrees.to_radians()),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn spot_light_colour_component(clip: &uxfd_rust_core::EvaluatedClip, index: usize) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::SpotLight { colour, .. } => Some(colour[index]),
            _ => None,
        })
        .last()
        .unwrap_or(1.0)
        .clamp(0.0, 1.0)
}

fn spot_light_centre_component(clip: &uxfd_rust_core::EvaluatedClip, index: usize) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::SpotLight {
                centre_x,
                centre_y,
                ..
            } => Some(if index == 0 { *centre_x } else { *centre_y }),
            _ => None,
        })
        .last()
        .unwrap_or(0.5)
        .clamp(0.0, 1.0)
}

fn spot_light_radius(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::SpotLight { radius, .. } => Some(*radius),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .max(0.0)
}

fn spot_light_intensity(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::SpotLight { intensity, .. } => Some(*intensity),
            _ => None,
        })
        .sum::<f32>()
        .max(0.0)
}

fn displacement_amount_component(clip: &uxfd_rust_core::EvaluatedClip, index: usize) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::DisplacementMap {
                amount_x,
                amount_y,
                ..
            } => Some(if index == 0 { *amount_x } else { *amount_y }),
            _ => None,
        })
        .sum::<f32>()
        .max(0.0)
}

fn displacement_size(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::DisplacementMap { size, .. } => Some(*size),
            _ => None,
        })
        .last()
        .unwrap_or(1.0)
        .max(1.0)
}

fn displacement_strength(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::DisplacementMap { strength, .. } => Some(*strength),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn fake_dof_focus_component(clip: &uxfd_rust_core::EvaluatedClip, index: usize) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::FakeDof {
                focus_x, focus_y, ..
            } => Some(if index == 0 { *focus_x } else { *focus_y }),
            _ => None,
        })
        .last()
        .unwrap_or(0.5)
        .clamp(0.0, 1.0)
}

fn fake_dof_focus_radius(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::FakeDof { focus_radius, .. } => Some(*focus_radius),
            _ => None,
        })
        .last()
        .unwrap_or(0.25)
        .clamp(0.01, 1.0)
}

fn fake_dof_blur(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::FakeDof { blur, .. } => Some(*blur),
            _ => None,
        })
        .sum::<f32>()
        .max(0.0)
}

fn fake_dof_strength(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::FakeDof { strength, .. } => Some(*strength),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn auto_blur_angle(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::AutoBlur { angle_degrees, .. } => Some(angle_degrees.to_radians()),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn auto_blur_radius(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::AutoBlur { radius, .. } => Some(*radius),
            _ => None,
        })
        .sum::<f32>()
        .max(0.0)
}

fn auto_blur_strength(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::AutoBlur { strength, .. } => Some(*strength),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn auto_blur_colour_shift(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::AutoBlur { colour_shift, .. } => Some(*colour_shift),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn stretch_angle(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Stretch { angle_degrees, .. } => Some(angle_degrees.to_radians()),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn stretch_amount(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Stretch { amount, .. } => Some(*amount),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .max(0.0)
}

fn stretch_strength(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Stretch { strength, .. } => Some(*strength),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn multi_slicer_angle(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::MultiSlicer { angle_degrees, .. } => Some(angle_degrees.to_radians()),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
}

fn multi_slicer_offset(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::MultiSlicer { offset, .. } => Some(*offset),
            _ => None,
        })
        .sum::<f32>()
        .max(0.0)
}

fn multi_slicer_slices(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::MultiSlicer { slices, .. } => Some(*slices as f32),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .max(0.0)
}

fn multi_slicer_expansion(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::MultiSlicer { expansion, .. } => Some(*expansion),
            _ => None,
        })
        .sum::<f32>()
        .max(0.0)
}

fn multi_slicer_strength(clip: &uxfd_rust_core::EvaluatedClip) -> f32 {
    clip.effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::MultiSlicer { strength, .. } => Some(*strength),
            _ => None,
        })
        .last()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}
