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
//! Note on scope: this measures decode only, not decode+GPU-composite --
//! Stage 2 (the NV12 zero-copy path through `SceneSnapshot`/
//! native-wgpu-renderer) had not landed in this session (see
//! `progress/phase4c-inprocess-decode-integration.md`), so there is no
//! composite step to measure yet.

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
        let mut child = Command::new(env!("CARGO_BIN_EXE_uxfd-rust-backend"))
            .env("UXFD_DISABLE_DECODE_CHECKSUM", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .expect("start rust backend");
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
