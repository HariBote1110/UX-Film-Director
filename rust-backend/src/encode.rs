use std::io::{Read, Write};
use std::process::{Child, ChildStderr, ChildStdin, Command, Stdio};
use std::time::Duration;

use crate::params::{
    EncodeAbortParams, EncodeFinishParams, EncodeStartParams, EncodeWriteFrameParams,
};
use crate::rpc::{response_error, RpcResponse};
use crate::sessions::{EncodeAbortSummary, EncodeSession};
use crate::state::BackendState;
use serde_json::{json, Value};
use uxfd_golden_harness::RgbaFrame;
#[cfg(unix)]
use uxfd_shared_memory_spike::PosixSharedRing;
use uxfd_sidecar_protocol::{
    validate_renderer_handoff_descriptor, ColourMetadata, CopyOutState, FrameDescriptor,
    FrameFormat,
};

pub(crate) fn handle_encode_start(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
    let parsed = match serde_json::from_value::<EncodeStartParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(id, -32602, &format!("Invalid encode.start params: {error}"));
        }
    };

    if parsed.session_id.trim().is_empty() {
        return response_error(id, -32602, "sessionId must not be empty");
    }
    if parsed.file_path.trim().is_empty() {
        return response_error(id, -32602, "filePath must not be empty");
    }
    let audio_path = parsed
        .audio_path
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    if parsed.width == 0 || parsed.height == 0 {
        return response_error(id, -32602, "width and height must be greater than zero");
    }
    if parsed.fps == 0 {
        return response_error(id, -32602, "fps must be greater than zero");
    }
    if parsed.pixel_format != FrameFormat::Rgba8Srgb {
        return response_error(id, -32602, "Only rgba8Srgb encode input is supported");
    }
    if parsed.colour != ColourMetadata::rec709_srgb() {
        return response_error(
            id,
            -32602,
            "Only bt709/srgb/rgb/full encode input is supported",
        );
    }
    if state.encode_sessions.contains_key(&parsed.session_id) {
        return response_error(id, -32051, "Encode session already active for sessionId");
    }

    let (child, stdin, stderr) = match start_encode_ffmpeg(&parsed) {
        Ok(value) => value,
        Err(message) => return response_error(id, -32054, &message),
    };

    state.encode_sessions.insert(
        parsed.session_id.clone(),
        EncodeSession {
            child,
            stdin,
            stderr,
            session_id: parsed.session_id.clone(),
            file_path: parsed.file_path.clone(),
            audio_path: audio_path.clone(),
            width: parsed.width,
            height: parsed.height,
            fps: parsed.fps,
            pixel_format: parsed.pixel_format,
            colour: parsed.colour,
            frame_count: 0,
        },
    );

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "started": true,
            "sessionId": parsed.session_id,
            "filePath": parsed.file_path,
            "width": parsed.width,
            "height": parsed.height,
            "fps": parsed.fps,
            "pixelFormat": "rgba8Srgb",
            "audioPath": audio_path,
        })),
        error: None,
    }
}

pub(crate) fn handle_encode_write_frame(
    id: u64,
    params: Value,
    state: &mut BackendState,
) -> RpcResponse {
    let parsed = match serde_json::from_value::<EncodeWriteFrameParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid encode.writeFrame params: {error}"),
            );
        }
    };

    let (session_id, frame_count, shared_frame_byte_len, encoded_frame_byte_len) = {
        let Some(session) = state.encode_sessions.get_mut(&parsed.session_id) else {
            return response_error(id, -32052, "No active encode session");
        };

        if let Err(message) = validate_encode_shared_frame(session, &parsed) {
            return response_error(id, -32602, &message);
        }

        let (shared_frame_byte_len, encoded_frame_byte_len) =
            match write_encode_shared_frame(session, &parsed) {
                Ok(value) => value,
                Err(message) => return response_error(id, -32053, &message),
            };

        session.frame_count += 1;
        (
            session.session_id.clone(),
            session.frame_count,
            shared_frame_byte_len,
            encoded_frame_byte_len,
        )
    };
    state
        .native_render_outputs
        .remove(&parsed.frame.descriptor.memory_id);

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "written": true,
            "sessionId": session_id,
            "frameIndex": parsed.frame_index,
            "timestampUs": parsed.timestamp_us,
            "slotCount": parsed.slot_count,
            "sharedFrameByteLen": shared_frame_byte_len,
            "encodedFrameByteLen": encoded_frame_byte_len,
            "frameCount": frame_count,
        })),
        error: None,
    }
}

pub(crate) fn handle_encode_finish(
    id: u64,
    params: Value,
    state: &mut BackendState,
) -> RpcResponse {
    let parsed = match serde_json::from_value::<EncodeFinishParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid encode.finish params: {error}"),
            );
        }
    };

    let Some(session) = state.encode_sessions.remove(&parsed.session_id) else {
        return response_error(id, -32052, "No active encode session");
    };
    let mut session = session;

    let _ = session.stdin.flush();
    drop(session.stdin);

    let status = match session.child.wait() {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32056,
                &format!("Failed to wait Rust encode ffmpeg process: {error}"),
            );
        }
    };
    let mut ffmpeg_stderr = String::new();
    let _ = session.stderr.read_to_string(&mut ffmpeg_stderr);

    if !status.success() {
        let stderr_detail = ffmpeg_stderr.trim();
        let stderr_suffix = if stderr_detail.is_empty() {
            String::new()
        } else {
            format!(" stderr: {stderr_detail}")
        };
        return response_error(
            id,
            -32057,
            &format!(
                "Rust encode ffmpeg exited with failure status: code={:?}.{stderr_suffix}",
                status.code(),
            ),
        );
    }

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "finished": true,
            "sessionId": session.session_id,
            "filePath": session.file_path,
            "audioPath": session.audio_path,
            "fps": session.fps,
            "frameCount": session.frame_count,
        })),
        error: None,
    }
}

pub(crate) fn handle_encode_abort(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
    let parsed = match serde_json::from_value::<EncodeAbortParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(id, -32602, &format!("Invalid encode.abort params: {error}"));
        }
    };

    let Some(session) = state.encode_sessions.remove(&parsed.session_id) else {
        return RpcResponse {
            id,
            ok: true,
            result: Some(json!({
                "aborted": false,
                "sessionId": parsed.session_id,
                "alreadyClosed": true,
            })),
            error: None,
        };
    };

    let summary = abort_encode_session(session);
    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "aborted": true,
            "sessionId": summary.session_id,
            "filePath": summary.file_path,
            "frameCount": summary.frame_count,
            "ffmpegStatus": summary.ffmpeg_status,
            "stderr": summary.stderr,
        })),
        error: None,
    }
}

pub(crate) fn abort_encode_session(session: EncodeSession) -> EncodeAbortSummary {
    let EncodeSession {
        mut child,
        mut stdin,
        mut stderr,
        session_id,
        file_path,
        frame_count,
        ..
    } = session;

    let _ = stdin.flush();
    drop(stdin);

    let ffmpeg_status = match child.try_wait() {
        Ok(Some(status)) => format!("alreadyExited:{:?}", status.code()),
        Ok(None) => {
            let _ = child.kill();
            match child.wait() {
                Ok(status) => format!("killed:{:?}", status.code()),
                Err(error) => format!("waitFailed:{error}"),
            }
        }
        Err(error) => format!("statusFailed:{error}"),
    };
    let mut stderr_text = String::new();
    let _ = stderr.read_to_string(&mut stderr_text);

    EncodeAbortSummary {
        session_id,
        file_path,
        frame_count,
        ffmpeg_status,
        stderr: stderr_text.trim().to_string(),
    }
}

pub(crate) fn validate_encode_shared_frame(
    session: &EncodeSession,
    parsed: &EncodeWriteFrameParams,
) -> Result<(), String> {
    if parsed.slot_count == 0 {
        return Err("slotCount must be greater than zero".to_string());
    }
    if parsed.frame.pts_frame != parsed.frame_index {
        return Err("Encode frame ptsFrame does not match frameIndex".to_string());
    }

    let descriptor = &parsed.frame.descriptor;
    validate_renderer_handoff_descriptor(descriptor)
        .map_err(|error| format!("Unsupported encode renderer handoff descriptor: {error:?}"))?;

    if descriptor.slot_index >= parsed.slot_count {
        return Err("Encode frame descriptor slotIndex is outside slotCount".to_string());
    }

    if descriptor.width != session.width
        || descriptor.height != session.height
        || descriptor.format != session.pixel_format
        || descriptor.colour != session.colour
    {
        return Err("Encode frame descriptor does not match active session".to_string());
    }

    let expected_byte_len = u64::from(descriptor.stride_bytes)
        .checked_mul(u64::from(descriptor.height))
        .ok_or_else(|| "Encode frame descriptor byte length overflows".to_string())?;
    if descriptor.byte_len != expected_byte_len {
        return Err(
            "Encode frame descriptor byteLen does not match strideBytes * height".to_string(),
        );
    }

    let expected_byte_offset = descriptor
        .byte_len
        .checked_mul(u64::from(descriptor.slot_index))
        .ok_or_else(|| "Encode frame descriptor byteOffset overflows".to_string())?;
    if descriptor.byte_offset != expected_byte_offset {
        return Err("Encode frame descriptor byteOffset does not match slot layout".to_string());
    }

    Ok(())
}

#[cfg(unix)]
pub(crate) fn write_encode_shared_frame(
    session: &mut EncodeSession,
    parsed: &EncodeWriteFrameParams,
) -> Result<(usize, usize), String> {
    let descriptor = &parsed.frame.descriptor;
    let frame_len = usize::try_from(descriptor.byte_len).map_err(|_| {
        format!(
            "Encode frame byteLen overflows usize: {}",
            descriptor.byte_len
        )
    })?;
    let ring = PosixSharedRing::attach_with_retry_for_layout(
        &descriptor.memory_id,
        parsed.slot_count,
        frame_len,
        Duration::from_secs(1),
    )
    .map_err(|error| format!("Failed to attach encode shared memory: {error:?}"))?;
    let frame = ring
        .read_frame(parsed.frame.pts_frame)
        .map_err(|error| format!("Failed to read encode shared frame: {error:?}"))?;
    let byte_len = frame.bytes.len();
    let write_result = write_tight_rgba_frame_to_encoder(session, descriptor, &frame.bytes);
    let release_state = if write_result.is_ok() {
        CopyOutState::EncoderFrameWritten
    } else {
        CopyOutState::RendererUploadAborted
    };
    let release_result = ring.release_frame(release_state);

    let encoded_byte_len = write_result?;
    release_result.map_err(|error| format!("Failed to release encode shared frame: {error:?}"))?;

    Ok((byte_len, encoded_byte_len))
}

#[cfg(not(unix))]
pub(crate) fn write_encode_shared_frame(
    _session: &mut EncodeSession,
    _parsed: &EncodeWriteFrameParams,
) -> Result<(usize, usize), String> {
    Err("Rust encode shared memory is unavailable on this platform".to_string())
}

pub(crate) fn start_encode_ffmpeg(
    parsed: &EncodeStartParams,
) -> Result<(Child, ChildStdin, ChildStderr), String> {
    let ffmpeg_path = std::env::var("UXFD_FFMPEG_BIN").unwrap_or_else(|_| "ffmpeg".to_string());
    let audio_path = parsed
        .audio_path
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    let mut cmd = Command::new(&ffmpeg_path);
    cmd.arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-y")
        .arg("-f")
        .arg("rawvideo")
        .arg("-pix_fmt")
        .arg("rgba")
        .arg("-s")
        .arg(format!("{}x{}", parsed.width, parsed.height))
        .arg("-r")
        .arg(parsed.fps.to_string())
        .arg("-i")
        .arg("-");

    if let Some(audio_path) = audio_path {
        cmd.arg("-i").arg(audio_path);
    }

    cmd.arg("-c:v")
        .arg(get_video_codec())
        .arg("-b:v")
        .arg("8000k")
        .arg("-pix_fmt")
        .arg("yuv420p");

    if audio_path.is_some() {
        cmd.arg("-c:a")
            .arg("aac")
            .arg("-b:a")
            .arg("192k")
            .arg("-map")
            .arg("0:v:0")
            .arg("-map")
            .arg("1:a:0")
            .arg("-shortest");
    } else {
        cmd.arg("-an");
    }

    cmd.arg(&parsed.file_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|error| format!("Failed to start Rust encode ffmpeg ({ffmpeg_path}): {error}"))?;
    let stdin = match child.stdin.take() {
        Some(value) => value,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Failed to capture Rust encode ffmpeg stdin".to_string());
        }
    };
    let stderr = match child.stderr.take() {
        Some(value) => value,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Failed to capture Rust encode ffmpeg stderr".to_string());
        }
    };

    Ok((child, stdin, stderr))
}

pub(crate) fn get_video_codec() -> &'static str {
    if cfg!(target_os = "macos") {
        "h264_videotoolbox"
    } else {
        "libx264"
    }
}

fn write_tight_rgba_frame_to_encoder(
    session: &mut EncodeSession,
    descriptor: &FrameDescriptor,
    shared_frame: &[u8],
) -> Result<usize, String> {
    let row_bytes = usize::try_from(descriptor.width)
        .ok()
        .and_then(|width| width.checked_mul(4))
        .ok_or_else(|| "Encode frame row byte length overflows".to_string())?;
    let stride_bytes = usize::try_from(descriptor.stride_bytes)
        .map_err(|_| "Encode frame strideBytes overflows usize".to_string())?;
    let height = usize::try_from(descriptor.height)
        .map_err(|_| "Encode frame height overflows usize".to_string())?;
    if stride_bytes < row_bytes {
        return Err("Encode frame strideBytes is smaller than tight RGBA row".to_string());
    }
    let expected_len = stride_bytes
        .checked_mul(height)
        .ok_or_else(|| "Encode shared frame byte length overflows".to_string())?;
    if shared_frame.len() != expected_len {
        return Err(format!(
            "Encode shared frame byte length mismatch: expected={expected_len}, actual={}",
            shared_frame.len()
        ));
    }

    let mut tight_rgba = Vec::with_capacity(
        row_bytes
            .checked_mul(height)
            .ok_or_else(|| "Encode tight frame byte length overflows".to_string())?,
    );
    for row in 0..height {
        let source_start = row
            .checked_mul(stride_bytes)
            .ok_or_else(|| "Encode source row offset overflows".to_string())?;
        tight_rgba.extend_from_slice(&shared_frame[source_start..source_start + row_bytes]);
    }

    session
        .stdin
        .write_all(&tight_rgba)
        .map_err(|error| format!("Failed to write raw RGBA frame to Rust encoder: {error}"))?;

    Ok(tight_rgba.len())
}

pub(crate) fn write_rgba_frame_to_encoder(
    session: &mut EncodeSession,
    frame: &RgbaFrame,
) -> Result<usize, String> {
    if frame.width != session.width || frame.height != session.height {
        return Err("Native rendered frame dimensions do not match active session".to_string());
    }
    session
        .stdin
        .write_all(&frame.pixels)
        .map_err(|error| format!("Failed to write native RGBA frame to Rust encoder: {error}"))?;

    Ok(frame.pixels.len())
}
