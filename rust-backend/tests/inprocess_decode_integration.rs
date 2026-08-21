//! Phase 4c Stage 1: end-to-end coverage of the in-process
//! (`macos-video-decode`) decode path wired behind the existing
//! `decode.start`/`decode.requestFrame` RPC surface
//! (`rust-backend/src/inprocess_decode.rs`, `rust-backend/src/decode.rs`).
//!
//! `rust-backend/tests/decode_control_plane.rs` builds its H.264 fixtures at
//! `crf=0` (lossless) as an exact-checksum decode-correctness oracle against
//! ffmpeg's CPU pixel pipeline. VideoToolbox's hardware H.264 decoder does
//! not support the lossless profile that `crf=0` selects, so
//! `VideoDecodeSession::open` legitimately fails for every one of those
//! fixtures and every one of those tests transparently exercises the
//! automatic ffmpeg fallback -- exactly per spec, and verified empirically
//! (see `progress/phase4c-inprocess-decode-integration.md`). This file uses
//! an ordinary (non-lossless) H.264 encode instead, so the in-process path
//! actually engages, and asserts on it directly.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

const WIDTH: u32 = 64;
const HEIGHT: u32 = 36;
const FPS: u32 = 30;

fn require_ffmpeg() -> bool {
    Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

struct TempDir {
    path: PathBuf,
}

impl TempDir {
    fn new(label: &str) -> Self {
        let micros = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_micros();
        let path = std::env::temp_dir().join(format!(
            "uxfd-inprocess-decode-it-{label}-{}-{micros}",
            std::process::id()
        ));
        std::fs::create_dir_all(&path).expect("create temporary directory");
        Self { path }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

/// Builds an ordinary (non-lossless, `crf=18`) H.264 4:2:0 fixture: a solid
/// colour that shifts every frame, BT.709 full range, `keyint=1` so every
/// frame is independently seekable. VideoToolbox hardware-decodes this
/// (unlike the repo's other `crf=0` fixtures), so the in-process path
/// actually engages.
fn build_playable_h264_fixture(directory: &Path, frame_count: u32) -> PathBuf {
    let raw_path = directory.join("inprocess-source.rgba");
    let video_path = directory.join("inprocess-source.mp4");
    let mut raw_frames = Vec::new();
    for frame_index in 0..frame_count {
        let shade = ((frame_index * 23) % 256) as u8;
        for _ in 0..(WIDTH as usize * HEIGHT as usize) {
            raw_frames.extend([shade, 255 - shade, 128, 255]);
        }
    }
    std::fs::write(&raw_path, raw_frames).expect("write raw fixture frames");

    let status = Command::new("ffmpeg")
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-y")
        .arg("-f")
        .arg("rawvideo")
        .arg("-pixel_format")
        .arg("rgba")
        .arg("-video_size")
        .arg(format!("{WIDTH}x{HEIGHT}"))
        .arg("-framerate")
        .arg(FPS.to_string())
        .arg("-i")
        .arg(&raw_path)
        .arg("-frames:v")
        .arg(frame_count.to_string())
        .arg("-pix_fmt")
        .arg("yuv420p")
        .arg("-c:v")
        .arg("libx264")
        .arg("-preset")
        .arg("ultrafast")
        .arg("-crf")
        .arg("18")
        .arg("-x264-params")
        .arg("keyint=1:min-keyint=1:scenecut=0:range=pc:colorprim=bt709:transfer=iec61966-2-1:colormatrix=bt709")
        .arg("-color_primaries")
        .arg("bt709")
        .arg("-color_trc")
        .arg("iec61966-2-1")
        .arg("-colorspace")
        .arg("bt709")
        .arg("-color_range")
        .arg("pc")
        .arg("-video_track_timescale")
        .arg(FPS.to_string())
        .arg(&video_path)
        .status()
        .expect("run ffmpeg");
    assert!(status.success(), "failed to encode playable H.264 fixture");
    video_path
}

struct BackendProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl BackendProcess {
    fn start_with_env(envs: &[(&str, &str)]) -> Self {
        let mut command = Command::new(env!("CARGO_BIN_EXE_uxfd-rust-backend"));
        command.stdin(Stdio::piped()).stdout(Stdio::piped());
        for (key, value) in envs {
            command.env(key, value);
        }
        let mut child = command.spawn().expect("start rust backend");
        let stdin = child.stdin.take().expect("backend stdin");
        let stdout = BufReader::new(child.stdout.take().expect("backend stdout"));
        Self { child, stdin, stdout }
    }

    fn request(&mut self, payload: Value) -> Value {
        let request_id = payload["id"].as_u64().expect("request has numeric id");
        writeln!(self.stdin, "{payload}").expect("write backend request");
        self.stdin.flush().expect("flush backend request");
        loop {
            let mut line = String::new();
            self.stdout
                .read_line(&mut line)
                .expect("read backend response");
            let parsed: Value = serde_json::from_str(&line).expect("parse backend response");
            if parsed["id"].as_u64() == Some(request_id) {
                return parsed;
            }
        }
    }

    fn start_decode(&mut self, job_id: &str, source: &Path) -> Value {
        self.request(json!({
            "id": 1,
            "method": "decode.start",
            "params": {
                "jobId": job_id,
                "source": source.to_string_lossy(),
                "slotCount": 2,
                "width": WIDTH,
                "height": HEIGHT,
                "sourceRate": { "numerator": FPS, "denominator": 1 },
                "format": "rgba8Srgb",
                "colour": {
                    "primaries": "bt709",
                    "transfer": "srgb",
                    "matrix": "rgb",
                    "range": "full"
                }
            }
        }))
    }

    /// Requests one inline frame (`rgbaBytes` embedded, no shared-memory
    /// consumer needed) and immediately releases its shared-ring slot with
    /// `rendererUploadAborted` -- the inline path never touches shared
    /// memory, so there is nothing to signal a GPU upload fence for. Real
    /// non-inline consumers use `gpuUploadFenceSignalled` after reading the
    /// ring (see `decode_control_plane.rs`); this test never reads the ring,
    /// only the inline `rgbaBytes` payload, so it must release the same way.
    fn request_frame_inline(&mut self, job_id: &str, request_id: u64, frame_index: u64) -> Value {
        let response = self.request(json!({
            "id": 10 + request_id,
            "method": "decode.requestFrameInline",
            "params": {
                "jobId": job_id,
                "requestId": request_id,
                "frameIndex": frame_index,
                "mode": "latestWins"
            }
        }));
        if response["ok"] == true {
            let release = self.request(json!({
                "id": 1000 + request_id,
                "method": "decode.releaseFrame",
                "params": {
                    "jobId": job_id,
                    "slotIndex": response["result"]["frame"]["descriptor"]["slotIndex"],
                    "generation": response["result"]["frame"]["descriptor"]["generation"],
                    "copyOutState": "rendererUploadAborted"
                }
            }));
            assert_eq!(release["ok"], true, "release after inline frame: {release}");
        }
        response
    }
}

impl Drop for BackendProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
#[cfg(target_os = "macos")]
fn decode_request_frame_uses_inprocess_path_for_ordinary_h264_source() {
    if !require_ffmpeg() {
        eprintln!("skipping: ffmpeg not on PATH");
        return;
    }
    let dir = TempDir::new("engages");
    let source = build_playable_h264_fixture(dir.path(), 5);
    let mut backend = BackendProcess::start_with_env(&[]);

    let start = backend.start_decode("inprocess-1", &source);
    assert_eq!(start["ok"], true, "{start}");

    let first = backend.request_frame_inline("inprocess-1", 1, 0);
    assert_eq!(first["ok"], true, "{first}");
    assert_eq!(
        first["result"]["decodePath"], "inprocess",
        "an ordinary (non-lossless) local H.264 source should decode via the in-process VideoToolbox path: {first}"
    );
    let rgba_base64 = first["result"]["frame"]["rgbaBytes"]
        .as_str()
        .expect("inline frame carries rgbaBytes");
    assert!(!rgba_base64.is_empty());

    // Sequential forward steps stay on the in-process path (the worker's
    // prefetch ring, not a per-frame ffmpeg respawn).
    let second = backend.request_frame_inline("inprocess-1", 2, 1);
    assert_eq!(second["result"]["decodePath"], "inprocess", "{second}");
    let third = backend.request_frame_inline("inprocess-1", 3, 2);
    assert_eq!(third["result"]["decodePath"], "inprocess", "{third}");

    // A small backward step (still-buffered pts) must not error: the ring
    // either still has it or holds the nearest available frame.
    let backward = backend.request_frame_inline("inprocess-1", 4, 1);
    assert_eq!(backward["ok"], true, "{backward}");
    assert_eq!(backward["result"]["decodePath"], "inprocess", "{backward}");
}

#[test]
fn decode_request_frame_respects_the_inprocess_disable_kill_switch() {
    if !require_ffmpeg() {
        eprintln!("skipping: ffmpeg not on PATH");
        return;
    }
    let dir = TempDir::new("kill-switch");
    let source = build_playable_h264_fixture(dir.path(), 3);
    let mut backend =
        BackendProcess::start_with_env(&[("UXFD_DISABLE_INPROCESS_DECODE", "1")]);

    let start = backend.start_decode("inprocess-2", &source);
    assert_eq!(start["ok"], true, "{start}");

    let first = backend.request_frame_inline("inprocess-2", 1, 0);
    assert_eq!(first["ok"], true, "{first}");
    assert_ne!(
        first["result"]["decodePath"], "inprocess",
        "UXFD_DISABLE_INPROCESS_DECODE=1 must force the ffmpeg fallback path: {first}"
    );
}
