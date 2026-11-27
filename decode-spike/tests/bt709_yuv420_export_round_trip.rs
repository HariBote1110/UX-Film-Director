use uxfd_decode_spike::{
    decode_exported_h264_to_rgba, explicit_rgba_to_h264_420_bt709_filter,
    export_rgba_frame_to_h264_420_bt709, known_colour_swatch_frame, DecodeSpikeError,
};
use uxfd_golden_harness::{compare_rgba_frames, ComparisonThresholds, RgbaFrame};

#[test]
fn bt709_yuv420_filter_names_subsampled_distribution_contract() {
    let filter = explicit_rgba_to_h264_420_bt709_filter();

    assert!(filter.contains("zscale="));
    assert!(filter.contains("primariesin=bt709"));
    assert!(filter.contains("transferin=iec61966-2-1"));
    assert!(filter.contains("matrixin=gbr"));
    assert!(filter.contains("rangein=full"));
    assert!(filter.contains("primaries=bt709"));
    assert!(filter.contains("transfer=bt709"));
    assert!(filter.contains("matrix=bt709"));
    assert!(filter.contains("range=full"));
    assert!(filter.contains("format=yuv420p"));
}

#[test]
fn known_swatch_interiors_round_trip_through_bt709_yuv420_export() -> Result<(), DecodeSpikeError> {
    let temp_dir = tempfile::tempdir().expect("create temporary directory");
    let expected_frame = known_colour_swatch_frame(128, 128)?;

    let exported = export_rgba_frame_to_h264_420_bt709(temp_dir.path(), &expected_frame)?;

    assert_eq!(exported.probe.codec_name, "h264");
    assert_eq!(exported.probe.pixel_format.as_deref(), Some("yuvj420p"));
    assert_eq!(exported.probe.colour_range.as_deref(), Some("pc"));
    assert_eq!(exported.probe.colour_space.as_deref(), Some("bt709"));
    assert_eq!(exported.probe.colour_transfer.as_deref(), Some("bt709"));
    assert_eq!(exported.probe.colour_primaries.as_deref(), Some("bt709"));

    let decoded = decode_exported_h264_to_rgba(&exported)?;
    let full_frame_comparison = compare_rgba_frames(
        &expected_frame,
        &decoded,
        ComparisonThresholds {
            max_channel_delta: 6,
            max_mean_absolute_error: 1.5,
            min_psnr: 38.0,
            min_ssim: 0.99,
        },
    );

    eprintln!(
        "bt709 yuv420 full-frame round-trip metrics: {:?}",
        full_frame_comparison.metrics
    );

    let expected_interiors = extract_swatch_interiors(&expected_frame);
    let decoded_interiors = extract_swatch_interiors(&decoded);
    let interior_comparison = compare_rgba_frames(
        &expected_interiors,
        &decoded_interiors,
        ComparisonThresholds {
            max_channel_delta: 6,
            max_mean_absolute_error: 1.5,
            min_psnr: 38.0,
            min_ssim: 0.99,
        },
    );

    eprintln!(
        "bt709 yuv420 swatch-interior round-trip metrics: {:?}",
        interior_comparison.metrics
    );

    assert!(
        interior_comparison.passed,
        "bt709 yuv420 export round-trip differed inside stable swatch regions: {interior_comparison:?}"
    );

    Ok(())
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
