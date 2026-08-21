#![cfg(target_os = "macos")]

use std::fs;
use std::os::unix::fs::PermissionsExt;
use uxfd_macos_video_encode::VideoEncodeSession;

#[test]
fn start_succeeds_when_output_file_already_exists() {
    let directory = tempfile::tempdir().expect("temporary output directory");
    let output_path = directory.path().join("out.mp4");
    fs::write(&output_path, b"stale").expect("write stale file");

    let session = VideoEncodeSession::start(&output_path, 64, 64, 30);

    assert!(session.is_ok(), "start should overwrite an existing output file: {:?}", session.err());
}

#[test]
fn failed_start_leaves_no_zero_byte_remnant() {
    let directory = tempfile::tempdir().expect("temporary output directory");
    let output_path = directory.path().join("out.mp4");

    fs::set_permissions(directory.path(), fs::Permissions::from_mode(0o555))
        .expect("make directory read-only");

    let result = VideoEncodeSession::start(&output_path, 64, 64, 30);

    fs::set_permissions(directory.path(), fs::Permissions::from_mode(0o755))
        .expect("restore directory permissions");

    assert!(result.is_err(), "start should fail when the output directory is read-only");
    assert!(!output_path.exists(), "no zero-byte remnant should be left after a failed start");
}
