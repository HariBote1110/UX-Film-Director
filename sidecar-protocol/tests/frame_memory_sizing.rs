use uxfd_sidecar_protocol::{
    frame_buffer_footprint, rgba8_srgb_ring_layout, ColourMetadata, FrameFormat,
};

#[test]
fn rgba8_4k_decode_slot_is_stride_times_height() {
    let footprint =
        frame_buffer_footprint(3840, 2160, FrameFormat::Rgba8Srgb).expect("4K RGBA8 footprint");

    assert_eq!(footprint.bytes_per_pixel, 4);
    assert_eq!(footprint.unpadded_bytes_per_row, 15_360);
    assert_eq!(footprint.stride_bytes, 15_360);
    assert_eq!(footprint.slot_byte_len, 33_177_600);
}

#[test]
fn rgba16float_4k_render_target_is_double_rgba8_when_rows_are_aligned() {
    let footprint = frame_buffer_footprint(3840, 2160, FrameFormat::Rgba16FloatLinear)
        .expect("4K rgba16float footprint");

    assert_eq!(footprint.bytes_per_pixel, 8);
    assert_eq!(footprint.unpadded_bytes_per_row, 30_720);
    assert_eq!(footprint.stride_bytes, 30_720);
    assert_eq!(footprint.slot_byte_len, 66_355_200);
}

#[test]
fn rgba16float_stride_is_padded_to_256_byte_gpu_copy_alignment() {
    let footprint = frame_buffer_footprint(1919, 1, FrameFormat::Rgba16FloatLinear)
        .expect("padded rgba16float footprint");

    assert_eq!(footprint.unpadded_bytes_per_row, 15_352);
    assert_eq!(footprint.stride_bytes, 15_360);
    assert_eq!(footprint.slot_byte_len, 15_360);
}

#[test]
fn ring_layout_can_be_derived_from_rgba8_footprint() {
    let layout = rgba8_srgb_ring_layout(
        "uxfd-4k-preview-ring",
        3,
        3840,
        2160,
        ColourMetadata::rec709_srgb(),
    )
    .expect("derived 4K ring layout");

    let descriptor = layout
        .descriptor_for_slot(2)
        .expect("third slot descriptor");

    assert_eq!(descriptor.memory_id, "uxfd-4k-preview-ring");
    assert_eq!(descriptor.slot_index, 2);
    assert_eq!(descriptor.byte_offset, 66_355_200);
    assert_eq!(descriptor.byte_len, 33_177_600);
    assert_eq!(descriptor.stride_bytes, 15_360);
    assert_eq!(descriptor.format, FrameFormat::Rgba8Srgb);
    assert_eq!(descriptor.colour, ColourMetadata::rec709_srgb());
}
