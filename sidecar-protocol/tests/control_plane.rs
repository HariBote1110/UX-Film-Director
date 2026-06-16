use uxfd_sidecar_protocol::{
    ColourMetadata, ControlEvent, DecodeFrameRequest, DecodeReleaseFrameRequest,
    DecodeStartRequest, DecodeStartResponse, FrameDescriptor, FrameFormat, SharedFrame,
    CopyOutState,
};

#[test]
fn decode_start_request_declares_ring_layout_without_frame_bytes() {
    let request = DecodeStartRequest {
        job_id: "decode-1".to_string(),
        source: "/media/input.mp4".to_string(),
        slot_count: 3,
        width: 3840,
        height: 2160,
        format: FrameFormat::Rgba8Srgb,
        colour: ColourMetadata::rec709_srgb(),
    };

    let encoded = serde_json::to_value(request).expect("serialise decode start request");

    assert_eq!(encoded["jobId"], "decode-1");
    assert_eq!(encoded["source"], "/media/input.mp4");
    assert_eq!(encoded["slotCount"], 3);
    assert_eq!(encoded["format"], "rgba8Srgb");
    assert_eq!(encoded["colour"]["transfer"], "srgb");
    assert!(encoded.get("frameBase64").is_none());
    assert!(encoded.get("bytes").is_none());
    assert!(encoded.get("pixels").is_none());
}

#[test]
fn decode_start_response_returns_shared_ring_descriptor_without_pixels() {
    let response = DecodeStartResponse {
        job_id: "decode-1".to_string(),
        memory_id: "uxfd-frame-ring-1".to_string(),
        slot_count: 3,
        slot_byte_len: 33_177_600,
        width: 3840,
        height: 2160,
        stride_bytes: 15_360,
        format: FrameFormat::Rgba8Srgb,
        colour: ColourMetadata::rec709_srgb(),
    };

    let encoded = serde_json::to_value(response).expect("serialise decode start response");

    assert_eq!(encoded["jobId"], "decode-1");
    assert_eq!(encoded["memoryId"], "uxfd-frame-ring-1");
    assert_eq!(encoded["slotByteLen"], 33_177_600);
    assert_eq!(encoded["strideBytes"], 15_360);
    assert!(encoded.get("frameBase64").is_none());
    assert!(encoded.get("bytes").is_none());
    assert!(encoded.get("pixels").is_none());
}

#[test]
fn frame_ready_event_serialises_descriptor_without_frame_bytes() {
    let event = ControlEvent::FrameReady {
        job_id: "decode-1".to_string(),
        frame: SharedFrame {
            descriptor: FrameDescriptor {
                memory_id: "uxfd-frame-ring-1".to_string(),
                slot_index: 2,
                generation: 5,
                byte_offset: 16_777_216,
                byte_len: 33_177_600,
                width: 3840,
                height: 2160,
                stride_bytes: 15_360,
                format: FrameFormat::Rgba8Srgb,
                colour: ColourMetadata::rec709_srgb(),
            },
            pts_frame: 42,
        },
    };

    let encoded = serde_json::to_value(event).expect("serialise frame-ready event");

    assert_eq!(encoded["type"], "frameReady");
    assert_eq!(encoded["jobId"], "decode-1");
    assert_eq!(
        encoded["frame"]["descriptor"]["memoryId"],
        "uxfd-frame-ring-1"
    );
    assert_eq!(encoded["frame"]["descriptor"]["slotIndex"], 2);
    assert_eq!(encoded["frame"]["descriptor"]["format"], "rgba8Srgb");
    assert!(encoded.to_string().len() < 700);
    assert!(encoded.get("frameBase64").is_none());
    assert!(encoded["frame"].get("bytes").is_none());
    assert!(encoded["frame"].get("pixels").is_none());
}

#[test]
fn decode_frame_request_uses_frame_index_not_float_seconds() {
    let request = DecodeFrameRequest {
        job_id: "decode-1".to_string(),
        frame_index: 120,
    };

    let encoded = serde_json::to_value(request).expect("serialise decode request");

    assert_eq!(encoded["jobId"], "decode-1");
    assert_eq!(encoded["frameIndex"], 120);
    assert!(encoded.get("seconds").is_none());
    assert!(encoded.get("time").is_none());
}

#[test]
fn decode_release_frame_request_requires_generation_and_completed_gpu_copy_out() {
    let request = DecodeReleaseFrameRequest {
        job_id: "decode-1".to_string(),
        slot_index: 2,
        generation: 5,
        copy_out_state: CopyOutState::GpuUploadFenceSignalled,
    };

    let encoded = serde_json::to_value(request).expect("serialise decode release request");

    assert_eq!(encoded["jobId"], "decode-1");
    assert_eq!(encoded["slotIndex"], 2);
    assert_eq!(encoded["generation"], 5);
    assert_eq!(encoded["copyOutState"], "gpuUploadFenceSignalled");
    assert!(encoded.get("frameBase64").is_none());
    assert!(encoded.get("bytes").is_none());
    assert!(encoded.get("pixels").is_none());
}
