use std::fs;
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use uxfd_decode_spike::{build_known_cfr_h264_fixture, decode_fixture_to_shared_rgba};
use uxfd_shared_memory_spike::PosixSharedRing;

#[test]
fn decoded_cfr_h264_rgba_travels_through_posix_shm_to_consumer() {
    let temp_dir = tempfile::tempdir().expect("create temporary directory");
    let fixture = build_known_cfr_h264_fixture(temp_dir.path()).expect("build known fixture");
    let decoded = decode_fixture_to_shared_rgba(&fixture).expect("decode known fixture");
    let expected_path = temp_dir.path().join("decoded.rgba");
    fs::write(&expected_path, &decoded.rgba_frame.pixels).expect("write expected rgba");

    let name = unique_shm_name();
    let frame_len = decoded.rgba_frame.pixels.len();

    let mut consumer = Command::new(env!("CARGO_BIN_EXE_uxfd-shm-raw-consumer"))
        .arg(&name)
        .arg(frame_len.to_string())
        .arg(&expected_path)
        .spawn()
        .expect("spawn raw shm consumer");

    std::thread::sleep(Duration::from_millis(100));

    let ring = PosixSharedRing::create(&name, frame_len).expect("create shm ring");
    ring.write_frame(0, &decoded.rgba_frame.pixels)
        .expect("write decoded frame to shm");
    ring.wait_until_free(Duration::from_secs(5))
        .expect("consumer should release frame");

    let status = consumer.wait().expect("wait for raw shm consumer");

    assert!(status.success(), "raw consumer failed: {status}");
}

fn unique_shm_name() -> String {
    let micros = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_micros()
        % 1_000_000;
    format!("/uxfd{}-{micros}", std::process::id())
}
