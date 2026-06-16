use std::collections::HashMap;

use uxfd_decode_spike::{
    build_known_cfr_h264_fixture, decode_exported_h264_to_rgba, export_rgba_frame_to_h264_444,
};
use uxfd_golden_harness::{compare_rgba_frames, ComparisonThresholds};
use uxfd_native_wgpu_renderer::{render_native_wgpu_frame, NativeWgpuRenderError};
use uxfd_rust_core::{ColourPipeline, EvaluatedClip, SceneSnapshot, Transform};

#[test]
fn native_wgpu_frame_round_trips_through_explicit_h264_444_export() {
    let temp_dir = tempfile::tempdir().expect("create temporary directory");
    let fixture =
        build_known_cfr_h264_fixture(temp_dir.path()).expect("build known swatch fixture");
    let snapshot = SceneSnapshot {
        frame_index: 0,
        colour: ColourPipeline::rec709_sdr_linear(),
        clips: vec![EvaluatedClip {
            clip_id: "clip-export".to_string(),
            track_id: "track-1".to_string(),
            media_id: "known-swatch".to_string(),
            source_frame: 0,
            z_index: 0,
            transform: Transform::identity(),
            opacity: 1.0,
            effects: Vec::new(),
        }],
    };
    let sources = HashMap::from([("known-swatch".to_string(), fixture.expected_frame.clone())]);

    let rendered = match pollster::block_on(render_native_wgpu_frame(
        &snapshot,
        &sources,
        fixture.expected_frame.width,
        fixture.expected_frame.height,
    )) {
        Ok(frame) => frame,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping export round-trip test: no GPU adapter available");
            return;
        }
        Err(error) => panic!("native wgpu render failed: {error:?}"),
    };
    let exported = export_rgba_frame_to_h264_444(temp_dir.path(), &rendered)
        .expect("export rendered frame with explicit colour conversion");
    let decoded = decode_exported_h264_to_rgba(&exported).expect("decode exported H.264");

    let comparison = compare_rgba_frames(
        &fixture.expected_frame,
        &decoded,
        ComparisonThresholds {
            max_channel_delta: 4,
            max_mean_absolute_error: 1.25,
            min_psnr: 40.0,
            min_ssim: 0.99,
        },
    );

    eprintln!(
        "native export round-trip metrics: {:?}, probe={:?}",
        comparison.metrics, exported.probe
    );

    assert!(
        comparison.passed,
        "native wgpu export round-trip differed from known swatch: {comparison:?}"
    );

    let wysiwyg_comparison = compare_rgba_frames(
        &rendered,
        &decoded,
        ComparisonThresholds {
            max_channel_delta: 2,
            max_mean_absolute_error: 1.25,
            min_psnr: 40.0,
            min_ssim: 0.99,
        },
    );

    eprintln!(
        "native preview-output vs export-round-trip metrics: {:?}",
        wysiwyg_comparison.metrics
    );

    assert!(
        wysiwyg_comparison.passed,
        "native preview output and export round-trip output diverged beyond codec floor: {wysiwyg_comparison:?}"
    );
}
