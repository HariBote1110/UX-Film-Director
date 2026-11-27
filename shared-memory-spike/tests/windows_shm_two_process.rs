#![cfg(windows)]
// Windows-only counterpart to `posix_shm_two_process.rs`'s naming and
// stale-name tests: `Local\` namespace, MAX_PATH-based length limit, and no
// "reclaim a leaked name" behaviour (see the rationale left next to
// `posix_shm_create_reclaims_a_leaked_shm_name_from_a_crashed_owner`).
// These exercise the same `PosixSharedRing` public API POSIX does; only the
// platform's naming/collision rules differ.

use std::time::Duration;

use uxfd_shared_memory_spike::{PosixSharedRing, PosixShmError};

#[test]
fn windows_shm_create_accepts_a_name_over_the_posix_31_byte_limit() {
    // 40 bytes (including the leading '/') would be rejected by the POSIX
    // path (PSHMNAMLEN = 31) but must be accepted on Windows, which uses
    // the much larger `Local\` + MAX_PATH namespace instead. Proves the two
    // naming schemes are not forced onto each other.
    let name = format!("/{}", "c".repeat(39));
    assert_eq!(name.len(), 40, "fixture name must exceed the POSIX 31 byte limit");

    let ring = PosixSharedRing::create_with_slot_count(&name, 1, 16)
        .expect("Windows named file mapping accepts names longer than PSHMNAMLEN");
    let attached = PosixSharedRing::attach_with_retry_for_layout(&name, 1, 16, Duration::from_secs(1))
        .expect("attach must find the mapping created above under the same name");

    drop(attached);
    drop(ring);
}

#[test]
fn windows_shm_create_rejects_names_longer_than_max_path_before_calling_create_file_mapping() {
    // "Local\" (6 chars) + a name long enough to exceed the 260 character
    // MAX_PATH-based limit used for the Windows kernel object namespace.
    let too_long_name = format!("/{}", "d".repeat(300));

    let result = PosixSharedRing::create_with_slot_count(&too_long_name, 1, 16);

    assert!(
        matches!(result, Err(PosixShmError::NameTooLong { limit: 260, .. })),
        "expected an explicit NameTooLong error, got: {result:?}"
    );
}

#[test]
fn windows_shm_create_fails_fast_on_a_genuine_live_name_collision() {
    // Unlike POSIX (where a previous owner's leaked name is silently
    // reclaimed via shm_unlink+retry), Windows named mappings are
    // reference-counted kernel objects: while the first handle is still
    // open, a second CreateFileMappingW under the same name opens the same
    // live object (GetLastError() == ERROR_ALREADY_EXISTS) rather than
    // creating a fresh, zeroed one. An exclusive `create` must treat that
    // as an error rather than silently taking over memory another owner is
    // still using.
    let name = format!("/wcol{}", std::process::id());

    let first = PosixSharedRing::create_with_slot_count(&name, 1, 16).expect("create first ring");

    let second = PosixSharedRing::create_with_slot_count(&name, 1, 16);
    assert!(
        second.is_err(),
        "a second exclusive create against a still-live name must fail, got: {second:?}"
    );

    drop(first);
}
