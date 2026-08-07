use serde_json::{json, Value};
use std::io::Read;
use std::process::{Command, Stdio};

use crate::frames::{
    base64_encode, checksum_for_bytes, descriptor_for_release, pad_rgba_rows, tight_rgba_byte_len,
};
use crate::inprocess_decode::{inprocess_decode_enabled, InProcessDecodeSession};
use crate::params::DecodeStopRequest;
use crate::rpc::{response_error, RpcResponse};
use crate::sessions::{
    CachedDecodedRgbaFrame, DecodeFrameLease, DecodeSession, DecodedRgbaFrame,
    StreamingDecodeProcess,
};
use crate::state::BackendState;
#[cfg(unix)]
use uxfd_shared_memory_spike::PosixSharedRing;
use uxfd_sidecar_protocol::{
    rgba8_srgb_ring_layout, validate_renderer_handoff_descriptor, ChecksumAlgorithm, CopyOutState,
    DecodeFrameRequest, DecodeReleaseFrameRequest, DecodeStartRequest, DecodeStartResponse,
    FrameChecksum, FrameFormat, FrameVerificationReport, FrameVerificationStatus, ReadyFrame,
    SharedFrame, SharedFrameRing, SlotRecoveryReason,
};

pub(crate) fn handle_decode_start(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
    let parsed = match serde_json::from_value::<DecodeStartRequest>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(id, -32602, &format!("Invalid decode.start params: {error}"));
        }
    };

    if parsed.job_id.trim().is_empty() {
        return response_error(id, -32602, "jobId must not be empty");
    }
    if parsed.source.trim().is_empty() {
        return response_error(id, -32602, "source must not be empty");
    }
    if parsed.format != FrameFormat::Rgba8Srgb {
        return response_error(id, -32602, "Only rgba8Srgb decode output is supported");
    }
    if parsed.source_rate.numerator == 0 || parsed.source_rate.denominator == 0 {
        return response_error(id, -32602, "sourceRate must be a positive rational");
    }
    if let Some(session) = state.decode_sessions.get(&parsed.job_id) {
        // jobId is derived from mediaId+size+rate only (see the various
        // `buildViewport*DecodeJob` helpers on the TS side); it does not
        // include slotCount. Two independent callers (e.g. native playback,
        // which asks for a deep buffer, and export, which asks for a
        // shallow one) can therefore legitimately request the same jobId
        // with different slotCounts. Silently handing back the already-active
        // session here would let the caller believe its own requested
        // slotCount was honoured, when the underlying POSIX ring actually has
        // a different slot count -- the caller then attaches to the ring
        // (e.g. in render.nativeSharedFrame) with the wrong slotCount and
        // hits SlotCountMismatch deep inside `attach_with_retry_for_layout`,
        // producing a corrupt export output. Fail loudly and immediately
        // here instead.
        if session.start_response.slot_count != parsed.slot_count {
            return response_error(
                id,
                -32055,
                &format!(
                    "Decode session already active for jobId={} with slotCount={}, but this \
                     request asked for slotCount={}. jobId must be scoped by slotCount when \
                     callers can disagree on it.",
                    parsed.job_id, session.start_response.slot_count, parsed.slot_count
                ),
            );
        }
        return RpcResponse {
            id,
            ok: true,
            result: Some(
                serde_json::to_value(session.start_response.clone()).unwrap_or(Value::Null),
            ),
            error: None,
        };
    }

    let memory_id = decode_memory_id(&parsed.job_id);
    let layout = match rgba8_srgb_ring_layout(
        memory_id.clone(),
        parsed.slot_count,
        parsed.width,
        parsed.height,
        parsed.colour.clone(),
    ) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid decode ring layout: {error:?}"),
            );
        }
    };
    let descriptor = match layout.descriptor_for_slot(0) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid decode ring descriptor: {error:?}"),
            );
        }
    };

    if let Err(error) = validate_renderer_handoff_descriptor(&descriptor) {
        return response_error(
            id,
            -32602,
            &format!("Unsupported decode renderer handoff descriptor: {error:?}"),
        );
    }

    let ffmpeg_path = std::env::var("UXFD_FFMPEG_BIN").unwrap_or_else(|_| "ffmpeg".to_string());
    let ffprobe_path = std::env::var("UXFD_FFPROBE_BIN").unwrap_or_else(|_| "ffprobe".to_string());
    let data_plane_ring =
        match create_decode_data_plane(&memory_id, layout.slot_count(), descriptor.byte_len) {
            Ok(value) => value,
            Err(error) => {
                return response_error(
                    id,
                    -32049,
                    &format!("Failed to create decode shared memory: {error}"),
                );
            }
        };
    let response = DecodeStartResponse {
        job_id: parsed.job_id.clone(),
        memory_id,
        slot_count: layout.slot_count(),
        slot_byte_len: descriptor.byte_len,
        width: descriptor.width,
        height: descriptor.height,
        stride_bytes: descriptor.stride_bytes,
        source_rate: parsed.source_rate,
        format: descriptor.format,
        colour: descriptor.colour,
    };
    let inprocess = open_inprocess_decode_session(&parsed.job_id, &parsed.source, &response);

    state.decode_sessions.insert(
        response.job_id.clone(),
        DecodeSession {
            start_response: response.clone(),
            source: parsed.source,
            ffmpeg_path,
            ffprobe_path,
            ring: SharedFrameRing::new(layout),
            data_plane_ring,
            inprocess,
            streaming_decoder: None,
            decoded_frame_cache: std::collections::VecDeque::new(),
            decoded_frame_leases: std::collections::HashMap::new(),
            next_renderer_lease_generation: 1,
        },
    );

    RpcResponse {
        id,
        ok: true,
        result: Some(serde_json::to_value(response).unwrap_or(Value::Null)),
        error: None,
    }
}

pub(crate) fn handle_decode_stop(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
    let parsed = match serde_json::from_value::<DecodeStopRequest>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(id, -32602, &format!("Invalid decode.stop params: {error}"));
        }
    };

    let Some(session) = state.decode_sessions.get(&parsed.job_id) else {
        return response_error(id, -32041, "No active decode session");
    };

    if parsed.job_id != session.start_response.job_id {
        return response_error(id, -32042, "Decode jobId does not match active session");
    }

    let job_id = session.start_response.job_id.clone();
    state.decode_sessions.remove(&job_id);

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "stopped": true,
            "jobId": job_id,
        })),
        error: None,
    }
}

pub(crate) fn handle_decode_request_frame(
    id: u64,
    params: Value,
    state: &mut BackendState,
    include_inline_rgba: bool,
) -> RpcResponse {
    let parsed = match serde_json::from_value::<DecodeFrameRequest>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid decode.requestFrame params: {error}"),
            );
        }
    };

    let Some(session) = state.decode_sessions.get_mut(&parsed.job_id) else {
        return response_error(id, -32041, "No active decode session");
    };

    let write_slot = match session.ring.acquire_write_slot() {
        Ok(value) => value,
        Err(error) => {
            return response_error(id, -32043, &format!("No free decode frame slot: {error:?}"));
        }
    };
    let write_slot_index = write_slot.slot_index;

    let decode_started_at = std::time::Instant::now();
    let decoded_rgba = match decode_rgba_frame_for_session(session, parsed.frame_index) {
        Ok(value) => value,
        Err(error) => {
            let _ = session
                .ring
                .recover_stuck_slot(write_slot_index, SlotRecoveryReason::ProducerTimeout);
            return response_error(
                id,
                -32044,
                &format!("Failed to decode video frame in Rust backend: {error}"),
            );
        }
    };
    // Opt-in trace (UXFD_DECODE_TRACE=1): one compact line per decode so the
    // restart cadence and per-frame decode latency are observable on a real
    // playback/scrub session. Restarts (non-"sequential") are the jank source.
    if decode_trace_enabled() {
        let elapsed_ms = decode_started_at.elapsed().as_secs_f64() * 1_000.0;
        eprintln!(
            "[decode.trace] job={} frame={} reason={} restarted={} skipped={} decodeMs={:.1}",
            parsed.job_id,
            parsed.frame_index,
            decoded_rgba.stream_restart_reason,
            decoded_rgba.stream_restarted,
            decoded_rgba.stream_skipped_frame_count,
            elapsed_ms,
        );
    }

    let padded_rgba = match pad_rgba_rows(
        &decoded_rgba.bytes,
        session.start_response.width,
        session.start_response.height,
        session.start_response.stride_bytes,
    ) {
        Ok(value) => value,
        Err(error) => {
            let _ = session
                .ring
                .recover_stuck_slot(write_slot_index, SlotRecoveryReason::ProducerTimeout);
            return response_error(
                id,
                -32045,
                &format!("Decoded frame does not match shared-ring layout: {error}"),
            );
        }
    };

    if write_slot.descriptor.byte_len != padded_rgba.len() as u64 {
        let _ = session
            .ring
            .recover_stuck_slot(write_slot_index, SlotRecoveryReason::ProducerTimeout);
        return response_error(
            id,
            -32045,
            &format!(
                "Decoded padded frame byte length mismatch: descriptor={}, actual={}",
                write_slot.descriptor.byte_len,
                padded_rgba.len()
            ),
        );
    }

    if let Err(error) = validate_renderer_handoff_descriptor(&write_slot.descriptor) {
        let _ = session
            .ring
            .recover_stuck_slot(write_slot_index, SlotRecoveryReason::ProducerTimeout);
        return response_error(
            id,
            -32602,
            &format!("Unsupported decoded frame descriptor: {error:?}"),
        );
    }

    let data_plane_slot_index = match write_decode_data_plane(
        session.data_plane_ring.as_ref(),
        parsed.frame_index,
        &padded_rgba,
    ) {
        Ok(value) => value,
        Err(error) => {
            let _ = session
                .ring
                .recover_stuck_slot(write_slot_index, SlotRecoveryReason::ProducerTimeout);
            return response_error(
                id,
                -32050,
                &format!("Failed to write decoded frame to shared memory: {error}"),
            );
        }
    };

    if let Err(error) = session.ring.mark_slot_ready(write_slot, parsed.frame_index) {
        // The data-plane frame was already written; drop it so the internal
        // failure does not strand a READY slot forever.
        let _ = release_decode_data_plane(
            session.data_plane_ring.as_ref(),
            data_plane_slot_index,
            parsed.frame_index,
            CopyOutState::RendererUploadAborted,
        );
        return response_error(
            id,
            -32046,
            &format!("Failed to mark decoded frame ready: {error:?}"),
        );
    }
    let mut ready_frame = match session.ring.acquire_ready_slot() {
        Ok(value) => value,
        Err(error) => {
            let _ = release_decode_data_plane(
                session.data_plane_ring.as_ref(),
                data_plane_slot_index,
                parsed.frame_index,
                CopyOutState::RendererUploadAborted,
            );
            return response_error(
                id,
                -32047,
                &format!("Decoded frame was not readable after ready transition: {error:?}"),
            );
        }
    };
    // The control-plane SharedFrameRing and the data-plane PosixSharedRing
    // each scan independently for the lowest-numbered FREE slot, so their
    // slot numbering can desynchronise once a data-plane slot is released
    // outside the control-plane's view (see progress.md 2026-07-02). Make
    // the data-plane's real slot the single source of truth for what the
    // renderer sees: it is what copy_shared_frame_into_upload_buffer() will
    // actually read, so it must be what descriptor.slotIndex says.
    //
    // The renderer-visible generation is a session-wide unique lease id, not
    // the control-plane slot generation: the data-plane slot can be freed
    // early by the in-backend native render source read and reused by the
    // next requestFrame while this lease is still outstanding, and two
    // control-plane slots can carry equal generation values — so (slot,
    // control generation) does not identify a lease. The unique id does; the
    // control-plane slot_index + generation needed to release the
    // control-plane side are retained in the lease table.
    let renderer_lease_generation = session.next_renderer_lease_generation;
    session.next_renderer_lease_generation += 1;
    let control_plane_slot_index = ready_frame.slot_index;
    let control_plane_generation = ready_frame.frame.descriptor.generation;
    let Some(data_plane_byte_offset) = ready_frame
        .frame
        .descriptor
        .byte_len
        .checked_mul(u64::from(data_plane_slot_index))
    else {
        let _ = session
            .ring
            .recover_stuck_slot(control_plane_slot_index, SlotRecoveryReason::ProducerTimeout);
        let _ = release_decode_data_plane(
            session.data_plane_ring.as_ref(),
            data_plane_slot_index,
            parsed.frame_index,
            CopyOutState::RendererUploadAborted,
        );
        return response_error(
            id,
            -32045,
            &format!(
                "Decoded frame byte offset overflows: slotIndex={data_plane_slot_index}, byteLen={}",
                ready_frame.frame.descriptor.byte_len
            ),
        );
    };
    ready_frame.frame.descriptor.slot_index = data_plane_slot_index;
    // Renderer-side validation and the native overlay upload path require
    // byteOffset === slotIndex * byteLen, so the whole descriptor must be
    // self-consistent against the data-plane slot, not the control-plane one.
    ready_frame.frame.descriptor.byte_offset = data_plane_byte_offset;
    ready_frame.frame.descriptor.generation = renderer_lease_generation;
    session.decoded_frame_leases.insert(
        renderer_lease_generation,
        DecodeFrameLease {
            data_plane_slot_index,
            sequence: parsed.frame_index,
            control_plane_slot_index,
            control_plane_generation,
        },
    );
    // The verification checksum is a diagnostic field for the RPC caller:
    // the frontend only type-checks its shape (algorithm/valueHex/byteLen)
    // and never compares its value against anything (see
    // rustBackendVideoDecodeControl.ts), and `status` is unconditionally
    // `WithinTolerance` here, so nothing in the shipped app depends on a
    // real CRC32. This backend's own integration tests
    // (rust-backend/tests/decode_control_plane.rs) do use it as a
    // decode-correctness oracle though (comparing checksums to assert exact
    // pixel output for scaling/range-conversion/etc.), so — unlike
    // `decode_trace_enabled()`, which is opt-in — this stays on by default
    // and only skips the whole-frame CRC32 pass (the actual per-frame CPU
    // cost) when explicitly disabled, mirroring the
    // `UXFD_DISABLE_VIDEOTOOLBOX_DECODE` opt-out pattern below. This mirrors
    // the JS-side CRC verification that commit 358477d3 already downgraded
    // to `VITE_UXFD_UPLOAD_CRC_VERIFY=1` (opt-in there, since nothing on the
    // JS side depends on it either).
    let checksum = if decode_checksum_enabled() {
        checksum_for_bytes(&padded_rgba)
    } else {
        FrameChecksum {
            algorithm: ChecksumAlgorithm::Crc32,
            value_hex: "00000000".to_string(),
            byte_len: padded_rgba.len() as u64,
        }
    };
    let verification = FrameVerificationReport {
        frame_index: parsed.frame_index,
        checksum,
        diff: None,
        status: FrameVerificationStatus::WithinTolerance,
    };
    let mut frame_value = serde_json::to_value(&ready_frame.frame).unwrap_or(Value::Null);
    if include_inline_rgba {
        if let Value::Object(frame_object) = &mut frame_value {
            frame_object.insert(
                "rgbaBytes".to_string(),
                Value::String(base64_encode(&padded_rgba)),
            );
        }
    }

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "accepted": true,
            "jobId": parsed.job_id,
            "requestId": parsed.request_id,
            "frameIndex": parsed.frame_index,
            "mode": parsed.mode,
            "frame": frame_value,
            "verification": verification,
            "decodeInvocationCount": decoded_rgba.decode_invocation_count,
            "decodePath": decoded_rgba.decode_path,
            "streamRestarted": decoded_rgba.stream_restarted,
            "streamRestartReason": decoded_rgba.stream_restart_reason,
            "streamSkippedFrameCount": decoded_rgba.stream_skipped_frame_count,
        })),
        error: None,
    }
}

pub(crate) fn handle_decode_release_frame(
    id: u64,
    params: Value,
    state: &mut BackendState,
) -> RpcResponse {
    let parsed = match serde_json::from_value::<DecodeReleaseFrameRequest>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid decode.releaseFrame params: {error}"),
            );
        }
    };

    let Some(session) = state.decode_sessions.get_mut(&parsed.job_id) else {
        return response_error(id, -32041, "No active decode session");
    };
    if !parsed.copy_out_state.permits_read_slot_release() {
        return response_error(
            id,
            -32602,
            "copyOutState must be gpuUploadFenceSignalled or rendererUploadAborted before releasing a frame",
        );
    }

    // The renderer identifies the lease it is returning by the
    // descriptor.generation it received from decode.requestFrame (a
    // session-wide unique lease id) plus the data-plane slotIndex. The
    // generation is the lookup key: the data-plane slot number alone is
    // ambiguous, because a slot freed early by the in-backend native render
    // source read can be reused by a later requestFrame while the earlier
    // lease is still outstanding.
    let Some(lease) = session.decoded_frame_leases.remove(&parsed.generation) else {
        return response_error(
            id,
            -32602,
            &format!(
                "No outstanding decoded frame lease for generation {}",
                parsed.generation
            ),
        );
    };
    if lease.data_plane_slot_index != parsed.slot_index {
        return response_error(
            id,
            -32602,
            &format!(
                "Decoded frame lease slot mismatch: expected slotIndex={}, actual={}",
                lease.data_plane_slot_index, parsed.slot_index
            ),
        );
    }

    let descriptor = match descriptor_for_release(
        &session.start_response,
        lease.control_plane_slot_index,
        lease.control_plane_generation,
    ) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid decoded frame release descriptor: {error}"),
            );
        }
    };
    let ready_frame = ReadyFrame {
        slot_index: lease.control_plane_slot_index,
        frame: SharedFrame {
            descriptor,
            pts_frame: 0,
        },
    };

    if let Err(error) = session
        .ring
        .release_read_slot(ready_frame, parsed.copy_out_state)
    {
        return response_error(
            id,
            -32048,
            &format!("Failed to release decoded frame slot: {error:?}"),
        );
    }
    if let Err(error) = release_decode_data_plane(
        session.data_plane_ring.as_ref(),
        lease.data_plane_slot_index,
        lease.sequence,
        parsed.copy_out_state,
    ) {
        return response_error(
            id,
            -32051,
            &format!("Failed to release decoded shared memory slot: {error}"),
        );
    }

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "released": true,
            "jobId": parsed.job_id,
            "slotIndex": parsed.slot_index,
            "generation": parsed.generation,
        })),
        error: None,
    }
}

#[cfg(unix)]
pub(crate) type DecodeDataPlaneRing = PosixSharedRing;

#[cfg(not(unix))]
pub(crate) struct DecodeDataPlaneRing;

/// Phase 4c Stage 1 automatic fallback: attempts to open `source` via the
/// in-process `macos-video-decode` worker at the ring's requested output
/// resolution. Returns `None` (never an error to the caller) whenever the
/// in-process path is unavailable for any reason -- disabled via
/// `UXFD_DISABLE_INPROCESS_DECODE=1`, not macOS, or `VideoDecodeSession::open`
/// itself failing (unsupported codec/container, e.g. the sandboxed-HEVC
/// pixel-decode constraint from `progress/phase4a-macos-video-decode-core.md`)
/// -- so `decode_rgba_frame_for_session` transparently falls back to the
/// existing ffmpeg streaming pipeline for this session. The failure is
/// logged exactly once, here, at session-open time.
fn open_inprocess_decode_session(
    job_id: &str,
    source: &str,
    response: &DecodeStartResponse,
) -> Option<InProcessDecodeSession> {
    if !inprocess_decode_enabled() {
        return None;
    }
    match InProcessDecodeSession::open(
        std::path::Path::new(source),
        response.width,
        response.height,
    ) {
        Ok(session) => {
            if decode_trace_enabled() {
                eprintln!("[decode.trace] job={job_id} decodePath=inprocess (VideoToolbox, resident)");
            }
            Some(session)
        }
        Err(error) => {
            eprintln!(
                "[uxfd-decode] in-process decode unavailable for jobId={job_id}, falling back to ffmpeg pipeline: {error}"
            );
            None
        }
    }
}

fn decode_memory_id(job_id: &str) -> String {
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(job_id.as_bytes());
    format!("/uxfd-{}-{:08x}", std::process::id(), hasher.finalize())
}

#[cfg(unix)]
fn create_decode_data_plane(
    memory_id: &str,
    slot_count: u32,
    slot_byte_len: u64,
) -> Result<Option<DecodeDataPlaneRing>, String> {
    let frame_len = usize::try_from(slot_byte_len)
        .map_err(|_| format!("slotByteLen overflows usize: {slot_byte_len}"))?;
    PosixSharedRing::create_with_slot_count(memory_id, slot_count, frame_len)
        .map(Some)
        .map_err(|error| format!("{error:?}"))
}

#[cfg(not(unix))]
fn create_decode_data_plane(
    _memory_id: &str,
    _slot_count: u32,
    _slot_byte_len: u64,
) -> Result<Option<DecodeDataPlaneRing>, String> {
    Ok(None)
}

/// Writes the decoded frame into the data-plane ring and returns the slot
/// index it actually landed in. This is the single source of truth for the
/// slotIndex handed back to the renderer — the control-plane `SharedFrameRing`
/// (`session.ring`) tracks its own, independent slot bookkeeping that can
/// desynchronise from the data-plane ring once a slot is freed behind its
/// back (see progress.md 2026-07-02 for how this caused decode ring
/// exhaustion).
#[cfg(unix)]
fn write_decode_data_plane(
    ring: Option<&DecodeDataPlaneRing>,
    frame_index: u64,
    bytes: &[u8],
) -> Result<u32, String> {
    let ring = ring.ok_or_else(|| "decode shared memory ring is unavailable".to_string())?;
    ring.write_frame(frame_index, bytes)
        .map_err(|error| format!("{error:?}"))
}

#[cfg(not(unix))]
fn write_decode_data_plane(
    _ring: Option<&DecodeDataPlaneRing>,
    _frame_index: u64,
    _bytes: &[u8],
) -> Result<u32, String> {
    Ok(0)
}

/// Releases one leased frame on the data-plane ring, verified by the
/// sequence the lease was written as. `release_frame_slot_for_sequence`
/// covers every legitimate end-of-lease state:
/// - READING (the renderer copy bridge read it) → freed.
/// - READY (never read: renderer abort before the copy, or the inline MVP
///   upload path which never touches shared memory) → the unread frame is
///   dropped and the slot freed. Leaving such slots stranded was the
///   residual leak that starved the ring on 0.1.1-Beta-425a.
/// - FREE / recycled for a different sequence (the in-backend native render
///   source read already consumed and released it) → safe no-op.
#[cfg(unix)]
fn release_decode_data_plane(
    ring: Option<&DecodeDataPlaneRing>,
    slot_index: u32,
    sequence: u64,
    copy_out_state: CopyOutState,
) -> Result<(), String> {
    let ring = ring.ok_or_else(|| "decode shared memory ring is unavailable".to_string())?;
    ring.release_frame_slot_for_sequence(slot_index, sequence, copy_out_state)
        .map_err(|error| format!("{error:?}"))
}

#[cfg(not(unix))]
fn release_decode_data_plane(
    _ring: Option<&DecodeDataPlaneRing>,
    _slot_index: u32,
    _sequence: u64,
    _copy_out_state: CopyOutState,
) -> Result<(), String> {
    Ok(())
}

// Forward gap a warm streaming decoder will absorb by discard-reading frames
// instead of cold-restarting ffmpeg. A cold restart costs ~150-400ms (process
// spawn + keyframe seek), whereas discard-reading is a few ms per frame, so a
// generous window lets the decoder recover from a transient hitch (e.g. a brief
// stall that let the playhead run ahead) without the restart→runaway loop.
const MAX_STREAMING_DECODE_SKIP_FRAMES: u64 = 90;
const DECODED_FRAME_CACHE_CAPACITY: usize = 12;

fn decode_trace_enabled() -> bool {
    std::env::var("UXFD_DECODE_TRACE")
        .map(|value| value == "1")
        .unwrap_or(false)
}

// Whole-frame CRC32 verification is a diagnostic aid, not a correctness
// dependency in the shipped app (see the comment at its call site in
// handle_decode_request_frame), but the integration tests use it as a
// decode-correctness oracle, so it stays on by default and is opted out via
// UXFD_DISABLE_DECODE_CHECKSUM=1 (which the Electron main process sets when
// spawning this backend for production preview).
fn decode_checksum_enabled() -> bool {
    std::env::var("UXFD_DISABLE_DECODE_CHECKSUM")
        .map(|value| value != "1")
        .unwrap_or(true)
}

fn decode_rgba_frame_for_session(
    session: &mut DecodeSession,
    frame_index: u64,
) -> Result<DecodedRgbaFrame, String> {
    let expected_len =
        tight_rgba_byte_len(session.start_response.width, session.start_response.height)?;

    // Phase 4c Stage 1: an in-process session (see `open_inprocess_decode_session`)
    // fully replaces the ffmpeg pipeline below for this session -- the
    // decoder worker thread owns its own pts-ordered prefetch ring, so
    // `decoded_frame_cache`/`streaming_decoder` (ffmpeg-specific) are never
    // touched on this path. `request_frame` never runs a decode on this (RPC)
    // thread; it only does a bounded ring lookup (see `inprocess_decode.rs`).
    if let Some(inprocess) = session.inprocess.as_ref() {
        let target_pts_seconds = frame_index as f64
            * f64::from(session.start_response.source_rate.denominator)
            / f64::from(session.start_response.source_rate.numerator);
        let frame = inprocess.request_frame(target_pts_seconds).map_err(|error| {
            format!("in-process decode failed for frame {frame_index}: {error}")
        })?;
        if decode_trace_enabled() {
            eprintln!(
                "[decode.trace] inprocess targetPts={target_pts_seconds:.4} servedPts={:.4}",
                frame.pts_seconds
            );
        }
        return Ok(DecodedRgbaFrame {
            bytes: frame.rgba,
            decode_path: "inprocess",
            stream_restarted: false,
            stream_skipped_frame_count: 0,
            decode_invocation_count: 0,
            stream_restart_reason: "inprocess",
        });
    }

    if let Some(bytes) = cached_decoded_frame_bytes(session, frame_index, expected_len) {
        return Ok(DecodedRgbaFrame {
            bytes,
            decode_path: "cache",
            stream_restarted: false,
            stream_skipped_frame_count: 0,
            decode_invocation_count: 0,
            stream_restart_reason: "cacheHit",
        });
    }

    // Classify why this request can or cannot reuse the running ffmpeg process.
    // A restart re-spawns ffprobe + ffmpeg and re-seeks, which stalls preview;
    // surfacing the reason lets us measure restart-driven jank on real sessions.
    let restart_reason = match session.streaming_decoder.as_ref() {
        None => "firstFrame",
        Some(decoder) if decoder.frame_byte_len != expected_len => "byteLenMismatch",
        Some(decoder) if frame_index < decoder.next_frame_index => "backwardSeek",
        Some(decoder)
            if frame_index - decoder.next_frame_index > MAX_STREAMING_DECODE_SKIP_FRAMES =>
        {
            "forwardGapExceeded"
        }
        Some(_) => "sequential",
    };

    if restart_reason == "sequential" {
        let (bytes, skipped_frame_count, frames_to_cache) = {
            let decoder = session
                .streaming_decoder
                .as_mut()
                .expect("sequential reuse requires a running streaming decoder");
            let skipped_frame_count = frame_index - decoder.next_frame_index;
            let mut frames_to_cache: std::collections::VecDeque<(u64, Vec<u8>)> =
                std::collections::VecDeque::new();
            for _ in 0..skipped_frame_count {
                let skipped_frame_index = decoder.next_frame_index;
                let mut scratch = vec![0u8; expected_len];
                decoder
                    .stdout
                    .read_exact(&mut scratch)
                    .map_err(|error| format!("failed to skip streaming decoded frame: {error}"))?;
                remember_pending_decoded_frame(&mut frames_to_cache, skipped_frame_index, scratch);
                decoder.next_frame_index += 1;
            }

            let requested_frame_index = decoder.next_frame_index;
            let mut bytes = vec![0u8; expected_len];
            decoder
                .stdout
                .read_exact(&mut bytes)
                .map_err(|error| format!("failed to read streaming decoded frame: {error}"))?;
            remember_pending_decoded_frame(
                &mut frames_to_cache,
                requested_frame_index,
                bytes.clone(),
            );
            decoder.next_frame_index += 1;
            (bytes, skipped_frame_count, frames_to_cache)
        };
        for (cached_frame_index, cached_bytes) in frames_to_cache {
            remember_decoded_frame(session, cached_frame_index, cached_bytes);
        }
        return Ok(DecodedRgbaFrame {
            bytes,
            decode_path: "stream",
            stream_restarted: false,
            stream_skipped_frame_count: skipped_frame_count,
            decode_invocation_count: 0,
            stream_restart_reason: restart_reason,
        });
    }

    let (mut decoder, bytes) = start_streaming_decode_process(session, frame_index, expected_len)?;
    decoder.next_frame_index = frame_index + 1;
    session.streaming_decoder = Some(decoder);
    remember_decoded_frame(session, frame_index, bytes.clone());

    Ok(DecodedRgbaFrame {
        bytes,
        decode_path: "stream",
        stream_restarted: true,
        stream_skipped_frame_count: 0,
        decode_invocation_count: 1,
        stream_restart_reason: restart_reason,
    })
}

fn cached_decoded_frame_bytes(
    session: &DecodeSession,
    frame_index: u64,
    expected_len: usize,
) -> Option<Vec<u8>> {
    session
        .decoded_frame_cache
        .iter()
        .rev()
        .find(|frame| frame.frame_index == frame_index && frame.bytes.len() == expected_len)
        .map(|frame| frame.bytes.clone())
}

fn remember_decoded_frame(session: &mut DecodeSession, frame_index: u64, bytes: Vec<u8>) {
    if let Some(position) = session
        .decoded_frame_cache
        .iter()
        .position(|frame| frame.frame_index == frame_index)
    {
        session.decoded_frame_cache.remove(position);
    }
    session
        .decoded_frame_cache
        .push_back(CachedDecodedRgbaFrame { frame_index, bytes });
    while session.decoded_frame_cache.len() > DECODED_FRAME_CACHE_CAPACITY {
        session.decoded_frame_cache.pop_front();
    }
}

fn remember_pending_decoded_frame(
    frames: &mut std::collections::VecDeque<(u64, Vec<u8>)>,
    frame_index: u64,
    bytes: Vec<u8>,
) {
    if let Some(position) = frames
        .iter()
        .position(|(cached_frame_index, _)| *cached_frame_index == frame_index)
    {
        frames.remove(position);
    }
    frames.push_back((frame_index, bytes));
    while frames.len() > DECODED_FRAME_CACHE_CAPACITY {
        frames.pop_front();
    }
}

fn start_streaming_decode_process(
    session: &mut DecodeSession,
    frame_index: u64,
    expected_len: usize,
) -> Result<(StreamingDecodeProcess, Vec<u8>), String> {
    session.streaming_decoder = None;

    let input_metadata = probe_video_input_metadata(&session.ffprobe_path, &session.source)?;
    let seek_seconds = frame_index as f64
        * f64::from(session.start_response.source_rate.denominator)
        / f64::from(session.start_response.source_rate.numerator);
    // `source_rate` is the frame-rate domain of the caller's `frameIndex`
    // values (the preview tick rate, e.g. 60fps) — not necessarily the
    // source file's native frame rate (e.g. 30fps). The sequential-read fast
    // path below assumes each `frameIndex` step of 1 corresponds to exactly
    // one frame read from ffmpeg's output stream, so the source must be
    // resampled to `source_rate` up front: the `fps` filter duplicates (or
    // drops) frames as needed so ffmpeg's stdout stream is already in the
    // caller's tick domain. Without this, a slower source (e.g. 30fps) is
    // drained twice as fast as playback advances, causing 2x-speed playback
    // and a stall once the source frames run out.
    let numerator = session.start_response.source_rate.numerator;
    let denominator = session.start_response.source_rate.denominator;
    let width = session.start_response.width;
    let height = session.start_response.height;
    let range = input_metadata.range;

    // When VideoToolbox decode is available, prefer keeping the decoded
    // frame on the GPU for the resize (`scale_vt`) and only pulling it back
    // to CPU memory (`hwdownload`) once it is already small, instead of
    // downloading the full-resolution NV12 frame and letting ffmpeg's CPU
    // swscale do both the resize and the NV12->RGBA conversion on every
    // frame. If `scale_vt` is unsupported by the local ffmpeg build (older
    // version, no VideoToolbox) the first spawn/read below fails fast and
    // this falls back to the original CPU-scale filter chain, which is also
    // what runs when VideoToolbox is disabled entirely via
    // `UXFD_DISABLE_VIDEOTOOLBOX_DECODE=1`.
    if streaming_decode_scale_vt_enabled() {
        let hardware_filter =
            build_streaming_decode_filter(numerator, denominator, width, height, range, true);
        let hardware_args = build_streaming_decode_args_with_hwaccel(
            &session.source,
            seek_seconds,
            &hardware_filter,
            true,
            true,
        );
        match spawn_streaming_decode_process(
            &session.ffmpeg_path,
            &hardware_args,
            frame_index,
            expected_len,
        ) {
            Ok(result) => return Ok(result),
            Err(error) => {
                if decode_trace_enabled() {
                    eprintln!(
                        "[uxfd-decode-trace] scale_vt streaming decode failed, falling back to CPU scale filter: {error}"
                    );
                }
            }
        }
    }

    let cpu_filter =
        build_streaming_decode_filter(numerator, denominator, width, height, range, false);
    let cpu_args = build_streaming_decode_args(&session.source, seek_seconds, &cpu_filter);
    spawn_streaming_decode_process(&session.ffmpeg_path, &cpu_args, frame_index, expected_len)
}

fn spawn_streaming_decode_process(
    ffmpeg_path: &str,
    args: &[String],
    frame_index: u64,
    expected_len: usize,
) -> Result<(StreamingDecodeProcess, Vec<u8>), String> {
    let mut child = Command::new(ffmpeg_path)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("failed to start streaming ffmpeg ({ffmpeg_path}): {error}"))?;
    let mut stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("streaming ffmpeg stdout was unavailable".to_string());
        }
    };

    // Reading the first frame here (rather than leaving it to the caller) is
    // what makes the scale_vt fallback above possible: an unsupported filter
    // graph does not fail `spawn()` (ffmpeg starts fine, it just errors out
    // internally and closes stdout), so the failure only becomes observable
    // once the first read comes up short. Surfacing that as an `Err` here
    // lets the caller retry with the CPU filter chain instead of the request
    // stalling or returning garbage.
    let mut bytes = vec![0u8; expected_len];
    if let Err(error) = stdout.read_exact(&mut bytes) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(format!("failed to read first streaming decoded frame: {error}"));
    }

    Ok((
        StreamingDecodeProcess {
            child,
            stdout,
            next_frame_index: frame_index,
            frame_byte_len: expected_len,
        },
        bytes,
    ))
}

// Builds the `-vf` filter graph. `hardware_scale` selects between resizing
// on the GPU via VideoToolbox (`scale_vt`, paired with
// `-hwaccel_output_format videotoolbox_vld`) and the original CPU `scale`
// filter. `scale_vt` itself has no range-conversion option, so the
// tv->pc range conversion still happens on CPU via a no-resize `scale` pass
// — but only after `hwdownload`, i.e. on the already-downscaled frame, which
// is comparatively cheap.
fn build_streaming_decode_filter(
    source_rate_numerator: u32,
    source_rate_denominator: u32,
    width: u32,
    height: u32,
    range: &str,
    hardware_scale: bool,
) -> String {
    if hardware_scale {
        format!(
            "fps={source_rate_numerator}/{source_rate_denominator},scale_vt=w={width}:h={height},hwdownload,format=nv12,scale=in_range={range}:out_range=pc,format=rgba"
        )
    } else {
        format!(
            "fps={source_rate_numerator}/{source_rate_denominator},scale=w={width}:h={height}:in_range={range}:out_range=pc,format=rgba"
        )
    }
}

fn build_streaming_decode_args(source: &str, seek_seconds: f64, filter: &str) -> Vec<String> {
    build_streaming_decode_args_with_hwaccel(
        source,
        seek_seconds,
        filter,
        streaming_decode_videotoolbox_enabled(),
        false,
    )
}

fn build_streaming_decode_args_with_hwaccel(
    source: &str,
    seek_seconds: f64,
    filter: &str,
    videotoolbox_decode: bool,
    videotoolbox_output_format: bool,
) -> Vec<String> {
    let mut args = vec![
        "-hide_banner".to_string(),
        "-loglevel".to_string(),
        "error".to_string(),
    ];
    if videotoolbox_decode {
        args.push("-hwaccel".to_string());
        args.push("videotoolbox".to_string());
        if videotoolbox_output_format {
            args.push("-hwaccel_output_format".to_string());
            args.push("videotoolbox_vld".to_string());
        }
    }
    args.extend([
        "-ss".to_string(),
        format!("{seek_seconds:.6}"),
        "-i".to_string(),
        source.to_string(),
        "-vf".to_string(),
        filter.to_string(),
        "-pix_fmt".to_string(),
        "rgba".to_string(),
        "-f".to_string(),
        "rawvideo".to_string(),
        "pipe:1".to_string(),
    ]);
    args
}

#[cfg(target_os = "macos")]
fn streaming_decode_videotoolbox_enabled() -> bool {
    std::env::var("UXFD_DISABLE_VIDEOTOOLBOX_DECODE")
        .map(|value| value != "1")
        .unwrap_or(true)
}

#[cfg(not(target_os = "macos"))]
fn streaming_decode_videotoolbox_enabled() -> bool {
    false
}

// `scale_vt` additionally requires VideoToolbox decode to be enabled (it
// operates on hardware frames), so it is gated on
// `streaming_decode_videotoolbox_enabled()` plus its own opt-out for
// isolating scale_vt-specific issues without disabling hardware decode
// entirely.
fn streaming_decode_scale_vt_enabled() -> bool {
    streaming_decode_videotoolbox_enabled()
        && std::env::var("UXFD_DISABLE_VIDEOTOOLBOX_SCALE")
            .map(|value| value != "1")
            .unwrap_or(true)
}

struct VideoInputMetadata {
    range: &'static str,
}

fn probe_video_input_metadata(
    ffprobe_path: &str,
    source: &str,
) -> Result<VideoInputMetadata, String> {
    let output = Command::new(ffprobe_path)
        .arg("-v")
        .arg("error")
        .arg("-select_streams")
        .arg("v:0")
        .arg("-show_entries")
        .arg("stream=color_range,color_primaries,color_transfer,color_space")
        .arg("-of")
        .arg("json")
        .arg(source)
        .output()
        .map_err(|error| format!("failed to run ffprobe ({ffprobe_path}): {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe exited with status {:?}: {}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let parsed: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("invalid ffprobe JSON: {error}"))?;
    let stream = parsed
        .get("streams")
        .and_then(Value::as_array)
        .and_then(|streams| streams.first())
        .ok_or_else(|| "ffprobe did not return a video stream".to_string())?;
    // `color_range` is frequently absent from real-world mp4s (ffprobe omits
    // the field entirely rather than reporting "unknown"). H.264's
    // conventional default when unspecified is limited (tv) range, so a
    // missing tag must not fail the decode — it falls back to "tv" exactly
    // like an explicit "unknown" already does below. Only an explicit "pc"
    // (full range) is honoured as such.
    let range = stream
        .get("color_range")
        .and_then(Value::as_str)
        .unwrap_or("tv");
    let range = match range {
        "pc" => "pc",
        "tv" => "tv",
        "unknown" => "tv",
        value if value.trim().is_empty() => "tv",
        _ => "tv",
    };

    Ok(VideoInputMetadata { range })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode_start_params(job_id: &str, slot_count: u32) -> Value {
        json!({
            "jobId": job_id,
            "source": "/dev/null",
            "slotCount": slot_count,
            "width": 4,
            "height": 4,
            "sourceRate": {"numerator": 30, "denominator": 1},
            "format": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full",
            },
        })
    }

    /// Root cause of the intermittent export corruption recorded in
    /// progress/native-render-source-slot-count-collision.md: `jobId` is
    /// derived from mediaId+size+rate only (not slotCount), so the native
    /// playback path (slotCount=6, see
    /// SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT) and the export path
    /// (slotCount=2) can request the *same* jobId. Before this fix,
    /// decode.start silently returned the already-active session's cached
    /// response instead of validating the new request's slotCount, so the
    /// caller believed it got slotCount=2 while the underlying POSIX ring
    /// actually had 6 slots -- exactly the shape that later fails
    /// `PosixSharedRing::attach_with_retry_for_layout` in
    /// `read_native_render_source_frame` with
    /// `SlotCountMismatch { expected: 2, actual: 6 }`.
    #[test]
    #[cfg(unix)]
    fn decode_start_rejects_a_slot_count_that_disagrees_with_the_active_session_for_the_same_job_id(
    ) {
        let mut state = BackendState::default();
        let job_id = "collision-job-id";

        let first = handle_decode_start(1, decode_start_params(job_id, 6), &mut state);
        assert!(
            first.ok,
            "first decode.start for a fresh jobId should succeed: {:?}",
            first.error
        );

        let second = handle_decode_start(2, decode_start_params(job_id, 2), &mut state);
        assert!(
            !second.ok,
            "decode.start must reject a slotCount that disagrees with the already-active \
             session for the same jobId instead of silently returning the stale session's \
             shape -- doing so is how a caller ends up attaching to the ring with the wrong \
             slotCount and hitting SlotCountMismatch deep inside render.nativeSharedFrame"
        );
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn streaming_decode_args_use_videotoolbox_before_input_on_macos() {
        let args = build_streaming_decode_args(
            "/tmp/input.mp4",
            0.5,
            "scale=w=720:h=405:in_range=tv:out_range=pc,format=rgba",
        );

        let hwaccel_index = args
            .iter()
            .position(|arg| arg == "-hwaccel")
            .expect("macOS preview decode should request VideoToolbox");
        let input_index = args
            .iter()
            .position(|arg| arg == "-i")
            .expect("ffmpeg input argument");
        assert_eq!(args[hwaccel_index + 1], "videotoolbox");
        assert!(
            hwaccel_index < input_index,
            "VideoToolbox hwaccel must be declared before the input"
        );
    }

    #[test]
    fn streaming_decode_filter_uses_scale_vt_and_hwdownload_for_hardware_scale() {
        let filter = build_streaming_decode_filter(60, 1, 1280, 720, "tv", true);
        assert_eq!(
            filter,
            "fps=60/1,scale_vt=w=1280:h=720,hwdownload,format=nv12,scale=in_range=tv:out_range=pc,format=rgba"
        );
    }

    #[test]
    fn streaming_decode_filter_uses_cpu_scale_for_software_scale() {
        let filter = build_streaming_decode_filter(60, 1, 1280, 720, "tv", false);
        assert_eq!(
            filter,
            "fps=60/1,scale=w=1280:h=720:in_range=tv:out_range=pc,format=rgba"
        );
    }

    #[test]
    fn streaming_decode_args_with_hwaccel_adds_output_format_only_when_requested() {
        let filter = "scale_vt=w=1:h=1,hwdownload,format=nv12,format=rgba";

        let with_output_format =
            build_streaming_decode_args_with_hwaccel("/tmp/input.mp4", 0.0, filter, true, true);
        assert!(with_output_format
            .windows(2)
            .any(|pair| pair == ["-hwaccel_output_format", "videotoolbox_vld"]));

        let without_output_format =
            build_streaming_decode_args_with_hwaccel("/tmp/input.mp4", 0.0, filter, true, false);
        assert!(!without_output_format.contains(&"-hwaccel_output_format".to_string()));

        let without_hwaccel_at_all =
            build_streaming_decode_args_with_hwaccel("/tmp/input.mp4", 0.0, filter, false, true);
        assert!(!without_hwaccel_at_all.contains(&"-hwaccel".to_string()));
        assert!(!without_hwaccel_at_all.contains(&"-hwaccel_output_format".to_string()));
    }

    #[test]
    fn spawn_streaming_decode_process_falls_back_when_filter_graph_is_unsupported() {
        // Simulates the scale_vt-unsupported case: ffmpeg spawns successfully
        // but the filter graph fails internally and stdout closes with no
        // frame bytes, so the first `read_exact` comes up short and the call
        // must surface an `Err` rather than hang or panic.
        let ffmpeg_path =
            std::env::var("UXFD_FFMPEG_BIN").unwrap_or_else(|_| "ffmpeg".to_string());
        let args = build_streaming_decode_args_with_hwaccel(
            "/dev/null",
            0.0,
            "definitely_not_a_real_filter",
            false,
            false,
        );
        let result = spawn_streaming_decode_process(&ffmpeg_path, &args, 0, 16);
        assert!(
            result.is_err(),
            "an invalid filter graph must be reported as an error so the caller can fall back"
        );
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn streaming_decode_scale_vt_enabled_respects_its_own_opt_out() {
        // Deliberately does not touch UXFD_DISABLE_VIDEOTOOLBOX_DECODE here:
        // that var is also read by
        // `streaming_decode_args_use_videotoolbox_before_input_on_macos`,
        // and cargo test runs tests in the same binary concurrently, so
        // mutating it would risk flaking that other test.
        std::env::set_var("UXFD_DISABLE_VIDEOTOOLBOX_SCALE", "1");
        assert!(
            !streaming_decode_scale_vt_enabled(),
            "UXFD_DISABLE_VIDEOTOOLBOX_SCALE=1 must disable scale_vt"
        );
        std::env::remove_var("UXFD_DISABLE_VIDEOTOOLBOX_SCALE");
    }
}
