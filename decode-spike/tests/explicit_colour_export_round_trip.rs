use uxfd_decode_spike::{
    build_known_cfr_h264_fixture, decode_exported_h264_to_rgba, explicit_rgba_to_h264_444_filter,
    export_rgba_frame_to_h264_444, DecodeSpikeError,
};
use uxfd_golden_harness::{compare_rgba_frames, ComparisonThresholds};

#[test]
fn explicit_rgba_to_h264_filter_names_input_and_output_colour_contract() {
    let filter = explicit_rgba_to_h264_444_filter();

    assert!(filter.contains("zscale="));
    assert!(filter.contains("primariesin=bt709"));
    assert!(filter.contains("transferin=iec61966-2-1"));
    assert!(filter.contains("matrixin=gbr"));
    assert!(filter.contains("rangein=full"));
    assert!(filter.contains("primaries=bt709"));
    assert!(filter.contains("transfer=iec61966-2-1"));
    assert!(filter.contains("matrix=bt709"));
    assert!(filter.contains("range=full"));
    assert!(filter.contains("format=yuv444p"));
}

#[test]
fn known_swatch_round_trips_through_explicit_h264_444_export() -> Result<(), DecodeSpikeError> {
    let temp_dir = tempfile::tempdir().expect("create temporary directory");
    let fixture = build_known_cfr_h264_fixture(temp_dir.path())?;

    let exported = export_rgba_frame_to_h264_444(temp_dir.path(), &fixture.expected_frame)?;

    assert_eq!(exported.probe.codec_name, "h264");
    assert_eq!(exported.probe.avg_frame_rate, "30/1");
    assert_eq!(exported.probe.frame_count, Some(1));
    assert_eq!(exported.probe.colour_range.as_deref(), Some("pc"));
    assert_eq!(exported.probe.colour_space.as_deref(), Some("bt709"));
    assert_eq!(
        exported.probe.colour_transfer.as_deref(),
        Some("iec61966-2-1")
    );
    assert_eq!(exported.probe.colour_primaries.as_deref(), Some("bt709"));

    let decoded = decode_exported_h264_to_rgba(&exported)?;
    let comparison = compare_rgba_frames(
        &fixture.expected_frame,
        &decoded,
        ComparisonThresholds {
            max_channel_delta: 3,
            max_mean_absolute_error: 1.0,
            min_psnr: 40.0,
            min_ssim: 0.99,
        },
    );

    eprintln!(
        "explicit export round-trip metrics: {:?}",
        comparison.metrics
    );

    assert!(
        comparison.passed,
        "explicit colour export round-trip differed from known swatch: {comparison:?}"
    );

    Ok(())
}
