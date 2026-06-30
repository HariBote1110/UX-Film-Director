use std::collections::HashMap;
use std::time::Duration;

use uxfd_golden_harness::{compare_rgba_frames, ComparisonThresholds, RgbaFrame};
use uxfd_native_wgpu_renderer::{
    measure_native_wgpu_frame_stages, measure_native_wgpu_present_stages,
    native_wgpu_readback_frame_format,
    NativeWgpuFrameStageTimings, NativeWgpuRenderError, NativeWgpuRenderer,
};
use uxfd_reference_renderer::render_reference_frame;
use uxfd_rust_core::{ColourPipeline, EvaluatedClip, SceneSnapshot, Transform};
use uxfd_sidecar_protocol::FrameFormat;

#[test]
fn stage_timings_separate_upload_render_and_readback_encode_legs() {
    let width = 64;
    let height = 64;
    let snapshot = SceneSnapshot {
        frame_index: 0,
        colour: ColourPipeline::rec709_sdr_linear(),
        clips: vec![EvaluatedClip {
            clip_id: "clip-1".to_string(),
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
    let reference =
        render_reference_frame(&snapshot, &sources, width, height).expect("reference frame");

    let measured = match pollster::block_on(measure_native_wgpu_frame_stages(
        &snapshot, &sources, width, height,
    )) {
        Ok(report) => report,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping stage timing test: no GPU adapter available");
            return;
        }
        Err(error) => panic!("native wgpu stage measurement failed: {error:?}"),
    };

    assert_stage_timings_are_populated(measured.timings);
    assert_eq!(measured.width, width);
    assert_eq!(measured.height, height);

    let comparison = compare_rgba_frames(
        &reference,
        &measured.frame,
        ComparisonThresholds {
            max_channel_delta: 1,
            max_mean_absolute_error: 1.0,
            min_psnr: 48.0,
            min_ssim: 0.99,
        },
    );

    assert!(
        comparison.passed,
        "measured native frame differed from CPU reference: {comparison:?}"
    );
}

#[test]
fn persistent_renderer_keeps_gpu_setup_out_of_per_frame_timings() {
    let width = 64;
    let height = 64;
    let snapshot = SceneSnapshot {
        frame_index: 0,
        colour: ColourPipeline::rec709_sdr_linear(),
        clips: vec![EvaluatedClip {
            clip_id: "clip-1".to_string(),
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

    let renderer = match pollster::block_on(NativeWgpuRenderer::new(width, height)) {
        Ok(renderer) => renderer,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping persistent renderer test: no GPU adapter available");
            return;
        }
        Err(error) => panic!("persistent native wgpu renderer setup failed: {error:?}"),
    };
    let first = pollster::block_on(renderer.render_frame_stages(&snapshot, &sources))
        .expect("first persistent render succeeds");
    let second = pollster::block_on(renderer.render_frame_stages(&snapshot, &sources))
        .expect("second persistent render succeeds");

    assert_eq!(renderer.width(), width);
    assert_eq!(renderer.height(), height);
    assert_eq!(first.timings.setup, Duration::ZERO);
    assert_eq!(second.timings.setup, Duration::ZERO);
    assert_duration_recorded(second.timings.source_upload);
    assert_duration_recorded(second.timings.render);
    assert_duration_recorded(second.timings.readback_encode);
}

#[test]
fn present_stage_timings_skip_readback_for_overlay_surface_mode() {
    let width = 64;
    let height = 64;
    let snapshot = SceneSnapshot {
        frame_index: 0,
        colour: ColourPipeline::rec709_sdr_linear(),
        clips: vec![EvaluatedClip {
            clip_id: "clip-1".to_string(),
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

    let measured = match pollster::block_on(measure_native_wgpu_present_stages(
        &snapshot, &sources, width, height,
    )) {
        Ok(report) => report,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping present timing test: no GPU adapter available");
            return;
        }
        Err(error) => panic!("native wgpu present measurement failed: {error:?}"),
    };

    assert_eq!(measured.width, width);
    assert_eq!(measured.height, height);
    assert_duration_recorded(measured.timings.setup);
    assert_duration_recorded(measured.timings.source_upload);
    assert_duration_recorded(measured.timings.render);
    assert_eq!(measured.timings.readback_encode, Duration::ZERO);
    assert_eq!(
        measured.timings.steady_state,
        measured.timings.source_upload + measured.timings.render
    );
}

#[test]
fn native_wgpu_readback_uses_rgba8_export_frame_format() {
    assert_eq!(native_wgpu_readback_frame_format(), FrameFormat::Rgba8Srgb);
}

fn assert_stage_timings_are_populated(timings: NativeWgpuFrameStageTimings) {
    assert_duration_recorded(timings.setup);
    assert_duration_recorded(timings.source_upload);
    assert_duration_recorded(timings.render);
    assert_duration_recorded(timings.readback_encode);
    assert_duration_recorded(timings.steady_state);
    assert_duration_recorded(timings.total);
    assert_eq!(
        timings.steady_state,
        timings.source_upload + timings.render + timings.readback_encode
    );
    assert!(timings.total >= timings.setup);
    assert!(timings.total >= timings.steady_state);
    assert!(timings.total >= timings.source_upload);
    assert!(timings.total >= timings.render);
    assert!(timings.total >= timings.readback_encode);
}

fn assert_duration_recorded(duration: Duration) {
    assert!(
        duration > Duration::ZERO,
        "expected non-zero timing, got {duration:?}"
    );
}

fn gradient_frame(
    width: u32,
    height: u32,
) -> Result<RgbaFrame, uxfd_golden_harness::RgbaFrameError> {
    let mut pixels = Vec::with_capacity(width as usize * height as usize * 4);
    for y in 0..height {
        for x in 0..width {
            pixels.extend([(x % 256) as u8, (y % 256) as u8, ((x + y) % 256) as u8, 255]);
        }
    }

    RgbaFrame::from_rgba8(width, height, pixels)
}
