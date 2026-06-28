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
fn posix_shm_create_reclaims_a_leaked_shm_name_from_a_crashed_owner() {
    // A previous owner that was SIGKILLed (e.g. the dev app force-quit) never ran
    // Drop, so its POSIX shm name persists. Simulate that by creating a ring and
    // leaking it (std::mem::forget skips the unlinking Drop), then prove a fresh
    // create with the same name reclaims it instead of failing with AlreadyExists.
    let name = unique_shm_name();
    let leaked = PosixSharedRing::create_with_slot_count(&name, 1, 16)
        .expect("create initial ring");
    std::mem::forget(leaked);

    let reclaimed = PosixSharedRing::create_with_slot_count(&name, 1, 16)
        .expect("recreate must reclaim the leaked shm name rather than fail AlreadyExists");
    drop(reclaimed);
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
    assert_eq!(first_read.slot_index, 0);
    assert_eq!(first_read.bytes, first);

    producer_ring
        .write_frame(1, &second)
        .expect("producer uses second slot while first is reading");
    let second_read = consumer_ring
        .read_frame(1)
        .expect("consumer reads second frame");
    assert_eq!(second_read.slot_index, 1);
    assert_eq!(second_read.bytes, second);

    producer_ring
        .release_frame_slot(1, uxfd_sidecar_protocol::CopyOutState::GpuUploadFenceSignalled)
        .expect("release the second reading slot by lease");
    producer_ring
        .write_frame(2, &second)
        .expect("released second slot can be reused while first remains reading");
    let reused_second = consumer_ring
        .read_frame(2)
        .expect("consumer reads frame written to released second slot");
    assert_eq!(reused_second.slot_index, 1);

    producer_ring
        .release_frame_slot(0, uxfd_sidecar_protocol::CopyOutState::GpuUploadFenceSignalled)
        .expect("release first reading slot");
    producer_ring
        .release_frame_slot(1, uxfd_sidecar_protocol::CopyOutState::GpuUploadFenceSignalled)
        .expect("release remaining reading slot");
    producer_ring
        .wait_until_free(Duration::from_secs(1))
        .expect("all slots return to free");
}

#[test]
fn posix_shm_slot_can_be_released_after_encoder_writes_frame() {
    let name = unique_shm_name();
    let producer_ring =
        PosixSharedRing::create_with_slot_count(&name, 1, 16).expect("create encoder source ring");
    let encoder_ring =
        PosixSharedRing::attach_with_retry_for_layout(&name, 1, 16, Duration::from_secs(1))
            .expect("attach encoder source ring");

    producer_ring
        .write_frame(7, &[0x42; 16])
        .expect("write frame for encoder");
    encoder_ring
        .read_frame(7)
        .expect("encoder reads frame from shared memory");

    encoder_ring
        .release_frame(uxfd_sidecar_protocol::CopyOutState::EncoderFrameWritten)
        .expect("release after encoder wrote frame");
    producer_ring
        .wait_until_free(Duration::from_secs(1))
        .expect("slot returns to free after encoder write");
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
