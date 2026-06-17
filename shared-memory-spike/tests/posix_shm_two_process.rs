use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

use uxfd_shared_memory_spike::{PosixSharedRing, PosixShmError, SharedRingAttachError};

static UNIQUE_SHM_COUNTER: AtomicU64 = AtomicU64::new(0);

#[test]
fn two_processes_exchange_frames_after_attach_retry() {
    let name = unique_shm_name();
    let frame_len = "4096";
    let iterations = "250";

    let mut consumer = Command::new(env!("CARGO_BIN_EXE_uxfd-shm-consumer"))
        .arg(&name)
        .arg(frame_len)
        .arg(iterations)
        .spawn()
        .expect("spawn shm consumer");

    std::thread::sleep(std::time::Duration::from_millis(100));

    let producer_status = Command::new(env!("CARGO_BIN_EXE_uxfd-shm-producer"))
        .arg(&name)
        .arg(frame_len)
        .arg(iterations)
        .status()
        .expect("run shm producer");

    let consumer_status = consumer.wait().expect("wait for shm consumer");

    assert!(
        producer_status.success(),
        "producer failed: {producer_status}"
    );
    assert!(
        consumer_status.success(),
        "consumer failed: {consumer_status}"
    );
}

#[test]
fn posix_shm_attach_rejects_layout_hash_mismatch() {
    let name = unique_shm_name();
    let ring = PosixSharedRing::create(&name, 4096).expect("create shm ring");
    let expected = ring.debug_corrupt_layout_hash_for_test();

    let result = PosixSharedRing::attach_with_retry(&name, 4096, Duration::from_secs(1));

    assert!(matches!(
        result,
        Err(PosixShmError::Attach(
            SharedRingAttachError::LayoutHashMismatch { expected: _, actual }
        )) if actual == expected ^ 0x01
    ));
}

#[test]
fn posix_shm_multi_slot_allows_next_frame_while_previous_frame_is_reading() {
    let name = unique_shm_name();
    let producer_ring =
        PosixSharedRing::create_with_slot_count(&name, 2, 16).expect("create multi-slot ring");
    let consumer_ring =
        PosixSharedRing::attach_with_retry_for_layout(&name, 2, 16, Duration::from_secs(1))
            .expect("attach multi-slot ring");
    let first = vec![1; 16];
    let second = vec![2; 16];

    producer_ring
        .write_frame(0, &first)
        .expect("write first frame");
    let first_read = consumer_ring
        .read_frame(0)
        .expect("consumer holds first frame");
    assert_eq!(first_read.bytes, first);

    producer_ring
        .write_frame(1, &second)
        .expect("producer uses second slot while first is reading");
    let second_read = consumer_ring
        .read_frame(1)
        .expect("consumer reads second frame");
    assert_eq!(second_read.bytes, second);

    producer_ring
        .release_frame(uxfd_sidecar_protocol::CopyOutState::GpuUploadFenceSignalled)
        .expect("release one reading slot");
    producer_ring
        .release_frame(uxfd_sidecar_protocol::CopyOutState::GpuUploadFenceSignalled)
        .expect("release remaining reading slot");
    producer_ring
        .wait_until_free(Duration::from_secs(1))
        .expect("all slots return to free");
}

fn unique_shm_name() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_nanos() as u64;
    let counter = UNIQUE_SHM_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!(
        "/u{:x}{:x}{:x}",
        std::process::id(),
        counter,
        nanos & 0xfffff
    )
}
