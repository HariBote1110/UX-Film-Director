use uxfd_sidecar_protocol::{
    AcquireReadError, AcquireWriteError, AtomicOrdering, ColourMetadata, ConsumerTopology,
    CopyOutState, FrameFormat, FrameRingLayout, MultiConsumerPolicy, SharedFrameRing, SlotState,
    SlotStateStorage, SlotTransitionError,
};

fn layout(slot_count: u32) -> FrameRingLayout {
    FrameRingLayout::new(
        "uxfd-frame-ring-1",
        slot_count,
        33_177_600,
        3840,
        2160,
        15_360,
        FrameFormat::Rgba8Srgb,
        ColourMetadata::rec709_srgb(),
    )
    .expect("valid frame ring layout")
}

#[test]
fn layout_derives_stable_descriptor_offsets_for_each_slot() {
    let ring_layout = layout(3);

    let first = ring_layout
        .descriptor_for_slot(0)
        .expect("first descriptor");
    let third = ring_layout
        .descriptor_for_slot(2)
        .expect("third descriptor");

    assert_eq!(first.memory_id, "uxfd-frame-ring-1");
    assert_eq!(first.slot_index, 0);
    assert_eq!(first.byte_offset, 0);
    assert_eq!(first.byte_len, 33_177_600);
    assert_eq!(third.slot_index, 2);
    assert_eq!(third.byte_offset, 66_355_200);
    assert_eq!(third.byte_len, 33_177_600);
}

#[test]
fn layout_preserves_padded_stride_and_colour_metadata() {
    let padded_layout = FrameRingLayout::new(
        "uxfd-padded-frame-ring",
        1,
        8192,
        1919,
        1,
        7680,
        FrameFormat::Rgba8Srgb,
        ColourMetadata::rec709_srgb(),
    )
    .expect("valid padded frame layout");

    let descriptor = padded_layout
        .descriptor_for_slot(0)
        .expect("padded descriptor");

    assert_eq!(descriptor.width, 1919);
    assert_eq!(descriptor.stride_bytes, 7680);
    assert_ne!(descriptor.stride_bytes, descriptor.width * 4);
    assert_eq!(descriptor.colour, ColourMetadata::rec709_srgb());
}

#[test]
fn producer_consumer_cycle_returns_slot_to_free() {
    let mut ring = SharedFrameRing::new(layout(2));

    assert_eq!(ring.slot_state(0), Some(SlotState::Free));

    let write_slot = ring.acquire_write_slot().expect("free slot");

    assert_eq!(write_slot.slot_index, 0);
    assert_eq!(write_slot.descriptor.byte_offset, 0);
    assert_eq!(ring.slot_state(0), Some(SlotState::Writing));

    let shared_frame = ring
        .mark_slot_ready(write_slot, 42)
        .expect("writing slot can become ready");

    assert_eq!(shared_frame.pts_frame, 42);
    assert_eq!(ring.slot_state(0), Some(SlotState::Ready));

    let ready_frame = ring.acquire_ready_slot().expect("ready slot");

    assert_eq!(ready_frame.slot_index, 0);
    assert_eq!(ready_frame.frame, shared_frame);
    assert_eq!(ring.slot_state(0), Some(SlotState::Reading));

    ring.release_read_slot(ready_frame, CopyOutState::GpuUploadFenceSignalled)
        .expect("reading slot can be released");

    assert_eq!(ring.slot_state(0), Some(SlotState::Free));
}

#[test]
fn producer_observes_back_pressure_when_no_free_slot_exists() {
    let mut ring = SharedFrameRing::new(layout(1));

    let write_slot = ring.acquire_write_slot().expect("initial free slot");

    assert_eq!(
        ring.acquire_write_slot(),
        Err(AcquireWriteError::NoFreeSlot)
    );

    ring.mark_slot_ready(write_slot, 7)
        .expect("written frame becomes ready");

    assert_eq!(
        ring.acquire_write_slot(),
        Err(AcquireWriteError::NoFreeSlot)
    );
}

#[test]
fn consumer_observes_empty_ring_when_no_ready_slot_exists() {
    let mut ring = SharedFrameRing::new(layout(1));

    assert_eq!(
        ring.acquire_ready_slot(),
        Err(AcquireReadError::NoReadySlot)
    );

    let write_slot = ring.acquire_write_slot().expect("free slot");

    assert_eq!(
        ring.acquire_ready_slot(),
        Err(AcquireReadError::NoReadySlot)
    );

    ring.mark_slot_ready(write_slot, 9)
        .expect("written frame becomes ready");

    let ready_frame = ring.acquire_ready_slot().expect("ready slot");

    assert_eq!(
        ring.acquire_ready_slot(),
        Err(AcquireReadError::NoReadySlot)
    );

    ring.release_read_slot(ready_frame, CopyOutState::GpuUploadFenceSignalled)
        .expect("reading slot can be released");

    assert!(ring.acquire_write_slot().is_ok());
}

#[test]
fn reading_slot_is_not_freed_until_copy_out_completion_is_signalled() {
    let mut ring = SharedFrameRing::new(layout(1));
    let write_slot = ring.acquire_write_slot().expect("free slot");
    ring.mark_slot_ready(write_slot, 11)
        .expect("written frame becomes ready");
    let ready_frame = ring.acquire_ready_slot().expect("ready slot");

    assert_eq!(
        ring.release_read_slot(ready_frame.clone(), CopyOutState::Started),
        Err(SlotTransitionError::CopyOutNotComplete { slot_index: 0 })
    );
    assert_eq!(ring.slot_state(0), Some(SlotState::Reading));
    assert_eq!(
        ring.acquire_write_slot(),
        Err(AcquireWriteError::NoFreeSlot)
    );

    ring.release_read_slot(ready_frame, CopyOutState::GpuUploadFenceSignalled)
        .expect("GPU upload fence permits release");

    assert_eq!(ring.slot_state(0), Some(SlotState::Free));
}

#[test]
fn synchronisation_contract_requires_release_acquire_slot_state() {
    let contract = SharedFrameRing::synchronisation_contract();

    assert_eq!(contract.slot_state_storage, SlotStateStorage::AtomicU32);
    assert_eq!(contract.producer_ready_store, AtomicOrdering::Release);
    assert_eq!(contract.consumer_ready_load, AtomicOrdering::Acquire);
    assert_eq!(
        contract.consumer_topology,
        ConsumerTopology::SingleProducerSingleConsumer
    );
    assert_eq!(
        contract.multi_consumer_policy,
        MultiConsumerPolicy::IndependentRingPerConsumer
    );
    assert_eq!(
        contract.reading_to_free_requires,
        CopyOutState::GpuUploadFenceSignalled
    );
}
