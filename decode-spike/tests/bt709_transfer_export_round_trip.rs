use uxfd_decode_spike::{
    build_known_cfr_h264_fixture, decode_exported_h264_to_rgba,
    explicit_rgba_to_h264_444_bt709_filter, export_rgba_frame_to_h264_444_bt709, DecodeSpikeError,
};
use uxfd_golden_harness::{compare_rgba_frames, ComparisonThresholds};

#[test]
fn bt709_shipping_filter_converts_srgb_rgba_to_bt709_transfer_h264() {
    let filter = explicit_rgba_to_h264_444_bt709_filter();

    assert!(filter.contains("zscale="));
    assert!(filter.contains("primariesin=bt709"));
    assert!(filter.contains("transferin=iec61966-2-1"));
    assert!(filter.contains("matrixin=gbr"));
    assert!(filter.contains("rangein=full"));
    assert!(filter.contains("primaries=bt709"));
    assert!(filter.contains("transfer=bt709"));
    assert!(filter.contains("matrix=bt709"));
    assert!(filter.contains("range=full"));
    assert!(filter.contains("format=yuv444p"));
}

#[test]
fn known_swatch_round_trips_through_bt709_transfer_h264_444_export() -> Result<(), DecodeSpikeError>
{
    let temp_dir = tempfile::tempdir().expect("create temporary directory");
    let fixture = build_known_cfr_h264_fixture(temp_dir.path())?;

    let exported = export_rgba_frame_to_h264_444_bt709(temp_dir.path(), &fixture.expected_frame)?;

    assert_eq!(exported.probe.codec_name, "h264");
    assert_eq!(exported.probe.avg_frame_rate, "30/1");
    assert_eq!(exported.probe.frame_count, Some(1));
    assert_eq!(exported.probe.colour_range.as_deref(), Some("pc"));
    assert_eq!(exported.probe.colour_space.as_deref(), Some("bt709"));
    assert_eq!(exported.probe.colour_transfer.as_deref(), Some("bt709"));
    assert_eq!(exported.probe.colour_primaries.as_deref(), Some("bt709"));

    let decoded = decode_exported_h264_to_rgba(&exported)?;
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
        "bt709 transfer export round-trip metrics: {:?}",
        comparison.metrics
    );

    assert!(
        comparison.passed,
        "bt709 transfer export round-trip differed from known swatch: {comparison:?}"
    );

    Ok(())
}
