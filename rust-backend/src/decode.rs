use serde_json::{json, Value};
use std::io::Read;
use std::process::{Command, Stdio};

use crate::frames::{
    base64_encode, checksum_for_bytes, descriptor_for_release, pad_rgba_rows, tight_rgba_byte_len,
};
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
    rgba8_srgb_ring_layout, validate_renderer_handoff_descriptor, CopyOutState, DecodeFrameRequest,
    DecodeReleaseFrameRequest, DecodeStartRequest, DecodeStartResponse, FrameFormat,
    FrameVerificationReport, FrameVerificationStatus, ReadyFrame, SharedFrame, SharedFrameRing,
    SlotRecoveryReason,
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
    state.decode_sessions.insert(
        response.job_id.clone(),
        DecodeSession {
            start_response: response.clone(),
            source: parsed.source,
            ffmpeg_path,
            ffprobe_path,
            ring: SharedFrameRing::new(layout),
            data_plane_ring,
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
    let verification = FrameVerificationReport {
        frame_index: parsed.frame_index,
        checksum: checksum_for_bytes(&padded_rgba),
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

fn decode_rgba_frame_for_session(
    session: &mut DecodeSession,
    frame_index: u64,
) -> Result<DecodedRgbaFrame, String> {
    let expected_len =
        tight_rgba_byte_len(session.start_response.width, session.start_response.height)?;

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

    let mut decoder = start_streaming_decode_process(session, frame_index, expected_len)?;
    let mut bytes = vec![0u8; expected_len];
    decoder
        .stdout
        .read_exact(&mut bytes)
        .map_err(|error| format!("failed to read first streaming decoded frame: {error}"))?;
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
) -> Result<StreamingDecodeProcess, String> {
    session.streaming_decoder = None;

    let input_metadata = probe_video_input_metadata(&session.ffprobe_path, &session.source)?;
    let seek_seconds = frame_index as f64
        * f64::from(session.start_response.source_rate.denominator)
        / f64::from(session.start_response.source_rate.numerator);
    let filter = format!(
        "scale=w={}:h={}:in_range={}:out_range=pc,format=rgba",
        session.start_response.width, session.start_response.height, input_metadata.range
    );
    let args = build_streaming_decode_args(&session.source, seek_seconds, &filter);
    let mut child = Command::new(&session.ffmpeg_path)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            format!(
                "failed to start streaming ffmpeg ({}): {error}",
                session.ffmpeg_path
            )
        })?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "streaming ffmpeg stdout was unavailable".to_string())?;

    Ok(StreamingDecodeProcess {
        child,
        stdout,
        next_frame_index: frame_index,
        frame_byte_len: expected_len,
    })
}

fn build_streaming_decode_args(source: &str, seek_seconds: f64, filter: &str) -> Vec<String> {
    let mut args = vec![
        "-hide_banner".to_string(),
        "-loglevel".to_string(),
        "error".to_string(),
    ];
    if streaming_decode_videotoolbox_enabled() {
        args.push("-hwaccel".to_string());
        args.push("videotoolbox".to_string());
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
    let range = stream_metadata_string(stream, "color_range")?;
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
}

fn stream_metadata_string<'a>(stream: &'a Value, key: &str) -> Result<&'a str, String> {
    stream
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("ffprobe video stream did not include {key}"))
}
