use uxfd_sidecar_protocol::{
    validate_renderer_handoff_descriptor, ColourMetadata, DescriptorValidationError,
    FrameDescriptor, FrameFormat,
};

fn descriptor_with_colour(colour: ColourMetadata) -> FrameDescriptor {
    FrameDescriptor {
        memory_id: "decode-ring".to_string(),
        slot_index: 0,
        generation: 0,
        byte_offset: 0,
        byte_len: 2_048,
        width: 32,
        height: 16,
        stride_bytes: 128,
        format: FrameFormat::Rgba8Srgb,
        colour,
    }
}

#[test]
fn renderer_handoff_accepts_srgb_full_range_rgba8() {
    let descriptor = descriptor_with_colour(ColourMetadata::rec709_srgb());

    assert_eq!(validate_renderer_handoff_descriptor(&descriptor), Ok(()));
}

#[test]
fn renderer_handoff_rejects_bt709_transfer_until_supported() {
    let descriptor = descriptor_with_colour(ColourMetadata {
        primaries: "bt709".to_string(),
        transfer: "bt709".to_string(),
        matrix: "rgb".to_string(),
        range: "full".to_string(),
    });

    assert_eq!(
        validate_renderer_handoff_descriptor(&descriptor),
        Err(DescriptorValidationError::UnsupportedTransfer {
            transfer: "bt709".to_string()
        })
    );
}

#[test]
fn renderer_handoff_rejects_limited_range_until_supported() {
    let descriptor = descriptor_with_colour(ColourMetadata {
        primaries: "bt709".to_string(),
        transfer: "srgb".to_string(),
        matrix: "rgb".to_string(),
        range: "tv".to_string(),
    });

    assert_eq!(
        validate_renderer_handoff_descriptor(&descriptor),
        Err(DescriptorValidationError::UnsupportedRange {
            range: "tv".to_string()
        })
    );
}
