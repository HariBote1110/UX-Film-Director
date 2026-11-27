use uxfd_decode_spike::{
    build_known_cfr_h264_fixture, decode_fixture_to_shared_rgba, DecodeSpikeError,
};
use uxfd_golden_harness::{compare_rgba_frames, ComparisonThresholds};
use uxfd_sidecar_protocol::{ColourMetadata, FrameFormat, FrameVerificationStatus};

#[test]
fn known_cfr_h264_frame_decodes_to_expected_rgba_and_descriptor() -> Result<(), DecodeSpikeError> {
    let temp_dir = tempfile::tempdir().expect("create temporary directory");
    let fixture = build_known_cfr_h264_fixture(temp_dir.path())?;

    assert!(
        has_red_swatch(&fixture.expected_frame.pixels),
        "known frame must exercise Cr / red matrix contribution"
    );
    assert!(
        has_blue_swatch(&fixture.expected_frame.pixels),
        "known frame must exercise Cb / blue matrix contribution"
    );
    assert!(
        has_mixed_chroma_swatch(&fixture.expected_frame.pixels),
        "known frame must include non-primary chroma for matrix/range mistakes"
    );

    assert_eq!(fixture.probe.codec_name, "h264");
    assert_eq!(fixture.probe.avg_frame_rate, "30/1");
    assert_eq!(fixture.probe.frame_count, Some(1));
    assert_eq!(fixture.probe.colour_range.as_deref(), Some("pc"));
    assert_eq!(fixture.probe.colour_space.as_deref(), Some("bt709"));
    assert_eq!(
        fixture.probe.colour_transfer.as_deref(),
        Some("iec61966-2-1")
    );
    assert_eq!(fixture.probe.colour_primaries.as_deref(), Some("bt709"));

    let decoded = decode_fixture_to_shared_rgba(&fixture)?;

    assert_eq!(decoded.decode_invocation_count, 1);
    assert_eq!(decoded.shared_frame.pts_frame, 0);
    assert_eq!(decoded.descriptor.width, fixture.expected_frame.width);
    assert_eq!(decoded.descriptor.height, fixture.expected_frame.height);
    assert_eq!(
        decoded.descriptor.stride_bytes,
        fixture.expected_frame.width * 4
    );
    assert_eq!(decoded.descriptor.format, FrameFormat::Rgba8Srgb);
    assert_eq!(decoded.descriptor.colour, ColourMetadata::rec709_srgb());
    assert_eq!(decoded.shared_frame.descriptor, decoded.descriptor);

    let comparison = compare_rgba_frames(
        &fixture.expected_frame,
        &decoded.rgba_frame,
        ComparisonThresholds {
            max_channel_delta: 3,
            max_mean_absolute_error: 1.0,
            min_psnr: 40.0,
            min_ssim: 0.99,
        },
    );

    eprintln!(
        "decode metrics: {:?}, checksum: {:?}",
        comparison.metrics, decoded.verification.checksum
    );

    assert!(
        comparison.passed,
        "known CFR frame should decode within tolerance, metrics: {:?}, cause: {:?}",
        comparison.metrics, comparison.cause
    );
    assert_eq!(
        decoded.verification.status,
        FrameVerificationStatus::WithinTolerance
    );
    assert_eq!(
        decoded
            .verification
            .diff
            .expect("diff summary")
            .max_channel_delta,
        comparison.metrics.max_channel_delta
    );

    Ok(())
}

fn has_red_swatch(pixels: &[u8]) -> bool {
    pixels
        .chunks_exact(4)
        .any(|pixel| pixel[0] > 180 && pixel[1] < 80 && pixel[2] < 80)
}

fn has_blue_swatch(pixels: &[u8]) -> bool {
    pixels
        .chunks_exact(4)
        .any(|pixel| pixel[2] > 180 && pixel[0] < 80 && pixel[1] < 80)
}

fn has_mixed_chroma_swatch(pixels: &[u8]) -> bool {
    pixels
        .chunks_exact(4)
        .any(|pixel| pixel[0] > 180 && pixel[1] > 90 && pixel[2] < 80)
        && pixels
            .chunks_exact(4)
            .any(|pixel| pixel[0] < 80 && pixel[1] > 150 && pixel[2] > 150)
}
