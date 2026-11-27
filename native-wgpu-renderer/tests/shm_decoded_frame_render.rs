use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use uxfd_decode_spike::{build_known_cfr_h264_fixture, decode_fixture_to_shared_rgba};
use uxfd_golden_harness::{compare_rgba_frames, ComparisonThresholds, RgbaFrame};
use uxfd_native_wgpu_renderer::{render_native_wgpu_frame, NativeWgpuRenderError};
use uxfd_rust_core::{ColourPipeline, EvaluatedClip, SceneSnapshot, Transform};
use uxfd_shared_memory_spike::PosixSharedRing;
use uxfd_sidecar_protocol::CopyOutState;

#[test]
fn shm_decoded_frame_renders_to_known_swatch() {
    let temp_dir = tempfile::tempdir().expect("create temporary directory");
    let fixture = build_known_cfr_h264_fixture(temp_dir.path()).expect("build known fixture");
    let decoded = decode_fixture_to_shared_rgba(&fixture).expect("decode known fixture");
    let frame_len = decoded.rgba_frame.pixels.len();

    let ring = PosixSharedRing::create(&unique_shm_name(), frame_len).expect("create shm ring");
    ring.write_frame(0, &decoded.rgba_frame.pixels)
        .expect("write decoded frame to shm");
    let mapped = ring.read_frame(0).expect("read decoded frame from shm");
    let shm_frame = RgbaFrame::from_rgba8(
        decoded.rgba_frame.width,
        decoded.rgba_frame.height,
        mapped.bytes,
    )
    .expect("valid shm RGBA frame");

    let snapshot = SceneSnapshot {
        frame_index: 0,
        colour: ColourPipeline::rec709_sdr_linear(),
        clips: vec![EvaluatedClip {
            clip_id: "clip-decoded".to_string(),
            track_id: "track-1".to_string(),
            media_id: "decoded-video".to_string(),
            source_frame: 0,
            z_index: 0,
            transform: Transform::identity(),
            opacity: 1.0,
            effects: Vec::new(),
        }],
    };
    let sources = HashMap::from([("decoded-video".to_string(), Arc::new(shm_frame))]);

    let native_result = pollster::block_on(render_native_wgpu_frame(
        &snapshot,
        &sources,
        decoded.rgba_frame.width,
        decoded.rgba_frame.height,
    ));
    let rendered = match native_result {
        Ok(frame) => frame,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping shm decoded render test: no GPU adapter available");
            return;
        }
        Err(error) => panic!("native wgpu render failed: {error:?}"),
    };

    ring.release_frame(CopyOutState::GpuUploadFenceSignalled)
        .expect("release after render completion");

    let comparison = compare_rgba_frames(
        &fixture.expected_frame,
        &rendered,
        ComparisonThresholds {
            max_channel_delta: 3,
            max_mean_absolute_error: 1.0,
            min_psnr: 40.0,
            min_ssim: 0.99,
        },
    );

    eprintln!("shm decoded render metrics: {:?}", comparison.metrics);

    assert!(
        comparison.passed,
        "shm decoded render differed from known swatch: {comparison:?}"
    );
}

fn unique_shm_name() -> String {
    let micros = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_micros()
        % 1_000_000;
    format!("/uxfd{}-{micros}", std::process::id())
}
