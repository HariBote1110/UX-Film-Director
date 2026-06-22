use serde_json::{json, Value};
use std::io::Read;
use std::process::{Command, Stdio};

use crate::frames::{
    base64_encode, checksum_for_bytes, descriptor_for_release, pad_rgba_rows, tight_rgba_byte_len,
};
use crate::params::DecodeStopRequest;
use crate::rpc::{response_error, RpcResponse};
use crate::sessions::{DecodeSession, DecodedRgbaFrame, StreamingDecodeProcess};
use crate::state::BackendState;
#[cfg(unix)]
use uxfd_shared_memory_spike::{PosixSharedRing, PosixShmError};
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

    if let Err(error) = write_decode_data_plane(
        session.data_plane_ring.as_ref(),
        parsed.frame_index,
        &padded_rgba,
    ) {
        let _ = session
            .ring
            .recover_stuck_slot(write_slot_index, SlotRecoveryReason::ProducerTimeout);
        return response_error(
            id,
            -32050,
            &format!("Failed to write decoded frame to shared memory: {error}"),
        );
    }

    if let Err(error) = session.ring.mark_slot_ready(write_slot, parsed.frame_index) {
        return response_error(
            id,
            -32046,
            &format!("Failed to mark decoded frame ready: {error:?}"),
        );
    }
    let ready_frame = match session.ring.acquire_ready_slot() {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32047,
                &format!("Decoded frame was not readable after ready transition: {error:?}"),
            );
        }
    };
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

    let descriptor = match descriptor_for_release(
        &session.start_response,
        parsed.slot_index,
        parsed.generation,
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
        slot_index: parsed.slot_index,
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
        parsed.slot_index,
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

#[cfg(unix)]
fn write_decode_data_plane(
    ring: Option<&DecodeDataPlaneRing>,
    frame_index: u64,
    bytes: &[u8],
) -> Result<(), String> {
    let ring = ring.ok_or_else(|| "decode shared memory ring is unavailable".to_string())?;
    ring.write_frame(frame_index, bytes)
        .map_err(|error| format!("{error:?}"))
}

#[cfg(not(unix))]
fn write_decode_data_plane(
    _ring: Option<&DecodeDataPlaneRing>,
    _frame_index: u64,
    _bytes: &[u8],
) -> Result<(), String> {
    Ok(())
}

#[cfg(unix)]
fn release_decode_data_plane(
    ring: Option<&DecodeDataPlaneRing>,
    slot_index: u32,
    copy_out_state: CopyOutState,
) -> Result<(), String> {
    let ring = ring.ok_or_else(|| "decode shared memory ring is unavailable".to_string())?;
    match ring.release_frame_slot(slot_index, copy_out_state) {
        Ok(()) => Ok(()),
        Err(PosixShmError::UnexpectedState {
            expected: 3,
            actual: 0,
        }) => Ok(()),
        Err(error) => Err(format!("{error:?}")),
    }
}

#[cfg(not(unix))]
fn release_decode_data_plane(
    _ring: Option<&DecodeDataPlaneRing>,
    _slot_index: u32,
    _copy_out_state: CopyOutState,
) -> Result<(), String> {
    Ok(())
}

const MAX_STREAMING_DECODE_SKIP_FRAMES: u64 = 30;

fn decode_rgba_frame_for_session(
    session: &mut DecodeSession,
    frame_index: u64,
) -> Result<DecodedRgbaFrame, String> {
    let expected_len =
        tight_rgba_byte_len(session.start_response.width, session.start_response.height)?;

    if let Some(decoder) = session.streaming_decoder.as_mut() {
        if decoder.frame_byte_len == expected_len
            && frame_index >= decoder.next_frame_index
            && frame_index - decoder.next_frame_index <= MAX_STREAMING_DECODE_SKIP_FRAMES
        {
            let skipped_frame_count = frame_index - decoder.next_frame_index;
            let mut scratch = vec![0u8; expected_len];
            for _ in 0..skipped_frame_count {
                decoder
                    .stdout
                    .read_exact(&mut scratch)
                    .map_err(|error| format!("failed to skip streaming decoded frame: {error}"))?;
                decoder.next_frame_index += 1;
            }

            let mut bytes = vec![0u8; expected_len];
            decoder
                .stdout
                .read_exact(&mut bytes)
                .map_err(|error| format!("failed to read streaming decoded frame: {error}"))?;
            decoder.next_frame_index += 1;
            return Ok(DecodedRgbaFrame {
                bytes,
                decode_path: "stream",
                stream_restarted: false,
                stream_skipped_frame_count: skipped_frame_count,
                decode_invocation_count: 0,
            });
        }
    }

    let mut decoder = start_streaming_decode_process(session, frame_index, expected_len)?;
    let mut bytes = vec![0u8; expected_len];
    decoder
        .stdout
        .read_exact(&mut bytes)
        .map_err(|error| format!("failed to read first streaming decoded frame: {error}"))?;
    decoder.next_frame_index = frame_index + 1;
    session.streaming_decoder = Some(decoder);

    Ok(DecodedRgbaFrame {
        bytes,
        decode_path: "stream",
        stream_restarted: true,
        stream_skipped_frame_count: 0,
        decode_invocation_count: 1,
    })
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
    let mut child = Command::new(&session.ffmpeg_path)
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-ss")
        .arg(format!("{seek_seconds:.6}"))
        .arg("-i")
        .arg(&session.source)
        .arg("-vf")
        .arg(filter)
        .arg("-pix_fmt")
        .arg("rgba")
        .arg("-f")
        .arg("rawvideo")
        .arg("pipe:1")
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

fn stream_metadata_string<'a>(stream: &'a Value, key: &str) -> Result<&'a str, String> {
    stream
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("ffprobe video stream did not include {key}"))
}
