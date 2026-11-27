//! `DecodedVideoFrame::read_nv12` CPU readback matches the analytically
//! expected YCbCr values for a solid-colour, BT.709 full-range fixture --
//! validating plane layout (Y then interleaved Cb/Cr) and colour range/
//! matrix metadata end to end.

mod common;

use common::{
    build_solid_colour_fixture, expected_ycbcr_bt709_full_range,
    is_environment_hevc_pixel_decode_unavailable, require_ffmpeg, TempDir, FIXTURE_HEIGHT,
    FIXTURE_WIDTH,
};
use uxfd_macos_video_decode::{ColourMatrix, ColourRange, VideoDecodeSession};

const FRAME_COUNT: u32 = 5;
const COLOUR: [u8; 3] = [200, 80, 40];
// NV12 4:2:0 decode + BT.709 matrix rounding through VideoToolbox; the
// fixture is a *solid* colour so subsampling introduces no additional
// blending error, but 8-bit rounding through the encode -> decode ->
// readback pipeline still needs a small tolerance.
const TOLERANCE: f64 = 4.0;

fn average_plane(plane: &common_types::PlaneStats) -> f64 {
    plane.sum / plane.count as f64
}

mod common_types {
    pub struct PlaneStats {
        pub sum: f64,
        pub count: usize,
    }
}

fn assert_readback_matches_expected(readback: &uxfd_macos_video_decode::YCbCrReadback) {
    let (expected_y, expected_cb, expected_cr) = expected_ycbcr_bt709_full_range(COLOUR);

    // Luma plane: full resolution, one byte per sample.
    let mut y_stats = common_types::PlaneStats { sum: 0.0, count: 0 };
    for row in 0..readback.y.height as usize {
        let row_start = row * readback.y.bytes_per_row;
        for x in 0..readback.y.width as usize {
            y_stats.sum += readback.y.data[row_start + x] as f64;
            y_stats.count += 1;
        }
    }
    let actual_y = average_plane(&y_stats);
    assert!(
        (actual_y - expected_y).abs() < TOLERANCE,
        "Y mismatch: expected {expected_y:.2}, got {actual_y:.2}"
    );

    // Cb/Cr plane: half resolution in each dimension, interleaved Cb,Cr
    // bytes (standard NV12 layout).
    let mut cb_stats = common_types::PlaneStats { sum: 0.0, count: 0 };
    let mut cr_stats = common_types::PlaneStats { sum: 0.0, count: 0 };
    for row in 0..readback.cb_cr.height as usize {
        let row_start = row * readback.cb_cr.bytes_per_row;
        for chroma_x in 0..(readback.cb_cr.width as usize) {
            let cb = readback.cb_cr.data[row_start + chroma_x * 2];
            let cr = readback.cb_cr.data[row_start + chroma_x * 2 + 1];
            cb_stats.sum += cb as f64;
            cb_stats.count += 1;
            cr_stats.sum += cr as f64;
            cr_stats.count += 1;
        }
    }
    let actual_cb = average_plane(&cb_stats);
    let actual_cr = average_plane(&cr_stats);
    assert!(
        (actual_cb - expected_cb).abs() < TOLERANCE,
        "Cb mismatch: expected {expected_cb:.2}, got {actual_cb:.2}"
    );
    assert!(
        (actual_cr - expected_cr).abs() < TOLERANCE,
        "Cr mismatch: expected {expected_cr:.2}, got {actual_cr:.2}"
    );

    assert_eq!(readback.y.width, FIXTURE_WIDTH);
    assert_eq!(readback.y.height, FIXTURE_HEIGHT);
    assert_eq!(readback.cb_cr.width, FIXTURE_WIDTH / 2);
    assert_eq!(readback.cb_cr.height, FIXTURE_HEIGHT / 2);
}

#[test]
fn h264_solid_colour_cpu_readback_matches_bt709_full_range() {
    if require_ffmpeg().is_none() {
        return;
    }
    let dir = TempDir::new("readback-h264");
    let path = build_solid_colour_fixture(
        dir.path(),
        "solid_h264.mp4",
        "libx264",
        FRAME_COUNT,
        COLOUR,
    );
    let mut session = VideoDecodeSession::open(&path).expect("open h264 fixture");
    let frame = session
        .next_frame()
        .expect("next_frame")
        .expect("at least one frame");

    assert_eq!(frame.colour.range, ColourRange::Full);
    assert_eq!(frame.colour.matrix, ColourMatrix::Bt709);

    let readback = frame.read_nv12();
    assert_readback_matches_expected(&readback);
}

#[test]
fn hevc_solid_colour_cpu_readback_matches_bt709_full_range() {
    if require_ffmpeg().is_none() {
        return;
    }
    let dir = TempDir::new("readback-hevc");
    let path = build_solid_colour_fixture(
        dir.path(),
        "solid_hevc.mp4",
        "libx265",
        FRAME_COUNT,
        COLOUR,
    );
    let mut session = match VideoDecodeSession::open(&path) {
        Ok(session) => session,
        Err(error) if is_environment_hevc_pixel_decode_unavailable(&error) => {
            eprintln!("skipping: {error}");
            return;
        }
        Err(error) => panic!("open hevc fixture: {error}"),
    };
    let frame = session
        .next_frame()
        .expect("next_frame")
        .expect("at least one frame");

    assert_eq!(frame.colour.range, ColourRange::Full);
    assert_eq!(frame.colour.matrix, ColourMatrix::Bt709);

    let readback = frame.read_nv12();
    assert_readback_matches_expected(&readback);
}
