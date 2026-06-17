mod psd_fast;

use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::{self, BufRead, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use uxfd_sidecar_protocol::{
    rgba8_srgb_ring_layout, validate_renderer_handoff_descriptor, ChecksumAlgorithm, CopyOutState,
    DecodeFrameRequest, DecodeReleaseFrameRequest, DecodeStartRequest, DecodeStartResponse,
    FrameChecksum, FrameDescriptor, FrameFormat, FrameVerificationReport, FrameVerificationStatus,
    ReadyFrame, SharedFrame, SharedFrameRing, SlotRecoveryReason,
};
#[cfg(unix)]
use uxfd_shared_memory_spike::PosixSharedRing;

#[derive(Debug, Deserialize)]
struct RpcRequest {
    id: u64,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Serialize)]
struct RpcError {
    code: i64,
    message: String,
}

#[derive(Debug, Serialize)]
struct RpcResponse {
    id: u64,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcError>,
}

struct ExportSession {
    child: Child,
    stdin: ChildStdin,
    output_path: String,
}

struct DecodeSession {
    start_response: DecodeStartResponse,
    source: String,
    ffmpeg_path: String,
    ffprobe_path: String,
    ring: SharedFrameRing,
    data_plane_ring: Option<DecodeDataPlaneRing>,
}

/// Shared state for the in-progress PSD pixel blob write.
/// `None` = no write pending; `Some(Ok(path))` = done; `Some(Err(msg))` = failed.
type BlobWriteResult = Arc<Mutex<Option<Result<String, String>>>>;

#[derive(Default)]
struct BackendState {
    export_session: Option<ExportSession>,
    decode_session: Option<DecodeSession>,
    /// Background blob writer: set by psd.parse, drained by psd.await_blob.
    psd_blob_result: Option<BlobWriteResult>,
}

#[derive(Debug, Serialize)]
struct HealthResult<'a> {
    status: &'a str,
    engine: &'a str,
    version: &'a str,
}

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    let mut state = BackendState::default();

    for line_result in stdin.lock().lines() {
        let line = match line_result {
            Ok(value) => value,
            Err(_) => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        let parsed = serde_json::from_str::<RpcRequest>(&line);
        let response = match parsed {
            Ok(request) => handle_request(request, &mut state),
            Err(error) => RpcResponse {
                id: 0,
                ok: false,
                result: None,
                error: Some(RpcError {
                    code: -32700,
                    message: format!("Invalid JSON: {error}"),
                }),
            },
        };

        let serialised = match serde_json::to_string(&response) {
            Ok(value) => value,
            Err(_) => continue,
        };

        if writeln!(stdout, "{serialised}").is_err() {
            break;
        }

        if stdout.flush().is_err() {
            break;
        }
    }
    if let Some(mut session) = state.export_session.take() {
        let _ = session.stdin.flush();
        drop(session.stdin);
        let _ = session.child.wait();
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportStartParams {
    width: u32,
    height: u32,
    fps: u32,
    file_path: String,
    #[serde(default)]
    audio_path: Option<String>,
    #[serde(default)]
    ffmpeg_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportWriteFrameParams {
    frame_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MediaProbeParams {
    file_path: String,
    #[serde(default)]
    ffprobe_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PsdParseParams {
    file_path: String,
}

fn handle_request(request: RpcRequest, state: &mut BackendState) -> RpcResponse {
    match request.method.as_str() {
        "health" => {
            let result = HealthResult {
                status: "ok",
                engine: "uxfd-rust-backend",
                version: env!("CARGO_PKG_VERSION"),
            };

            RpcResponse {
                id: request.id,
                ok: true,
                result: Some(serde_json::to_value(result).unwrap_or(Value::Null)),
                error: None,
            }
        }
        "echo" => RpcResponse {
            id: request.id,
            ok: true,
            result: Some(request.params),
            error: None,
        },
        "media.probe" => handle_media_probe(request.id, request.params),
        "psd.parse" => handle_psd_parse(request.id, request.params, state),
        "psd.await_blob" => handle_psd_await_blob(request.id, state),
        "decode.start" => handle_decode_start(request.id, request.params, state),
        "decode.requestFrame" => handle_decode_request_frame(request.id, request.params, state),
        "decode.releaseFrame" => handle_decode_release_frame(request.id, request.params, state),
        "export.start" => handle_export_start(request.id, request.params, state),
        "export.write_frame" => handle_export_write_frame(request.id, request.params, state),
        "export.end" => handle_export_end(request.id, state),
        "proxy.generate" => handle_proxy_generate(request.id, request.params),
        _ => RpcResponse {
            id: request.id,
            ok: false,
            result: None,
            error: Some(RpcError {
                code: -32601,
                message: format!("Method not found: {}", request.method),
            }),
        },
    }
}

fn handle_media_probe(id: u64, params: Value) -> RpcResponse {
    let parsed = match serde_json::from_value::<MediaProbeParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(id, -32602, &format!("Invalid media.probe params: {error}"));
        }
    };

    if parsed.file_path.trim().is_empty() {
        return response_error(id, -32602, "filePath must not be empty");
    }

    let ffprobe_path = parsed
        .ffprobe_path
        .or_else(|| std::env::var("UXFD_FFPROBE_BIN").ok())
        .unwrap_or_else(|| "ffprobe".to_string());

    let output = match Command::new(&ffprobe_path)
        .arg("-v")
        .arg("quiet")
        .arg("-print_format")
        .arg("json")
        .arg("-show_streams")
        .arg("-show_format")
        .arg(&parsed.file_path)
        .output()
    {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32020,
                &format!("Failed to run ffprobe ({ffprobe_path}): {error}"),
            );
        }
    };

    if !output.status.success() {
        return response_error(
            id,
            -32021,
            &format!("ffprobe failed with status: {:?}", output.status.code()),
        );
    }

    let parsed_json = match serde_json::from_slice::<Value>(&output.stdout) {
        Ok(value) => value,
        Err(error) => {
            return response_error(id, -32022, &format!("Invalid ffprobe output: {error}"));
        }
    };

    let duration = parsed_json
        .get("format")
        .and_then(|format| format.get("duration"))
        .and_then(|value| value.as_str())
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or(0.0);

    let mut width: Option<u64> = None;
    let mut height: Option<u64> = None;
    let mut has_audio = false;
    let mut has_video = false;

    if let Some(streams) = parsed_json
        .get("streams")
        .and_then(|value| value.as_array())
    {
        for stream in streams {
            let codec_type = stream
                .get("codec_type")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            if codec_type == "video" {
                has_video = true;
                if width.is_none() {
                    width = stream.get("width").and_then(|value| value.as_u64());
                }
                if height.is_none() {
                    height = stream.get("height").and_then(|value| value.as_u64());
                }
            } else if codec_type == "audio" {
                has_audio = true;
            }
        }
    }

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "filePath": parsed.file_path,
            "duration": duration,
            "width": width,
            "height": height,
            "hasAudio": has_audio,
            "hasVideo": has_video,
            "ffprobePath": ffprobe_path,
        })),
        error: None,
    }
}

fn handle_psd_parse(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
    let parsed = match serde_json::from_value::<PsdParseParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(id, -32602, &format!("Invalid psd.parse params: {error}"));
        }
    };

    if parsed.file_path.trim().is_empty() {
        return response_error(id, -32602, "filePath must not be empty");
    }

    let bytes = match fs::read(&parsed.file_path) {
        Ok(b) => b,
        Err(e) => return response_error(id, -32020, &format!("Failed to read PSD file: {e}")),
    };

    let result = match psd_fast::parse_psd_fast(&bytes) {
        Ok(r) => r,
        Err(e) => return response_error(id, -32021, &format!("Failed to parse PSD: {e}")),
    };

    // Determine blob path (written by background thread)
    let tmp_path = {
        let pid = std::process::id();
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("uxfd-psd-{pid}-{ts}.raw"))
    };
    let tmp_path_str = tmp_path.to_string_lossy().into_owned();

    // Build metadata nodes and concatenate blob in memory
    let mut blob: Vec<u8> = Vec::new();
    let mut nodes: Vec<Value> = Vec::new();

    for (idx, layer) in result.layers.iter().enumerate() {
        let pixel_offset: Option<u64>;
        let pixel_byte_len: u64;
        let (w, h);

        if let Some(rgba) = &layer.rgba {
            pixel_offset = Some(blob.len() as u64);
            pixel_byte_len = rgba.len() as u64;
            blob.extend_from_slice(rgba);
            w = layer.width;
            h = layer.height;
        } else {
            pixel_offset = None;
            pixel_byte_len = 0;
            w = 0;
            h = 0;
        }

        let psd_id: Value = if layer.is_group {
            layer.own_group_id.map(|v| json!(v)).unwrap_or(json!(idx))
        } else {
            json!(idx)
        };

        let parent_psd_id: Value = layer
            .parent_group_id
            .map(|v| json!(v))
            .unwrap_or(Value::Null);

        nodes.push(json!({
            "psdId": psd_id,
            "parentPsdId": parent_psd_id,
            "isGroup": layer.is_group,
            "name": layer.name,
            "width": w,
            "height": h,
            "top": layer.top,
            "left": layer.left,
            "defaultVisible": layer.visible,
            "order": idx,
            "pixelOffset": pixel_offset,
            "pixelByteLen": pixel_byte_len,
        }));
    }

    // Spawn background thread to write the pixel blob to disk.
    // The main thread returns the metadata JSON immediately (before the write completes).
    // Electron calls psd.await_blob to wait for the write to finish.
    let blob_result: BlobWriteResult = Arc::new(Mutex::new(None));
    let blob_result_clone = Arc::clone(&blob_result);
    let write_path = tmp_path.clone();
    std::thread::spawn(move || {
        let outcome = fs::write(&write_path, &blob)
            .map(|_| write_path.to_string_lossy().into_owned())
            .map_err(|e| e.to_string());
        *blob_result_clone.lock().unwrap() = Some(outcome);
    });

    state.psd_blob_result = Some(blob_result);

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "tmpFile": tmp_path_str,
            "width": result.width,
            "height": result.height,
            "nodes": nodes,
        })),
        error: None,
    }
}

/// Block until the background blob writer (started by psd.parse) finishes,
/// then return the blob path or an error.
fn handle_psd_await_blob(id: u64, state: &mut BackendState) -> RpcResponse {
    let shared = match state.psd_blob_result.take() {
        Some(s) => s,
        None => return response_error(id, -32030, "No pending PSD blob write"),
    };

    // Spin-wait (the blob should finish in <500ms; polling avoids blocking stdin).
    loop {
        {
            let guard = shared.lock().unwrap();
            if guard.is_some() {
                break;
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
    }

    let result = shared.lock().unwrap().take().unwrap();
    match result {
        Ok(path) => RpcResponse {
            id,
            ok: true,
            result: Some(json!({ "blobPath": path })),
            error: None,
        },
        Err(e) => response_error(id, -32031, &format!("Blob write failed: {e}")),
    }
}

fn handle_decode_start(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
    if state.decode_session.is_some() {
        return response_error(id, -32040, "Decode session already active");
    }

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
    let data_plane_ring = match create_decode_data_plane(&memory_id, descriptor.byte_len) {
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
    state.decode_session = Some(DecodeSession {
        start_response: response.clone(),
        source: parsed.source,
        ffmpeg_path,
        ffprobe_path,
        ring: SharedFrameRing::new(layout),
        data_plane_ring,
    });

    RpcResponse {
        id,
        ok: true,
        result: Some(serde_json::to_value(response).unwrap_or(Value::Null)),
        error: None,
    }
}

fn handle_decode_request_frame(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
    let Some(session) = state.decode_session.as_mut() else {
        return response_error(id, -32041, "No active decode session");
    };

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

    if parsed.job_id != session.start_response.job_id {
        return response_error(id, -32042, "Decode jobId does not match active session");
    }

    let write_slot = match session.ring.acquire_write_slot() {
        Ok(value) => value,
        Err(error) => {
            return response_error(id, -32043, &format!("No free decode frame slot: {error:?}"));
        }
    };
    let write_slot_index = write_slot.slot_index;

    let tight_rgba = match decode_tight_rgba_frame(
        &session.ffmpeg_path,
        &session.ffprobe_path,
        &session.source,
        parsed.frame_index,
        session.start_response.width,
        session.start_response.height,
    ) {
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
        &tight_rgba,
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

    if let Err(error) =
        write_decode_data_plane(session.data_plane_ring.as_ref(), parsed.frame_index, &padded_rgba)
    {
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

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "accepted": true,
            "jobId": parsed.job_id,
            "requestId": parsed.request_id,
            "frameIndex": parsed.frame_index,
            "mode": parsed.mode,
            "frame": ready_frame.frame,
            "verification": verification,
            "decodeInvocationCount": 1,
        })),
        error: None,
    }
}

fn handle_decode_release_frame(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
    let Some(session) = state.decode_session.as_mut() else {
        return response_error(id, -32041, "No active decode session");
    };

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

    if parsed.job_id != session.start_response.job_id {
        return response_error(id, -32042, "Decode jobId does not match active session");
    }
    if parsed.copy_out_state != CopyOutState::GpuUploadFenceSignalled {
        return response_error(
            id,
            -32602,
            "copyOutState must be gpuUploadFenceSignalled before releasing a frame",
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
    if let Err(error) =
        release_decode_data_plane(session.data_plane_ring.as_ref(), parsed.copy_out_state)
    {
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
type DecodeDataPlaneRing = PosixSharedRing;

#[cfg(not(unix))]
struct DecodeDataPlaneRing;

fn decode_memory_id(job_id: &str) -> String {
    let sanitised: String = job_id
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect();
    format!("/uxfd-{}-{sanitised}-ring", std::process::id())
}

#[cfg(unix)]
fn create_decode_data_plane(
    memory_id: &str,
    slot_byte_len: u64,
) -> Result<Option<DecodeDataPlaneRing>, String> {
    let frame_len = usize::try_from(slot_byte_len)
        .map_err(|_| format!("slotByteLen overflows usize: {slot_byte_len}"))?;
    PosixSharedRing::create(memory_id, frame_len)
        .map(Some)
        .map_err(|error| format!("{error:?}"))
}

#[cfg(not(unix))]
fn create_decode_data_plane(
    _memory_id: &str,
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
    copy_out_state: CopyOutState,
) -> Result<(), String> {
    let ring = ring.ok_or_else(|| "decode shared memory ring is unavailable".to_string())?;
    ring.release_frame(copy_out_state)
        .map_err(|error| format!("{error:?}"))
}

#[cfg(not(unix))]
fn release_decode_data_plane(
    _ring: Option<&DecodeDataPlaneRing>,
    _copy_out_state: CopyOutState,
) -> Result<(), String> {
    Ok(())
}

fn decode_tight_rgba_frame(
    ffmpeg_path: &str,
    ffprobe_path: &str,
    source: &str,
    frame_index: u64,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, String> {
    let input_range = probe_video_input_range(ffprobe_path, source)?;
    let filter = format!(
        "select=eq(n\\,{frame_index}),scale=in_range={input_range}:out_range=pc:in_color_matrix=bt709:out_color_matrix=bt709,format=rgba"
    );
    let output = Command::new(ffmpeg_path)
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-i")
        .arg(source)
        .arg("-vf")
        .arg(filter)
        .arg("-frames:v")
        .arg("1")
        .arg("-pix_fmt")
        .arg("rgba")
        .arg("-f")
        .arg("rawvideo")
        .arg("pipe:1")
        .output()
        .map_err(|error| format!("failed to run ffmpeg ({ffmpeg_path}): {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "ffmpeg exited with status {:?}: {}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let expected_len = u64::from(width)
        .checked_mul(u64::from(height))
        .and_then(|pixels| pixels.checked_mul(4))
        .and_then(|bytes| usize::try_from(bytes).ok())
        .ok_or_else(|| format!("decoded frame dimensions overflow: {width}x{height}"))?;
    if output.stdout.len() != expected_len {
        return Err(format!(
            "ffmpeg produced unexpected RGBA byte length: expected={expected_len}, actual={}",
            output.stdout.len()
        ));
    }

    Ok(output.stdout)
}

fn probe_video_input_range(ffprobe_path: &str, source: &str) -> Result<&'static str, String> {
    let output = Command::new(ffprobe_path)
        .arg("-v")
        .arg("error")
        .arg("-select_streams")
        .arg("v:0")
        .arg("-show_entries")
        .arg("stream=color_range")
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
    let range = parsed
        .get("streams")
        .and_then(Value::as_array)
        .and_then(|streams| streams.first())
        .and_then(|stream| stream.get("color_range"))
        .and_then(Value::as_str)
        .ok_or_else(|| "ffprobe video stream did not include color_range".to_string())?;

    match range {
        "pc" => Ok("pc"),
        "tv" => Ok("tv"),
        value => Err(format!("unsupported video color_range for Rust decode: {value}")),
    }
}

fn pad_rgba_rows(
    tight_rgba: &[u8],
    width: u32,
    height: u32,
    stride_bytes: u32,
) -> Result<Vec<u8>, String> {
    let row_bytes = u64::from(width)
        .checked_mul(4)
        .and_then(|value| usize::try_from(value).ok())
        .ok_or_else(|| format!("row byte length overflow for width={width}"))?;
    let stride_bytes = usize::try_from(stride_bytes)
        .map_err(|_| format!("stride byte length overflows usize: {stride_bytes}"))?;
    if stride_bytes < row_bytes {
        return Err(format!(
            "stride is smaller than tight RGBA row: stride={stride_bytes}, row={row_bytes}"
        ));
    }

    let height =
        usize::try_from(height).map_err(|_| format!("height overflows usize: {height}"))?;
    let tight_len = row_bytes
        .checked_mul(height)
        .ok_or_else(|| "tight RGBA byte length overflow".to_string())?;
    if tight_rgba.len() != tight_len {
        return Err(format!(
            "tight RGBA byte length mismatch: expected={tight_len}, actual={}",
            tight_rgba.len()
        ));
    }
    let padded_len = stride_bytes
        .checked_mul(height)
        .ok_or_else(|| "padded RGBA byte length overflow".to_string())?;
    let mut padded = vec![0; padded_len];
    for row in 0..height {
        let source_start = row * row_bytes;
        let destination_start = row * stride_bytes;
        padded[destination_start..destination_start + row_bytes]
            .copy_from_slice(&tight_rgba[source_start..source_start + row_bytes]);
    }

    Ok(padded)
}

fn checksum_for_bytes(bytes: &[u8]) -> FrameChecksum {
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(bytes);
    FrameChecksum {
        algorithm: ChecksumAlgorithm::Crc32,
        value_hex: format!("{:08x}", hasher.finalize()),
        byte_len: bytes.len() as u64,
    }
}

fn descriptor_for_release(
    response: &DecodeStartResponse,
    slot_index: u32,
    generation: u64,
) -> Result<FrameDescriptor, String> {
    if slot_index >= response.slot_count {
        return Err(format!(
            "slotIndex out of bounds: slotIndex={slot_index}, slotCount={}",
            response.slot_count
        ));
    }
    let byte_offset = response
        .slot_byte_len
        .checked_mul(u64::from(slot_index))
        .ok_or_else(|| {
            format!(
                "byte offset overflow: slotIndex={slot_index}, slotByteLen={}",
                response.slot_byte_len
            )
        })?;

    Ok(FrameDescriptor {
        memory_id: response.memory_id.clone(),
        slot_index,
        generation,
        byte_offset,
        byte_len: response.slot_byte_len,
        width: response.width,
        height: response.height,
        stride_bytes: response.stride_bytes,
        format: response.format,
        colour: response.colour.clone(),
    })
}

fn handle_export_start(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
    if state.export_session.is_some() {
        return response_error(id, -32001, "Export session already active");
    }

    let parsed = match serde_json::from_value::<ExportStartParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(id, -32602, &format!("Invalid export.start params: {error}"));
        }
    };

    if parsed.fps == 0 {
        return response_error(id, -32602, "fps must be greater than zero");
    }

    let ffmpeg_path = parsed
        .ffmpeg_path
        .or_else(|| std::env::var("UXFD_FFMPEG_BIN").ok())
        .unwrap_or_else(|| "ffmpeg".to_string());

    let mut cmd = Command::new(&ffmpeg_path);
    cmd.arg("-y")
        .arg("-f")
        .arg("image2pipe")
        .arg("-vcodec")
        .arg("mjpeg")
        .arg("-r")
        .arg(parsed.fps.to_string())
        .arg("-i")
        .arg("-");

    if let Some(audio_path) = &parsed.audio_path {
        if !audio_path.is_empty() {
            cmd.arg("-i").arg(audio_path);
        }
    }

    cmd.arg("-s")
        .arg(format!("{}x{}", parsed.width, parsed.height))
        .arg("-c:v")
        .arg(get_video_codec())
        .arg("-b:v")
        .arg("8000k")
        .arg("-pix_fmt")
        .arg("yuv420p");

    if parsed
        .audio_path
        .as_ref()
        .is_some_and(|value| !value.is_empty())
    {
        cmd.arg("-c:a")
            .arg("aac")
            .arg("-b:a")
            .arg("192k")
            .arg("-map")
            .arg("0:v:0")
            .arg("-map")
            .arg("1:a:0");
    }

    cmd.arg("-shortest")
        .arg(&parsed.file_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        // ffmpeg progress logs can fill stderr pipe on long exports and stall writes.
        // Discard stderr to avoid pipe back-pressure blocking export.write_frame.
        .stderr(Stdio::null());

    let mut child = match cmd.spawn() {
        Ok(process) => process,
        Err(error) => {
            return response_error(
                id,
                -32002,
                &format!("Failed to start ffmpeg ({ffmpeg_path}): {error}"),
            );
        }
    };

    let stdin = match child.stdin.take() {
        Some(pipe) => pipe,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return response_error(id, -32003, "Failed to capture ffmpeg stdin");
        }
    };

    state.export_session = Some(ExportSession {
        child,
        stdin,
        output_path: parsed.file_path.clone(),
    });

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "started": true,
            "filePath": parsed.file_path,
            "ffmpegPath": ffmpeg_path,
        })),
        error: None,
    }
}

fn handle_export_write_frame(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
    let Some(session) = state.export_session.as_mut() else {
        return response_error(id, -32004, "No active export session");
    };

    let parsed = match serde_json::from_value::<ExportWriteFrameParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid export.write_frame params: {error}"),
            );
        }
    };

    let frame_data = match general_purpose::STANDARD.decode(parsed.frame_base64.as_bytes()) {
        Ok(value) => value,
        Err(error) => {
            return response_error(id, -32602, &format!("Invalid frame base64: {error}"));
        }
    };

    if let Err(error) = session.stdin.write_all(&frame_data) {
        return response_error(
            id,
            -32005,
            &format!("Failed to write frame to ffmpeg: {error}"),
        );
    }

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({ "written": true })),
        error: None,
    }
}

fn handle_export_end(id: u64, state: &mut BackendState) -> RpcResponse {
    let Some(mut session) = state.export_session.take() else {
        return response_error(id, -32004, "No active export session");
    };

    let _ = session.stdin.flush();
    drop(session.stdin);

    let status = match session.child.wait() {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32006,
                &format!("Failed to wait ffmpeg process: {error}"),
            );
        }
    };

    if !status.success() {
        return response_error(
            id,
            -32007,
            &format!(
                "ffmpeg exited with failure status: code={:?}",
                status.code()
            ),
        );
    }

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "finished": true,
            "filePath": session.output_path,
        })),
        error: None,
    }
}

fn get_video_codec() -> &'static str {
    if cfg!(target_os = "macos") {
        "h264_videotoolbox"
    } else {
        "libx264"
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProxyGenerateParams {
    input_path: String,
    output_path: String,
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    ffmpeg_path: Option<String>,
}

fn handle_proxy_generate(id: u64, params: Value) -> RpcResponse {
    let parsed = match serde_json::from_value::<ProxyGenerateParams>(params) {
        Ok(v) => v,
        Err(e) => {
            return response_error(id, -32602, &format!("Invalid proxy.generate params: {e}"))
        }
    };

    let ffmpeg_path = parsed
        .ffmpeg_path
        .or_else(|| std::env::var("UXFD_FFMPEG_BIN").ok())
        .unwrap_or_else(|| "ffmpeg".to_string());

    // scale: 指定幅に合わせ高さは偶数を保ちアスペクト維持
    let width = parsed.width.unwrap_or(1280);
    let scale_filter = format!("scale={}:-2", width);

    let status = Command::new(&ffmpeg_path)
        .args([
            "-y",
            "-i",
            &parsed.input_path,
            "-vf",
            &scale_filter,
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            &parsed.output_path,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();

    match status {
        Ok(s) if s.success() => RpcResponse {
            id,
            ok: true,
            result: Some(json!({ "outputPath": parsed.output_path })),
            error: None,
        },
        Ok(s) => response_error(
            id,
            -32007,
            &format!("ffmpeg exited with code {:?}", s.code()),
        ),
        Err(e) => response_error(id, -32002, &format!("Failed to start ffmpeg: {e}")),
    }
}

fn response_error(id: u64, code: i64, message: &str) -> RpcResponse {
    RpcResponse {
        id,
        ok: false,
        result: None,
        error: Some(RpcError {
            code,
            message: message.to_string(),
        }),
    }
}
