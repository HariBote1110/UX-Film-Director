mod psd_fast;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{self, BufRead, Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uxfd_golden_harness::{load_rgba_jpeg, load_rgba_png, RgbaFrame};
use uxfd_native_wgpu_renderer::{
    NativeAudioWaveformInput, NativeWgpuRenderError, NativeWgpuRenderer,
};
use uxfd_rust_core::{
    AudioWaveformSource, EvaluatedClip, MediaKind, SamplingMode, SceneMediaReference, SceneSnapshot,
};
#[cfg(unix)]
use uxfd_shared_memory_spike::{PosixSharedRing, PosixShmError};
use uxfd_sidecar_protocol::{
    rgba8_srgb_ring_layout, validate_renderer_handoff_descriptor, ChecksumAlgorithm,
    ColourMetadata, CopyOutState, DecodeFrameRequest, DecodeReleaseFrameRequest,
    DecodeStartRequest, DecodeStartResponse, FrameChecksum, FrameDescriptor, FrameFormat,
    FrameVerificationReport, FrameVerificationStatus, ReadyFrame, SharedFrame, SharedFrameRing,
    SlotRecoveryReason,
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

struct DecodeSession {
    start_response: DecodeStartResponse,
    source: String,
    ffmpeg_path: String,
    ffprobe_path: String,
    ring: SharedFrameRing,
    data_plane_ring: Option<DecodeDataPlaneRing>,
    streaming_decoder: Option<StreamingDecodeProcess>,
}

struct StreamingDecodeProcess {
    child: Child,
    stdout: ChildStdout,
    next_frame_index: u64,
    frame_byte_len: usize,
}

impl Drop for StreamingDecodeProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

struct DecodedRgbaFrame {
    bytes: Vec<u8>,
    decode_path: &'static str,
    stream_restarted: bool,
    stream_skipped_frame_count: u64,
    decode_invocation_count: u64,
}

struct EncodeSession {
    child: Child,
    stdin: ChildStdin,
    stderr: ChildStderr,
    session_id: String,
    file_path: String,
    audio_path: Option<String>,
    width: u32,
    height: u32,
    fps: u32,
    pixel_format: FrameFormat,
    colour: ColourMetadata,
    frame_count: u64,
}

struct EncodeAbortSummary {
    session_id: String,
    file_path: String,
    frame_count: u64,
    ffmpeg_status: String,
    stderr: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DecodeStopRequest {
    job_id: String,
}

/// Shared state for the in-progress PSD pixel blob write.
/// `None` = no write pending; `Some(Ok(path))` = done; `Some(Err(msg))` = failed.
type BlobWriteResult = Arc<Mutex<Option<Result<String, String>>>>;

#[derive(Default)]
struct BackendState {
    decode_sessions: HashMap<String, DecodeSession>,
    encode_sessions: HashMap<String, EncodeSession>,
    psd_overlay_cache: HashMap<String, PsdOverlayCacheEntry>,
    #[cfg(unix)]
    native_render_outputs: HashMap<String, PosixSharedRing>,
    native_wgpu_renderer: Option<NativeWgpuRenderer>,
    /// Background blob writer: set by psd.parse, drained by psd.await_blob.
    psd_blob_result: Option<BlobWriteResult>,
}

struct PsdOverlayCacheEntry {
    raw_path: PathBuf,
    source_width: u32,
    source_height: u32,
}

#[derive(Debug, Serialize)]
struct HealthResult<'a> {
    status: &'a str,
    engine: &'a str,
    version: &'a str,
}

#[derive(Debug, Deserialize)]
struct GeneratedGradientSource {
    #[serde(rename = "type")]
    gradient_type: String,
    colours: Vec<String>,
    #[serde(default)]
    stops: Vec<f32>,
    #[serde(default)]
    direction: f32,
}

#[derive(Debug, Deserialize)]
struct GeneratedParticleSource {
    generator: String,
    seed: u64,
    particle_count: u32,
    spread: f32,
    speed: f32,
    size: f32,
    colour: String,
    lifetime_seconds: f32,
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
    for (_, mut session) in state.encode_sessions.drain() {
        let _ = session.stdin.flush();
        drop(session.stdin);
        let _ = session.child.kill();
        let _ = session.child.wait();
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncodeStartParams {
    session_id: String,
    file_path: String,
    #[serde(default)]
    audio_path: Option<String>,
    width: u32,
    height: u32,
    fps: u32,
    pixel_format: FrameFormat,
    colour: ColourMetadata,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncodeWriteFrameParams {
    session_id: String,
    frame_index: u64,
    timestamp_us: u64,
    slot_count: u32,
    frame: SharedFrame,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncodeWriteNativeFrameParams {
    session_id: String,
    render_id: String,
    frame_index: u64,
    timestamp_us: u64,
    width: u32,
    height: u32,
    snapshot: SceneSnapshot,
    #[serde(default)]
    media: Vec<SceneMediaReference>,
    sources: Vec<NativeRenderSharedFrameSource>,
    #[serde(default)]
    audio_waveforms: Vec<NativeRenderAudioWaveformSource>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncodeFinishParams {
    session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncodeAbortParams {
    session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncodeTranscodeVideoParams {
    #[serde(default)]
    session_id: Option<String>,
    input_path: String,
    output_path: String,
    width: u32,
    height: u32,
    fps: u32,
    duration_seconds: f64,
    #[serde(default)]
    start_seconds: Option<f64>,
    #[serde(default)]
    object_x: Option<i32>,
    #[serde(default)]
    object_y: Option<i32>,
    #[serde(default)]
    object_width: Option<u32>,
    #[serde(default)]
    object_height: Option<u32>,
    #[serde(default)]
    audio_path: Option<String>,
    #[serde(default)]
    include_audio: bool,
    #[serde(default)]
    audio_volume: Option<f64>,
    #[serde(default)]
    quality_preset: Option<String>,
    #[serde(default)]
    video_bitrate_kbps: Option<u32>,
    #[serde(default)]
    overlays: Vec<EncodeTranscodeVideoOverlayParams>,
    #[serde(default)]
    ffmpeg_path: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EncodeTranscodeVideoOverlayParams {
    kind: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    #[serde(default)]
    colour: Option<String>,
    #[serde(default)]
    opacity: Option<f64>,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    active_layer_ids: Vec<String>,
}

#[derive(Debug, Clone)]
struct NormalisedTranscodeOverlay {
    kind: NormalisedTranscodeOverlayKind,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    opacity: f64,
}

struct NormalisedTranscodeOverlays {
    overlays: Vec<NormalisedTranscodeOverlay>,
    psd_overlay_cache_hits: u64,
}

#[derive(Debug, Clone)]
enum NormalisedTranscodeOverlayKind {
    SolidColour {
        colour: String,
    },
    Image {
        path: String,
    },
    RawRgbaImage {
        path: PathBuf,
        source_width: u32,
        source_height: u32,
        temporary: bool,
    },
}

fn normalise_transcode_quality_preset(value: Option<&str>) -> &'static str {
    match value
        .unwrap_or("balanced")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "compact" => "compact",
        "speed" => "speed",
        "quality" => "quality",
        _ => "balanced",
    }
}

fn default_transcode_video_bitrate_kbps(quality_preset: &str) -> u32 {
    match quality_preset {
        "compact" => 4_000,
        "speed" => 6_000,
        "quality" => 14_000,
        _ => 8_000,
    }
}

fn resolve_transcode_video_bitrate_kbps(quality_preset: &str, requested: Option<u32>) -> u32 {
    requested
        .filter(|value| *value > 0)
        .map(|value| value.clamp(500, 80_000))
        .unwrap_or_else(|| default_transcode_video_bitrate_kbps(quality_preset))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeRenderSharedFrameParams {
    render_id: String,
    memory_id: String,
    slot_count: u32,
    pts_frame: u64,
    width: u32,
    height: u32,
    snapshot: SceneSnapshot,
    #[serde(default)]
    media: Vec<SceneMediaReference>,
    sources: Vec<NativeRenderSharedFrameSource>,
    #[serde(default)]
    audio_waveforms: Vec<NativeRenderAudioWaveformSource>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeRenderSharedFrameSource {
    media_id: String,
    slot_count: u32,
    frame: SharedFrame,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeRenderAudioWaveformSource {
    media_id: String,
    source: String,
    samples: Vec<f32>,
    sample_rate: u32,
    width: u32,
    height: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeRenderReleaseSharedFrameParams {
    memory_id: String,
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
struct AudioWaveformSamplesParams {
    source: String,
    sample_rate: u32,
    max_samples: u32,
    #[serde(default)]
    start_seconds: Option<f64>,
    #[serde(default)]
    duration_seconds: Option<f64>,
    #[serde(default)]
    ffmpeg_path: Option<String>,
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
        "audio.waveformSamples" => handle_audio_waveform_samples(request.id, request.params),
        "psd.parse" => handle_psd_parse(request.id, request.params, state),
        "psd.await_blob" => handle_psd_await_blob(request.id, state),
        "decode.start" => handle_decode_start(request.id, request.params, state),
        "decode.stop" => handle_decode_stop(request.id, request.params, state),
        "decode.requestFrame" => {
            handle_decode_request_frame(request.id, request.params, state, false)
        }
        "decode.requestFrameInline" => {
            handle_decode_request_frame(request.id, request.params, state, true)
        }
        "decode.releaseFrame" => handle_decode_release_frame(request.id, request.params, state),
        "encode.start" => handle_encode_start(request.id, request.params, state),
        "encode.writeFrame" => handle_encode_write_frame(request.id, request.params, state),
        "encode.writeNativeFrame" => {
            handle_encode_write_native_frame(request.id, request.params, state)
        }
        "encode.transcodeVideo" => handle_encode_transcode_video(request.id, request.params, state),
        "encode.finish" => handle_encode_finish(request.id, request.params, state),
        "encode.abort" => handle_encode_abort(request.id, request.params, state),
        "render.nativeSharedFrame" => {
            handle_native_render_shared_frame(request.id, request.params, state)
        }
        "render.releaseNativeSharedFrame" => {
            handle_release_native_render_shared_frame(request.id, request.params, state)
        }
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

fn handle_encode_start(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
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

fn handle_encode_write_frame(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
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

#[cfg(unix)]
fn handle_encode_write_native_frame(
    id: u64,
    params: Value,
    state: &mut BackendState,
) -> RpcResponse {
    let parsed = match serde_json::from_value::<EncodeWriteNativeFrameParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid encode.writeNativeFrame params: {error}"),
            );
        }
    };

    {
        let Some(session) = state.encode_sessions.get(&parsed.session_id) else {
            return response_error(id, -32052, "No active encode session");
        };
        if parsed.width != session.width || parsed.height != session.height {
            return response_error(
                id,
                -32602,
                "Native encode frame dimensions do not match active session",
            );
        }
        if session.pixel_format != FrameFormat::Rgba8Srgb
            || session.colour != ColourMetadata::rec709_srgb()
        {
            return response_error(
                id,
                -32602,
                "Only bt709/srgb/rgb/full rgba8Srgb native encode input is supported",
            );
        }
    }

    let sources =
        match collect_native_render_sources(&parsed.snapshot, &parsed.media, &parsed.sources) {
            Ok(value) => value,
            Err(message) => {
                return response_error(id, native_render_source_error_code(&message), &message);
            }
        };
    let audio_waveforms = match collect_native_render_audio_waveforms(&parsed.audio_waveforms) {
        Ok(value) => value,
        Err(message) => return response_error(id, -32602, &message),
    };
    if sources.is_empty() && audio_waveforms.is_empty() {
        return response_error(
            id,
            -32602,
            "sources, Image media, SolidColour media, or audioWaveforms must include at least one render source",
        );
    }

    if audio_waveforms.is_empty() {
        if let Some(frame) = match try_render_simple_video_frame(
            &parsed.snapshot,
            &parsed.media,
            &sources,
            parsed.width,
            parsed.height,
        ) {
            Ok(value) => value,
            Err(message) => return response_error(id, -32071, &message),
        } {
            let (session_id, frame_count, encoded_frame_byte_len) = {
                let Some(session) = state.encode_sessions.get_mut(&parsed.session_id) else {
                    return response_error(id, -32052, "No active encode session");
                };
                let encoded_frame_byte_len = match write_rgba_frame_to_encoder(session, &frame) {
                    Ok(value) => value,
                    Err(message) => return response_error(id, -32053, &message),
                };
                session.frame_count += 1;
                (
                    session.session_id.clone(),
                    session.frame_count,
                    encoded_frame_byte_len,
                )
            };

            return RpcResponse {
                id,
                ok: true,
                result: Some(json!({
                    "written": true,
                    "writtenNativeFrame": true,
                    "sessionId": session_id,
                    "renderId": parsed.render_id,
                    "renderPath": "cpuSimpleVideoComposite",
                    "frameIndex": parsed.frame_index,
                    "timestampUs": parsed.timestamp_us,
                    "encodedFrameByteLen": encoded_frame_byte_len,
                    "frameCount": frame_count,
                })),
                error: None,
            };
        }
    }

    let renderer = match get_or_create_native_wgpu_renderer(state, parsed.width, parsed.height) {
        Ok(value) => value,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            return response_error(id, -32070, "Native WebGPU adapter is unavailable");
        }
        Err(error) => {
            return response_error(
                id,
                -32071,
                &format!("Native WebGPU renderer setup failed: {error:?}"),
            );
        }
    };

    let render = match pollster::block_on(renderer.render_frame_stages_with_audio_waveforms(
        &parsed.snapshot,
        &sources,
        &audio_waveforms,
    )) {
        Ok(value) => value,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            return response_error(id, -32070, "Native WebGPU adapter is unavailable");
        }
        Err(error) => {
            return response_error(
                id,
                -32071,
                &format!("Native WebGPU render failed: {error:?}"),
            );
        }
    };

    let (session_id, frame_count, encoded_frame_byte_len) = {
        let Some(session) = state.encode_sessions.get_mut(&parsed.session_id) else {
            return response_error(id, -32052, "No active encode session");
        };
        let encoded_frame_byte_len = match write_rgba_frame_to_encoder(session, &render.frame) {
            Ok(value) => value,
            Err(message) => return response_error(id, -32053, &message),
        };
        session.frame_count += 1;
        (
            session.session_id.clone(),
            session.frame_count,
            encoded_frame_byte_len,
        )
    };

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "written": true,
            "writtenNativeFrame": true,
            "sessionId": session_id,
            "renderId": parsed.render_id,
            "frameIndex": parsed.frame_index,
            "timestampUs": parsed.timestamp_us,
            "encodedFrameByteLen": encoded_frame_byte_len,
            "frameCount": frame_count,
            "timings": {
                "setupMs": render.timings.setup.as_secs_f64() * 1000.0,
                "sourceUploadMs": render.timings.source_upload.as_secs_f64() * 1000.0,
                "renderMs": render.timings.render.as_secs_f64() * 1000.0,
                "readbackEncodeMs": render.timings.readback_encode.as_secs_f64() * 1000.0,
                "steadyStateMs": render.timings.steady_state.as_secs_f64() * 1000.0,
                "totalMs": render.timings.total.as_secs_f64() * 1000.0,
            },
        })),
        error: None,
    }
}

#[cfg(not(unix))]
fn handle_encode_write_native_frame(
    id: u64,
    _params: Value,
    _state: &mut BackendState,
) -> RpcResponse {
    response_error(
        id,
        -32070,
        "encode.writeNativeFrame requires POSIX shared memory support",
    )
}

fn handle_encode_finish(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
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

fn handle_encode_abort(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
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

fn abort_encode_session(session: EncodeSession) -> EncodeAbortSummary {
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

fn emit_transcode_progress_event(
    session_id: &str,
    completed_frames: u64,
    total_frames: u64,
    progress_status: &str,
) {
    let bounded_completed = completed_frames.min(total_frames);
    let percent = if total_frames > 0 {
        (bounded_completed as f64 / total_frames as f64 * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };
    let event = json!({
        "event": "encode.transcodeVideo.progress",
        "payload": {
            "sessionId": session_id,
            "completedFrames": bounded_completed,
            "totalFrames": total_frames,
            "percent": percent,
            "status": progress_status,
        }
    });
    if let Ok(serialised) = serde_json::to_string(&event) {
        let mut stdout = io::stdout().lock();
        let _ = writeln!(stdout, "{serialised}");
        let _ = stdout.flush();
    }
}

fn normalise_transcode_overlays(
    overlays: &[EncodeTranscodeVideoOverlayParams],
    psd_overlay_cache: &mut HashMap<String, PsdOverlayCacheEntry>,
) -> Result<NormalisedTranscodeOverlays, String> {
    let mut normalised = Vec::with_capacity(overlays.len());
    let mut psd_overlay_cache_hits = 0_u64;
    for overlay in overlays {
        if overlay.width == 0 || overlay.height == 0 {
            return Err("overlay width and height must be greater than zero".to_string());
        }
        let opacity = overlay
            .opacity
            .filter(|value| value.is_finite())
            .unwrap_or(1.0)
            .clamp(0.0, 1.0);
        match overlay.kind.as_str() {
            "solidColour" => {
                let colour = overlay
                    .colour
                    .as_deref()
                    .ok_or_else(|| "solidColour overlay colour must not be empty".to_string())?;
                let colour = normalise_hex_colour(colour)?;
                normalised.push(NormalisedTranscodeOverlay {
                    kind: NormalisedTranscodeOverlayKind::SolidColour { colour },
                    x: overlay.x,
                    y: overlay.y,
                    width: overlay.width,
                    height: overlay.height,
                    opacity,
                });
            }
            "image" => {
                let path = overlay
                    .path
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| "image overlay path must not be empty".to_string())?;
                normalised.push(NormalisedTranscodeOverlay {
                    kind: NormalisedTranscodeOverlayKind::Image {
                        path: path.to_string(),
                    },
                    x: overlay.x,
                    y: overlay.y,
                    width: overlay.width,
                    height: overlay.height,
                    opacity,
                });
            }
            "psd" => {
                let path = overlay
                    .path
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| "psd overlay path must not be empty".to_string())?;
                let prepared = prepare_psd_overlay_raw_rgba(
                    path,
                    &overlay.active_layer_ids,
                    psd_overlay_cache,
                )?;
                if prepared.cache_hit {
                    psd_overlay_cache_hits += 1;
                }
                normalised.push(NormalisedTranscodeOverlay {
                    kind: NormalisedTranscodeOverlayKind::RawRgbaImage {
                        path: prepared.raw_path,
                        source_width: prepared.source_width,
                        source_height: prepared.source_height,
                        temporary: false,
                    },
                    x: overlay.x,
                    y: overlay.y,
                    width: overlay.width,
                    height: overlay.height,
                    opacity,
                });
            }
            _ => return Err(format!("unsupported overlay kind: {}", overlay.kind)),
        }
    }
    Ok(NormalisedTranscodeOverlays {
        overlays: normalised,
        psd_overlay_cache_hits,
    })
}

struct PreparedPsdOverlayInput {
    raw_path: PathBuf,
    source_width: u32,
    source_height: u32,
    cache_hit: bool,
}

fn prepare_psd_overlay_raw_rgba(
    source: &str,
    active_layer_ids: &[String],
    psd_overlay_cache: &mut HashMap<String, PsdOverlayCacheEntry>,
) -> Result<PreparedPsdOverlayInput, String> {
    let source_path = local_media_source_path(source, "Psd overlay")?;
    let metadata = fs::metadata(&source_path)
        .map_err(|error| format!("psd overlay failed to stat source: {error}"))?;
    let cache_key = psd_overlay_cache_key(&source_path, &metadata, active_layer_ids);
    if let Some(entry) = psd_overlay_cache.get(&cache_key) {
        if entry.raw_path.exists() {
            return Ok(PreparedPsdOverlayInput {
                raw_path: entry.raw_path.clone(),
                source_width: entry.source_width,
                source_height: entry.source_height,
                cache_hit: true,
            });
        }
    }
    psd_overlay_cache.remove(&cache_key);

    let (raw_path, source_width, source_height) =
        prepare_psd_overlay_raw_rgba_uncached(&source_path, active_layer_ids)?;
    psd_overlay_cache.insert(
        cache_key,
        PsdOverlayCacheEntry {
            raw_path: raw_path.clone(),
            source_width,
            source_height,
        },
    );
    Ok(PreparedPsdOverlayInput {
        raw_path,
        source_width,
        source_height,
        cache_hit: false,
    })
}

fn prepare_psd_overlay_raw_rgba_uncached(
    source_path: &str,
    active_layer_ids: &[String],
) -> Result<(PathBuf, u32, u32), String> {
    let bytes = fs::read(&source_path)
        .map_err(|error| format!("psd overlay failed to read source: {error}"))?;
    let psd = psd_fast::parse_psd_fast(&bytes)
        .map_err(|error| format!("psd overlay failed to parse source: {error}"))?;
    let frame =
        psd_fast::composite_visible_psd_layers_with_active_layer_ids(&psd, active_layer_ids)
            .map_err(|error| format!("psd overlay failed to composite source: {error}"))?;
    let micros = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    let path = std::env::temp_dir().join(format!(
        "uxfd-transcode-psd-{}-{micros}.rgba",
        std::process::id()
    ));
    fs::write(&path, &frame.pixels)
        .map_err(|error| format!("psd overlay failed to write temporary RGBA input: {error}"))?;
    Ok((path, frame.width, frame.height))
}

fn psd_overlay_cache_key(
    source_path: &str,
    metadata: &fs::Metadata,
    active_layer_ids: &[String],
) -> String {
    let mut active_layer_ids = active_layer_ids.to_vec();
    active_layer_ids.sort();
    let modified_ns = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!(
        "{}|{}|{}|{}",
        source_path,
        metadata.len(),
        modified_ns,
        active_layer_ids.join("\u{1f}")
    )
}

fn remove_temporary_transcode_overlay_inputs(overlays: &[NormalisedTranscodeOverlay]) {
    for overlay in overlays {
        if let NormalisedTranscodeOverlayKind::RawRgbaImage {
            path, temporary, ..
        } = &overlay.kind
        {
            if !temporary {
                continue;
            }
            let _ = fs::remove_file(path);
        }
    }
}

fn normalise_hex_colour(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    let hex = trimmed
        .strip_prefix('#')
        .ok_or_else(|| "overlay colour must be a hex colour".to_string())?;
    if hex.len() == 3 && hex.chars().all(|char| char.is_ascii_hexdigit()) {
        let mut expanded = String::with_capacity(6);
        for char in hex.chars() {
            expanded.push(char);
            expanded.push(char);
        }
        return Ok(expanded.to_ascii_lowercase());
    }
    if hex.len() == 6 && hex.chars().all(|char| char.is_ascii_hexdigit()) {
        return Ok(hex.to_ascii_lowercase());
    }
    Err("overlay colour must be a 3 or 6 digit hex colour".to_string())
}

fn build_transcode_filter_complex(
    base_filter: &str,
    overlays: &[NormalisedTranscodeOverlay],
    overlay_inputs: &[Option<usize>],
) -> (String, String) {
    let mut parts = vec![format!("[0:v]{base_filter}[v0]")];
    let mut previous_label = "v0".to_string();
    for (index, overlay) in overlays.iter().enumerate() {
        let next_label = format!("v{}", index + 1);
        match &overlay.kind {
            NormalisedTranscodeOverlayKind::SolidColour { colour } => {
                let opacity = overlay.opacity.clamp(0.0, 1.0);
                parts.push(format!(
                    "[{previous_label}]drawbox=x={}:y={}:w={}:h={}:color=0x{}@{:.6}:t=fill[{next_label}]",
                    overlay.x,
                    overlay.y,
                    overlay.width,
                    overlay.height,
                    colour,
                    opacity
                ));
            }
            NormalisedTranscodeOverlayKind::Image { .. }
            | NormalisedTranscodeOverlayKind::RawRgbaImage { .. } => {
                let input_index = overlay_inputs[index].unwrap_or(1);
                let overlay_label = format!("ov{index}");
                let opacity = overlay.opacity.clamp(0.0, 1.0);
                parts.push(format!(
                    "[{input_index}:v]scale={}:{}:force_original_aspect_ratio=disable,format=rgba,colorchannelmixer=aa={:.6}[{overlay_label}]",
                    overlay.width,
                    overlay.height,
                    opacity
                ));
                parts.push(format!(
                    "[{previous_label}][{overlay_label}]overlay={}:{}:format=auto[{next_label}]",
                    overlay.x, overlay.y
                ));
            }
        }
        previous_label = next_label;
    }
    (parts.join(";"), format!("[{previous_label}]"))
}

fn handle_encode_transcode_video(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
    let parsed = match serde_json::from_value::<EncodeTranscodeVideoParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid encode.transcodeVideo params: {error}"),
            );
        }
    };

    if parsed.input_path.trim().is_empty() {
        return response_error(id, -32602, "inputPath must not be empty");
    }
    if parsed.output_path.trim().is_empty() {
        return response_error(id, -32602, "outputPath must not be empty");
    }
    if parsed.width == 0 || parsed.height == 0 || parsed.fps == 0 {
        return response_error(
            id,
            -32602,
            "width, height, and fps must be greater than zero",
        );
    }
    if !parsed.duration_seconds.is_finite() || parsed.duration_seconds <= 0.0 {
        return response_error(id, -32602, "durationSeconds must be greater than zero");
    }

    let ffmpeg_path = parsed
        .ffmpeg_path
        .or_else(|| std::env::var("UXFD_FFMPEG_BIN").ok())
        .unwrap_or_else(|| "ffmpeg".to_string());
    let start_seconds = parsed
        .start_seconds
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(0.0);
    let audio_path = parsed
        .audio_path
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    let audio_volume = parsed
        .audio_volume
        .filter(|value| value.is_finite() && *value >= 0.0)
        .unwrap_or(1.0)
        .clamp(0.0, 4.0);
    let quality_preset = normalise_transcode_quality_preset(parsed.quality_preset.as_deref());
    let video_bitrate_kbps =
        resolve_transcode_video_bitrate_kbps(quality_preset, parsed.video_bitrate_kbps);
    let include_source_audio = parsed.include_audio && audio_path.is_none() && audio_volume > 0.0;
    let frame_count = (parsed.duration_seconds * f64::from(parsed.fps)).ceil() as u64;
    let session_id = parsed
        .session_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("transcode-video");
    let object_x = parsed.object_x.unwrap_or(0);
    let object_y = parsed.object_y.unwrap_or(0);
    let object_width = parsed.object_width.unwrap_or(parsed.width);
    let object_height = parsed.object_height.unwrap_or(parsed.height);
    let output_width = i64::from(parsed.width);
    let output_height = i64::from(parsed.height);
    let object_x_i64 = i64::from(object_x);
    let object_y_i64 = i64::from(object_y);
    let object_width_i64 = i64::from(object_width);
    let object_height_i64 = i64::from(object_height);
    let object_right = object_x_i64 + object_width_i64;
    let object_bottom = object_y_i64 + object_height_i64;
    if object_width == 0
        || object_height == 0
        || object_right <= 0
        || object_bottom <= 0
        || object_x_i64 >= output_width
        || object_y_i64 >= output_height
    {
        return response_error(
            id,
            -32602,
            "object placement must intersect the output frame",
        );
    }
    let crop_x = 0_i64.max(-object_x_i64);
    let crop_y = 0_i64.max(-object_y_i64);
    let right_overflow = 0_i64.max(object_right - output_width);
    let bottom_overflow = 0_i64.max(object_bottom - output_height);
    let canvas_width = output_width + crop_x + right_overflow;
    let canvas_height = output_height + crop_y + bottom_overflow;
    let pad_x = 0_i64.max(object_x_i64);
    let pad_y = 0_i64.max(object_y_i64);
    let scale_filter = format!(
        "scale={}:{},setsar=1,pad={}:{}:{}:{}:black,crop={}:{}:{}:{},fps={}",
        object_width,
        object_height,
        canvas_width,
        canvas_height,
        pad_x,
        pad_y,
        parsed.width,
        parsed.height,
        crop_x,
        crop_y,
        parsed.fps
    );
    let normalised_overlays =
        match normalise_transcode_overlays(&parsed.overlays, &mut state.psd_overlay_cache) {
            Ok(value) => value,
            Err(error) => return response_error(id, -32602, &error),
        };
    let psd_overlay_cache_hits = normalised_overlays.psd_overlay_cache_hits;
    let overlays = normalised_overlays.overlays;

    let mut cmd = Command::new(&ffmpeg_path);
    cmd.arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-nostats")
        .arg("-y");
    if start_seconds > 0.0 {
        cmd.arg("-ss").arg(format!("{start_seconds:.6}"));
    }
    cmd.arg("-i").arg(&parsed.input_path);
    let mut next_input_index = 1_usize;
    let mut overlay_inputs: Vec<Option<usize>> = Vec::with_capacity(overlays.len());
    for overlay in &overlays {
        match &overlay.kind {
            NormalisedTranscodeOverlayKind::Image { path } => {
                cmd.arg("-loop")
                    .arg("1")
                    .arg("-t")
                    .arg(format!("{:.6}", parsed.duration_seconds))
                    .arg("-i")
                    .arg(path);
                overlay_inputs.push(Some(next_input_index));
                next_input_index += 1;
            }
            NormalisedTranscodeOverlayKind::RawRgbaImage {
                path,
                source_width,
                source_height,
                ..
            } => {
                cmd.arg("-stream_loop")
                    .arg("-1")
                    .arg("-f")
                    .arg("rawvideo")
                    .arg("-pix_fmt")
                    .arg("rgba")
                    .arg("-s")
                    .arg(format!("{}x{}", source_width, source_height))
                    .arg("-r")
                    .arg(parsed.fps.to_string())
                    .arg("-t")
                    .arg(format!("{:.6}", parsed.duration_seconds))
                    .arg("-i")
                    .arg(path);
                overlay_inputs.push(Some(next_input_index));
                next_input_index += 1;
            }
            NormalisedTranscodeOverlayKind::SolidColour { .. } => {
                overlay_inputs.push(None);
            }
        }
    }
    let audio_input_index = audio_path.map(|_| next_input_index);
    if let Some(audio_path) = audio_path {
        cmd.arg("-i").arg(audio_path);
    }
    let mapped_complex_video = !overlays.is_empty();
    if mapped_complex_video {
        let (filter_complex, final_label) =
            build_transcode_filter_complex(&scale_filter, &overlays, &overlay_inputs);
        cmd.arg("-filter_complex")
            .arg(filter_complex)
            .arg("-map")
            .arg(final_label);
    }
    cmd.arg("-t")
        .arg(format!("{:.6}", parsed.duration_seconds))
        .arg("-progress")
        .arg("pipe:1");
    if !mapped_complex_video {
        cmd.arg("-vf").arg(scale_filter);
    }
    cmd.arg("-r")
        .arg(parsed.fps.to_string())
        .arg("-c:v")
        .arg(get_video_codec())
        .arg("-b:v")
        .arg(format!("{video_bitrate_kbps}k"))
        .arg("-pix_fmt")
        .arg("yuv420p");

    if audio_path.is_some() {
        if !mapped_complex_video {
            cmd.arg("-map").arg("0:v:0");
        }
        cmd.arg("-map")
            .arg(format!("{}:a:0", audio_input_index.unwrap_or(1)))
            .arg("-c:a")
            .arg("aac")
            .arg("-b:a")
            .arg("192k")
            .arg("-shortest");
    } else if include_source_audio {
        if !mapped_complex_video {
            cmd.arg("-map").arg("0:v:0");
        }
        cmd.arg("-map")
            .arg("0:a:0?")
            .arg("-c:a")
            .arg("aac")
            .arg("-b:a")
            .arg("192k");
        if (audio_volume - 1.0).abs() > 1e-6 {
            cmd.arg("-af").arg(format!("volume={audio_volume:.6}"));
        }
    } else {
        cmd.arg("-an");
    }

    cmd.arg("-movflags")
        .arg("+faststart")
        .arg(&parsed.output_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(value) => value,
        Err(error) => {
            remove_temporary_transcode_overlay_inputs(&overlays);
            return response_error(
                id,
                -32058,
                &format!("Failed to start Rust transcode ffmpeg ({ffmpeg_path}): {error}"),
            );
        }
    };
    let stdout = match child.stdout.take() {
        Some(value) => value,
        None => {
            let _ = child.kill();
            remove_temporary_transcode_overlay_inputs(&overlays);
            return response_error(id, -32058, "Failed to capture Rust transcode ffmpeg stdout");
        }
    };
    let stderr = match child.stderr.take() {
        Some(value) => value,
        None => {
            let _ = child.kill();
            remove_temporary_transcode_overlay_inputs(&overlays);
            return response_error(id, -32058, "Failed to capture Rust transcode ffmpeg stderr");
        }
    };
    let stderr_handle = thread::spawn(move || {
        let mut stderr_reader = stderr;
        let mut stderr_text = String::new();
        let _ = stderr_reader.read_to_string(&mut stderr_text);
        stderr_text
    });

    emit_transcode_progress_event(session_id, 0, frame_count, "started");
    let mut latest_frame = 0_u64;
    let mut latest_out_time_us = 0_u64;
    let stdout_reader = io::BufReader::new(stdout);
    for line_result in stdout_reader.lines() {
        let line = match line_result {
            Ok(value) => value,
            Err(_) => break,
        };
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        match key {
            "frame" => {
                latest_frame = value.trim().parse::<u64>().unwrap_or(latest_frame);
            }
            "out_time_ms" => {
                latest_out_time_us = value.trim().parse::<u64>().unwrap_or(latest_out_time_us);
            }
            "progress" => {
                let completed_from_time = ((latest_out_time_us as f64 / 1_000_000.0)
                    * f64::from(parsed.fps))
                .round() as u64;
                let completed_frames = latest_frame.max(completed_from_time);
                emit_transcode_progress_event(
                    session_id,
                    if value.trim() == "end" {
                        frame_count
                    } else {
                        completed_frames
                    },
                    frame_count,
                    value.trim(),
                );
            }
            _ => {}
        }
    }

    let status = match child.wait() {
        Ok(value) => value,
        Err(error) => {
            remove_temporary_transcode_overlay_inputs(&overlays);
            return response_error(
                id,
                -32059,
                &format!("Rust transcode ffmpeg wait failed: {error}"),
            );
        }
    };
    let stderr_detail = stderr_handle.join().unwrap_or_default().trim().to_string();
    remove_temporary_transcode_overlay_inputs(&overlays);

    if !status.success() {
        let stderr_suffix = if stderr_detail.is_empty() {
            String::new()
        } else {
            format!(" stderr: {stderr_detail}")
        };
        return response_error(
            id,
            -32059,
            &format!(
                "Rust transcode ffmpeg exited with failure status: code={:?}.{stderr_suffix}",
                status.code()
            ),
        );
    }
    emit_transcode_progress_event(session_id, frame_count, frame_count, "completed");

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "transcoded": true,
            "outputPath": parsed.output_path,
            "frameCount": frame_count,
            "width": parsed.width,
            "height": parsed.height,
            "fps": parsed.fps,
            "overlayCount": overlays.len(),
            "psdOverlayCacheHits": psd_overlay_cache_hits,
            "includedAudio": audio_path.is_some() || include_source_audio,
            "encodeSettings": {
                "qualityPreset": quality_preset,
                "videoBitrateKbps": video_bitrate_kbps,
            },
        })),
        error: None,
    }
}

#[cfg(unix)]
fn handle_native_render_shared_frame(
    id: u64,
    params: Value,
    state: &mut BackendState,
) -> RpcResponse {
    let parsed = match serde_json::from_value::<NativeRenderSharedFrameParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid render.nativeSharedFrame params: {error}"),
            );
        }
    };

    if parsed.slot_count == 0 {
        return response_error(id, -32602, "slotCount must be greater than zero");
    }
    let sources =
        match collect_native_render_sources(&parsed.snapshot, &parsed.media, &parsed.sources) {
            Ok(value) => value,
            Err(message) => {
                return response_error(id, native_render_source_error_code(&message), &message);
            }
        };
    let audio_waveforms = match collect_native_render_audio_waveforms(&parsed.audio_waveforms) {
        Ok(value) => value,
        Err(message) => return response_error(id, -32602, &message),
    };
    if sources.is_empty() && audio_waveforms.is_empty() {
        return response_error(
            id,
            -32602,
            "sources, Image media, SolidColour media, or audioWaveforms must include at least one render source",
        );
    }

    if audio_waveforms.is_empty() {
        match try_render_simple_video_frame_to_shared_ring(
            &parsed.snapshot,
            &parsed.media,
            &sources,
            parsed.width,
            parsed.height,
            &parsed.memory_id,
            parsed.slot_count,
            parsed.pts_frame,
        ) {
            Ok(Some(render)) => {
                let frame = render.shared_frame.clone();
                let slot_count = render.slot_count;
                let slot_byte_len = render.slot_byte_len;
                state
                    .native_render_outputs
                    .insert(parsed.memory_id.clone(), render.ring);

                return RpcResponse {
                    id,
                    ok: true,
                    result: Some(json!({
                        "rendered": true,
                        "renderPath": "cpuSimpleVideoComposite",
                        "renderId": parsed.render_id,
                        "memoryId": parsed.memory_id,
                        "slotCount": slot_count,
                        "slotByteLen": slot_byte_len,
                        "frame": frame,
                    })),
                    error: None,
                };
            }
            Ok(None) => {}
            Err(message) => {
                return response_error(
                    id,
                    -32071,
                    &format!("Native CPU simple video render failed: {message}"),
                );
            }
        }
    }

    let renderer = match get_or_create_native_wgpu_renderer(state, parsed.width, parsed.height) {
        Ok(value) => value,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            return response_error(id, -32070, "Native WebGPU adapter is unavailable");
        }
        Err(error) => {
            return response_error(
                id,
                -32071,
                &format!("Native WebGPU renderer setup failed: {error:?}"),
            );
        }
    };

    let render =
        match pollster::block_on(renderer.render_frame_to_shared_ring_with_audio_waveforms(
            &parsed.snapshot,
            &sources,
            &audio_waveforms,
            &parsed.memory_id,
            parsed.slot_count,
            parsed.pts_frame,
        )) {
            Ok(value) => value,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                return response_error(id, -32070, "Native WebGPU adapter is unavailable");
            }
            Err(error) => {
                return response_error(
                    id,
                    -32071,
                    &format!("Native WebGPU render failed: {error:?}"),
                );
            }
        };

    let frame = render.shared_frame.clone();
    let slot_count = render.slot_count;
    let slot_byte_len = render.slot_byte_len;
    state
        .native_render_outputs
        .insert(parsed.memory_id.clone(), render.ring);

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "rendered": true,
            "renderId": parsed.render_id,
            "memoryId": parsed.memory_id,
            "slotCount": slot_count,
            "slotByteLen": slot_byte_len,
            "frame": frame,
        })),
        error: None,
    }
}

#[cfg(unix)]
struct CpuSimpleVideoRenderReport {
    ring: PosixSharedRing,
    slot_count: u32,
    slot_byte_len: u64,
    shared_frame: SharedFrame,
}

#[cfg(unix)]
fn try_render_simple_video_frame_to_shared_ring(
    snapshot: &SceneSnapshot,
    media_items: &[SceneMediaReference],
    sources: &HashMap<String, RgbaFrame>,
    width: u32,
    height: u32,
    memory_id: &str,
    slot_count: u32,
    pts_frame: u64,
) -> Result<Option<CpuSimpleVideoRenderReport>, String> {
    let Some(frame) = try_render_simple_video_frame(snapshot, media_items, sources, width, height)?
    else {
        return Ok(None);
    };

    let colour = ColourMetadata::rec709_srgb();
    let layout = rgba8_srgb_ring_layout(memory_id, slot_count, width, height, colour)
        .map_err(|error| format!("CPU simple video output layout failed: {error:?}"))?;
    let descriptor = layout
        .descriptor_for_slot(0)
        .map_err(|error| format!("CPU simple video output descriptor failed: {error:?}"))?;
    let padded = pad_rgba_rows(&frame.pixels, width, height, descriptor.stride_bytes)?;
    let slot_byte_len = usize::try_from(descriptor.byte_len).map_err(|_| {
        format!(
            "CPU simple video output byteLen overflows usize: {}",
            descriptor.byte_len
        )
    })?;
    let ring = PosixSharedRing::create_with_slot_count(memory_id, slot_count, slot_byte_len)
        .map_err(|error| format!("CPU simple video output shared memory failed: {error:?}"))?;
    ring.write_frame(pts_frame, &padded)
        .map_err(|error| format!("CPU simple video output write failed: {error:?}"))?;

    Ok(Some(CpuSimpleVideoRenderReport {
        ring,
        slot_count,
        slot_byte_len: descriptor.byte_len,
        shared_frame: SharedFrame {
            descriptor,
            pts_frame,
        },
    }))
}

#[cfg(unix)]
fn try_render_simple_video_frame(
    snapshot: &SceneSnapshot,
    media_items: &[SceneMediaReference],
    sources: &HashMap<String, RgbaFrame>,
    width: u32,
    height: u32,
) -> Result<Option<RgbaFrame>, String> {
    if snapshot.clips.len() != 1 || sources.len() != 1 {
        return Ok(None);
    }
    let clip = &snapshot.clips[0];
    let Some(media) = media_items.iter().find(|item| item.id == clip.media_id) else {
        return Ok(None);
    };
    if media.kind != MediaKind::Video || !is_simple_video_composite_clip(clip) {
        return Ok(None);
    }
    let Some(source) = sources.get(&clip.media_id) else {
        return Ok(None);
    };
    if source.width != media.width || source.height != media.height {
        return Ok(None);
    }
    let Some(translation_x) = finite_integer_i64(clip.transform.translation_x) else {
        return Ok(None);
    };
    let Some(translation_y) = finite_integer_i64(clip.transform.translation_y) else {
        return Ok(None);
    };

    let output_len = u64::from(width)
        .checked_mul(u64::from(height))
        .and_then(|value| value.checked_mul(4))
        .and_then(|value| usize::try_from(value).ok())
        .ok_or_else(|| "CPU simple video output byte length overflows".to_string())?;
    let mut output = vec![0; output_len];
    blit_simple_video_source(
        source,
        &mut output,
        width,
        height,
        translation_x,
        translation_y,
        clip.transform.scale_x,
        clip.transform.scale_y,
        clip.transform.sampling,
    )?;

    RgbaFrame::from_rgba8(width, height, output)
        .map(Some)
        .map_err(|error| format!("CPU simple video output frame is invalid: {error:?}"))
}

#[cfg(unix)]
fn is_simple_video_composite_clip(clip: &EvaluatedClip) -> bool {
    clip.effects.is_empty()
        && nearly_equal_f32(clip.opacity, 1.0)
        && clip.transform.scale_x.is_finite()
        && clip.transform.scale_y.is_finite()
        && clip.transform.scale_x > 0.0
        && clip.transform.scale_y > 0.0
        && nearly_equal_f32(clip.transform.rotation_degrees, 0.0)
}

#[cfg(unix)]
fn blit_simple_video_source(
    source: &RgbaFrame,
    output: &mut [u8],
    output_width: u32,
    output_height: u32,
    translation_x: i64,
    translation_y: i64,
    scale_x: f32,
    scale_y: f32,
    sampling: SamplingMode,
) -> Result<(), String> {
    if nearly_equal_f32(scale_x, 1.0) && nearly_equal_f32(scale_y, 1.0) {
        return blit_unscaled_simple_video_source(
            source,
            output,
            output_width,
            output_height,
            translation_x,
            translation_y,
        );
    }

    blit_scaled_simple_video_source(
        source,
        output,
        output_width,
        output_height,
        translation_x as f32,
        translation_y as f32,
        scale_x,
        scale_y,
        sampling,
    )
}

#[cfg(unix)]
fn blit_unscaled_simple_video_source(
    source: &RgbaFrame,
    output: &mut [u8],
    output_width: u32,
    output_height: u32,
    translation_x: i64,
    translation_y: i64,
) -> Result<(), String> {
    let source_width = i64::from(source.width);
    let source_height = i64::from(source.height);
    let output_width_i64 = i64::from(output_width);
    let output_height_i64 = i64::from(output_height);
    let source_x_start = 0_i64.max(-translation_x);
    let source_y_start = 0_i64.max(-translation_y);
    let destination_x_start = 0_i64.max(translation_x);
    let destination_y_start = 0_i64.max(translation_y);
    let copy_width = (source_width - source_x_start)
        .min(output_width_i64 - destination_x_start)
        .max(0);
    let copy_height = (source_height - source_y_start)
        .min(output_height_i64 - destination_y_start)
        .max(0);
    if copy_width == 0 || copy_height == 0 {
        return Ok(());
    }

    let copy_bytes = usize::try_from(copy_width)
        .ok()
        .and_then(|value| value.checked_mul(4))
        .ok_or_else(|| "CPU simple video row byte length overflows".to_string())?;
    let source_width = usize::try_from(source.width)
        .map_err(|_| format!("source width overflows usize: {}", source.width))?;
    let output_width = usize::try_from(output_width)
        .map_err(|_| format!("output width overflows usize: {output_width}"))?;
    let source_x_start = usize::try_from(source_x_start)
        .map_err(|_| "source x start overflows usize".to_string())?;
    let source_y_start = usize::try_from(source_y_start)
        .map_err(|_| "source y start overflows usize".to_string())?;
    let destination_x_start = usize::try_from(destination_x_start)
        .map_err(|_| "destination x start overflows usize".to_string())?;
    let destination_y_start = usize::try_from(destination_y_start)
        .map_err(|_| "destination y start overflows usize".to_string())?;
    let copy_height =
        usize::try_from(copy_height).map_err(|_| "copy height overflows usize".to_string())?;

    for row in 0..copy_height {
        let source_start = ((source_y_start + row) * source_width + source_x_start)
            .checked_mul(4)
            .ok_or_else(|| "CPU simple video source row offset overflows".to_string())?;
        let destination_start = ((destination_y_start + row) * output_width + destination_x_start)
            .checked_mul(4)
            .ok_or_else(|| "CPU simple video destination row offset overflows".to_string())?;
        output[destination_start..destination_start + copy_bytes]
            .copy_from_slice(&source.pixels[source_start..source_start + copy_bytes]);
    }

    Ok(())
}

#[cfg(unix)]
fn blit_scaled_simple_video_source(
    source: &RgbaFrame,
    output: &mut [u8],
    output_width: u32,
    output_height: u32,
    translation_x: f32,
    translation_y: f32,
    scale_x: f32,
    scale_y: f32,
    sampling: SamplingMode,
) -> Result<(), String> {
    let output_width_usize = usize::try_from(output_width)
        .map_err(|_| format!("output width overflows usize: {output_width}"))?;
    let source_width = source.width as f32;
    let source_height = source.height as f32;
    let destination_x_start = translation_x.ceil().max(0.0) as i64;
    let destination_y_start = translation_y.ceil().max(0.0) as i64;
    let destination_x_end = (translation_x + source_width * scale_x)
        .ceil()
        .min(output_width as f32)
        .max(0.0) as i64;
    let destination_y_end = (translation_y + source_height * scale_y)
        .ceil()
        .min(output_height as f32)
        .max(0.0) as i64;
    if destination_x_start >= destination_x_end || destination_y_start >= destination_y_end {
        return Ok(());
    }

    for destination_y in destination_y_start..destination_y_end {
        let source_y = (destination_y as f32 - translation_y) / scale_y;
        if source_y < 0.0 || source_y >= source_height {
            continue;
        }
        let destination_y = usize::try_from(destination_y)
            .map_err(|_| "destination y overflows usize".to_string())?;
        for destination_x in destination_x_start..destination_x_end {
            let source_x = (destination_x as f32 - translation_x) / scale_x;
            if source_x < 0.0 || source_x >= source_width {
                continue;
            }
            let destination_x = usize::try_from(destination_x)
                .map_err(|_| "destination x overflows usize".to_string())?;
            let destination_offset = (destination_y * output_width_usize + destination_x)
                .checked_mul(4)
                .ok_or_else(|| "CPU scaled video destination offset overflows".to_string())?;
            let pixel = sample_simple_video_source(source, source_x, source_y, sampling)?;
            output[destination_offset..destination_offset + 4].copy_from_slice(&pixel);
        }
    }

    Ok(())
}

#[cfg(unix)]
fn sample_simple_video_source(
    source: &RgbaFrame,
    source_x: f32,
    source_y: f32,
    sampling: SamplingMode,
) -> Result<[u8; 4], String> {
    match sampling {
        SamplingMode::Nearest => sample_nearest_simple_video_source(source, source_x, source_y),
        SamplingMode::Bilinear => sample_bilinear_simple_video_source(source, source_x, source_y),
    }
}

#[cfg(unix)]
fn sample_nearest_simple_video_source(
    source: &RgbaFrame,
    source_x: f32,
    source_y: f32,
) -> Result<[u8; 4], String> {
    let x = source_x.floor().clamp(0.0, (source.width - 1) as f32) as usize;
    let y = source_y.floor().clamp(0.0, (source.height - 1) as f32) as usize;
    read_simple_video_source_pixel(source, x, y)
}

#[cfg(unix)]
fn sample_bilinear_simple_video_source(
    source: &RgbaFrame,
    source_x: f32,
    source_y: f32,
) -> Result<[u8; 4], String> {
    let floor_x = source_x.floor();
    let floor_y = source_y.floor();
    let x0 = floor_x.clamp(0.0, (source.width - 1) as f32) as usize;
    let y0 = floor_y.clamp(0.0, (source.height - 1) as f32) as usize;
    let x1 = (floor_x + 1.0).clamp(0.0, (source.width - 1) as f32) as usize;
    let y1 = (floor_y + 1.0).clamp(0.0, (source.height - 1) as f32) as usize;
    let tx = source_x - floor_x;
    let ty = source_y - floor_y;
    let top_left = read_simple_video_source_pixel(source, x0, y0)?;
    let top_right = read_simple_video_source_pixel(source, x1, y0)?;
    let bottom_left = read_simple_video_source_pixel(source, x0, y1)?;
    let bottom_right = read_simple_video_source_pixel(source, x1, y1)?;
    let mut output = [0_u8; 4];
    for channel in 0..4 {
        let top = lerp(top_left[channel] as f32, top_right[channel] as f32, tx);
        let bottom = lerp(
            bottom_left[channel] as f32,
            bottom_right[channel] as f32,
            tx,
        );
        output[channel] = lerp(top, bottom, ty).round().clamp(0.0, 255.0) as u8;
    }
    Ok(output)
}

#[cfg(unix)]
fn read_simple_video_source_pixel(
    source: &RgbaFrame,
    x: usize,
    y: usize,
) -> Result<[u8; 4], String> {
    let source_width = usize::try_from(source.width)
        .map_err(|_| format!("source width overflows usize: {}", source.width))?;
    let offset = (y * source_width + x)
        .checked_mul(4)
        .ok_or_else(|| "CPU scaled video source offset overflows".to_string())?;
    Ok([
        source.pixels[offset],
        source.pixels[offset + 1],
        source.pixels[offset + 2],
        source.pixels[offset + 3],
    ])
}

#[cfg(unix)]
fn lerp(left: f32, right: f32, amount: f32) -> f32 {
    left + (right - left) * amount
}

#[cfg(unix)]
fn finite_integer_i64(value: f32) -> Option<i64> {
    if !value.is_finite() {
        return None;
    }
    let rounded = value.round();
    if (value - rounded).abs() > 1e-6 {
        return None;
    }
    Some(rounded as i64)
}

#[cfg(unix)]
fn nearly_equal_f32(left: f32, right: f32) -> bool {
    (left - right).abs() <= 1e-6
}

#[cfg(unix)]
fn collect_native_render_sources(
    snapshot: &SceneSnapshot,
    media_items: &[SceneMediaReference],
    shared_sources: &[NativeRenderSharedFrameSource],
) -> Result<HashMap<String, RgbaFrame>, String> {
    let mut sources = HashMap::with_capacity(shared_sources.len() + media_items.len());
    for media in media_items {
        let frame = match media.kind {
            MediaKind::SolidColour => build_solid_colour_source_frame(media)?,
            MediaKind::GeneratedGradient => build_generated_gradient_source_frame(media)?,
            MediaKind::GeneratedParticle => build_generated_particle_source_frame(
                media,
                source_frame_for_media(snapshot, &media.id),
            )?,
            MediaKind::Image => build_image_source_frame(media)?,
            MediaKind::Psd => build_psd_source_frame(media)?,
            MediaKind::GeneratedAudioWaveform => continue,
            MediaKind::Video => continue,
        };
        if sources.insert(media.id.clone(), frame).is_some() {
            return Err(format!(
                "Duplicate native render source mediaId '{}'",
                media.id
            ));
        }
    }
    for source in shared_sources {
        if sources.contains_key(&source.media_id) {
            return Err(format!(
                "Duplicate native render source mediaId '{}'",
                source.media_id
            ));
        }
        let frame = read_native_render_source_frame(source)?;
        sources.insert(source.media_id.clone(), frame);
    }

    Ok(sources)
}

fn collect_native_render_audio_waveforms(
    waveforms: &[NativeRenderAudioWaveformSource],
) -> Result<Vec<NativeAudioWaveformInput>, String> {
    waveforms
        .iter()
        .map(|waveform| {
            let source = AudioWaveformSource::from_json(&waveform.source).map_err(|error| {
                format!("Invalid native render audio waveform source: {error:?}")
            })?;
            Ok(NativeAudioWaveformInput {
                media_id: waveform.media_id.clone(),
                source,
                samples: waveform.samples.clone(),
                sample_rate: waveform.sample_rate,
                width: waveform.width,
                height: waveform.height,
            })
        })
        .collect()
}

fn source_frame_for_media(snapshot: &SceneSnapshot, media_id: &str) -> u64 {
    snapshot
        .clips
        .iter()
        .find(|clip| clip.media_id == media_id)
        .map(|clip| clip.source_frame)
        .unwrap_or(0)
}

fn native_render_source_error_code(message: &str) -> i64 {
    if message.starts_with("Failed to attach native render source shared memory")
        || message.starts_with("Failed to read native render source frame")
        || message.starts_with("Failed to release native render source frame")
    {
        -32072
    } else {
        -32602
    }
}

fn get_or_create_native_wgpu_renderer(
    state: &mut BackendState,
    width: u32,
    height: u32,
) -> Result<&NativeWgpuRenderer, NativeWgpuRenderError> {
    let needs_new_renderer = state
        .native_wgpu_renderer
        .as_ref()
        .map(|renderer| renderer.width() != width || renderer.height() != height)
        .unwrap_or(true);

    if needs_new_renderer {
        state.native_wgpu_renderer =
            Some(pollster::block_on(NativeWgpuRenderer::new(width, height))?);
    }

    Ok(state
        .native_wgpu_renderer
        .as_ref()
        .expect("native WGPU renderer should be present after creation"))
}

fn build_solid_colour_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "SolidColour media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let [red, green, blue] = parse_hex_colour_source(&media.source)
        .map_err(|message| format!("Invalid SolidColour media '{}': {message}", media.id))?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "SolidColour media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "SolidColour media byte length overflows".to_string())?;
    let mut pixels = Vec::with_capacity(byte_len);
    for _ in 0..pixel_count {
        pixels.extend_from_slice(&[red, green, blue, 255]);
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("SolidColour media frame is invalid: {error:?}"))
}

fn build_generated_gradient_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedGradient media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let gradient: GeneratedGradientSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedGradient media '{}': {error}", media.id))?;
    let stops = normalise_gradient_stops(&gradient)
        .map_err(|message| format!("Invalid GeneratedGradient media '{}': {message}", media.id))?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedGradient media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedGradient media byte length overflows".to_string())?;
    let mut pixels = Vec::with_capacity(byte_len);
    for y in 0..media.height {
        for x in 0..media.width {
            let t = gradient_position(
                &gradient,
                media.width,
                media.height,
                x as f32 + 0.5,
                y as f32 + 0.5,
            );
            let [red, green, blue] = sample_gradient_colour(&stops, t);
            pixels.extend_from_slice(&[red, green, blue, 255]);
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedGradient media frame is invalid: {error:?}"))
}

fn build_generated_particle_source_frame(
    media: &SceneMediaReference,
    source_frame: u64,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedParticle media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let particle: GeneratedParticleSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedParticle media '{}': {error}", media.id))?;
    validate_generated_particle_source(&particle)
        .map_err(|message| format!("Invalid GeneratedParticle media '{}': {message}", media.id))?;
    let [red, green, blue] = parse_hex_colour_source(&particle.colour)
        .map_err(|message| format!("Invalid GeneratedParticle media '{}': {message}", media.id))?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedParticle media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedParticle media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let centre_x = media.width as f32 / 2.0;
    let centre_y = media.height as f32 / 2.0;
    let radius = ((particle.size.max(1.0).round() as i32) - 1) / 2;
    let source_seconds = source_frame as f32 / 60.0;

    for index in 0..particle.particle_count {
        let angle = deterministic_unit(particle.seed, index, 0) * std::f32::consts::TAU;
        let distance = deterministic_unit(particle.seed, index, 1) * particle.spread;
        let lifetime_position = if particle.lifetime_seconds <= f32::EPSILON {
            0.0
        } else {
            source_seconds.rem_euclid(particle.lifetime_seconds)
        };
        let motion = particle.speed * lifetime_position;
        let x = (centre_x + angle.cos() * (distance + motion)).round() as i32;
        let y = (centre_y + angle.sin() * (distance + motion)).round() as i32;
        for offset_y in -radius..=radius {
            for offset_x in -radius..=radius {
                write_particle_pixel(
                    &mut pixels,
                    media.width,
                    media.height,
                    x + offset_x,
                    y + offset_y,
                    [red, green, blue, 255],
                );
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedParticle media frame is invalid: {error:?}"))
}

fn validate_generated_particle_source(source: &GeneratedParticleSource) -> Result<(), String> {
    if source.generator != "standard-particle" {
        return Err("generator must be standard-particle".to_string());
    }
    if source.particle_count == 0 || source.particle_count > 10_000 {
        return Err("particle_count must be 1..10000".to_string());
    }
    if !source.spread.is_finite() || source.spread < 0.0 {
        return Err("spread must be a finite non-negative number".to_string());
    }
    if !source.speed.is_finite() || source.speed < 0.0 {
        return Err("speed must be a finite non-negative number".to_string());
    }
    if !source.size.is_finite() || source.size <= 0.0 {
        return Err("size must be a finite positive number".to_string());
    }
    if !source.lifetime_seconds.is_finite() || source.lifetime_seconds <= 0.0 {
        return Err("lifetime_seconds must be a finite positive number".to_string());
    }
    parse_hex_colour_source(&source.colour)?;
    Ok(())
}

fn deterministic_unit(seed: u64, index: u32, lane: u64) -> f32 {
    let mut value = seed
        ^ ((index as u64).wrapping_mul(0x9e37_79b9_7f4a_7c15))
        ^ lane.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value ^= value >> 30;
    value = value.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value ^= value >> 27;
    value = value.wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^= value >> 31;
    (value as f64 / u64::MAX as f64) as f32
}

fn write_particle_pixel(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    colour: [u8; 4],
) {
    if x < 0 || y < 0 || x >= width as i32 || y >= height as i32 {
        return;
    }
    let offset = ((y as u32 * width + x as u32) * 4) as usize;
    pixels[offset..offset + 4].copy_from_slice(&colour);
}

fn normalise_gradient_stops(
    gradient: &GeneratedGradientSource,
) -> Result<Vec<(f32, [u8; 3])>, String> {
    if gradient.gradient_type != "linear" && gradient.gradient_type != "radial" {
        return Err("gradient type must be linear or radial".to_string());
    }

    let colours = if gradient.colours.is_empty() {
        vec!["#ffffff".to_string(), "#000000".to_string()]
    } else {
        gradient.colours.clone()
    };
    let last_index = colours.len().saturating_sub(1);
    let mut stops = Vec::with_capacity(colours.len());
    for (index, colour) in colours.iter().enumerate() {
        let colour = parse_hex_colour_source(colour)?;
        let fallback_stop = if last_index == 0 {
            0.0
        } else {
            index as f32 / last_index as f32
        };
        let stop = gradient.stops.get(index).copied().unwrap_or(fallback_stop);
        if !stop.is_finite() {
            return Err("gradient stop must be finite".to_string());
        }
        stops.push((stop.clamp(0.0, 1.0), colour));
    }
    stops.sort_by(|left, right| left.0.total_cmp(&right.0));
    Ok(stops)
}

fn gradient_position(
    gradient: &GeneratedGradientSource,
    width: u32,
    height: u32,
    x: f32,
    y: f32,
) -> f32 {
    if gradient.gradient_type == "radial" {
        let cx = width as f32 / 2.0;
        let cy = height as f32 / 2.0;
        let radius = width.max(height) as f32 / 2.0;
        if radius <= 0.0 {
            return 0.0;
        }
        let distance = ((x - cx).powi(2) + (y - cy).powi(2)).sqrt();
        return (distance / radius).clamp(0.0, 1.0);
    }

    let radians = gradient.direction.to_radians();
    let cx = width as f32 / 2.0;
    let cy = height as f32 / 2.0;
    let half_line = width.max(height) as f32 / 2.0;
    let x1 = cx - radians.cos() * half_line;
    let y1 = cy - radians.sin() * half_line;
    let x2 = cx + radians.cos() * half_line;
    let y2 = cy + radians.sin() * half_line;
    let dx = x2 - x1;
    let dy = y2 - y1;
    let length_squared = dx * dx + dy * dy;
    if length_squared <= f32::EPSILON {
        return 0.0;
    }
    (((x - x1) * dx + (y - y1) * dy) / length_squared).clamp(0.0, 1.0)
}

fn sample_gradient_colour(stops: &[(f32, [u8; 3])], t: f32) -> [u8; 3] {
    if stops.is_empty() {
        return [255, 255, 255];
    }
    if t <= stops[0].0 {
        return stops[0].1;
    }
    for pair in stops.windows(2) {
        let (left_stop, left_colour) = pair[0];
        let (right_stop, right_colour) = pair[1];
        if t <= right_stop {
            let span = right_stop - left_stop;
            let local_t = if span <= f32::EPSILON {
                0.0
            } else {
                ((t - left_stop) / span).clamp(0.0, 1.0)
            };
            return [
                lerp_u8(left_colour[0], right_colour[0], local_t),
                lerp_u8(left_colour[1], right_colour[1], local_t),
                lerp_u8(left_colour[2], right_colour[2], local_t),
            ];
        }
    }
    stops[stops.len() - 1].1
}

fn lerp_u8(left: u8, right: u8, t: f32) -> u8 {
    ((left as f32 + (right as f32 - left as f32) * t).round()).clamp(0.0, 255.0) as u8
}

fn build_image_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "Image media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let frame = load_image_media_frame(media)?;
    if frame.width != media.width || frame.height != media.height {
        return Err(format!(
            "Image media '{}' dimensions {}x{} do not match decoded image {}x{}",
            media.id, media.width, media.height, frame.width, frame.height
        ));
    }

    Ok(frame)
}

fn build_psd_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "Psd media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let source_path = local_media_source_path(&media.source, "Psd")?;
    let bytes = fs::read(&source_path).map_err(|error| {
        format!(
            "Invalid Psd media '{}': failed to read source: {error}",
            media.id
        )
    })?;
    let psd = psd_fast::parse_psd_fast(&bytes).map_err(|error| {
        format!(
            "Invalid Psd media '{}': failed to parse PSD source: {error}",
            media.id
        )
    })?;
    if psd.width != media.width || psd.height != media.height {
        return Err(format!(
            "Psd media '{}' dimensions {}x{} do not match decoded PSD {}x{}",
            media.id, media.width, media.height, psd.width, psd.height
        ));
    }
    psd_fast::composite_visible_psd_layers_with_active_layer_ids(&psd, &media.active_layer_ids)
        .map_err(|error| {
            format!(
                "Invalid Psd media '{}': failed to composite PSD source: {error}",
                media.id
            )
        })
}

fn load_image_media_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    let source_path = local_media_source_path(&media.source, "Image")?;
    if is_jpeg_source(&source_path) {
        return load_rgba_jpeg(&source_path).map_err(|error| {
            format!(
                "Invalid Image media '{}': failed to load JPEG source: {error:?}",
                media.id
            )
        });
    }

    load_rgba_png(&source_path).map_err(|error| {
        format!(
            "Invalid Image media '{}': failed to load PNG source: {error:?}",
            media.id
        )
    })
}

fn is_jpeg_source(source: &str) -> bool {
    let lower = source.to_ascii_lowercase();
    lower.ends_with(".jpg") || lower.ends_with(".jpeg")
}

fn local_media_source_path(source: &str, media_kind: &str) -> Result<String, String> {
    let without_query = strip_query_and_fragment(source);
    let Some(file_url_path) = without_query.strip_prefix("file://") else {
        if has_url_scheme(without_query) {
            return Err(format!(
                "Only local file paths or file URLs are supported for {media_kind} media, got '{source}'"
            ));
        }
        return Ok(without_query.to_string());
    };

    let local_path = if let Some(path) = file_url_path.strip_prefix("localhost/") {
        format!("/{path}")
    } else if file_url_path.starts_with('/') {
        file_url_path.to_string()
    } else {
        return Err(format!(
            "Only local file URLs are supported for {media_kind} media, got '{source}'"
        ));
    };

    percent_decode_utf8(&local_path).map_err(|error| {
        format!("Invalid percent-encoded Image media file URL '{source}': {error}")
    })
}

fn has_url_scheme(source: &str) -> bool {
    let Some(colon_index) = source.find(':') else {
        return false;
    };
    let scheme = &source[..colon_index];
    if scheme.len() == 1 && is_windows_drive_path(source) {
        return false;
    }
    let mut chars = scheme.chars();
    matches!(chars.next(), Some(first) if first.is_ascii_alphabetic())
        && chars.all(|value| value.is_ascii_alphanumeric() || matches!(value, '+' | '.' | '-'))
}

fn is_windows_drive_path(source: &str) -> bool {
    let bytes = source.as_bytes();
    bytes.len() >= 3
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
        && bytes[0].is_ascii_alphabetic()
}

fn strip_query_and_fragment(source: &str) -> &str {
    let query_index = source.find('?');
    let fragment_index = source.find('#');
    match (query_index, fragment_index) {
        (Some(query), Some(fragment)) => &source[..query.min(fragment)],
        (Some(query), None) => &source[..query],
        (None, Some(fragment)) => &source[..fragment],
        (None, None) => source,
    }
}

fn percent_decode_utf8(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("truncated percent escape".to_string());
            }
            let high =
                hex_value(bytes[index + 1]).ok_or_else(|| "invalid percent escape".to_string())?;
            let low =
                hex_value(bytes[index + 2]).ok_or_else(|| "invalid percent escape".to_string())?;
            decoded.push((high << 4) | low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }

    String::from_utf8(decoded).map_err(|error| error.to_string())
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn parse_hex_colour_source(source: &str) -> Result<[u8; 3], String> {
    let source = source.trim();
    let Some(hex) = source.strip_prefix('#') else {
        return Err("source must be a #rrggbb hex colour".to_string());
    };
    if hex.len() != 6 || !hex.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err("source must be a #rrggbb hex colour".to_string());
    }

    let red = u8::from_str_radix(&hex[0..2], 16)
        .map_err(|_| "source must be a #rrggbb hex colour".to_string())?;
    let green = u8::from_str_radix(&hex[2..4], 16)
        .map_err(|_| "source must be a #rrggbb hex colour".to_string())?;
    let blue = u8::from_str_radix(&hex[4..6], 16)
        .map_err(|_| "source must be a #rrggbb hex colour".to_string())?;

    Ok([red, green, blue])
}

#[cfg(not(unix))]
fn handle_native_render_shared_frame(
    id: u64,
    _params: Value,
    _state: &mut BackendState,
) -> RpcResponse {
    response_error(
        id,
        -32070,
        "render.nativeSharedFrame requires POSIX shared memory support",
    )
}

#[cfg(unix)]
fn handle_release_native_render_shared_frame(
    id: u64,
    params: Value,
    state: &mut BackendState,
) -> RpcResponse {
    let parsed = match serde_json::from_value::<NativeRenderReleaseSharedFrameParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid render.releaseNativeSharedFrame params: {error}"),
            );
        }
    };
    if parsed.memory_id.is_empty() {
        return response_error(id, -32602, "memoryId must not be empty");
    }

    let released = state
        .native_render_outputs
        .remove(&parsed.memory_id)
        .is_some();

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "released": released,
            "memoryId": parsed.memory_id,
        })),
        error: None,
    }
}

#[cfg(not(unix))]
fn handle_release_native_render_shared_frame(
    id: u64,
    _params: Value,
    _state: &mut BackendState,
) -> RpcResponse {
    response_error(
        id,
        -32070,
        "render.releaseNativeSharedFrame requires POSIX shared memory support",
    )
}

#[cfg(unix)]
fn read_native_render_source_frame(
    source: &NativeRenderSharedFrameSource,
) -> Result<RgbaFrame, String> {
    if source.slot_count == 0 {
        return Err("source slotCount must be greater than zero".to_string());
    }
    let descriptor = &source.frame.descriptor;
    validate_renderer_handoff_descriptor(descriptor)
        .map_err(|error| format!("Unsupported native render source descriptor: {error:?}"))?;
    if descriptor.slot_index >= source.slot_count {
        return Err("Native render source descriptor slotIndex is outside slotCount".to_string());
    }
    let expected_byte_len = u64::from(descriptor.stride_bytes)
        .checked_mul(u64::from(descriptor.height))
        .ok_or_else(|| "Native render source descriptor byte length overflows".to_string())?;
    if descriptor.byte_len != expected_byte_len {
        return Err(
            "Native render source descriptor byteLen does not match strideBytes * height"
                .to_string(),
        );
    }

    let frame_len = usize::try_from(descriptor.byte_len).map_err(|_| {
        format!(
            "Native render source byteLen overflows usize: {}",
            descriptor.byte_len
        )
    })?;
    let ring = PosixSharedRing::attach_with_retry_for_layout(
        &descriptor.memory_id,
        source.slot_count,
        frame_len,
        Duration::from_secs(1),
    )
    .map_err(|error| format!("Failed to attach native render source shared memory: {error:?}"))?;
    let mapped = ring
        .read_frame(source.frame.pts_frame)
        .map_err(|error| format!("Failed to read native render source frame: {error:?}"))?;
    let tight_rgba = tight_rgba_from_padded_descriptor(descriptor, &mapped.bytes)?;
    ring.release_frame(CopyOutState::GpuUploadFenceSignalled)
        .map_err(|error| format!("Failed to release native render source frame: {error:?}"))?;

    RgbaFrame::from_rgba8(descriptor.width, descriptor.height, tight_rgba)
        .map_err(|error| format!("Native render source frame is invalid: {error:?}"))
}

fn tight_rgba_from_padded_descriptor(
    descriptor: &FrameDescriptor,
    shared_frame: &[u8],
) -> Result<Vec<u8>, String> {
    let row_bytes = usize::try_from(descriptor.width)
        .ok()
        .and_then(|width| width.checked_mul(4))
        .ok_or_else(|| "Native render source row byte length overflows".to_string())?;
    let stride_bytes = usize::try_from(descriptor.stride_bytes)
        .map_err(|_| "Native render source strideBytes overflows usize".to_string())?;
    let height = usize::try_from(descriptor.height)
        .map_err(|_| "Native render source height overflows usize".to_string())?;
    if stride_bytes < row_bytes {
        return Err("Native render source strideBytes is smaller than tight RGBA row".to_string());
    }
    let expected_len = stride_bytes
        .checked_mul(height)
        .ok_or_else(|| "Native render source byte length overflows".to_string())?;
    if shared_frame.len() != expected_len {
        return Err(format!(
            "Native render source byte length mismatch: expected={expected_len}, actual={}",
            shared_frame.len()
        ));
    }

    let mut tight_rgba = Vec::with_capacity(
        row_bytes
            .checked_mul(height)
            .ok_or_else(|| "Native render tight frame byte length overflows".to_string())?,
    );
    for row in 0..height {
        let source_start = row
            .checked_mul(stride_bytes)
            .ok_or_else(|| "Native render source row offset overflows".to_string())?;
        tight_rgba.extend_from_slice(&shared_frame[source_start..source_start + row_bytes]);
    }

    Ok(tight_rgba)
}

fn validate_encode_shared_frame(
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
fn write_encode_shared_frame(
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
fn write_encode_shared_frame(
    _session: &mut EncodeSession,
    _parsed: &EncodeWriteFrameParams,
) -> Result<(usize, usize), String> {
    Err("Rust encode shared memory is unavailable on this platform".to_string())
}

fn start_encode_ffmpeg(
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

fn get_video_codec() -> &'static str {
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

fn write_rgba_frame_to_encoder(
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

fn handle_audio_waveform_samples(id: u64, params: Value) -> RpcResponse {
    let parsed = match serde_json::from_value::<AudioWaveformSamplesParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid audio.waveformSamples params: {error}"),
            );
        }
    };

    if parsed.source.trim().is_empty() {
        return response_error(id, -32602, "source must not be empty");
    }
    if parsed.sample_rate == 0 {
        return response_error(id, -32602, "sampleRate must be positive");
    }
    if parsed.max_samples == 0 {
        return response_error(id, -32602, "maxSamples must be positive");
    }

    let ffmpeg_path = parsed
        .ffmpeg_path
        .or_else(|| std::env::var("UXFD_FFMPEG_BIN").ok())
        .unwrap_or_else(|| "ffmpeg".to_string());
    let start_seconds = parsed.start_seconds.unwrap_or(0.0).max(0.0);
    let duration_seconds = parsed
        .duration_seconds
        .unwrap_or_else(|| parsed.max_samples as f64 / parsed.sample_rate as f64)
        .max(0.0);

    let mut command = Command::new(&ffmpeg_path);
    command
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-ss")
        .arg(format!("{start_seconds:.6}"))
        .arg("-t")
        .arg(format!("{duration_seconds:.6}"))
        .arg("-i")
        .arg(&parsed.source)
        .arg("-vn")
        .arg("-ac")
        .arg("1")
        .arg("-ar")
        .arg(parsed.sample_rate.to_string())
        .arg("-f")
        .arg("f32le")
        .arg("pipe:1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output = match command.output() {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32080,
                &format!("Failed to start audio waveform ffmpeg ({ffmpeg_path}): {error}"),
            );
        }
    };
    if !output.status.success() {
        return response_error(
            id,
            -32081,
            &format!(
                "audio waveform ffmpeg exited with code {:?}: {}",
                output.status.code(),
                String::from_utf8_lossy(&output.stderr).trim()
            ),
        );
    }

    let max_bytes = parsed.max_samples as usize * std::mem::size_of::<f32>();
    let mut samples = Vec::with_capacity(parsed.max_samples as usize);
    for chunk in output.stdout[..output.stdout.len().min(max_bytes)].chunks_exact(4) {
        samples.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
    }

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "source": parsed.source,
            "sampleRate": parsed.sample_rate,
            "sampleCount": samples.len(),
            "samples": samples,
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

fn handle_decode_stop(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
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

fn handle_decode_request_frame(
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

fn handle_decode_release_frame(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
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
type DecodeDataPlaneRing = PosixSharedRing;

#[cfg(not(unix))]
struct DecodeDataPlaneRing;

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

fn tight_rgba_byte_len(width: u32, height: u32) -> Result<usize, String> {
    u64::from(width)
        .checked_mul(u64::from(height))
        .and_then(|pixels| pixels.checked_mul(4))
        .and_then(|bytes| usize::try_from(bytes).ok())
        .ok_or_else(|| format!("decoded frame dimensions overflow: {width}x{height}"))
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

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(((bytes.len() + 2) / 3) * 4);
    let mut index = 0;
    while index < bytes.len() {
        let b0 = bytes[index];
        let b1 = bytes.get(index + 1).copied().unwrap_or(0);
        let b2 = bytes.get(index + 2).copied().unwrap_or(0);
        let triple = ((b0 as u32) << 16) | ((b1 as u32) << 8) | b2 as u32;

        output.push(TABLE[((triple >> 18) & 0x3f) as usize] as char);
        output.push(TABLE[((triple >> 12) & 0x3f) as usize] as char);
        if index + 1 < bytes.len() {
            output.push(TABLE[((triple >> 6) & 0x3f) as usize] as char);
        } else {
            output.push('=');
        }
        if index + 2 < bytes.len() {
            output.push(TABLE[(triple & 0x3f) as usize] as char);
        } else {
            output.push('=');
        }
        index += 3;
    }
    output
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
            "28",
            "-g",
            "1",
            "-keyint_min",
            "1",
            "-sc_threshold",
            "0",
            "-an",
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
