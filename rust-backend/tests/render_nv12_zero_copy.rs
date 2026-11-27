//! Phase 4c Stage 2: end-to-end coverage of `render.nativeSharedFrame`
//! resolving a clip's video source through the zero-copy NV12 IOSurface path
//! (`rust-backend/src/native_render.rs::collect_native_render_nv12_sources`)
//! instead of the CPU RGBA bridge, when the underlying `decode.*` session is
//! in-process (`rust-backend/src/inprocess_decode.rs`, Stage 1).
//!
//! Uses the same "ordinary (non-lossless) H.264" fixture pattern as
//! `inprocess_decode_integration.rs` so the in-process VideoToolbox path
//! actually engages (VideoToolbox does not support the lossless `crf=0`
//! profile `decode_control_plane.rs`'s fixtures use).

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uxfd_shared_memory_spike::PosixSharedRing;

/// macOS POSIX shared memory names are capped at 31 bytes, so this must stay
/// short (unlike a descriptive job_id/media_id, which is fine -- those never
/// become shm names directly).
fn unique_shm_name() -> String {
    static SHM_COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_nanos() as u64;
    let counter = SHM_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("/n{:x}{:x}{:x}", std::process::id(), nanos, counter)
}

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
            "uxfd-render-nv12-zero-copy-{label}-{}-{micros}",
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

/// Same fixture shape as `inprocess_decode_integration.rs`'s
/// `build_playable_h264_fixture`: ordinary (non-lossless) H.264, BT.709 full
/// range, `keyint=1` so frame 0 is deterministic across independently
/// spawned backend processes (needed for the parity test below, which
/// compares pixels produced by two separate processes).
fn build_playable_h264_fixture(directory: &Path) -> PathBuf {
    let raw_path = directory.join("nv12-zero-copy-source.rgba");
    let video_path = directory.join("nv12-zero-copy-source.mp4");
    let frame_count = 4u32;
    let mut raw_frames = Vec::new();
    for frame_index in 0..frame_count {
        let shade = ((frame_index * 40) % 256) as u8;
        for _ in 0..(WIDTH as usize * HEIGHT as usize) {
            raw_frames.extend([shade, 255 - shade, 60, 255]);
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
}

impl Drop for BackendProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Runs `decode.start` + one `decode.requestFrame(frameIndex=0)` +
/// `render.nativeSharedFrame` against a fresh backend process (spawned with
/// `envs`) and returns `(render response, composited output pixels)`.
/// `effects` is the clip's `effects` JSON array as-is (usually `json!([])`,
/// the truly simple/common case -- see callers for when a disqualifying
/// no-op effect is deliberately used instead).
fn decode_and_render_frame_zero_with_ids(
    envs: &[(&str, &str)],
    job_id: &str,
    media_id: &str,
    source: &Path,
    effects: Value,
) -> (Value, Vec<u8>) {
    let mut backend = BackendProcess::start_with_env(envs);

    let start = backend.request(json!({
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
    }));
    assert_eq!(start["ok"], true, "decode.start failed: {start}");
    let decode_slot_count = start["result"]["slotCount"].as_u64().expect("slotCount") as u32;

    let decoded = backend.request(json!({
        "id": 2,
        "method": "decode.requestFrame",
        "params": {
            "jobId": job_id,
            "requestId": 0,
            "frameIndex": 0,
            "mode": "latestWins"
        }
    }));
    assert_eq!(decoded["ok"], true, "decode.requestFrame failed: {decoded}");
    assert_eq!(
        decoded["result"]["decodePath"], "inprocess",
        "expected the in-process VideoToolbox path to engage for this fixture: {decoded}"
    );

    let output_memory_id = unique_shm_name();
    let render = backend.request(json!({
        "id": 3,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "render-nv12-zero-copy",
            "memoryId": output_memory_id,
            "slotCount": 2,
            "ptsFrame": 0,
            "width": WIDTH,
            "height": HEIGHT,
            "snapshot": {
                "frame_index": 0,
                "colour": {
                    "profile": "rec709-sdr",
                    "working_space": "linear-light",
                    "alpha": "premultiplied"
                },
                "clips": [{
                    "clip_id": "clip-video",
                    "track_id": "track-1",
                    "media_id": media_id,
                    "source_frame": 0,
                    "z_index": 0,
                    "transform": {
                        "translation_x": 0.0,
                        "translation_y": 0.0,
                        "scale_x": 1.0,
                        "scale_y": 1.0,
                        "rotation_degrees": 0.0,
                        "sampling": "nearest"
                    },
                    "opacity": 1.0,
                    "effects": effects
                }]
            },
            "media": [{
                "id": media_id,
                "kind": "Video",
                "source": source.to_string_lossy(),
                "width": WIDTH,
                "height": HEIGHT,
                "source_rate": { "numerator": FPS, "denominator": 1 }
            }],
            "sources": [{
                "mediaId": media_id,
                "jobId": job_id,
                "slotCount": decode_slot_count,
                "frame": decoded["result"]["frame"]
            }]
        }
    }));
    assert_eq!(render["ok"], true, "render.nativeSharedFrame failed: {render}");

    let output_slot_count = render["result"]["slotCount"].as_u64().expect("slotCount") as u32;
    let output_slot_byte_len =
        render["result"]["frame"]["descriptor"]["byteLen"].as_u64().expect("byteLen") as usize;
    let output_ring = PosixSharedRing::attach_with_retry_for_layout(
        render["result"]["frame"]["descriptor"]["memoryId"]
            .as_str()
            .expect("output memoryId"),
        output_slot_count,
        output_slot_byte_len,
        Duration::from_secs(2),
    )
    .expect("attach to nv12 zero-copy render output ring");
    let output_frame = output_ring
        .read_frame(0)
        .expect("read nv12 zero-copy render output frame");

    (render, output_frame.bytes)
}

fn decode_and_render_frame_zero(
    envs: &[(&str, &str)],
    job_id: &str,
    source: &Path,
    effects: Value,
) -> (Value, Vec<u8>) {
    decode_and_render_frame_zero_with_ids(envs, job_id, job_id, source, effects)
}

#[test]
#[cfg(target_os = "macos")]
fn render_native_shared_frame_reports_nv12_zero_copy_for_inprocess_video_session() {
    if !require_ffmpeg() {
        eprintln!("skipping: ffmpeg not on PATH");
        return;
    }
    let dir = TempDir::new("engages");
    let source = build_playable_h264_fixture(dir.path());

    // Deliberately the *simplest* possible scene (identity transform, no
    // effects) -- this is exactly the shape `cpu_simple_video::
    // try_render_simple_video_frame_to_shared_ring` would otherwise
    // intercept before the GPU compositor ever runs.
    // `handle_native_render_shared_frame` must skip that CPU fast path
    // whenever an nv12 zero-copy source is available (see its comment),
    // precisely so this by-far-most-common real scene still reaches Stage
    // 2's NV12 resolution instead of silently never engaging it.
    let (render, pixels) =
        decode_and_render_frame_zero(&[], "nv12-zero-copy-1", &source, json!([]));

    let nv12_media_ids = render["result"]["nv12ZeroCopyMediaIds"]
        .as_array()
        .expect("nv12ZeroCopyMediaIds must be an array");
    assert_eq!(
        nv12_media_ids,
        &vec![json!("nv12-zero-copy-1")],
        "the in-process session's media_id must be resolved via the zero-copy NV12 path: {render}"
    );
    assert_eq!(
        render["result"]["renderPath"],
        json!("webgpuSceneComposite"),
        "the NV12 render must expose the WebGPU scene-composite path: {render}"
    );

    // Sanity: the composited output is not all-zero/transparent.
    assert!(
        pixels.chunks_exact(4).any(|pixel| pixel[3] != 0),
        "nv12 zero-copy composite must produce a non-transparent frame"
    );
}

#[test]
#[cfg(target_os = "macos")]
fn render_native_shared_frame_correlates_distinct_decode_job_and_media_ids() {
    if !require_ffmpeg() {
        eprintln!("skipping: ffmpeg not on PATH");
        return;
    }
    let dir = TempDir::new("distinct-job-and-media-ids");
    let source = build_playable_h264_fixture(dir.path());
    let media_id = "video-media-1";
    let job_id = "shared-renderer-video-video-media-1-64x32-60over1";

    let (render, _pixels) =
        decode_and_render_frame_zero_with_ids(&[], job_id, media_id, &source, json!([]));

    assert_eq!(
        render["result"]["nv12ZeroCopyMediaIds"],
        json!([media_id]),
        "the production decode job id must still correlate to the scene media id: {render}"
    );
    assert_eq!(
        render["result"]["renderPath"],
        json!("webgpuSceneComposite"),
        "a production-style decode job id must expose the WebGPU scene-composite path: {render}"
    );
}

#[test]
#[cfg(target_os = "macos")]
fn render_native_shared_frame_nv12_zero_copy_kill_switch_falls_back_to_rgba_bridge() {
    if !require_ffmpeg() {
        eprintln!("skipping: ffmpeg not on PATH");
        return;
    }
    let dir = TempDir::new("kill-switch");
    let source = build_playable_h264_fixture(dir.path());

    let (render, _pixels) = decode_and_render_frame_zero(
        &[("UXFD_DISABLE_NV12_ZERO_COPY_RENDER", "1")],
        "nv12-zero-copy-2",
        &source,
        json!([]),
    );

    let nv12_media_ids = render["result"]["nv12ZeroCopyMediaIds"]
        .as_array()
        .expect("nv12ZeroCopyMediaIds must be an array");
    assert!(
        nv12_media_ids.is_empty(),
        "UXFD_DISABLE_NV12_ZERO_COPY_RENDER=1 must force every media_id through the RGBA bridge: {render}"
    );
}

#[test]
#[cfg(target_os = "macos")]
fn encode_write_native_frame_uses_nv12_zero_copy_for_inprocess_video_session() {
    if !require_ffmpeg() {
        eprintln!("skipping: ffmpeg not on PATH");
        return;
    }

    let dir = TempDir::new("encode");
    let source = build_playable_h264_fixture(dir.path());
    let output = dir.path().join("nv12-zero-copy-export.mp4");
    let job_id = "export-video-job";
    let media_id = "export-video-media";
    let mut backend = BackendProcess::start_with_env(&[]);

    let encode_start = backend.request(json!({
        "id": 10,
        "method": "encode.start",
        "params": {
            "sessionId": "nv12-zero-copy-export",
            "filePath": output.to_string_lossy(),
            "width": WIDTH,
            "height": HEIGHT,
            "fps": FPS,
            "pixelFormat": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full"
            }
        }
    }));
    assert_eq!(encode_start["ok"], true, "encode.start failed: {encode_start}");

    let decode_start = backend.request(json!({
        "id": 11,
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
    }));
    assert_eq!(decode_start["ok"], true, "decode.start failed: {decode_start}");

    let decoded = backend.request(json!({
        "id": 12,
        "method": "decode.requestFrame",
        "params": {
            "jobId": job_id,
            "requestId": 0,
            "frameIndex": 0,
            "mode": "latestWins"
        }
    }));
    assert_eq!(decoded["ok"], true, "decode.requestFrame failed: {decoded}");
    assert_eq!(decoded["result"]["decodePath"], "inprocess", "{decoded}");

    let write = backend.request(json!({
        "id": 13,
        "method": "encode.writeNativeFrame",
        "params": {
            "sessionId": "nv12-zero-copy-export",
            "renderId": "nv12-zero-copy-export-frame",
            "frameIndex": 0,
            "timestampUs": 0,
            "width": WIDTH,
            "height": HEIGHT,
            "snapshot": {
                "frame_index": 0,
                "colour": {
                    "profile": "rec709-sdr",
                    "working_space": "linear-light",
                    "alpha": "premultiplied"
                },
                "clips": [{
                    "clip_id": "export-video-clip",
                    "track_id": "track-1",
                    "media_id": media_id,
                    "source_frame": 0,
                    "z_index": 0,
                    "transform": {
                        "translation_x": 0.0,
                        "translation_y": 0.0,
                        "scale_x": 1.0,
                        "scale_y": 1.0,
                        "rotation_degrees": 0.0,
                        "sampling": "nearest"
                    },
                    "opacity": 1.0,
                    "effects": []
                }]
            },
            "media": [{
                "id": media_id,
                "kind": "Video",
                "source": source.to_string_lossy(),
                "width": WIDTH,
                "height": HEIGHT,
                "source_rate": { "numerator": FPS, "denominator": 1 }
            }],
            "sources": [{
                "mediaId": media_id,
                "jobId": job_id,
                "slotCount": decode_start["result"]["slotCount"],
                "frame": decoded["result"]["frame"]
            }]
        }
    }));

    assert_eq!(write["ok"], true, "encode.writeNativeFrame failed: {write}");
    assert_eq!(write["result"]["renderPath"], "webgpuSceneComposite", "{write}");
    assert_eq!(
        write["result"]["nv12ZeroCopyMediaIds"],
        json!([media_id]),
        "export must report the video resolved through NV12 zero-copy: {write}"
    );

    let finish = backend.request(json!({
        "id": 14,
        "method": "encode.finish",
        "params": { "sessionId": "nv12-zero-copy-export" }
    }));
    assert_eq!(finish["ok"], true, "encode.finish failed: {finish}");
    assert!(std::fs::metadata(output).expect("export output exists").len() > 0);
}

/// Golden parity test (Phase 4c Stage 2 requirement): the exact same decoded
/// frame, composited via the zero-copy NV12 path vs the CPU RGBA bridge
/// (forced via the kill switch), must produce matching pixels within
/// tolerance. Two independently spawned backend processes decode the same
/// deterministic (`keyint=1`) frame 0 of the same fixture, so any pixel
/// difference beyond compression/hardware-decode noise reflects a genuine
/// divergence between the two composite paths rather than different
/// decoded content.
#[test]
#[cfg(target_os = "macos")]
fn render_native_shared_frame_nv12_zero_copy_matches_rgba_bridge_within_tolerance() {
    if !require_ffmpeg() {
        eprintln!("skipping: ffmpeg not on PATH");
        return;
    }
    let dir = TempDir::new("parity");
    let source = build_playable_h264_fixture(dir.path());

    // A no-op LinearGain(gain=1.0) effect: identical on both runs, so the
    // *only* difference between them is which composite path resolves the
    // clip's video source (NV12 zero-copy GPU import vs the CPU RGBA
    // bridge). Without it, the RGBA-bridge run (nv12_sources empty because
    // of the kill switch) would fall through to the unrelated CPU
    // `cpu_simple_video` fast path instead of the GPU compositor, which
    // would not be the RGBA-bridge-through-the-GPU-compositor comparison
    // this test is meant to make.
    let effects = json!([{ "LinearGain": { "gain": 1.0 } }]);
    let (nv12_render, nv12_pixels) =
        decode_and_render_frame_zero(&[], "nv12-zero-copy-parity", &source, effects.clone());
    let (rgba_render, rgba_pixels) = decode_and_render_frame_zero(
        &[("UXFD_DISABLE_NV12_ZERO_COPY_RENDER", "1")],
        "nv12-zero-copy-parity",
        &source,
        effects,
    );

    assert!(
        !nv12_render["result"]["nv12ZeroCopyMediaIds"]
            .as_array()
            .expect("array")
            .is_empty(),
        "control: the nv12 run must actually have engaged the zero-copy path: {nv12_render}"
    );
    assert!(
        rgba_render["result"]["nv12ZeroCopyMediaIds"]
            .as_array()
            .expect("array")
            .is_empty(),
        "control: the rgba-bridge run must not have engaged the zero-copy path: {rgba_render}"
    );

    assert_eq!(
        nv12_pixels.len(),
        rgba_pixels.len(),
        "both composite paths must produce the same byte length"
    );
    const TOLERANCE: i32 = 2;
    let mut max_delta = 0i32;
    for (index, (a, b)) in nv12_pixels.iter().zip(rgba_pixels.iter()).enumerate() {
        let delta = (*a as i32 - *b as i32).abs();
        max_delta = max_delta.max(delta);
        assert!(
            delta <= TOLERANCE,
            "byte {index} differs beyond tolerance between nv12 zero-copy ({a}) and rgba bridge ({b}), delta={delta}"
        );
    }
    eprintln!("[render-nv12-parity] maxByteDelta={max_delta} toleranceByte={TOLERANCE}");
}
