use std::collections::HashMap;

use uxfd_decode_spike::{
    build_known_cfr_h264_fixture, decode_exported_h264_to_rgba,
    export_rgba_frame_to_h264_420_bt709, export_rgba_frame_to_h264_444,
    export_rgba_frame_to_h264_444_bt709, known_colour_swatch_frame,
};
use uxfd_golden_harness::{compare_rgba_frames, ComparisonThresholds, RgbaFrame};
use uxfd_native_wgpu_renderer::{render_native_wgpu_frame, NativeWgpuRenderError};
use uxfd_rust_core::{ColourPipeline, EvaluatedClip, SceneSnapshot, Transform};

#[test]
fn native_wgpu_frame_round_trips_through_explicit_h264_444_export() {
    let temp_dir = tempfile::tempdir().expect("create temporary directory");
    let (fixture, rendered) = match render_known_swatch(temp_dir.path()) {
        Some(output) => output,
        None => return,
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

#[test]
fn native_wgpu_frame_round_trips_through_bt709_transfer_h264_444_export() {
    let temp_dir = tempfile::tempdir().expect("create temporary directory");
    let (fixture, rendered) = match render_known_swatch(temp_dir.path()) {
        Some(output) => output,
        None => return,
    };
    let exported = export_rgba_frame_to_h264_444_bt709(temp_dir.path(), &rendered)
        .expect("export rendered frame with bt709 transfer");
    let decoded = decode_exported_h264_to_rgba(&exported).expect("decode bt709 H.264");

    assert_eq!(exported.probe.colour_transfer.as_deref(), Some("bt709"));

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
        "native bt709 export round-trip metrics: {:?}, probe={:?}",
        comparison.metrics, exported.probe
    );

    assert!(
        comparison.passed,
        "native wgpu bt709 export round-trip differed from known swatch: {comparison:?}"
    );

    let wysiwyg_comparison = compare_rgba_frames(
        &rendered,
        &decoded,
        ComparisonThresholds {
            max_channel_delta: 3,
            max_mean_absolute_error: 1.25,
            min_psnr: 40.0,
            min_ssim: 0.99,
        },
    );

    eprintln!(
        "native preview-output vs bt709 export-round-trip metrics: {:?}",
        wysiwyg_comparison.metrics
    );

    assert!(
        wysiwyg_comparison.passed,
        "native preview output and bt709 export round-trip output diverged beyond transfer+codec floor: {wysiwyg_comparison:?}"
    );
}

#[test]
fn native_wgpu_frame_interiors_round_trip_through_bt709_yuv420_export() {
    let temp_dir = tempfile::tempdir().expect("create temporary directory");
    let expected_frame =
        known_colour_swatch_frame(128, 128).expect("build large known swatch frame");
    let rendered = match render_frame_from_source(&expected_frame) {
        Some(frame) => frame,
        None => return,
    };
    let exported = export_rgba_frame_to_h264_420_bt709(temp_dir.path(), &rendered)
        .expect("export rendered frame as bt709 yuv420");
    let decoded = decode_exported_h264_to_rgba(&exported).expect("decode bt709 yuv420 H.264");

    assert_eq!(exported.probe.pixel_format.as_deref(), Some("yuvj420p"));
    assert_eq!(exported.probe.colour_transfer.as_deref(), Some("bt709"));

    let full_frame_comparison = compare_rgba_frames(
        &expected_frame,
        &decoded,
        ComparisonThresholds {
            max_channel_delta: 140,
            max_mean_absolute_error: 4.0,
            min_psnr: 25.0,
            min_ssim: 0.99,
        },
    );
    let expected_interiors = extract_swatch_interiors(&expected_frame);
    let decoded_interiors = extract_swatch_interiors(&decoded);
    let interior_comparison = compare_rgba_frames(
        &expected_interiors,
        &decoded_interiors,
        ComparisonThresholds {
            max_channel_delta: 4,
            max_mean_absolute_error: 1.25,
            min_psnr: 40.0,
            min_ssim: 0.99,
        },
    );

    eprintln!(
        "native bt709 yuv420 full-frame metrics: {:?}, interior metrics: {:?}, probe={:?}",
        full_frame_comparison.metrics, interior_comparison.metrics, exported.probe
    );

    assert!(
        full_frame_comparison.passed,
        "native bt709 yuv420 full-frame degradation exceeded recorded subsampling envelope: {full_frame_comparison:?}"
    );
    assert!(
        interior_comparison.passed,
        "native bt709 yuv420 stable swatch interiors diverged beyond transfer+codec floor: {interior_comparison:?}"
    );
}

fn render_known_swatch(
    directory: &std::path::Path,
) -> Option<(
    uxfd_decode_spike::KnownCfrH264Fixture,
    uxfd_golden_harness::RgbaFrame,
)> {
    let fixture = build_known_cfr_h264_fixture(directory).expect("build known swatch fixture");
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
            return None;
        }
        Err(error) => panic!("native wgpu render failed: {error:?}"),
    };

    Some((fixture, rendered))
}

fn render_frame_from_source(source: &RgbaFrame) -> Option<RgbaFrame> {
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
    let sources = HashMap::from([("known-swatch".to_string(), source.clone())]);

    match pollster::block_on(render_native_wgpu_frame(
        &snapshot,
        &sources,
        source.width,
        source.height,
    )) {
        Ok(frame) => Some(frame),
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping export round-trip test: no GPU adapter available");
            None
        }
        Err(error) => panic!("native wgpu render failed: {error:?}"),
    }
}

fn extract_swatch_interiors(frame: &RgbaFrame) -> RgbaFrame {
    let columns = 4;
    let rows = 4;
    let cell_width = frame.width / columns;
    let cell_height = frame.height / rows;
    let x_padding = cell_width / 4;
    let y_padding = cell_height / 4;
    let interior_width = cell_width - x_padding * 2;
    let interior_height = cell_height - y_padding * 2;
    let mut pixels =
        Vec::with_capacity((columns * interior_width * rows * interior_height * 4) as usize);

    for row in 0..rows {
        for interior_y in 0..interior_height {
            let source_y = row * cell_height + y_padding + interior_y;
            for column in 0..columns {
                for interior_x in 0..interior_width {
                    let source_x = column * cell_width + x_padding + interior_x;
                    let offset = ((source_y * frame.width + source_x) * 4) as usize;
                    pixels.extend(&frame.pixels[offset..offset + 4]);
                }
            }
        }
    }

    RgbaFrame::from_rgba8(columns * interior_width, rows * interior_height, pixels)
        .expect("valid swatch interior frame")
}
