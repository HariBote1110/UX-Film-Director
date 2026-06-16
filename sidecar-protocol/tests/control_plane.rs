use uxfd_sidecar_protocol::{
    ColourMetadata, ControlEvent, DecodeFrameRequest, FrameDescriptor, FrameFormat, SharedFrame,
};

#[test]
fn frame_ready_event_serialises_descriptor_without_frame_bytes() {
    let event = ControlEvent::FrameReady {
        job_id: "decode-1".to_string(),
        frame: SharedFrame {
            descriptor: FrameDescriptor {
                memory_id: "uxfd-frame-ring-1".to_string(),
                slot_index: 2,
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
