use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::process::{Child, ChildStdin, Command, Stdio};

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

#[derive(Default)]
struct BackendState {
    export_session: Option<ExportSession>,
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
        "export.start" => handle_export_start(request.id, request.params, state),
        "export.write_frame" => handle_export_write_frame(request.id, request.params, state),
        "export.end" => handle_export_end(request.id, state),
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

    if let Some(streams) = parsed_json.get("streams").and_then(|value| value.as_array()) {
        for stream in streams {
            let codec_type = stream.get("codec_type").and_then(|value| value.as_str()).unwrap_or("");
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
        .stderr(Stdio::piped());

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
