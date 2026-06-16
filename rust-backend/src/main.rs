mod psd_fast;

use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::{self, BufRead, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use uxfd_sidecar_protocol::{
    rgba8_srgb_ring_layout, validate_renderer_handoff_descriptor, CopyOutState, DecodeFrameRequest,
    DecodeReleaseFrameRequest, DecodeStartRequest, DecodeStartResponse, FrameFormat,
};

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

    let memory_id = format!("{}-ring", parsed.job_id);
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

    let response = DecodeStartResponse {
        job_id: parsed.job_id,
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
    });

    RpcResponse {
        id,
        ok: true,
        result: Some(serde_json::to_value(response).unwrap_or(Value::Null)),
        error: None,
    }
}

fn handle_decode_request_frame(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
    let Some(session) = state.decode_session.as_ref() else {
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

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "accepted": true,
            "jobId": parsed.job_id,
            "requestId": parsed.request_id,
            "frameIndex": parsed.frame_index,
            "mode": parsed.mode,
        })),
        error: None,
    }
}

fn handle_decode_release_frame(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
    let Some(session) = state.decode_session.as_ref() else {
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
