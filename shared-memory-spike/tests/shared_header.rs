use std::mem::{offset_of, size_of};

use uxfd_shared_memory_spike::{
    expected_shared_ring_layout_hash, SharedRingAttachError, SharedRingHeader,
    SHARED_RING_PROTOCOL_VERSION,
};

#[test]
fn shared_header_has_stable_repr_c_layout() {
    assert_eq!(offset_of!(SharedRingHeader, magic), 0);
    assert_eq!(offset_of!(SharedRingHeader, layout_hash), 8);
    assert_eq!(offset_of!(SharedRingHeader, slot_byte_len), 16);
    assert_eq!(offset_of!(SharedRingHeader, protocol_version), 24);
    assert_eq!(offset_of!(SharedRingHeader, header_bytes), 28);
    assert_eq!(offset_of!(SharedRingHeader, slot_count), 32);
    assert_eq!(offset_of!(SharedRingHeader, init_state), 36);
    assert_eq!(size_of::<SharedRingHeader>(), 40);
}

#[test]
fn shared_header_rejects_attach_before_initialisation() {
    let header = SharedRingHeader::new(3, 4096);

    assert_eq!(
        header.validate_attach(),
        Err(SharedRingAttachError::NotInitialised)
    );
}

#[test]
fn shared_header_validates_magic_version_and_layout_hash() {
    let header = SharedRingHeader::new(3, 4096);
    header.mark_initialised();

    assert_eq!(header.validate_attach(), Ok(()));
    assert_eq!(header.protocol_version, SHARED_RING_PROTOCOL_VERSION);
    assert_eq!(header.layout_hash, expected_shared_ring_layout_hash());
}

#[test]
fn shared_header_rejects_layout_hash_mismatch() {
    let mut header = SharedRingHeader::new(3, 4096);
    header.layout_hash ^= 0x01;
    header.mark_initialised();

    assert_eq!(
        header.validate_attach(),
        Err(SharedRingAttachError::LayoutHashMismatch {
            expected: expected_shared_ring_layout_hash(),
            actual: header.layout_hash,
        })
    );
}
