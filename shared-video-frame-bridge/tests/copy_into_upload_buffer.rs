use std::ffi::CString;
use std::mem::size_of;
use std::ptr;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use uxfd_shared_memory_spike::{PosixSharedRing, SharedRingHeader};
use uxfd_shared_video_frame_bridge::copy_shared_frame_into_upload_buffer;
use uxfd_sidecar_protocol::CopyOutState;

static SHM_NAME_COUNTER: AtomicU64 = AtomicU64::new(0);

#[test]
fn copies_posix_shared_frame_into_renderer_upload_buffer_without_releasing_slot() {
    let name = unique_shm_name();
    let producer_ring =
        PosixSharedRing::create_with_slot_count(&name, 2, 16).expect("create shared frame ring");
    let source = vec![0x7a; 16];
    producer_ring
        .write_frame(42, &source)
        .expect("write decoded frame");

    let mut upload_buffer = vec![0; 16];
    let report = copy_shared_frame_into_upload_buffer(
        &name,
        2,
        16,
        0,
        1,
        42,
        &mut upload_buffer,
        Duration::from_secs(1),
    )
    .expect("copy shared frame into upload buffer");

    assert_eq!(upload_buffer, source);
    assert_eq!(report.sequence, 42);
    assert_eq!(report.slot_index, 0);
    assert_eq!(report.generation, 1);
    assert_eq!(report.byte_len, 16);
    assert_eq!(report.actual_checksum, report.expected_checksum);
    assert!(
        producer_ring.write_frame(43, &source).is_ok(),
        "second slot remains available while copied frame is still reading"
    );
    producer_ring
        .release_frame(CopyOutState::GpuUploadFenceSignalled)
        .expect("release copied frame after upload fence");
}

#[test]
fn rejects_shared_frame_when_resolved_slot_does_not_match_descriptor_slot() {
    let name = unique_shm_name();
    let producer_ring =
        PosixSharedRing::create_with_slot_count(&name, 2, 16).expect("create shared frame ring");
    let source = vec![0x7b; 16];
    producer_ring
        .write_frame(42, &source)
        .expect("write decoded frame");

    let mut upload_buffer = vec![0; 16];
    let error = copy_shared_frame_into_upload_buffer(
        &name,
        2,
        16,
        1,
        1,
        42,
        &mut upload_buffer,
        Duration::from_secs(1),
    )
    .expect_err("copy must reject a descriptor slot that does not own the ready frame");

    assert!(format!("{error:?}").contains("SlotLeaseMismatch"));
}

#[test]
fn releases_corrupted_shared_frame_slot_after_checksum_mismatch() {
    let name = unique_shm_name();
    let producer_ring =
        PosixSharedRing::create_with_slot_count(&name, 1, 16).expect("create shared frame ring");
    let source = vec![0x7c; 16];
    producer_ring
        .write_frame(42, &source)
        .expect("write decoded frame");
    corrupt_first_frame_byte(&name, 1, 16);

    let mut upload_buffer = vec![0; 16];
    let error = copy_shared_frame_into_upload_buffer(
        &name,
        1,
        16,
        0,
        1,
        42,
        &mut upload_buffer,
        Duration::from_secs(1),
    )
    .expect_err("copy must reject a corrupted shared frame checksum");

    assert!(format!("{error:?}").contains("ChecksumMismatch"));
    assert!(
        producer_ring.write_frame(43, &source).is_ok(),
        "checksum mismatch must not leak the corrupted slot in READING state"
    );
}

#[repr(C)]
struct TestSharedSlotHeader {
    state: AtomicU32,
    _padding0: u32,
    sequence: AtomicU64,
    checksum: AtomicU32,
    _padding1: u32,
}

fn corrupt_first_frame_byte(name: &str, slot_count: u32, slot_byte_len: usize) {
    let c_name = CString::new(name).expect("test shm name should not contain nul");
    let fd = unsafe { libc::shm_open(c_name.as_ptr(), libc::O_RDWR, 0o600) };
    assert!(fd >= 0, "open test shm for corruption");
    let mapping_len = size_of::<SharedRingHeader>()
        + size_of::<TestSharedSlotHeader>() * slot_count as usize
        + slot_byte_len * slot_count as usize;
    let ptr = unsafe {
        libc::mmap(
            ptr::null_mut(),
            mapping_len,
            libc::PROT_READ | libc::PROT_WRITE,
            libc::MAP_SHARED,
            fd,
            0,
        )
    };
    assert_ne!(ptr, libc::MAP_FAILED, "map test shm for corruption");
    let bytes_offset = size_of::<SharedRingHeader>()
        + size_of::<TestSharedSlotHeader>() * slot_count as usize;
    unsafe {
        let byte = (ptr as *mut u8).add(bytes_offset);
        *byte ^= 0xff;
        assert_eq!(libc::munmap(ptr, mapping_len), 0);
        assert_eq!(libc::close(fd), 0);
    }
}

fn unique_shm_name() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_nanos() as u64;
    let counter = SHM_NAME_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("/u{:x}{:x}{:x}", std::process::id(), nanos, counter)
}
