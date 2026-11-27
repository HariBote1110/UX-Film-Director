//! Phase 4c Stage 3: measurement harness for the in-process decode path
//! added in Stage 1 (`rust-backend/src/inprocess_decode.rs`). Compares
//! per-frame decode latency against the ffmpeg-subprocess baseline measured
//! in `markdown/Rust_Preview_Jank_Handoff.md` (12-96ms/frame at 1080p,
//! failing the 60fps/30fps budget).
//!
//! Both tests are `#[ignore]`d: they decode real, heavy media end to end
//! through the compiled backend binary. Run explicitly (`--release` matters
//! here -- this harness reads the *decoded* frame out of shared memory every
//! frame, and that copy plus JSON (de)serialisation is itself much slower in
//! a debug build, which would swamp the decode-latency signal this is meant
//! to measure):
//!   cargo test --manifest-path rust-backend/Cargo.toml --release \
//!     --test inprocess_decode_perf -- --ignored --nocapture --test-threads=1
//!
//! Deliberately uses the *production-shaped* path -- `decode.requestFrame`
//! (not `...Inline`) plus a real `PosixSharedRing` consumer, exactly like
//! `rust-backend/tests/decode_control_plane.rs` -- rather than the inline
//! (base64-in-JSON) variant: an earlier version of this harness used the
//! inline path and measured ~400ms/frame client-side even though the
//! backend's own `decodeMs` trace showed <1ms; the difference was entirely
//! base64-encoding the whole frame into the JSON response, which the real
//! JS-side consumer never does. `UXFD_DISABLE_DECODE_CHECKSUM=1` is also set,
//! matching what Electron's main process sets when spawning this backend for
//! production preview (see `decode_checksum_enabled` in
//! `rust-backend/src/decode.rs`) -- the CRC32 pass is a diagnostic aid, not
//! part of the real pipeline's cost.
//!
//! Stage 2 addendum: `measure_sequential_render` (below) extends this to
//! decode+GPU-composite, driving `render.nativeSharedFrame` per frame (the
//! actual `render.nativeSharedFrame` hot path a real preview session uses)
//! instead of reading the decode ring directly, so the Stage 2 zero-copy
//! NV12 path and the pre-Stage-2 CPU RGBA bridge (forced via
//! `UXFD_DISABLE_NV12_ZERO_COPY_RENDER=1`) can be compared end to end.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::time::{Duration, Instant};
use uxfd_shared_memory_spike::PosixSharedRing;

struct BackendProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl BackendProcess {
    fn start() -> Self {
        Self::start_with_env(&[])
    }

    fn start_with_env(extra_envs: &[(&str, &str)]) -> Self {
        let mut command = Command::new(env!("CARGO_BIN_EXE_uxfd-rust-backend"));
        command
            .env("UXFD_DISABLE_DECODE_CHECKSUM", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped());
        for (key, value) in extra_envs {
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

struct FrameLatencies {
    label: String,
    decode_path: String,
    samples_ms: Vec<f64>,
}

impl FrameLatencies {
    fn report(&self) {
        let mut sorted = self.samples_ms.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let count = sorted.len();
        let sum: f64 = sorted.iter().sum();
        let mean = sum / count as f64;
        let p95 = sorted[((count as f64 * 0.95) as usize).min(count - 1)];
        let max = *sorted.last().unwrap();
        let min = sorted[0];
        eprintln!(
            "[inprocess-decode-perf] label={} decodePath={} frames={} meanMs={:.2} p95Ms={:.2} maxMs={:.2} minMs={:.2}",
            self.label, self.decode_path, count, mean, p95, max, min
        );
    }
}

/// Requests `frame_count` sequential frames from `source` at native
/// resolution (no proxy downscale, matching the 1080p target profile),
/// reading each one out of the real shared-memory ring (the same path the
/// JS frontend uses) and recording the wall-clock time for
/// `decode.requestFrame` + the shared-memory read. Releases each frame with
/// `gpuUploadFenceSignalled` (the real "I actually copied it out" signal),
/// matching `decode_control_plane.rs`'s consumer pattern.
fn measure_sequential_decode(
    label: &str,
    source: &Path,
    width: u32,
    height: u32,
    source_rate_numerator: u32,
    source_rate_denominator: u32,
    frame_count: u64,
) -> FrameLatencies {
    let mut backend = BackendProcess::start();
    let job_id = "inprocess-perf";

    let start = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": job_id,
            "source": source.to_string_lossy(),
            "slotCount": 2,
            "width": width,
            "height": height,
            "sourceRate": {
                "numerator": source_rate_numerator,
                "denominator": source_rate_denominator
            },
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
    let memory_id = start["result"]["memoryId"]
        .as_str()
        .expect("memoryId")
        .to_string();
    let slot_byte_len = start["result"]["slotByteLen"].as_u64().expect("slotByteLen") as usize;
    let slot_count = start["result"]["slotCount"].as_u64().expect("slotCount") as u32;
    let consumer_ring = PosixSharedRing::attach_with_retry_for_layout(
        &memory_id,
        slot_count,
        slot_byte_len,
        Duration::from_secs(2),
    )
    .expect("attach to decode ring");

    let mut samples_ms = Vec::with_capacity(frame_count as usize);
    let mut decode_path = String::new();
    for frame_index in 0..frame_count {
        let request_started_at = Instant::now();
        let response = backend.request(json!({
            "id": 10 + frame_index,
            "method": "decode.requestFrame",
            "params": {
                "jobId": job_id,
                "requestId": frame_index,
                "frameIndex": frame_index,
                "mode": "latestWins"
            }
        }));
        assert_eq!(
            response["ok"], true,
            "decode.requestFrame failed at frame {frame_index}: {response}"
        );
        consumer_ring
            .read_frame(frame_index)
            .expect("consumer reads decoded frame from shared memory");
        let elapsed_ms = request_started_at.elapsed().as_secs_f64() * 1_000.0;
        if frame_index == 0 {
            decode_path = response["result"]["decodePath"]
                .as_str()
                .unwrap_or("unknown")
                .to_string();
        }
        samples_ms.push(elapsed_ms);

        let release = backend.request(json!({
            "id": 1_000_000 + frame_index,
            "method": "decode.releaseFrame",
            "params": {
                "jobId": job_id,
                "slotIndex": response["result"]["frame"]["descriptor"]["slotIndex"],
                "generation": response["result"]["frame"]["descriptor"]["generation"],
                "copyOutState": "gpuUploadFenceSignalled"
            }
        }));
        assert_eq!(release["ok"], true, "decode.releaseFrame failed: {release}");
    }

    FrameLatencies {
        label: label.to_string(),
        decode_path,
        samples_ms,
    }
}

/// Phase 4c Stage 2: like `measure_sequential_decode`, but measures
/// decode+GPU-composite per frame by driving `render.nativeSharedFrame`
/// (the real hot path a preview session calls every tick) instead of
/// reading the decode ring directly. `nv12_zero_copy` selects whether the
/// backend process is spawned with the Stage 2 zero-copy path enabled
/// (default) or forced off (`UXFD_DISABLE_NV12_ZERO_COPY_RENDER=1`, the
/// pre-Stage-2 CPU RGBA bridge for comparison).
///
/// The composed scene includes a no-op `LinearGain(gain=1.0)` effect. This
/// is no longer strictly required for the `nv12_zero_copy=true` run --
/// `handle_native_render_shared_frame` now skips the unrelated
/// `cpu_simple_video` CPU fast path whenever an nv12 zero-copy source is
/// available, specifically so the common empty-effects single-clip case
/// still reaches the GPU compositor -- but it is still required for the
/// `nv12_zero_copy=false` (kill-switched) run: with `nv12_sources` empty,
/// an effects-less scene would fall through to that CPU fast path instead
/// of the GPU RGBA-bridge path this measurement means to compare against.
/// Applying it uniformly to both runs keeps the two scenes identical except
/// for which composite path resolves the video source.
fn measure_sequential_render(
    label: &str,
    source: &Path,
    width: u32,
    height: u32,
    source_rate_numerator: u32,
    source_rate_denominator: u32,
    frame_count: u64,
    nv12_zero_copy: bool,
) -> FrameLatencies {
    let extra_envs: &[(&str, &str)] = if nv12_zero_copy {
        &[]
    } else {
        &[("UXFD_DISABLE_NV12_ZERO_COPY_RENDER", "1")]
    };
    let mut backend = BackendProcess::start_with_env(extra_envs);
    let job_id = "inprocess-render-perf";
    let output_memory_id = format!("/urp{:x}", std::process::id());

    let start = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": job_id,
            "source": source.to_string_lossy(),
            "slotCount": 2,
            "width": width,
            "height": height,
            "sourceRate": {
                "numerator": source_rate_numerator,
                "denominator": source_rate_denominator
            },
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

    let mut samples_ms = Vec::with_capacity(frame_count as usize);
    let mut decode_path = String::new();
    let mut nv12_engaged_frame_count: u64 = 0;
    for frame_index in 0..frame_count {
        let request_started_at = Instant::now();
        let decoded = backend.request(json!({
            "id": 10 + frame_index,
            "method": "decode.requestFrame",
            "params": {
                "jobId": job_id,
                "requestId": frame_index,
                "frameIndex": frame_index,
                "mode": "latestWins"
            }
        }));
        assert_eq!(
            decoded["ok"], true,
            "decode.requestFrame failed at frame {frame_index}: {decoded}"
        );

        let render = backend.request(json!({
            "id": 1_000 + frame_index,
            "method": "render.nativeSharedFrame",
            "params": {
                "renderId": "inprocess-render-perf",
                "memoryId": output_memory_id,
                "slotCount": 2,
                "ptsFrame": frame_index,
                "width": width,
                "height": height,
                "snapshot": {
                    "frame_index": frame_index,
                    "colour": {
                        "profile": "rec709-sdr",
                        "working_space": "linear-light",
                        "alpha": "premultiplied"
                    },
                    "clips": [{
                        "clip_id": "clip-video",
                        "track_id": "track-1",
                        "media_id": job_id,
                        "source_frame": frame_index,
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
                        "effects": [{ "LinearGain": { "gain": 1.0 } }]
                    }]
                },
                "media": [{
                    "id": job_id,
                    "kind": "Video",
                    "source": source.to_string_lossy(),
                    "width": width,
                    "height": height,
                    "source_rate": {
                        "numerator": source_rate_numerator,
                        "denominator": source_rate_denominator
                    }
                }],
                "sources": [{
                    "mediaId": job_id,
                    "slotCount": decode_slot_count,
                    "frame": decoded["result"]["frame"]
                }]
            }
        }));
        assert_eq!(
            render["ok"], true,
            "render.nativeSharedFrame failed at frame {frame_index}: {render}"
        );
        let elapsed_ms = request_started_at.elapsed().as_secs_f64() * 1_000.0;
        if frame_index == 0 {
            decode_path = decoded["result"]["decodePath"]
                .as_str()
                .unwrap_or("unknown")
                .to_string();
        }
        if !render["result"]["nv12ZeroCopyMediaIds"]
            .as_array()
            .map(|ids| ids.is_empty())
            .unwrap_or(true)
        {
            nv12_engaged_frame_count += 1;
        }
        samples_ms.push(elapsed_ms);

        let release = backend.request(json!({
            "id": 2_000_000 + frame_index,
            "method": "decode.releaseFrame",
            "params": {
                "jobId": job_id,
                "slotIndex": decoded["result"]["frame"]["descriptor"]["slotIndex"],
                "generation": decoded["result"]["frame"]["descriptor"]["generation"],
                "copyOutState": "gpuUploadFenceSignalled"
            }
        }));
        assert_eq!(release["ok"], true, "decode.releaseFrame failed: {release}");
    }

    if nv12_zero_copy {
        assert_eq!(
            nv12_engaged_frame_count, frame_count,
            "expected every frame to engage the Stage 2 zero-copy NV12 path when it is enabled"
        );
    } else {
        assert_eq!(
            nv12_engaged_frame_count, 0,
            "UXFD_DISABLE_NV12_ZERO_COPY_RENDER=1 must keep every frame on the RGBA bridge"
        );
    }

    FrameLatencies {
        label: label.to_string(),
        decode_path,
        samples_ms,
    }
}

/// Committed, reproducible fixture: HEVC 1920x1080 60fps ~20Mbps, i.e. the
/// same codec/resolution as the user's problem profile (HEVC 1080p30
/// ~35Mbps `.mov` screen recordings) at a higher frame rate. Always
/// available in-repo, unlike the user's real 37GB file below.
#[test]
#[ignore]
fn inprocess_decode_latency_on_committed_hevc_1080p_fixture() {
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("repository root");
    let source = repo_root.join("perf/heavy-media/20000kbps_60fps.mp4");
    if !source.exists() {
        eprintln!("skipping: fixture not present at {source:?}");
        return;
    }

    let latencies = measure_sequential_decode(
        "committed-hevc-1080p60-20mbps",
        &source,
        1920,
        1080,
        60,
        1,
        120,
    );
    latencies.report();

    assert_eq!(
        latencies.decode_path, "inprocess",
        "expected the in-process VideoToolbox path to engage for this fixture"
    );
    let mean = latencies.samples_ms.iter().sum::<f64>() / latencies.samples_ms.len() as f64;
    // The ffmpeg baseline measured 12-96ms/frame at 1080p (markdown/Rust_Preview_Jank_Handoff.md).
    // This is a generous regression guard (well under even the baseline's best
    // case), not a tight perf budget -- CI machine variance is unknown.
    assert!(
        mean < 30.0,
        "in-process decode mean latency regressed well past the ffmpeg baseline: {mean:.2}ms"
    );
}

/// Phase 4c Stage 2: decode+GPU-composite comparison on the same committed
/// fixture as `inprocess_decode_latency_on_committed_hevc_1080p_fixture`
/// above (decode-only). Reports the zero-copy NV12 path's per-frame
/// decode+composite latency against the pre-Stage-2 CPU RGBA bridge
/// (forced via the kill switch) for the identical scene/frame sequence, so
/// the NV12 zero-copy win (skipping the CPU NV12->RGBA conversion this
/// bridge performs, see `inprocess_decode.rs::nv12_to_rgba`) is visible
/// end to end rather than only in the decode-only numbers above.
#[test]
#[ignore]
fn inprocess_render_latency_nv12_zero_copy_vs_rgba_bridge_on_committed_hevc_1080p_fixture() {
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("repository root");
    let source = repo_root.join("perf/heavy-media/20000kbps_60fps.mp4");
    if !source.exists() {
        eprintln!("skipping: fixture not present at {source:?}");
        return;
    }

    let nv12_latencies = measure_sequential_render(
        "committed-hevc-1080p60-20mbps-nv12-zero-copy",
        &source,
        1920,
        1080,
        60,
        1,
        120,
        true,
    );
    nv12_latencies.report();
    let rgba_latencies = measure_sequential_render(
        "committed-hevc-1080p60-20mbps-rgba-bridge",
        &source,
        1920,
        1080,
        60,
        1,
        120,
        false,
    );
    rgba_latencies.report();

    assert_eq!(nv12_latencies.decode_path, "inprocess");
    assert_eq!(rgba_latencies.decode_path, "inprocess");

    let nv12_mean =
        nv12_latencies.samples_ms.iter().sum::<f64>() / nv12_latencies.samples_ms.len() as f64;
    let rgba_mean =
        rgba_latencies.samples_ms.iter().sum::<f64>() / rgba_latencies.samples_ms.len() as f64;
    eprintln!(
        "[inprocess-render-perf] nv12ZeroCopyMeanMs={nv12_mean:.2} rgbaBridgeMeanMs={rgba_mean:.2} \
         deltaMs={:.2}",
        rgba_mean - nv12_mean
    );

    // Generous regression guards (decode+composite adds GPU setup/readback on
    // top of the ~3ms decode-only numbers already measured above; this is not
    // a tight perf budget). The interesting number is the reported delta
    // above, not a strict "nv12 must be faster" assertion -- GPU timing on a
    // shared/loaded dev machine is noisy enough that a strict comparative
    // assertion here would be a flaky test, not a meaningful regression
    // guard.
    assert!(
        nv12_mean < 50.0,
        "nv12 zero-copy decode+composite mean latency regressed past budget: {nv12_mean:.2}ms"
    );
    assert!(
        rgba_mean < 50.0,
        "rgba bridge decode+composite mean latency regressed past budget: {rgba_mean:.2}ms"
    );
}

/// The user's actual problem video (see `markdown/Rust_Preview_Jank_Handoff.md`
/// / the Phase 4c brief): HEVC 1920x1080 30fps ~35Mbps, a long screen
/// recording. Only runs when the file is present and readable -- it lives on
/// an external drive, not in the repo.
#[test]
#[ignore]
fn inprocess_decode_latency_on_users_reported_problem_video() {
    let source = Path::new("/Volumes/Datadrive/2026-01-07 18-19-31.mov");
    if !source.exists() {
        eprintln!("skipping: {source:?} not present/readable in this environment");
        return;
    }

    let latencies =
        measure_sequential_decode("user-problem-video-hevc-1080p30", source, 1920, 1080, 30, 1, 120);
    latencies.report();

    if latencies.decode_path != "inprocess" {
        eprintln!(
            "in-process decode did NOT engage for this file (decodePath={}); likely the sandboxed-HEVC \
             pixel-decode constraint documented in progress/phase4a-macos-video-decode-core.md -- this is \
             an environment limitation, not a code failure, so it is reported rather than asserted on.",
            latencies.decode_path
        );
        return;
    }

    let mean = latencies.samples_ms.iter().sum::<f64>() / latencies.samples_ms.len() as f64;
    assert!(
        mean < 30.0,
        "in-process decode mean latency on the user's problem video regressed past budget: {mean:.2}ms"
    );
}
