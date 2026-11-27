//! `VideoDecodeSession::seek` contract: the first frame decoded after
//! `seek(target)` has `pts >= target` (never strictly before), subsequent
//! frames keep advancing forward from there, and seeking backwards after
//! having already decoded forward works (recreates the reader cleanly).

mod common;

use common::{
    build_gradient_fixture, is_environment_hevc_pixel_decode_unavailable, require_ffmpeg, TempDir,
    FIXTURE_FPS,
};
use uxfd_macos_video_decode::VideoDecodeSession;

const FRAME_COUNT: u32 = 60; // 2s at FIXTURE_FPS(=30)
const FRAME_DURATION: f64 = 1.0 / FIXTURE_FPS as f64;
// Generous slack for "lands at/after target": AVAssetReader resumes from
// the nearest preceding sync sample and hides pre-roll, so the first vended
// frame should be within a couple of frame periods of the target, never
// exactly frame-accurate given the fixture's GOP structure.
const LANDING_SLACK_SECONDS: f64 = FRAME_DURATION * 3.0;

fn assert_seek_contract(mut session: VideoDecodeSession) {
    // Seek forward into the middle of the stream.
    let target = 1.0; // seconds
    session.seek(target).expect("seek forward");

    let first = session
        .next_frame()
        .expect("next_frame after forward seek")
        .expect("a frame should exist at/after the forward seek target");
    assert!(
        first.pts_seconds >= target - 1e-6,
        "seek({target}) landed at pts={} which is strictly before the target",
        first.pts_seconds
    );
    assert!(
        first.pts_seconds < target + LANDING_SLACK_SECONDS,
        "seek({target}) landed too far after the target: pts={}",
        first.pts_seconds
    );

    // Subsequent frames keep advancing forward from the landing point.
    let second = session
        .next_frame()
        .expect("next_frame")
        .expect("a second frame should follow");
    assert!(
        second.pts_seconds > first.pts_seconds,
        "frame after seek should keep advancing: first={}, second={}",
        first.pts_seconds,
        second.pts_seconds
    );

    // Re-seeking backwards (after having already decoded forward) works.
    let backward_target = 0.3;
    session.seek(backward_target).expect("seek backward");
    let after_backward_seek = session
        .next_frame()
        .expect("next_frame after backward seek")
        .expect("a frame should exist at/after the backward seek target");
    assert!(
        after_backward_seek.pts_seconds >= backward_target - 1e-6,
        "seek({backward_target}) landed at pts={} which is strictly before the target",
        after_backward_seek.pts_seconds
    );
    assert!(
        after_backward_seek.pts_seconds < backward_target + LANDING_SLACK_SECONDS,
        "seek({backward_target}) landed too far after the target: pts={}",
        after_backward_seek.pts_seconds
    );
    assert!(
        after_backward_seek.pts_seconds < first.pts_seconds,
        "backward seek should land earlier than the previous forward-seek frame"
    );

    // And decoding continues to advance forward from the backward seek too.
    let next_after_backward = session
        .next_frame()
        .expect("next_frame")
        .expect("a frame should follow the backward seek landing");
    assert!(
        next_after_backward.pts_seconds > after_backward_seek.pts_seconds,
        "frame after backward seek should keep advancing forward"
    );
}

#[test]
fn h264_seek_lands_at_or_after_target_and_keeps_advancing() {
    if require_ffmpeg().is_none() {
        return;
    }
    let dir = TempDir::new("seek-h264");
    let path = build_gradient_fixture(dir.path(), "gradient_h264.mp4", "libx264", FRAME_COUNT);
    let session = VideoDecodeSession::open(&path).expect("open h264 fixture");
    assert_seek_contract(session);
}

#[test]
fn hevc_seek_lands_at_or_after_target_and_keeps_advancing() {
    if require_ffmpeg().is_none() {
        return;
    }
    let dir = TempDir::new("seek-hevc");
    let path = build_gradient_fixture(dir.path(), "gradient_hevc.mp4", "libx265", FRAME_COUNT);
    let session = match VideoDecodeSession::open(&path) {
        Ok(session) => session,
        Err(error) if is_environment_hevc_pixel_decode_unavailable(&error) => {
            eprintln!("skipping: {error}");
            return;
        }
        Err(error) => panic!("open hevc fixture: {error}"),
    };
    assert_seek_contract(session);
}
