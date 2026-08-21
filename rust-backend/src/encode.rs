use std::io::{Read, Write};
use std::process::{Child, ChildStderr, ChildStdin, Command, Stdio};
use std::time::Duration;

use crate::params::{
    EncodeAbortParams, EncodeFinishParams, EncodeStartParams, EncodeWriteFrameParams,
};
use crate::rpc::{response_error, RpcResponse};
use crate::sessions::{EncodeAbortSummary, EncodeSession, EncodeTransport};
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

    let transport = match start_encode_transport(&parsed) {
        Ok(value) => value,
        Err(message) => return response_error(id, -32054, &message),
    };

    state.encode_sessions.insert(
        parsed.session_id.clone(),
        EncodeSession {
            transport,
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
            "encoderPath": if parsed.iosurface_encode {
                "iosurfaceVideoToolbox"
            } else {
                "ffmpegRawRgba"
            },
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
    state.release_resident_video_decoders_for_encode_session(&parsed.session_id);
    let EncodeSession {
        transport,
        session_id,
        file_path,
        audio_path,
        fps,
        frame_count,
        ..
    } = session;
    let encoder_path = match finish_encode_transport(transport) {
        Ok(value) => value,
        Err(message) => return response_error(id, -32057, &message),
    };

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "finished": true,
            "sessionId": session_id,
            "filePath": file_path,
            "audioPath": audio_path,
            "fps": fps,
            "frameCount": frame_count,
            "encoderPath": encoder_path,
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

    state.release_resident_video_decoders_for_encode_session(&parsed.session_id);
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
        transport,
        session_id,
        file_path,
        frame_count,
        ..
    } = session;
    let (ffmpeg_status, stderr_text) = abort_encode_transport(transport);

    EncodeAbortSummary {
        session_id,
        file_path,
        frame_count,
        ffmpeg_status,
        stderr: stderr_text.trim().to_string(),
    }
}

/// Derives a deterministic temporary video-only output path for the
/// IOSurface VideoToolbox transport when an audio track needs to be muxed in
/// afterwards. Pure so it can be unit tested without touching the filesystem.
pub(crate) fn derive_pending_mux_temp_video_path(final_file_path: &str) -> String {
    format!("{final_file_path}.uxfd-video-tmp.mp4")
}

fn start_encode_transport(parsed: &EncodeStartParams) -> Result<EncodeTransport, String> {
    if parsed.iosurface_encode {
        let audio_path = parsed
            .audio_path
            .as_deref()
            .map(|path| path.trim())
            .filter(|path| !path.is_empty());
        #[cfg(target_os = "macos")]
        {
            let (encode_target_path, pending_audio_mux) = if let Some(audio_path) = audio_path {
                let temp_video_path = derive_pending_mux_temp_video_path(&parsed.file_path);
                // Remove any stale temp file left over from a crashed/aborted
                // previous run before the encoder starts writing to it.
                let _ = std::fs::remove_file(&temp_video_path);
                (
                    temp_video_path.clone(),
                    Some(crate::sessions::PendingAudioMux {
                        temp_video_path,
                        audio_path: audio_path.to_string(),
                        final_path: parsed.file_path.clone(),
                    }),
                )
            } else {
                (parsed.file_path.clone(), None)
            };
            let encoder = uxfd_macos_video_encode::VideoEncodeSession::start(
                std::path::Path::new(&encode_target_path),
                parsed.width,
                parsed.height,
                parsed.fps,
            )
            .map_err(|error| format!("Failed to start IOSurface VideoToolbox encoder: {error}"))?;
            return Ok(EncodeTransport::VideoToolbox {
                encoder,
                pending_audio_mux,
            });
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = audio_path;
            return Err("IOSurface VideoToolbox encode is only available on macOS".to_string());
        }
    }

    let (child, stdin, stderr) = start_encode_ffmpeg(parsed)?;
    Ok(EncodeTransport::Ffmpeg {
        child,
        stdin,
        stderr,
    })
}

fn finish_encode_transport(transport: EncodeTransport) -> Result<&'static str, String> {
    match transport {
        EncodeTransport::Ffmpeg {
            mut child,
            mut stdin,
            mut stderr,
        } => {
            let _ = stdin.flush();
            drop(stdin);
            let status = child
                .wait()
                .map_err(|error| format!("Failed to wait Rust encode ffmpeg process: {error}"))?;
            let mut stderr_text = String::new();
            let _ = stderr.read_to_string(&mut stderr_text);
            if !status.success() {
                return Err(format!(
                    "Rust encode ffmpeg exited with failure status: code={:?}. stderr: {}",
                    status.code(),
                    stderr_text.trim()
                ));
            }
            Ok("ffmpegRawRgba")
        }
        #[cfg(target_os = "macos")]
        EncodeTransport::VideoToolbox {
            encoder,
            pending_audio_mux,
        } => {
            std::thread::Builder::new()
                .name("uxfd-videotoolbox-finish".to_string())
                .spawn(move || encoder.finish())
                .map_err(|error| {
                    format!("Failed to start IOSurface VideoToolbox finish thread: {error}")
                })?
                .join()
                .map_err(|_| "IOSurface VideoToolbox finish thread panicked".to_string())?
                .map_err(|error| format!("IOSurface VideoToolbox finish failed: {error}"))?;

            let Some(mux) = pending_audio_mux else {
                return Ok("iosurfaceVideoToolbox");
            };

            let ffmpeg_path =
                std::env::var("UXFD_FFMPEG_BIN").unwrap_or_else(|_| "ffmpeg".to_string());
            let mux_result = mux_audio_into_video(
                &mux.temp_video_path,
                &mux.audio_path,
                &mux.final_path,
                &ffmpeg_path,
            );
            // Best-effort cleanup of the temp video file regardless of mux
            // outcome, so a failed mux does not leave it lying around.
            let _ = std::fs::remove_file(&mux.temp_video_path);
            mux_result?;
            Ok("iosurfaceVideoToolboxAudioMux")
        }
    }
}

/// Muxes `audio_path` into `temp_video_path` (video-only, produced by the
/// IOSurface VideoToolbox encoder) via ffmpeg stream copy, writing the result
/// to `final_path`. Extracted as a pure(ish) function so it can be unit
/// tested directly against small ffmpeg-generated fixtures.
fn mux_audio_into_video(
    temp_video_path: &str,
    audio_path: &str,
    final_path: &str,
    ffmpeg_path: &str,
) -> Result<(), String> {
    let output = Command::new(ffmpeg_path)
        .arg("-y")
        .arg("-i")
        .arg(temp_video_path)
        .arg("-i")
        .arg(audio_path)
        .arg("-c:v")
        .arg("copy")
        .arg("-c:a")
        .arg("aac")
        .arg("-shortest")
        .arg(final_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("Failed to run ffmpeg audio mux ({ffmpeg_path}): {error}"))?;

    if !output.status.success() {
        let stderr_text = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "ffmpeg audio mux exited with failure status: code={:?}. stderr: {}",
            output.status.code(),
            stderr_text.trim()
        ));
    }

    Ok(())
}

fn abort_encode_transport(transport: EncodeTransport) -> (String, String) {
    match transport {
        EncodeTransport::Ffmpeg {
            mut child,
            mut stdin,
            mut stderr,
        } => {
            let _ = stdin.flush();
            drop(stdin);
            let status = match child.try_wait() {
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
            (status, stderr_text)
        }
        #[cfg(target_os = "macos")]
        EncodeTransport::VideoToolbox {
            encoder,
            pending_audio_mux,
        } => {
            drop(encoder);
            if let Some(mux) = pending_audio_mux {
                let _ = std::fs::remove_file(&mux.temp_video_path);
            }
            ("cancelled:videoToolbox".to_string(), String::new())
        }
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

    let tight_len = row_bytes
        .checked_mul(height)
        .ok_or_else(|| "Encode tight frame byte length overflows".to_string())?;

    if stride_bytes == row_bytes {
        // Fast path: the shared buffer is already tight (no row padding), so
        // it can be handed to the encoder directly without an intermediate
        // per-frame allocation + copy.
        ffmpeg_stdin(session)?
            .write_all(shared_frame)
            .map_err(|error| format!("Failed to write raw RGBA frame to Rust encoder: {error}"))?;
        return Ok(shared_frame.len());
    }

    // Padded rows: stream each row straight from the shared buffer to the
    // encoder's stdin pipe instead of copying every row into a freshly
    // allocated `Vec` first. This trades a per-row `write_all` syscall for
    // the per-frame allocation + memcpy that used to happen here.
    for row in 0..height {
        let source_start = row
            .checked_mul(stride_bytes)
            .ok_or_else(|| "Encode source row offset overflows".to_string())?;
        ffmpeg_stdin(session)?
            .write_all(&shared_frame[source_start..source_start + row_bytes])
            .map_err(|error| format!("Failed to write raw RGBA frame to Rust encoder: {error}"))?;
    }

    Ok(tight_len)
}

pub(crate) fn write_rgba_frame_to_encoder(
    session: &mut EncodeSession,
    frame: &RgbaFrame,
) -> Result<usize, String> {
    if frame.width != session.width || frame.height != session.height {
        return Err("Native rendered frame dimensions do not match active session".to_string());
    }
    ffmpeg_stdin(session)?
        .write_all(&frame.pixels)
        .map_err(|error| format!("Failed to write native RGBA frame to Rust encoder: {error}"))?;

    Ok(frame.pixels.len())
}

fn ffmpeg_stdin(session: &mut EncodeSession) -> Result<&mut ChildStdin, String> {
    match &mut session.transport {
        EncodeTransport::Ffmpeg { stdin, .. } => Ok(stdin),
        #[cfg(target_os = "macos")]
        EncodeTransport::VideoToolbox { .. } => Err(
            "RGBA/shared-frame writes are incompatible with IOSurface VideoToolbox encode"
                .to_string(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Command, Stdio};

    /// Spawns a tiny `sh -c 'cat > <path>'` sink process so tests can drive
    /// `write_tight_rgba_frame_to_encoder` against a real `ChildStdin` (the
    /// type is only constructible from an actually-spawned child) without
    /// depending on ffmpeg being installed.
    fn spawn_stdin_sink(out_path: &std::path::Path) -> (Child, ChildStdin, ChildStderr) {
        let mut child = Command::new("sh")
            .arg("-c")
            .arg(format!("cat > {}", out_path.display()))
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .expect("failed to spawn stdin sink process");
        let stdin = child.stdin.take().expect("child stdin should be piped");
        let stderr = child.stderr.take().expect("child stderr should be piped");
        (child, stdin, stderr)
    }

    fn make_test_session(out_path: &std::path::Path, width: u32, height: u32) -> EncodeSession {
        let (child, stdin, stderr) = spawn_stdin_sink(out_path);
        EncodeSession {
            transport: EncodeTransport::Ffmpeg {
                child,
                stdin,
                stderr,
            },
            session_id: "test-session".to_string(),
            file_path: "unused.mp4".to_string(),
            audio_path: None,
            width,
            height,
            fps: 30,
            pixel_format: FrameFormat::Rgba8Srgb,
            colour: ColourMetadata::rec709_srgb(),
            frame_count: 0,
        }
    }

    fn make_descriptor(width: u32, height: u32, stride_bytes: u32) -> FrameDescriptor {
        let byte_len = u64::from(stride_bytes) * u64::from(height);
        FrameDescriptor {
            memory_id: "test-memory".to_string(),
            slot_index: 0,
            generation: 0,
            byte_offset: 0,
            byte_len,
            width,
            height,
            stride_bytes,
            format: FrameFormat::Rgba8Srgb,
            colour: ColourMetadata::rec709_srgb(),
        }
    }

    fn unique_temp_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "uxfd_encode_test_{}_{}_{}",
            std::process::id(),
            name,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn write_tight_rgba_frame_to_encoder_no_padding_writes_buffer_directly() {
        let width = 4u32;
        let height = 3u32;
        let row_bytes = width * 4;
        // stride == row_bytes: no padding, should hit the fast direct-write path.
        let descriptor = make_descriptor(width, height, row_bytes);
        let shared_frame: Vec<u8> = (0..(row_bytes * height) as usize)
            .map(|index| (index % 256) as u8)
            .collect();

        let out_path = unique_temp_path("no_padding");
        let mut session = make_test_session(&out_path, width, height);

        let written = write_tight_rgba_frame_to_encoder(&mut session, &descriptor, &shared_frame)
            .expect("write should succeed");
        assert_eq!(written, shared_frame.len());

        let EncodeTransport::Ffmpeg {
            mut child, stdin, ..
        } = session.transport
        else {
            panic!("test session must use ffmpeg transport");
        };
        drop(stdin);
        child.wait().expect("sink process should exit");
        let bytes = std::fs::read(&out_path).expect("sink output file should exist");
        let _ = std::fs::remove_file(&out_path);

        assert_eq!(bytes, shared_frame);
    }

    #[test]
    fn write_tight_rgba_frame_to_encoder_with_padding_strips_padding() {
        let width = 4u32;
        let height = 3u32;
        let row_bytes = (width * 4) as usize;
        let stride_bytes = row_bytes + 8; // padded rows (e.g. alignment padding)
        let descriptor = make_descriptor(width, height, stride_bytes as u32);

        let mut shared_frame = vec![0u8; stride_bytes * height as usize];
        let mut expected_tight = Vec::with_capacity(row_bytes * height as usize);
        for row in 0..height as usize {
            let row_start = row * stride_bytes;
            let row_pixels: Vec<u8> = (0..row_bytes)
                .map(|column| ((row * 31 + column) % 256) as u8)
                .collect();
            shared_frame[row_start..row_start + row_bytes].copy_from_slice(&row_pixels);
            // Fill the padding bytes with a sentinel value that must never
            // show up in the written output.
            for padding_byte in &mut shared_frame[row_start + row_bytes..row_start + stride_bytes]
            {
                *padding_byte = 0xAA;
            }
            expected_tight.extend_from_slice(&row_pixels);
        }

        let out_path = unique_temp_path("with_padding");
        let mut session = make_test_session(&out_path, width, height);

        let written = write_tight_rgba_frame_to_encoder(&mut session, &descriptor, &shared_frame)
            .expect("write should succeed");
        assert_eq!(written, expected_tight.len());

        let EncodeTransport::Ffmpeg {
            mut child, stdin, ..
        } = session.transport
        else {
            panic!("test session must use ffmpeg transport");
        };
        drop(stdin);
        child.wait().expect("sink process should exit");
        let bytes = std::fs::read(&out_path).expect("sink output file should exist");
        let _ = std::fs::remove_file(&out_path);

        assert_eq!(bytes, expected_tight);
        assert!(!bytes.contains(&0xAA), "padding bytes must not leak into the encoder stream");
    }

    #[test]
    fn derive_pending_mux_temp_video_path_is_deterministic_and_final_specific() {
        let temp_a = derive_pending_mux_temp_video_path("/tmp/out/a.mp4");
        let temp_b = derive_pending_mux_temp_video_path("/tmp/out/b.mp4");
        assert_eq!(temp_a, "/tmp/out/a.mp4.uxfd-video-tmp.mp4");
        assert_eq!(temp_b, "/tmp/out/b.mp4.uxfd-video-tmp.mp4");
        assert_ne!(temp_a, temp_b);
        // Deterministic: calling again with the same input yields the same path.
        assert_eq!(temp_a, derive_pending_mux_temp_video_path("/tmp/out/a.mp4"));
    }

    fn ffmpeg_available() -> bool {
        let ffmpeg_path = std::env::var("UXFD_FFMPEG_BIN").unwrap_or_else(|_| "ffmpeg".to_string());
        Command::new(&ffmpeg_path)
            .arg("-version")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    /// Generates a tiny silent/blank fixture file via ffmpeg's `lavfi`
    /// source so mux tests don't depend on real project media.
    fn generate_lavfi_fixture(out_path: &std::path::Path, filter: &str, extra_args: &[&str]) -> bool {
        let ffmpeg_path = std::env::var("UXFD_FFMPEG_BIN").unwrap_or_else(|_| "ffmpeg".to_string());
        let mut cmd = Command::new(&ffmpeg_path);
        cmd.arg("-y")
            .arg("-hide_banner")
            .arg("-loglevel")
            .arg("error")
            .arg("-f")
            .arg("lavfi")
            .arg("-i")
            .arg(filter)
            .args(extra_args)
            .arg(out_path);
        cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    #[test]
    fn mux_audio_into_video_combines_streams_into_final_path() {
        if !ffmpeg_available() {
            eprintln!("skipping mux_audio_into_video test: ffmpeg is not available");
            return;
        }
        let ffmpeg_path = std::env::var("UXFD_FFMPEG_BIN").unwrap_or_else(|_| "ffmpeg".to_string());

        let temp_video_path = unique_temp_path("mux_video").with_extension("mp4");
        let audio_path = unique_temp_path("mux_audio").with_extension("wav");
        let final_path = unique_temp_path("mux_final").with_extension("mp4");

        assert!(
            generate_lavfi_fixture(
                &temp_video_path,
                "testsrc=size=32x32:rate=10:duration=1",
                &["-pix_fmt", "yuv420p"],
            ),
            "failed to generate fixture video"
        );
        assert!(
            generate_lavfi_fixture(
                &audio_path,
                "sine=frequency=440:duration=1",
                &[],
            ),
            "failed to generate fixture audio"
        );

        let result = mux_audio_into_video(
            &temp_video_path.to_string_lossy(),
            &audio_path.to_string_lossy(),
            &final_path.to_string_lossy(),
            &ffmpeg_path,
        );

        let _ = std::fs::remove_file(&temp_video_path);
        let _ = std::fs::remove_file(&audio_path);
        let final_exists = final_path.exists();
        let final_size = std::fs::metadata(&final_path).map(|meta| meta.len()).unwrap_or(0);
        let _ = std::fs::remove_file(&final_path);

        assert!(result.is_ok(), "mux should succeed: {:?}", result.err());
        assert!(final_exists, "final muxed file should exist");
        assert!(final_size > 0, "final muxed file should not be empty");
    }

    #[test]
    fn mux_audio_into_video_reports_failure_for_missing_inputs() {
        if !ffmpeg_available() {
            eprintln!("skipping mux_audio_into_video failure test: ffmpeg is not available");
            return;
        }
        let ffmpeg_path = std::env::var("UXFD_FFMPEG_BIN").unwrap_or_else(|_| "ffmpeg".to_string());
        let missing_video = unique_temp_path("mux_missing_video").with_extension("mp4");
        let missing_audio = unique_temp_path("mux_missing_audio").with_extension("wav");
        let final_path = unique_temp_path("mux_missing_final").with_extension("mp4");

        let result = mux_audio_into_video(
            &missing_video.to_string_lossy(),
            &missing_audio.to_string_lossy(),
            &final_path.to_string_lossy(),
            &ffmpeg_path,
        );

        assert!(result.is_err(), "mux should fail when inputs are missing");
        assert!(!final_path.exists(), "final path should not be created on failure");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn iosurface_transport_with_audio_path_mux_es_into_final_file() {
        if !ffmpeg_available() {
            eprintln!("skipping iosurface audio mux end-to-end test: ffmpeg is not available");
            return;
        }

        let audio_path = unique_temp_path("iosurface_e2e_audio").with_extension("wav");
        assert!(
            generate_lavfi_fixture(&audio_path, "sine=frequency=440:duration=1", &[]),
            "failed to generate fixture audio"
        );

        let final_path = unique_temp_path("iosurface_e2e_final").with_extension("mp4");
        let temp_video_path = derive_pending_mux_temp_video_path(&final_path.to_string_lossy());

        let parsed = crate::params::EncodeStartParams {
            session_id: "iosurface-e2e-session".to_string(),
            file_path: final_path.to_string_lossy().to_string(),
            audio_path: Some(audio_path.to_string_lossy().to_string()),
            width: 32,
            height: 32,
            fps: 10,
            pixel_format: FrameFormat::Rgba8Srgb,
            colour: ColourMetadata::rec709_srgb(),
            iosurface_encode: true,
        };

        let transport = start_encode_transport(&parsed).expect("transport should start");
        let EncodeTransport::VideoToolbox {
            mut encoder,
            pending_audio_mux,
        } = transport
        else {
            panic!("expected VideoToolbox transport");
        };
        assert!(pending_audio_mux.is_some(), "audio mux should be pending");
        let mux = pending_audio_mux.expect("checked above");
        assert_eq!(mux.temp_video_path, temp_video_path);
        assert_eq!(mux.final_path, final_path.to_string_lossy());

        for frame_index in 0..3u64 {
            let frame = encoder.acquire_frame().expect("acquire_frame should succeed");
            encoder
                .append_frame(frame, frame_index)
                .expect("append_frame should succeed");
        }

        let status = finish_encode_transport(EncodeTransport::VideoToolbox {
            encoder,
            pending_audio_mux: Some(mux),
        })
        .expect("finish should succeed");

        assert_eq!(status, "iosurfaceVideoToolboxAudioMux");
        assert!(final_path.exists(), "final muxed file should exist");
        assert!(
            !std::path::Path::new(&temp_video_path).exists(),
            "temp video file should be deleted after a successful mux"
        );

        let _ = std::fs::remove_file(&audio_path);
        let _ = std::fs::remove_file(&final_path);
        let _ = std::fs::remove_file(&temp_video_path);
    }
}
