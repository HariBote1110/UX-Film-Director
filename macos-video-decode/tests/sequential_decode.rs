//! `VideoDecodeSession::next_frame` decodes sequentially: presentation
//! timestamps are monotonically increasing and roughly `1/fps` apart, and
//! every frame is an IOSurface-backed NV12 `CVPixelBuffer`.

mod common;

use common::{
    build_gradient_fixture, is_environment_hevc_pixel_decode_unavailable, require_ffmpeg, TempDir,
    FIXTURE_FPS, FIXTURE_HEIGHT, FIXTURE_WIDTH,
};
use uxfd_macos_video_decode::VideoDecodeSession;

const FRAME_COUNT: u32 = 60;

fn assert_sequential_pts_and_iosurface(mut session: VideoDecodeSession, expected_frames: u32) {
    let expected_spacing = 1.0 / FIXTURE_FPS as f64;
    let mut previous_pts: Option<f64> = None;
    let mut decoded_count = 0u32;

    while let Some(frame) = session.next_frame().expect("next_frame") {
        assert_eq!(frame.width, FIXTURE_WIDTH);
        assert_eq!(frame.height, FIXTURE_HEIGHT);

        let surface_id = frame
            .io_surface_id()
            .expect("decoded frame should be IOSurface-backed");
        assert_ne!(surface_id, 0, "IOSurfaceID should be non-zero");

        if let Some(previous) = previous_pts {
            let delta = frame.pts_seconds - previous;
            assert!(
                delta > 0.0,
                "pts should be strictly increasing: previous={previous}, current={}",
                frame.pts_seconds
            );
            assert!(
                (delta - expected_spacing).abs() < expected_spacing * 0.5 + 0.005,
                "pts spacing {delta} too far from expected ~{expected_spacing}"
            );
        }
        previous_pts = Some(frame.pts_seconds);
        decoded_count += 1;
    }

    assert_eq!(
        decoded_count, expected_frames,
        "expected exactly {expected_frames} frames"
    );
}

#[test]
fn h264_sequential_frames_have_monotonic_pts_and_iosurface_backing() {
    if require_ffmpeg().is_none() {
        return;
    }
    let dir = TempDir::new("sequential-h264");
    let path = build_gradient_fixture(dir.path(), "gradient_h264.mp4", "libx264", FRAME_COUNT);
    let session = VideoDecodeSession::open(&path).expect("open h264 fixture");
    assert_sequential_pts_and_iosurface(session, FRAME_COUNT);
}

#[test]
fn hevc_sequential_frames_have_monotonic_pts_and_iosurface_backing() {
    if require_ffmpeg().is_none() {
        return;
    }
    let dir = TempDir::new("sequential-hevc");
    let path = build_gradient_fixture(dir.path(), "gradient_hevc.mp4", "libx265", FRAME_COUNT);
    let session = match VideoDecodeSession::open(&path) {
        Ok(session) => session,
        Err(error) if is_environment_hevc_pixel_decode_unavailable(&error) => {
            eprintln!("skipping: {error}");
            return;
        }
        Err(error) => panic!("open hevc fixture: {error}"),
    };
    assert_sequential_pts_and_iosurface(session, FRAME_COUNT);
}
