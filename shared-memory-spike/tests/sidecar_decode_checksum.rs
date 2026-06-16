use std::time::{SystemTime, UNIX_EPOCH};

use uxfd_decode_spike::{build_known_cfr_h264_fixture, decode_fixture_to_shared_rgba};
use uxfd_shared_memory_spike::{
    crc32, write_sidecar_decoded_frame_to_ring, PosixSharedRing, SidecarDecodeHandoffError,
};
use uxfd_sidecar_protocol::{
    ColourMetadata, ControlEvent, CopyOutState, DecodeFrameRequest, DescriptorValidationError,
    FrameDescriptor, FrameFormat, FrameVerificationStatus,
};

#[test]
fn sidecar_decoded_frame_checksum_matches_direct_decode_reference() {
    let temp_dir = tempfile::tempdir().expect("create temporary directory");
    let fixture = build_known_cfr_h264_fixture(temp_dir.path()).expect("build known fixture");
    let direct = decode_fixture_to_shared_rgba(&fixture).expect("decode reference fixture");
    let frame_len = direct.rgba_frame.pixels.len();
    let request = DecodeFrameRequest {
        job_id: "decode-job-1".to_string(),
        frame_index: 0,
    };
    let ring = PosixSharedRing::create(&unique_shm_name(), frame_len).expect("create shm ring");

    let outcome = write_sidecar_decoded_frame_to_ring(
        &ring,
        request.clone(),
        direct.descriptor.clone(),
        &direct.rgba_frame.pixels,
    )
    .expect("sidecar decode write succeeds");

    assert_eq!(outcome.shared_frame, direct.shared_frame);
    assert_eq!(
        outcome.verification.status,
        FrameVerificationStatus::WithinTolerance
    );
    assert_eq!(
        outcome.verification.checksum.value_hex,
        format!("{:08x}", crc32(&direct.rgba_frame.pixels))
    );
    assert_eq!(outcome.events.len(), 3);
    assert_eq!(
        outcome.events[0],
        ControlEvent::JobStarted {
            job_id: request.job_id.clone(),
        }
    );
    assert_eq!(
        outcome.events[1],
        ControlEvent::FrameReady {
            job_id: request.job_id.clone(),
            frame: direct.shared_frame.clone(),
        }
    );
    assert_eq!(
        outcome.events[2],
        ControlEvent::JobCompleted {
            job_id: request.job_id,
        }
    );

    let mapped = ring.read_frame(0).expect("read sidecar frame from shm");
    assert_eq!(mapped.bytes, direct.rgba_frame.pixels);
    assert_eq!(mapped.expected_checksum, crc32(&direct.rgba_frame.pixels));
    assert_eq!(mapped.actual_checksum, mapped.expected_checksum);

    ring.release_frame(CopyOutState::GpuUploadFenceSignalled)
        .expect("release after checksum verification");
}

#[test]
fn sidecar_handoff_rejects_unsupported_colour_metadata_before_writing() {
    let ring = PosixSharedRing::create(&unique_shm_name(), 4).expect("create shm ring");
    let descriptor = FrameDescriptor {
        memory_id: "decode-spike-memory".to_string(),
        slot_index: 0,
        generation: 0,
        byte_offset: 0,
        byte_len: 4,
        width: 1,
        height: 1,
        stride_bytes: 4,
        format: FrameFormat::Rgba8Srgb,
        colour: ColourMetadata {
            primaries: "bt709".to_string(),
            transfer: "bt709".to_string(),
            matrix: "rgb".to_string(),
            range: "full".to_string(),
        },
    };

    let error = write_sidecar_decoded_frame_to_ring(
        &ring,
        DecodeFrameRequest {
            job_id: "decode-job-unsupported".to_string(),
            frame_index: 0,
        },
        descriptor,
        &[0, 0, 0, 255],
    )
    .expect_err("unsupported transfer must fail before handoff");

    assert!(matches!(
        error,
        SidecarDecodeHandoffError::Descriptor(
            DescriptorValidationError::UnsupportedTransfer { transfer }
        ) if transfer == "bt709"
    ));
}

fn unique_shm_name() -> String {
    let micros = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_micros()
        % 1_000_000;
    format!("/uxfd{}-{micros}", std::process::id())
}
