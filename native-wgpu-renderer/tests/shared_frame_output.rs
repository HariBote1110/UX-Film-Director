use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use uxfd_golden_harness::RgbaFrame;
use uxfd_native_wgpu_renderer::{
    render_native_wgpu_frame, render_native_wgpu_frame_to_shared_ring,
    render_native_wgpu_frame_to_shared_ring_with_audio_waveforms,
    render_native_wgpu_frame_with_audio_waveforms, NativeAudioWaveformInput, NativeWgpuRenderError,
};
use uxfd_rust_core::{
    AudioWaveformSource, ColourPipeline, EvaluatedClip, SceneSnapshot, Transform,
};
use uxfd_sidecar_protocol::FrameFormat;

#[test]
fn native_wgpu_frame_can_be_written_to_shared_frame_ring() {
    let width = 4;
    let height = 4;
    let snapshot = SceneSnapshot {
        frame_index: 3,
        colour: ColourPipeline::rec709_sdr_linear(),
        clips: vec![EvaluatedClip {
            clip_id: "clip-shared-frame".to_string(),
            track_id: "track-1".to_string(),
            media_id: "source-1".to_string(),
            source_frame: 0,
            z_index: 0,
            transform: Transform::identity(),
            opacity: 1.0,
            effects: Vec::new(),
        }],
    };
    let sources = HashMap::from([(
        "source-1".to_string(),
        gradient_frame(width, height).expect("valid gradient frame"),
    )]);
    let memory_id = unique_shm_name();

    let rendered =
        match pollster::block_on(render_native_wgpu_frame(&snapshot, &sources, width, height)) {
            Ok(frame) => frame,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping shared frame output test: no GPU adapter available");
                return;
            }
            Err(error) => panic!("native wgpu render failed: {error:?}"),
        };

    let output = match pollster::block_on(render_native_wgpu_frame_to_shared_ring(
        &snapshot, &sources, width, height, &memory_id, 2, 3,
    )) {
        Ok(output) => output,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping shared frame output test: no GPU adapter available");
            return;
        }
        Err(error) => panic!("native wgpu shared-frame render failed: {error:?}"),
    };

    assert_eq!(output.slot_count, 2);
    assert_eq!(output.shared_frame.pts_frame, 3);
    assert_eq!(output.shared_frame.descriptor.memory_id, memory_id);
    assert_eq!(output.shared_frame.descriptor.width, width);
    assert_eq!(output.shared_frame.descriptor.height, height);
    assert_eq!(
        output.shared_frame.descriptor.format,
        FrameFormat::Rgba8Srgb
    );
    assert_eq!(output.shared_frame.descriptor.stride_bytes % 256, 0);
    assert_eq!(
        output.shared_frame.descriptor.byte_len,
        u64::from(output.shared_frame.descriptor.stride_bytes) * u64::from(height)
    );

    let mapped = output
        .ring
        .read_frame(3)
        .expect("read rendered shared frame");
    assert_eq!(
        mapped.bytes.len() as u64,
        output.shared_frame.descriptor.byte_len
    );

    for row in 0..height as usize {
        let source_start = row * width as usize * 4;
        let source_end = source_start + width as usize * 4;
        let shared_start = row * output.shared_frame.descriptor.stride_bytes as usize;
        let shared_end = shared_start + width as usize * 4;
        assert_eq!(
            &mapped.bytes[shared_start..shared_end],
            &rendered.pixels[source_start..source_end]
        );
    }
}

#[test]
fn native_wgpu_generated_waveform_shared_frame_matches_direct_frame() {
    let width = 8;
    let height = 4;
    let snapshot = SceneSnapshot {
        frame_index: 5,
        colour: ColourPipeline::rec709_sdr_linear(),
        clips: vec![
            EvaluatedClip {
                clip_id: "clip-background".to_string(),
                track_id: "track-1".to_string(),
                media_id: "background".to_string(),
                source_frame: 0,
                z_index: 0,
                transform: Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            },
            EvaluatedClip {
                clip_id: "clip-waveform".to_string(),
                track_id: "track-2".to_string(),
                media_id: "waveform-1".to_string(),
                source_frame: 3,
                z_index: 1,
                transform: Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            },
        ],
    };
    let sources = HashMap::from([(
        "background".to_string(),
        RgbaFrame::from_rgba8(
            width,
            height,
            vec![12, 18, 24, 255].repeat(width as usize * height as usize),
        )
        .expect("valid background frame"),
    )]);
    let waveform = NativeAudioWaveformInput {
        media_id: "waveform-1".to_string(),
        source: AudioWaveformSource::from_json(
            r##"{"generator":"audio-waveform-r","target_audio_id":"audio-1","target_source":"/tmp/music.wav","sample_window_seconds":1,"colour":"#00ff66","thickness":1,"amplitude":1}"##,
        )
        .expect("valid waveform source"),
        samples: vec![-1.0, -0.5, 0.0, 0.5, 1.0, 0.5, 0.0, -0.5],
        sample_rate: 8,
        width,
        height,
    };
    let memory_id = unique_shm_name();

    let rendered = match pollster::block_on(render_native_wgpu_frame_with_audio_waveforms(
        &snapshot,
        &sources,
        &[waveform.clone()],
        width,
        height,
    )) {
        Ok(frame) => frame,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping generated waveform shared-frame test: no GPU adapter available");
            return;
        }
        Err(error) => panic!("native wgpu generated waveform render failed: {error:?}"),
    };

    let output = match pollster::block_on(
        render_native_wgpu_frame_to_shared_ring_with_audio_waveforms(
            &snapshot,
            &sources,
            &[waveform],
            width,
            height,
            &memory_id,
            2,
            5,
        ),
    ) {
        Ok(output) => output,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping generated waveform shared-frame test: no GPU adapter available");
            return;
        }
        Err(error) => {
            panic!("native wgpu generated waveform shared-frame render failed: {error:?}")
        }
    };

    let mapped = output
        .ring
        .read_frame(5)
        .expect("read rendered generated waveform shared frame");
    for row in 0..height as usize {
        let source_start = row * width as usize * 4;
        let source_end = source_start + width as usize * 4;
        let shared_start = row * output.shared_frame.descriptor.stride_bytes as usize;
        let shared_end = shared_start + width as usize * 4;
        assert_eq!(
            &mapped.bytes[shared_start..shared_end],
            &rendered.pixels[source_start..source_end]
        );
    }
}

fn gradient_frame(
    width: u32,
    height: u32,
) -> Result<RgbaFrame, uxfd_golden_harness::RgbaFrameError> {
    let mut pixels = Vec::with_capacity(width as usize * height as usize * 4);
    for y in 0..height {
        for x in 0..width {
            pixels.extend([(x * 11) as u8, (y * 17) as u8, ((x + y) * 23) as u8, 255]);
        }
    }

    RgbaFrame::from_rgba8(width, height, pixels)
}

fn unique_shm_name() -> String {
    let micros = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_micros()
        % 1_000_000;
    format!("/uxfd{}-{micros}", std::process::id())
}
