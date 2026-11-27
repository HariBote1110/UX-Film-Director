use uxfd_decode_spike::{
    build_known_cfr_h264_limited_range_fixture, decode_fixture_to_shared_rgba,
    explicit_rgba_to_limited_range_h264_444_filter, DecodeSpikeError,
};
use uxfd_golden_harness::{compare_rgba_frames, ComparisonThresholds};
use uxfd_sidecar_protocol::{ColourMetadata, FrameFormat, FrameVerificationStatus};

#[test]
fn limited_range_encode_filter_names_range_expansion_contract() {
    let filter = explicit_rgba_to_limited_range_h264_444_filter();

    assert!(filter.contains("zscale="));
    assert!(filter.contains("rangein=full"));
    assert!(filter.contains("range=limited"));
    assert!(filter.contains("format=yuv444p"));
}

#[test]
fn limited_range_cfr_h264_decodes_to_srgb_full_range_rgba() -> Result<(), DecodeSpikeError> {
    let temp_dir = tempfile::tempdir().expect("create temporary directory");
    let fixture = build_known_cfr_h264_limited_range_fixture(temp_dir.path())?;

    assert_eq!(fixture.probe.codec_name, "h264");
    assert_eq!(fixture.probe.avg_frame_rate, "30/1");
    assert_eq!(fixture.probe.frame_count, Some(1));
    assert_eq!(fixture.probe.colour_range.as_deref(), Some("tv"));
    assert_eq!(fixture.probe.colour_space.as_deref(), Some("bt709"));
    assert_eq!(
        fixture.probe.colour_transfer.as_deref(),
        Some("iec61966-2-1")
    );
    assert_eq!(fixture.probe.colour_primaries.as_deref(), Some("bt709"));

    let decoded = decode_fixture_to_shared_rgba(&fixture)?;

    assert_eq!(decoded.descriptor.format, FrameFormat::Rgba8Srgb);
    assert_eq!(decoded.descriptor.colour, ColourMetadata::rec709_srgb());
    assert_eq!(
        decoded.verification.status,
        FrameVerificationStatus::WithinTolerance
    );

    let comparison = compare_rgba_frames(
        &fixture.expected_frame,
        &decoded.rgba_frame,
        ComparisonThresholds {
            max_channel_delta: 4,
            max_mean_absolute_error: 1.25,
            min_psnr: 40.0,
            min_ssim: 0.99,
        },
    );

    eprintln!("limited range decode metrics: {:?}", comparison.metrics);

    assert!(
        comparison.passed,
        "limited range decode should expand to full-range RGBA: {comparison:?}"
    );

    Ok(())
}
