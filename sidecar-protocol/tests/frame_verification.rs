use uxfd_sidecar_protocol::{
    ChecksumAlgorithm, FrameChecksum, FrameVerificationReport, FrameVerificationStatus,
    PixelDiffSummary,
};

#[test]
fn frame_verification_report_serialises_checksum_and_diff_without_pixels() {
    let report = FrameVerificationReport {
        frame_index: 42,
        checksum: FrameChecksum {
            algorithm: ChecksumAlgorithm::Crc32,
            value_hex: "9f2a1c0b".to_string(),
            byte_len: 33_177_600,
        },
        diff: Some(PixelDiffSummary {
            max_channel_delta: 2,
            mean_absolute_error: 0.125,
            differing_channels: 128,
        }),
        status: FrameVerificationStatus::WithinTolerance,
    };

    let encoded = serde_json::to_value(report).expect("serialise verification report");

    assert_eq!(encoded["frameIndex"], 42);
    assert_eq!(encoded["checksum"]["algorithm"], "crc32");
    assert_eq!(encoded["checksum"]["valueHex"], "9f2a1c0b");
    assert_eq!(encoded["checksum"]["byteLen"], 33_177_600);
    assert_eq!(encoded["diff"]["maxChannelDelta"], 2);
    assert_eq!(encoded["diff"]["meanAbsoluteError"], 0.125);
    assert_eq!(encoded["status"], "withinTolerance");
    assert!(encoded.get("bytes").is_none());
    assert!(encoded.get("pixels").is_none());
    assert!(encoded.get("frameBase64").is_none());
}

#[test]
fn frame_verification_status_distinguishes_mismatch_from_infra_failure() {
    let mismatch =
        serde_json::to_value(FrameVerificationStatus::Mismatch).expect("serialise mismatch status");
    let failed =
        serde_json::to_value(FrameVerificationStatus::VerificationFailed).expect("serialise fail");

    assert_eq!(mismatch, "mismatch");
    assert_eq!(failed, "verificationFailed");
}
