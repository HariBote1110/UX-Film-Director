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

// POSIX-only: this reclaims a name left behind by a SIGKILLed owner via
// shm_unlink. On Windows a named file mapping has no equivalent "leaked
// name" state to reclaim — the kernel object is reference-counted and the
// OS closes every handle (destroying the object) as soon as the owning
// process exits, crashed or not. See `windows_shm_two_process.rs` for the
// Windows-side collision behaviour this replaces.
#[cfg(unix)]
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
fn posix_shm_write_frame_returns_the_slot_index_it_actually_wrote() {
    let name = unique_shm_name();
    let producer_ring =
        PosixSharedRing::create_with_slot_count(&name, 2, 16).expect("create multi-slot ring");
    let consumer_ring =
        PosixSharedRing::attach_with_retry_for_layout(&name, 2, 16, Duration::from_secs(1))
            .expect("attach multi-slot ring");
    let first = vec![1; 16];
    let second = vec![2; 16];

    let first_written_slot = producer_ring
        .write_frame(0, &first)
        .expect("write first frame returns the slot index it used");
    assert_eq!(
        first_written_slot, 0,
        "first write must land in the first free slot"
    );

    // Keep the first slot in READING so the second write is forced into slot 1;
    // the returned slot index must reflect that, not just "the caller's guess".
    let first_read = consumer_ring
        .read_frame(0)
        .expect("consumer holds first frame");
    assert_eq!(first_read.slot_index, 0);

    let second_written_slot = producer_ring
        .write_frame(1, &second)
        .expect("producer uses second slot while first is reading");
    assert_eq!(
        second_written_slot, 1,
        "write_frame must report the real data-plane slot it wrote, not an assumed one"
    );

    consumer_ring
        .release_frame_slot(0, uxfd_sidecar_protocol::CopyOutState::GpuUploadFenceSignalled)
        .expect("release first reading slot");
    producer_ring
        .wait_until_free(Duration::from_secs(1))
        .map(|_| ())
        .unwrap_or(());
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

/// Contract for the sequence-verified lease release used by the decode
/// data-plane: a leased frame must be releasable whether or not it was ever
/// read (READY or READING), and releasing a lease whose slot has already
/// been recycled for a different frame must be a safe no-op instead of
/// freeing somebody else's frame.
#[test]
fn posix_shm_release_frame_slot_for_sequence_frees_leased_frames_and_ignores_recycled_slots() {
    let name = unique_shm_name();
    let ring =
        PosixSharedRing::create_with_slot_count(&name, 1, 16).expect("create single-slot ring");
    let payload = vec![0x51; 16];

    // Case 1: a written frame that was never read (READY) is aborted by the
    // renderer before any copy. The release must still free the slot.
    let written_slot = ring.write_frame(7, &payload).expect("write frame 7");
    ring.release_frame_slot_for_sequence(
        written_slot,
        7,
        uxfd_sidecar_protocol::CopyOutState::RendererUploadAborted,
    )
    .expect("aborting an unread READY frame must free its slot");

    // Case 2: a frame the consumer has read (READING) releases normally.
    let written_slot = ring
        .write_frame(8, &payload)
        .expect("slot freed by case 1 accepts a new frame");
    ring.read_frame(8).expect("consumer reads frame 8");
    ring.release_frame_slot_for_sequence(
        written_slot,
        8,
        uxfd_sidecar_protocol::CopyOutState::GpuUploadFenceSignalled,
    )
    .expect("releasing a READING frame by sequence must free its slot");

    // Case 3: a READY frame released with gpuUploadFenceSignalled (the
    // inline MVP upload path never reads the shared memory slot but still
    // reports a completed upload) must also free the slot.
    let written_slot = ring
        .write_frame(9, &payload)
        .expect("slot freed by case 2 accepts a new frame");
    ring.release_frame_slot_for_sequence(
        written_slot,
        9,
        uxfd_sidecar_protocol::CopyOutState::GpuUploadFenceSignalled,
    )
    .expect("releasing an unread READY frame after an inline upload must free its slot");

    // Case 4: releasing a lease whose slot now holds a DIFFERENT frame
    // (the slot was freed by another consumer and recycled) must not touch
    // the newer frame.
    let written_slot = ring
        .write_frame(10, &payload)
        .expect("slot freed by case 3 accepts a new frame");
    ring.release_frame_slot_for_sequence(
        written_slot,
        9, // stale lease: the slot now holds sequence 10
        uxfd_sidecar_protocol::CopyOutState::RendererUploadAborted,
    )
    .expect("releasing a recycled lease must be a safe no-op");
    ring.read_frame(10)
        .expect("the newer frame must still be readable after the stale release");
    ring.release_frame_slot_for_sequence(
        written_slot,
        10,
        uxfd_sidecar_protocol::CopyOutState::GpuUploadFenceSignalled,
    )
    .expect("release the newer frame normally");

    ring.wait_until_free(Duration::from_secs(1))
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

// POSIX-only: macOS's PSHMNAMLEN = 31 limit does not apply on Windows,
// which names its file mappings in the `Local\` kernel object namespace
// (MAX_PATH-based limit, see `windows_shm_two_process.rs`). The naming
// rules are deliberately not shared between platforms.
#[cfg(unix)]
#[test]
fn posix_shm_create_rejects_names_longer_than_the_macos_shm_name_limit_before_calling_shm_open() {
    // macOS caps POSIX shm names (including the leading '/') at 31 bytes
    // (PSHMNAMLEN). A name over that limit makes shm_open(2) fail with
    // ENAMETOOLONG (observed in practice as an opaque
    // `Io { operation: "shm_open(create)", source: Os { code: 63, .. } }`).
    // Callers should get an explicit, self-describing error before the OS
    // call rather than have to decode an OS errno to diagnose a naming bug.
    let too_long_name = format!("/{}", "a".repeat(31));
    assert_eq!(too_long_name.len(), 32, "fixture name must exceed the 31 byte limit");

    let result = PosixSharedRing::create_with_slot_count(&too_long_name, 1, 16);

    assert!(
        matches!(result, Err(PosixShmError::NameTooLong { limit: 31, actual: 32 })),
        "expected an explicit NameTooLong error, got: {result:?}"
    );
}

#[cfg(unix)]
#[test]
fn posix_shm_attach_rejects_names_longer_than_the_macos_shm_name_limit_before_calling_shm_open() {
    let too_long_name = format!("/{}", "b".repeat(31));

    let result = PosixSharedRing::attach_with_retry(&too_long_name, 16, Duration::from_millis(10));

    assert!(
        matches!(result, Err(PosixShmError::NameTooLong { limit: 31, actual: 32 })),
        "expected an explicit NameTooLong error, got: {result:?}"
    );
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
