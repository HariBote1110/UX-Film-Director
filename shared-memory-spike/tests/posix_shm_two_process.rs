use std::process::Command;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

use uxfd_shared_memory_spike::{PosixSharedRing, PosixShmError, SharedRingAttachError};

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

fn unique_shm_name() -> String {
    let micros = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_micros()
        % 1_000_000;
    format!("/uxfd{}-{micros}", std::process::id())
}
