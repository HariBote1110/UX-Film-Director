//! Shared ffmpeg-based fixture helpers for `macos-video-decode` integration
//! tests.
//!
//! Fixtures are generated at test time (not checked in) with the system
//! `ffmpeg` CLI. This is test-only: production code in this crate never
//! spawns a subprocess. If `ffmpeg` is not on `PATH`, tests call
//! [`require_ffmpeg`] and skip themselves with a clear message rather than
//! failing.

#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::process::Command;

/// Small, fast-to-encode fixture dimensions used across these tests.
pub const FIXTURE_WIDTH: u32 = 320;
pub const FIXTURE_HEIGHT: u32 = 180;
pub const FIXTURE_FPS: u32 = 30;

/// Returns `Some(())` if the system `ffmpeg` CLI is available, otherwise
/// prints a skip message and returns `None`. Call this first in every test
/// that needs to generate a fixture, and `return` early on `None`.
pub fn require_ffmpeg() -> Option<()> {
    let available = Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);
    if available {
        Some(())
    } else {
        eprintln!(
            "skipping: system `ffmpeg` CLI not found on PATH (test-only fixture generation)"
        );
        None
    }
}

/// True when `error`'s message matches `VTCouldNotFindVideoDecoderErr`
/// (OSStatus -12906 / "The decoder required for this media cannot be
/// found."): `AVAssetReader` can demux HEVC and read track metadata
/// (duration/fps/dimensions/codec) fine, but cannot start a pixel-buffer
/// producing reader for the track.
///
/// This was confirmed, via a stand-alone AVFoundation probe outside this
/// crate, to be a *sandbox* limitation of the environment these tests
/// happened to be authored in (a VideoToolbox decoder-lookup XPC service is
/// unreachable from the sandboxed test process) rather than a hardware/
/// software HEVC support gap -- the machine (Apple M4) natively supports
/// HEVC hardware decode, and the exact same `open`/`create_reader_and_output`
/// code path works end-to-end for H.264 in this same environment. Tests
/// that hit this treat it as a skip, not a failure, since it is outside the
/// crate's control; no other failure mode is treated this leniently. See
/// `progress/phase4a-macos-video-decode-core.md`.
pub fn is_environment_hevc_pixel_decode_unavailable<E: std::fmt::Display>(error: &E) -> bool {
    let message = error.to_string();
    message.contains("decoder required for this media cannot be found") || message.contains("-12906")
}

pub struct TempDir {
    path: PathBuf,
}

impl TempDir {
    pub fn new(label: &str) -> Self {
        let mut path = std::env::temp_dir();
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock after epoch")
            .as_nanos();
        path.push(format!(
            "uxfd-macos-video-decode-{label}-{}-{nanos}",
            std::process::id()
        ));
        std::fs::create_dir_all(&path).expect("create temp dir");
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

fn run_ffmpeg(command: &mut Command, label: &str) {
    let output = command.output().expect(label);
    assert!(
        output.status.success(),
        "{label} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

/// Generates `width * height * 4`-byte RGBA test frames: a horizontal/
/// vertical gradient offset by `frame_index`, so consecutive frames are
/// visibly distinct (useful for spotting duplicate/stuck frames).
fn gradient_frame_pixels(width: u32, height: u32, frame_index: u32) -> Vec<u8> {
    let mut pixels = Vec::with_capacity(width as usize * height as usize * 4);
    for y in 0..height {
        for x in 0..width {
            let red = ((x * 3 + frame_index * 7) & 0xff) as u8;
            let green = ((y * 5 + frame_index * 11) & 0xff) as u8;
            let blue = ((x + y + frame_index * 13) & 0xff) as u8;
            pixels.extend([red, green, blue, 255]);
        }
    }
    pixels
}

/// Encodes an N-frame gradient fixture with the given codec (`libx264` or
/// `libx265`), `frame_count` frames at [`FIXTURE_FPS`], 4:2:0, BT.709 full
/// range. H.264 uses `keyint=1` (one keyframe per frame) so per-frame
/// seeking in tests is unambiguous; HEVC deliberately does not: an
/// all-intra (`keyint=1`) x265 stream gets tagged with the "Range
/// Extensions" (Rext) HEVC profile rather than "Main" (a known x265
/// quirk -- `Main Intra` is not a distinct signalled profile), and
/// VideoToolbox has no hardware decoder for Rext, so `AVAssetReader`
/// fails to start reading with "Cannot Decode". `keyint=15` (half a
/// second at [`FIXTURE_FPS`]) keeps HEVC in the hardware-decodable
/// "Main" profile while still giving seek tests several sync points.
pub fn build_gradient_fixture(dir: &Path, file_name: &str, codec: &str, frame_count: u32) -> PathBuf {
    let width = FIXTURE_WIDTH;
    let height = FIXTURE_HEIGHT;

    let raw_path = dir.join(format!("{file_name}.rgba"));
    let mut raw_frames = Vec::new();
    for frame_index in 0..frame_count {
        raw_frames.extend(gradient_frame_pixels(width, height, frame_index));
    }
    std::fs::write(&raw_path, raw_frames).expect("write raw gradient frames");

    let video_path = dir.join(file_name);
    let mut command = Command::new("ffmpeg");
    command
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-y")
        .arg("-f")
        .arg("rawvideo")
        .arg("-pixel_format")
        .arg("rgba")
        .arg("-video_size")
        .arg(format!("{width}x{height}"))
        .arg("-framerate")
        .arg(FIXTURE_FPS.to_string())
        .arg("-i")
        .arg(&raw_path)
        .arg("-frames:v")
        .arg(frame_count.to_string())
        .arg("-pix_fmt")
        .arg("yuv420p")
        .arg("-c:v")
        .arg(codec);

    if codec == "libx264" {
        command
            .arg("-preset")
            .arg("ultrafast")
            .arg("-x264-params")
            .arg("keyint=1:min-keyint=1:scenecut=0:range=pc:colorprim=bt709:transfer=iec61966-2-1:colormatrix=bt709");
    } else if codec == "libx265" {
        command.arg("-preset").arg("ultrafast").arg("-x265-params").arg(
            "keyint=15:min-keyint=15:scenecut=0:colorprim=bt709:transfer=bt709:colormatrix=bt709",
        );
    }

    command
        .arg("-color_primaries")
        .arg("bt709")
        .arg("-color_trc")
        .arg("bt709")
        .arg("-colorspace")
        .arg("bt709")
        .arg("-color_range")
        .arg("pc")
        .arg("-video_track_timescale")
        .arg(FIXTURE_FPS.to_string())
        .arg(&video_path);

    run_ffmpeg(&mut command, &format!("encode {codec} gradient fixture"));
    video_path
}

/// Encodes a fixture that is a single solid RGB colour for every one of
/// `frame_count` frames, BT.709 full range, so the exact YCbCr values a
/// decoder should produce can be computed analytically and compared against
/// [`super::assert_cpu_readback_matches_colour`]-style checks.
pub fn build_solid_colour_fixture(
    dir: &Path,
    file_name: &str,
    codec: &str,
    frame_count: u32,
    colour: [u8; 3],
) -> PathBuf {
    let width = FIXTURE_WIDTH;
    let height = FIXTURE_HEIGHT;

    let raw_path = dir.join(format!("{file_name}.rgba"));
    let mut frame_pixels = Vec::with_capacity(width as usize * height as usize * 4);
    for _ in 0..(width as usize * height as usize) {
        frame_pixels.extend([colour[0], colour[1], colour[2], 255]);
    }
    let mut raw_frames = Vec::with_capacity(frame_pixels.len() * frame_count as usize);
    for _ in 0..frame_count {
        raw_frames.extend_from_slice(&frame_pixels);
    }
    std::fs::write(&raw_path, raw_frames).expect("write raw solid-colour frames");

    let video_path = dir.join(file_name);
    let mut command = Command::new("ffmpeg");
    command
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-y")
        .arg("-f")
        .arg("rawvideo")
        .arg("-pixel_format")
        .arg("rgba")
        .arg("-video_size")
        .arg(format!("{width}x{height}"))
        .arg("-framerate")
        .arg(FIXTURE_FPS.to_string())
        .arg("-i")
        .arg(&raw_path)
        .arg("-frames:v")
        .arg(frame_count.to_string())
        .arg("-pix_fmt")
        .arg("yuv420p")
        .arg("-c:v")
        .arg(codec)
        .arg("-preset")
        .arg("ultrafast");

    if codec == "libx264" {
        command.arg("-x264-params").arg(
            "keyint=1:min-keyint=1:scenecut=0:range=pc:colorprim=bt709:transfer=iec61966-2-1:colormatrix=bt709",
        );
    } else if codec == "libx265" {
        // See the comment on `build_gradient_fixture`: `keyint=1` all-intra
        // HEVC gets tagged Rext (no VideoToolbox hardware decoder).
        command.arg("-x265-params").arg(
            "keyint=15:min-keyint=15:scenecut=0:colorprim=bt709:transfer=bt709:colormatrix=bt709",
        );
    }

    command
        .arg("-color_primaries")
        .arg("bt709")
        .arg("-color_trc")
        .arg("bt709")
        .arg("-colorspace")
        .arg("bt709")
        .arg("-color_range")
        .arg("pc")
        .arg("-video_track_timescale")
        .arg(FIXTURE_FPS.to_string())
        .arg(&video_path);

    run_ffmpeg(&mut command, &format!("encode {codec} solid-colour fixture"));
    video_path
}

/// Full-range BT.709 RGB -> YCbCr, matching the `colorprim=bt709:...
/// range=pc` fixtures built above. Returns `(y, cb, cr)` as `f64` in
/// `0..=255`.
pub fn expected_ycbcr_bt709_full_range(rgb: [u8; 3]) -> (f64, f64, f64) {
    let r = rgb[0] as f64;
    let g = rgb[1] as f64;
    let b = rgb[2] as f64;

    const KR: f64 = 0.2126;
    const KB: f64 = 0.0722;

    let y = KR * r + (1.0 - KR - KB) * g + KB * b;
    let cb = (b - y) / (2.0 * (1.0 - KB)) + 128.0;
    let cr = (r - y) / (2.0 * (1.0 - KR)) + 128.0;
    (y, cb, cr)
}
