//! `VideoDecodeSession::open` reports correct duration/fps/dimensions/codec
//! for both H.264 and HEVC sources, without spawning any subprocess itself
//! (fixtures are built with the `ffmpeg` CLI as a *test* concern only).

mod common;

use common::{
    build_gradient_fixture, is_environment_hevc_pixel_decode_unavailable, require_ffmpeg, TempDir,
    FIXTURE_FPS, FIXTURE_HEIGHT, FIXTURE_WIDTH,
};
use uxfd_macos_video_decode::{VideoCodec, VideoDecodeSession};

const FRAME_COUNT: u32 = 60; // ~2s at FIXTURE_FPS(=30)

#[test]
fn open_reports_h264_duration_fps_dimensions_and_codec() {
    if require_ffmpeg().is_none() {
        return;
    }
    let dir = TempDir::new("open-h264");
    let path = build_gradient_fixture(dir.path(), "gradient_h264.mp4", "libx264", FRAME_COUNT);

    let session = VideoDecodeSession::open(&path).expect("open h264 fixture");
    let info = session.info();

    assert_eq!(info.width, FIXTURE_WIDTH);
    assert_eq!(info.height, FIXTURE_HEIGHT);
    assert_eq!(info.codec, VideoCodec::H264);
    assert!(
        (info.nominal_fps - FIXTURE_FPS as f64).abs() < 1.0,
        "expected nominal fps close to {FIXTURE_FPS}, got {}",
        info.nominal_fps
    );
    let expected_duration = FRAME_COUNT as f64 / FIXTURE_FPS as f64;
    assert!(
        (info.duration_seconds - expected_duration).abs() < 0.1,
        "expected duration close to {expected_duration}s, got {}s",
        info.duration_seconds
    );
}

#[test]
fn open_reports_hevc_duration_fps_dimensions_and_codec() {
    if require_ffmpeg().is_none() {
        return;
    }
    let dir = TempDir::new("open-hevc");
    let path = build_gradient_fixture(dir.path(), "gradient_hevc.mp4", "libx265", FRAME_COUNT);

    let session = match VideoDecodeSession::open(&path) {
        Ok(session) => session,
        Err(error) if is_environment_hevc_pixel_decode_unavailable(&error) => {
            eprintln!("skipping: {error} (see is_environment_hevc_pixel_decode_unavailable)");
            return;
        }
        Err(error) => panic!("open hevc fixture: {error}"),
    };
    let info = session.info();

    assert_eq!(info.width, FIXTURE_WIDTH);
    assert_eq!(info.height, FIXTURE_HEIGHT);
    assert_eq!(info.codec, VideoCodec::Hevc);
    assert!(
        (info.nominal_fps - FIXTURE_FPS as f64).abs() < 1.0,
        "expected nominal fps close to {FIXTURE_FPS}, got {}",
        info.nominal_fps
    );
    let expected_duration = FRAME_COUNT as f64 / FIXTURE_FPS as f64;
    assert!(
        (info.duration_seconds - expected_duration).abs() < 0.1,
        "expected duration close to {expected_duration}s, got {}s",
        info.duration_seconds
    );
}

#[test]
fn reopening_the_same_path_is_fast_and_leaves_no_lingering_state() {
    if require_ffmpeg().is_none() {
        return;
    }
    let dir = TempDir::new("reopen");
    let path = build_gradient_fixture(dir.path(), "gradient_reopen.mp4", "libx264", FRAME_COUNT);

    let first = VideoDecodeSession::open(&path).expect("first open");
    let first_info = first.info().clone();
    drop(first);

    let start = std::time::Instant::now();
    let second = VideoDecodeSession::open(&path).expect("second open");
    let elapsed = start.elapsed();

    assert_eq!(second.info().width, first_info.width);
    assert_eq!(second.info().height, first_info.height);
    assert_eq!(second.info().codec, first_info.codec);
    assert!(
        (second.info().duration_seconds - first_info.duration_seconds).abs() < 0.01,
        "duration should be identical across opens"
    );
    // "Fast" here means "no ffprobe/ffmpeg subprocess cold start" (which the
    // ffmpeg-CLI decode pipeline this crate replaces measures in the
    // 150-400ms range, see markdown/Rust_Preview_Jank_Handoff.md); an
    // in-process AVURLAsset/AVAssetReader open should comfortably clear a
    // generous 1s budget even on a loaded CI machine.
    assert!(
        elapsed.as_secs_f64() < 1.0,
        "second open took {:?}, expected well under 1s (no subprocess cold start)",
        elapsed
    );
}
