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

#[derive(Debug, Deserialize)]
struct GeneratedBarcodeSource {
    generator: String,
    data: String,
    minimum_bar_width: u32,
    horizontal_margin: u32,
    vertical_margin: u32,
    foreground_colour: String,
    background_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedPuzzlePieceSource {
    generator: String,
    size: u32,
    shape_variant: u32,
    connector_mode: String,
    fill_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedColourWheelSource {
    generator: String,
    radius: u32,
    saturation: f32,
    brightness: f32,
    ring_width_percent: f32,
    segment_count: u32,
}

#[derive(Debug, Deserialize)]
struct GeneratedGourdSource {
    generator: String,
    body_radius: u32,
    body_width: u32,
    waist_radius: u32,
    squash_percent: f32,
    repeat_count: u32,
    fill_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedGearSource {
    generator: String,
    outer_radius: u32,
    inner_radius_percent: f32,
    tooth_count: u32,
    tooth_depth_percent: f32,
    tooth_skew_percent: f32,
    fill_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedTrackBarSource {
    generator: String,
    track_values: Vec<f32>,
    track_ranges: Vec<[f32; 2]>,
    labels: Vec<String>,
    bar_colour: String,
    background_opacity: f32,
}

#[derive(Debug, Deserialize)]
struct GeneratedPieChartSource {
    generator: String,
    values: Vec<f32>,
    sort_mode: String,
    normalise_to_hundred: bool,
    label_mode: String,
    progress_percent: f32,
    stroke_width: f32,
    slice_colours: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct GeneratedHistogramSource {
    generator: String,
    bin_values: Vec<f32>,
    height_scale_percent: f32,
    line_width: f32,
    show_luminance: bool,
    show_red: bool,
    show_green: bool,
    show_blue: bool,
    channel_colours: Vec<String>,
    background_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedSunburstSource {
    generator: String,
    ray_count: u32,
    ray_coverage_percent: f32,
    rotation_offset_degrees: f32,
    centre_x_percent: f32,
    centre_y_percent: f32,
    motif_size: u32,
    motif_shape: String,
    ray_colour: String,
    background_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedCircularArrowSource {
    generator: String,
    radius: u32,
    line_width: u32,
    head_size: u32,
    angle_degrees: f32,
    centre_angle_degrees: f32,
    head_shape: String,
    show_tail_head: bool,
    flip_vertical: bool,
    flip_horizontal: bool,
    arrow_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedTriangleBracketSource {
    generator: String,
    bracket_width: u32,
    angle_degrees: f32,
    arm_length: u32,
    offset_distance: i32,
    bracket_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedTartanCheckSource {
    generator: String,
    tile_size: u32,
    blur_radius: u32,
    base_colour: String,
    stripe_colour_a: String,
    stripe_colour_b: String,
    line_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedHoundstoothSource {
    generator: String,
    pattern_size: u32,
    foreground_colour: String,
    background_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedYagasuriSource {
    generator: String,
    arrow_width: u32,
    arrow_height: u32,
    line_width: u32,
    staggered: bool,
    foreground_colour: String,
    background_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedPaperAirplaneSource {
    generator: String,
    body_length: u32,
    wing_width: u32,
    fold_height: u32,
    gap: u32,
    follow_motion_direction: bool,
    axis_mode: u32,
    fill_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedAsanohaPatternSource {
    generator: String,
    pattern_size: u32,
    line_width: u32,
    foreground_colour: String,
    background_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedFocusLinesPlusSource {
    generator: String,
    ray_width: f32,
    gap: f32,
    centre_radius: f32,
    rotation_degrees: f32,
    centre_x: f32,
    centre_y: f32,
    centre_jitter_percent: f32,
    seed: i64,
    keyframe_interval: u64,
    line_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedRandomLineExSource {
    generator: String,
    line_count: u32,
    line_width: f32,
    threshold: u32,
    noise_cell_size: u32,
    width_variance: f32,
    seed: i64,
    line_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedHologramSource {
    generator: String,
    tile_size: u32,
    rotation_degrees: f32,
    gradient_angle_degrees: f32,
    colour_mode: u32,
    tint_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedProtractorSource {
    generator: String,
    radius: u32,
    measured_angle_degrees: f32,
    tick_step_degrees: u32,
    major_tick_step_degrees: u32,
    decimal_places: u32,
    line_colour: String,
    text_colour: String,
    shadow_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedShakingPolygonSource {
    generator: String,
    line_width: u32,
    vertex_count: u32,
    fixed_diameter: u32,
    vertical_distortion_percent: f32,
    repeat_count: u32,
    repeat_frequency: u32,
    fill: bool,
    jitter_range: f32,
    jitter_interval: u32,
    stepped: bool,
    colour: String,
    seed: i64,
}

#[derive(Debug, Deserialize)]
struct GeneratedToneCurveSource {
    generator: String,
    grid_divisions: u32,
    line_width: u32,
    curve_points: Vec<f32>,
    curve_colour: String,
    grid_colour: String,
    background_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedGetColorDotsSource {
    generator: String,
    columns: u32,
    rows: u32,
    dot_size: f32,
    dot_shape: Option<String>,
    stroke_width: Option<f32>,
    size_influence: f32,
    luminance_influence: f32,
    hue_shift_degrees: f32,
    alternate_rows: bool,
    foreground_colour: String,
    secondary_colour: String,
    background_colour: String,
    seed: i64,
}

#[derive(Debug, Deserialize)]
struct GeneratedHksyCheckerGridSource {
    generator: String,
    pattern: Option<String>,
    cell_size: u32,
    line_width: u32,
    checker_enabled: bool,
    grid_enabled: bool,
    foreground_colour: String,
    secondary_colour: String,
    background_colour: String,
    palette_colours: Option<Vec<String>>,
    separate_interval: Option<u32>,
    separate_line_width: Option<u32>,
    anchor_points: Option<Vec<GeneratedHksyAnchorPoint>>,
    round_caps: Option<bool>,
    max_join_distance: Option<f32>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
struct GeneratedHksyAnchorPoint {
    x: f32,
    y: f32,
}

#[derive(Debug, Deserialize)]
struct GeneratedRegionFrameSource {
    generator: String,
    line_width: f32,
    #[serde(default = "default_region_frame_shape")]
    shape: String,
    #[serde(default = "default_region_frame_corner_cut")]
    corner_cut: f32,
    extra_width: f32,
    extra_height: f32,
    background_opacity: f32,
    frame_colour: String,
    background_colour: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedSimpleTubeSource {
    generator: String,
    radius: f32,
    depth: f32,
    segments: u32,
    rings: u32,
    twist_degrees: f32,
    random_amount: f32,
    stroke_width: f32,
    colour: String,
    secondary_colour: String,
    #[serde(default = "default_simple_tube_colour_pattern")]
    colour_pattern: String,
    #[serde(default)]
    fog_strength: f32,
    #[serde(default = "default_simple_tube_fog_colour")]
    fog_colour: String,
    seed: i64,
    torus: bool,
}

#[derive(Debug, Deserialize)]
struct GeneratedSphereDotsSource {
    generator: String,
    radius: f32,
    columns: u32,
    rows: u32,
    rotation_degrees: f32,
    offset_degrees: f32,
    luminance_influence: f32,
    point_size: f32,
    latitude_line_width: f32,
    colour: String,
    secondary_colour: String,
    seed: i64,
    plane_mode: bool,
}

fn default_simple_tube_colour_pattern() -> String {
    "single".to_string()
}

fn default_simple_tube_fog_colour() -> String {
    "#ffffff".to_string()
}

fn default_region_frame_shape() -> String {
    "rectangle".to_string()
}

fn default_region_frame_corner_cut() -> f32 {
    20.0
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
            MediaKind::GeneratedBarcode => build_generated_barcode_source_frame(media)?,
            MediaKind::GeneratedPuzzlePiece => build_generated_puzzle_piece_source_frame(media)?,
            MediaKind::GeneratedColourWheel => build_generated_colour_wheel_source_frame(media)?,
            MediaKind::GeneratedGourd => build_generated_gourd_source_frame(media)?,
            MediaKind::GeneratedGear => build_generated_gear_source_frame(media)?,
            MediaKind::GeneratedTrackBar => build_generated_track_bar_source_frame(media)?,
            MediaKind::GeneratedPieChart => build_generated_pie_chart_source_frame(media)?,
            MediaKind::GeneratedHistogram => build_generated_histogram_source_frame(media)?,
            MediaKind::GeneratedToneCurve => build_generated_tone_curve_source_frame(media)?,
            MediaKind::GeneratedGetColorDots => build_generated_getcolor_dots_source_frame(media)?,
            MediaKind::GeneratedHksyCheckerGrid => {
                build_generated_hksy_checker_grid_source_frame(media)?
            }
            MediaKind::GeneratedRegionFrame => build_generated_region_frame_source_frame(media)?,
            MediaKind::GeneratedSimpleTube => build_generated_simple_tube_source_frame(media)?,
            MediaKind::GeneratedSphereDots => build_generated_sphere_dots_source_frame(media)?,
            MediaKind::GeneratedSunburst => build_generated_sunburst_source_frame(media)?,
            MediaKind::GeneratedCircularArrow => {
                build_generated_circular_arrow_source_frame(media)?
            }
            MediaKind::GeneratedTriangleBracket => {
                build_generated_triangle_bracket_source_frame(media)?
            }
            MediaKind::GeneratedTartanCheck => build_generated_tartan_check_source_frame(media)?,
            MediaKind::GeneratedHoundstooth => build_generated_houndstooth_source_frame(media)?,
            MediaKind::GeneratedYagasuri => build_generated_yagasuri_source_frame(media)?,
            MediaKind::GeneratedPaperAirplane => {
                build_generated_paper_airplane_source_frame(media)?
            }
            MediaKind::GeneratedAsanohaPattern => {
                build_generated_asanoha_pattern_source_frame(media)?
            }
            MediaKind::GeneratedFocusLinesPlus => build_generated_focus_lines_plus_source_frame(
                media,
                source_frame_for_media(snapshot, &media.id),
            )?,
            MediaKind::GeneratedRandomLineEx => build_generated_random_line_ex_source_frame(media)?,
            MediaKind::GeneratedHologram => build_generated_hologram_source_frame(media)?,
            MediaKind::GeneratedProtractor => build_generated_protractor_source_frame(media)?,
            MediaKind::GeneratedShakingPolygon => build_generated_shaking_polygon_source_frame(
                media,
                source_frame_for_media(snapshot, &media.id),
            )?,
            MediaKind::Image => build_image_source_frame(media)?,
            MediaKind::Psd => build_psd_source_frame(media)?,
            MediaKind::GeneratedAudioWaveform | MediaKind::GeneratedAudioSphere => continue,
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

fn build_generated_barcode_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedBarcode media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let barcode: GeneratedBarcodeSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedBarcode media '{}': {error}", media.id))?;
    validate_generated_barcode_source(&barcode)
        .map_err(|message| format!("Invalid GeneratedBarcode media '{}': {message}", media.id))?;
    let [fg_red, fg_green, fg_blue] = parse_hex_colour_source(&barcode.foreground_colour)
        .map_err(|message| format!("Invalid GeneratedBarcode media '{}': {message}", media.id))?;
    let [bg_red, bg_green, bg_blue] = parse_hex_colour_source(&barcode.background_colour)
        .map_err(|message| format!("Invalid GeneratedBarcode media '{}': {message}", media.id))?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedBarcode media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedBarcode media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    for chunk in pixels.chunks_exact_mut(4) {
        chunk.copy_from_slice(&[bg_red, bg_green, bg_blue, 255]);
    }

    let left = barcode.horizontal_margin.min(media.width);
    let right = media
        .width
        .saturating_sub(barcode.horizontal_margin.min(media.width));
    let top = barcode.vertical_margin.min(media.height);
    let bottom = media
        .height
        .saturating_sub(barcode.vertical_margin.min(media.height));
    if right <= left || bottom <= top {
        return RgbaFrame::from_rgba8(media.width, media.height, pixels)
            .map_err(|error| format!("GeneratedBarcode media frame is invalid: {error:?}"));
    }

    let pattern = barcode_bar_pattern(&barcode.data);
    let mut x = left;
    let mut index = 0_usize;
    while x < right {
        let width_units = pattern[index % pattern.len()];
        let bar_width = barcode
            .minimum_bar_width
            .saturating_mul(width_units as u32)
            .max(1);
        let draw_foreground = index % 2 == 0;
        let end_x = (x.saturating_add(bar_width)).min(right);
        if draw_foreground {
            for py in top..bottom {
                for px in x..end_x {
                    write_particle_pixel(
                        &mut pixels,
                        media.width,
                        media.height,
                        px as i32,
                        py as i32,
                        [fg_red, fg_green, fg_blue, 255],
                    );
                }
            }
        }
        x = end_x;
        index += 1;
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedBarcode media frame is invalid: {error:?}"))
}

fn build_generated_puzzle_piece_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedPuzzlePiece media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let puzzle: GeneratedPuzzlePieceSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedPuzzlePiece media '{}': {error}", media.id))?;
    validate_generated_puzzle_piece_source(&puzzle).map_err(|message| {
        format!(
            "Invalid GeneratedPuzzlePiece media '{}': {message}",
            media.id
        )
    })?;
    let [red, green, blue] = parse_hex_colour_source(&puzzle.fill_colour).map_err(|message| {
        format!(
            "Invalid GeneratedPuzzlePiece media '{}': {message}",
            media.id
        )
    })?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedPuzzlePiece media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedPuzzlePiece media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    let centre_x = media.width as f32 / 2.0;
    let centre_y = media.height as f32 / 2.0;
    let half = (puzzle.size as f32 / 2.0).min(media.width.min(media.height) as f32 / 2.0);
    let knob_radius = (puzzle.size as f32 * 0.18).max(2.0);
    let connector_distance = half;
    let connectors = puzzle_piece_connectors(puzzle.shape_variant);

    for y in 0..media.height {
        for x in 0..media.width {
            let px = x as f32 + 0.5 - centre_x;
            let py = y as f32 + 0.5 - centre_y;
            let mut inside = px.abs() <= half && py.abs() <= half;

            for (direction, enabled) in connectors {
                if !enabled {
                    continue;
                }
                let (cx, cy) = match direction {
                    0 => (0.0, -connector_distance),
                    1 => (connector_distance, 0.0),
                    2 => (0.0, connector_distance),
                    _ => (-connector_distance, 0.0),
                };
                let distance = ((px - cx).powi(2) + (py - cy).powi(2)).sqrt();
                let in_knob = distance <= knob_radius;
                if puzzle.connector_mode == "convex" {
                    inside = inside || in_knob;
                } else if in_knob {
                    inside = false;
                }
            }

            if inside {
                write_particle_pixel(
                    &mut pixels,
                    media.width,
                    media.height,
                    x as i32,
                    y as i32,
                    [red, green, blue, 255],
                );
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedPuzzlePiece media frame is invalid: {error:?}"))
}

fn build_generated_colour_wheel_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedColourWheel media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let wheel: GeneratedColourWheelSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedColourWheel media '{}': {error}", media.id))?;
    validate_generated_colour_wheel_source(&wheel).map_err(|message| {
        format!(
            "Invalid GeneratedColourWheel media '{}': {message}",
            media.id
        )
    })?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedColourWheel media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedColourWheel media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    let centre_x = media.width as f32 / 2.0;
    let centre_y = media.height as f32 / 2.0;
    let outer_radius = (wheel.radius as f32).min(media.width.min(media.height) as f32 / 2.0);
    let inner_radius = outer_radius * (1.0 - wheel.ring_width_percent * 0.01).clamp(0.0, 0.99);
    let saturation = (wheel.saturation * 0.01).clamp(0.0, 1.0);
    let brightness = (wheel.brightness * 0.01).clamp(0.0, 1.0);
    let segment_count = wheel.segment_count.max(3) as f32;

    for y in 0..media.height {
        for x in 0..media.width {
            let px = x as f32 + 0.5 - centre_x;
            let py = y as f32 + 0.5 - centre_y;
            let radius = (px * px + py * py).sqrt();
            if radius < inner_radius || radius > outer_radius {
                continue;
            }

            let angle = py.atan2(px).rem_euclid(std::f32::consts::TAU);
            let segment = (angle / std::f32::consts::TAU * segment_count).floor();
            let hue = segment / segment_count * 360.0;
            let [red, green, blue] = hsv_to_rgb8(hue, saturation, brightness);
            write_particle_pixel(
                &mut pixels,
                media.width,
                media.height,
                x as i32,
                y as i32,
                [red, green, blue, 255],
            );
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedColourWheel media frame is invalid: {error:?}"))
}

fn build_generated_gourd_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedGourd media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let gourd: GeneratedGourdSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedGourd media '{}': {error}", media.id))?;
    validate_generated_gourd_source(&gourd)
        .map_err(|message| format!("Invalid GeneratedGourd media '{}': {message}", media.id))?;
    let [red, green, blue] = parse_hex_colour_source(&gourd.fill_colour)
        .map_err(|message| format!("Invalid GeneratedGourd media '{}': {message}", media.id))?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedGourd media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedGourd media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    let radius = (gourd.body_radius as f32 * 0.5).max(1.0);
    let half_width = (gourd.body_width as f32 * 0.5).max(radius);
    let waist = (gourd.waist_radius as f32 * 0.5).min(radius);
    let aspect = (1.0 - gourd.squash_percent * 0.01).clamp(0.05, 1.0);
    let fit_width = media.width as f32 / (half_width * 2.0);
    let fit_height = media.height as f32 / (radius * 2.0);
    let scale = fit_width.min(fit_height).max(0.001) * 0.9;
    let centre_x = media.width as f32 / 2.0;
    let centre_y = media.height as f32 / 2.0;
    let repeats = gourd.repeat_count.max(1);

    for y in 0..media.height {
        for x in 0..media.width {
            let local_x = (x as f32 + 0.5 - centre_x) / scale;
            let local_y = (y as f32 + 0.5 - centre_y) / scale;
            let mut inside = false;
            for index in 0..repeats {
                let angle = index as f32 / repeats as f32 * std::f32::consts::PI;
                let (sin, cos) = angle.sin_cos();
                let rotated_x = local_x * cos + local_y * sin;
                let rotated_y = -local_x * sin + local_y * cos;
                if point_inside_gourd(rotated_x, rotated_y, radius, half_width, waist, aspect) {
                    inside = true;
                    break;
                }
            }
            if inside {
                write_particle_pixel(
                    &mut pixels,
                    media.width,
                    media.height,
                    x as i32,
                    y as i32,
                    [red, green, blue, 255],
                );
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedGourd media frame is invalid: {error:?}"))
}

fn point_inside_gourd(
    x: f32,
    y: f32,
    radius: f32,
    half_width: f32,
    waist: f32,
    aspect: f32,
) -> bool {
    let x_abs = x.abs();
    if x_abs > half_width {
        return false;
    }

    let radius = radius.min(half_width).max(1.0);
    let waist = waist.min(radius);
    let m = half_width - radius;
    let boundary = if (radius - waist).abs() < f32::EPSILON {
        radius * aspect
    } else {
        let r2 = 0.5 * (m * m / (radius - waist) - radius - waist);
        let x0 = if (radius + r2).abs() > f32::EPSILON {
            m * r2 / (radius + r2)
        } else {
            0.0
        };
        if r2 > 0.0 && x0 > 0.0 && x_abs <= x0 {
            let inner = r2 * r2 - x_abs * x_abs;
            if inner < 0.0 {
                return false;
            }
            (waist + r2 - inner.sqrt()) * aspect
        } else {
            let inner = radius * radius - (x_abs - m) * (x_abs - m);
            if inner < 0.0 {
                return false;
            }
            inner.sqrt() * aspect
        }
    };

    y.abs() <= boundary
}

fn build_generated_gear_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedGear media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let gear: GeneratedGearSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedGear media '{}': {error}", media.id))?;
    validate_generated_gear_source(&gear)
        .map_err(|message| format!("Invalid GeneratedGear media '{}': {message}", media.id))?;
    let [red, green, blue] = parse_hex_colour_source(&gear.fill_colour)
        .map_err(|message| format!("Invalid GeneratedGear media '{}': {message}", media.id))?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedGear media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedGear media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    let centre_x = media.width as f32 / 2.0;
    let centre_y = media.height as f32 / 2.0;
    let outer_radius = (gear.outer_radius as f32).min(media.width.min(media.height) as f32 / 2.0);
    let inner_radius = outer_radius * (gear.inner_radius_percent * 0.01).clamp(0.0, 0.99);
    let root_radius = outer_radius * (1.0 - gear.tooth_depth_percent * 0.01).clamp(0.05, 0.99);
    let tooth_count = gear.tooth_count.max(3) as f32;
    let skew = (gear.tooth_skew_percent * 0.005).clamp(-0.5, 0.5);

    for y in 0..media.height {
        for x in 0..media.width {
            let px = x as f32 + 0.5 - centre_x;
            let py = y as f32 + 0.5 - centre_y;
            let radius = (px * px + py * py).sqrt();
            if radius < inner_radius || radius > outer_radius {
                continue;
            }

            let angle = py.atan2(px).rem_euclid(std::f32::consts::TAU);
            let tooth_phase = (angle / std::f32::consts::TAU * tooth_count + skew).fract();
            let tooth_top = trapezoid_tooth_factor(tooth_phase);
            let boundary = root_radius + (outer_radius - root_radius) * tooth_top;
            if radius <= boundary {
                write_particle_pixel(
                    &mut pixels,
                    media.width,
                    media.height,
                    x as i32,
                    y as i32,
                    [red, green, blue, 255],
                );
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedGear media frame is invalid: {error:?}"))
}

fn trapezoid_tooth_factor(phase: f32) -> f32 {
    let phase = phase.rem_euclid(1.0);
    if phase < 0.18 {
        phase / 0.18
    } else if phase < 0.5 {
        1.0
    } else if phase < 0.68 {
        1.0 - (phase - 0.5) / 0.18
    } else {
        0.0
    }
}

fn build_generated_track_bar_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedTrackBar media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let track_bar: GeneratedTrackBarSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedTrackBar media '{}': {error}", media.id))?;
    validate_generated_track_bar_source(&track_bar)
        .map_err(|message| format!("Invalid GeneratedTrackBar media '{}': {message}", media.id))?;
    let [red, green, blue] = parse_hex_colour_source(&track_bar.bar_colour)
        .map_err(|message| format!("Invalid GeneratedTrackBar media '{}': {message}", media.id))?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedTrackBar media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedTrackBar media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    let margin = (media.width.min(media.height) as f32 * 0.066)
        .max(6.0)
        .round() as i32;
    let row_count = track_bar.track_values.len() as i32;
    let gap = (media.height as f32 * 0.06).max(4.0).round() as i32;
    let row_height =
        ((media.height as i32 - margin * 2 - gap * (row_count - 1)) / row_count).max(4);
    let label_width = (media.width as f32 * 0.28).round() as i32;
    let bar_left = margin + label_width;
    let bar_right = media.width as i32 - margin;
    let bar_width = (bar_right - bar_left).max(1);
    let bg_alpha = (track_bar.background_opacity.clamp(0.0, 1.0) * 255.0).round() as u8;

    for index in 0..track_bar.track_values.len() {
        let top = margin + index as i32 * (row_height + gap);
        let bottom = (top + row_height).min(media.height as i32 - margin);
        fill_rect_rgba(
            &mut pixels,
            media.width,
            media.height,
            margin,
            top,
            media.width as i32 - margin,
            bottom,
            [red, green, blue, bg_alpha],
        );

        let value = track_bar.track_values[index];
        let [min, max] = track_bar.track_ranges[index];
        let progress = ((value - min) / (max - min)).clamp(0.0, 1.0);
        let fill_right = bar_left + (bar_width as f32 * progress).round() as i32;
        fill_rect_rgba(
            &mut pixels,
            media.width,
            media.height,
            bar_left,
            top + 2,
            fill_right.max(bar_left + 1),
            bottom - 2,
            [red, green, blue, 255],
        );
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedTrackBar media frame is invalid: {error:?}"))
}

fn build_generated_pie_chart_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedPieChart media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let pie_chart: GeneratedPieChartSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedPieChart media '{}': {error}", media.id))?;
    validate_generated_pie_chart_source(&pie_chart)
        .map_err(|message| format!("Invalid GeneratedPieChart media '{}': {message}", media.id))?;

    let mut values = pie_chart.values.clone();
    match pie_chart.sort_mode.as_str() {
        "descending" => values
            .sort_by(|left, right| right.partial_cmp(left).unwrap_or(std::cmp::Ordering::Equal)),
        "ascending" => values
            .sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal)),
        _ => {}
    }
    let total = if pie_chart.normalise_to_hundred {
        values.iter().sum::<f32>()
    } else {
        100.0
    };
    if !total.is_finite() || total <= 0.0 {
        return Err(format!(
            "Invalid GeneratedPieChart media '{}': values must produce a positive total",
            media.id
        ));
    }

    let colours = pie_chart
        .slice_colours
        .iter()
        .map(|colour| {
            parse_hex_colour_source(colour).map_err(|message| {
                format!("Invalid GeneratedPieChart media '{}': {message}", media.id)
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedPieChart media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedPieChart media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    let centre_x = (media.width as f32 - 1.0) * 0.5;
    let centre_y = (media.height as f32 - 1.0) * 0.5;
    let outer_radius = media.width.min(media.height) as f32 * 0.5 - 1.0;
    let stroke_width = pie_chart.stroke_width.min(outer_radius).max(1.0);
    let inner_radius = (outer_radius - stroke_width).max(0.0);
    let progress_radians =
        (pie_chart.progress_percent.clamp(0.0, 100.0) * 0.01) * std::f32::consts::TAU;

    for y in 0..media.height {
        for x in 0..media.width {
            let dx = x as f32 - centre_x;
            let dy = y as f32 - centre_y;
            let radius = (dx * dx + dy * dy).sqrt();
            if radius < inner_radius || radius > outer_radius {
                continue;
            }
            let mut angle = dy.atan2(dx) + std::f32::consts::FRAC_PI_2;
            if angle < 0.0 {
                angle += std::f32::consts::TAU;
            }
            if angle > progress_radians {
                continue;
            }

            let mut cumulative = 0.0_f32;
            let mut colour_index = values.len().saturating_sub(1);
            for (index, value) in values.iter().enumerate() {
                cumulative += (*value / total) * std::f32::consts::TAU;
                if angle <= cumulative {
                    colour_index = index;
                    break;
                }
            }
            let [red, green, blue] = colours[colour_index % colours.len()];
            let offset = ((y as usize * media.width as usize + x as usize) * 4) as usize;
            pixels[offset..offset + 4].copy_from_slice(&[red, green, blue, 255]);
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedPieChart media frame is invalid: {error:?}"))
}

fn build_generated_histogram_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedHistogram media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let histogram: GeneratedHistogramSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedHistogram media '{}': {error}", media.id))?;
    validate_generated_histogram_source(&histogram)
        .map_err(|message| format!("Invalid GeneratedHistogram media '{}': {message}", media.id))?;

    let background = parse_hex_colour_source(&histogram.background_colour)
        .map_err(|message| format!("Invalid GeneratedHistogram media '{}': {message}", media.id))?;
    let colours = histogram
        .channel_colours
        .iter()
        .map(|colour| {
            parse_hex_colour_source(colour).map_err(|message| {
                format!("Invalid GeneratedHistogram media '{}': {message}", media.id)
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedHistogram media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedHistogram media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    fill_rect_rgba(
        &mut pixels,
        media.width,
        media.height,
        0,
        0,
        media.width as i32,
        media.height as i32,
        [background[0], background[1], background[2], 255],
    );

    let enabled_channels = [
        histogram.show_luminance,
        histogram.show_red,
        histogram.show_green,
        histogram.show_blue,
    ];
    let enabled_count = enabled_channels
        .iter()
        .filter(|enabled| **enabled)
        .count()
        .max(1) as i32;
    let bin_count = histogram.bin_values.len() as i32;
    let bin_width = (media.width as f32 / bin_count as f32).max(1.0);
    let line_width = histogram.line_width.max(1.0).round() as i32;
    let height_scale = histogram.height_scale_percent.clamp(1.0, 1000.0) * 0.01;
    let channel_height_scales = [1.0_f32, 0.82_f32, 0.66_f32, 0.5_f32];

    for (bin_index, value) in histogram.bin_values.iter().enumerate() {
        let bin_left = (bin_index as f32 * bin_width).round() as i32;
        let bin_right = ((bin_index as f32 + 1.0) * bin_width).round() as i32;
        let channel_width = ((bin_right - bin_left).max(1) / enabled_count).max(1);
        let mut channel_slot = 0_i32;
        for channel_index in 0..4 {
            if !enabled_channels[channel_index] {
                continue;
            }
            let scaled_value =
                (value * height_scale * channel_height_scales[channel_index]).clamp(0.0, 1.0);
            let bar_height = (media.height as f32 * scaled_value).round() as i32;
            let left = bin_left + channel_slot * channel_width;
            let right = (left + channel_width.max(line_width)).min(bin_right.max(left + 1));
            let top = media.height as i32 - bar_height.max(1);
            let [red, green, blue] = colours[channel_index];
            fill_rect_rgba(
                &mut pixels,
                media.width,
                media.height,
                left,
                top,
                right,
                media.height as i32,
                [red, green, blue, 255],
            );
            channel_slot += 1;
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedHistogram media frame is invalid: {error:?}"))
}

fn build_generated_sunburst_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedSunburst media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let sunburst: GeneratedSunburstSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedSunburst media '{}': {error}", media.id))?;
    validate_generated_sunburst_source(&sunburst)
        .map_err(|message| format!("Invalid GeneratedSunburst media '{}': {message}", media.id))?;

    let ray_colour = parse_hex_colour_source(&sunburst.ray_colour)
        .map_err(|message| format!("Invalid GeneratedSunburst media '{}': {message}", media.id))?;
    let background_colour = parse_hex_colour_source(&sunburst.background_colour)
        .map_err(|message| format!("Invalid GeneratedSunburst media '{}': {message}", media.id))?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedSunburst media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedSunburst media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    fill_rect_rgba(
        &mut pixels,
        media.width,
        media.height,
        0,
        0,
        media.width as i32,
        media.height as i32,
        [
            background_colour[0],
            background_colour[1],
            background_colour[2],
            255,
        ],
    );

    let centre_x = media.width as f32 * sunburst.centre_x_percent * 0.01;
    let centre_y = media.height as f32 * sunburst.centre_y_percent * 0.01;
    let ray_count = sunburst.ray_count.max(1) as f32;
    let coverage = (sunburst.ray_coverage_percent * 0.01).clamp(0.0, 1.0);
    let rotation = sunburst.rotation_offset_degrees.to_radians() - std::f32::consts::FRAC_PI_2;
    let motif_radius = sunburst.motif_size as f32 * 0.5;

    for y in 0..media.height {
        for x in 0..media.width {
            let dx = x as f32 - centre_x;
            let dy = y as f32 - centre_y;
            let angle = (dy.atan2(dx) - rotation).rem_euclid(std::f32::consts::TAU);
            let phase = ((angle / std::f32::consts::TAU) * ray_count).fract();
            let in_ray = phase <= coverage;
            let in_motif = if sunburst.motif_shape == "rect" {
                dx.abs() <= motif_radius && dy.abs() <= motif_radius
            } else {
                (dx * dx + dy * dy).sqrt() <= motif_radius
            };
            if in_ray || in_motif {
                let offset = ((y as usize * media.width as usize + x as usize) * 4) as usize;
                pixels[offset..offset + 4].copy_from_slice(&[
                    ray_colour[0],
                    ray_colour[1],
                    ray_colour[2],
                    255,
                ]);
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedSunburst media frame is invalid: {error:?}"))
}

fn build_generated_circular_arrow_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedCircularArrow media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let arrow: GeneratedCircularArrowSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedCircularArrow media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_circular_arrow_source(&arrow).map_err(|message| {
        format!(
            "Invalid GeneratedCircularArrow media '{}': {message}",
            media.id
        )
    })?;

    let colour = parse_hex_colour_source(&arrow.arrow_colour).map_err(|message| {
        format!(
            "Invalid GeneratedCircularArrow media '{}': {message}",
            media.id
        )
    })?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedCircularArrow media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedCircularArrow media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    let centre_x = media.width as f32 * 0.5;
    let centre_y = media.height as f32 * 0.5;
    let radius = (arrow.radius as f32)
        .min(media.width.min(media.height) as f32 * 0.5 - 1.0)
        .max(1.0);
    let half_line = (arrow.line_width as f32 * 0.5).max(0.5);
    let span = arrow
        .angle_degrees
        .to_radians()
        .clamp(0.0, std::f32::consts::TAU);
    let centre_angle = arrow.centre_angle_degrees.to_radians() - std::f32::consts::FRAC_PI_2;
    let start_angle = centre_angle - span * 0.5;
    let end_angle = centre_angle + span * 0.5;
    let start_point = point_on_circle(centre_x, centre_y, radius, start_angle);
    let end_point = point_on_circle(centre_x, centre_y, radius, end_angle);
    let end_head = circular_arrow_head(end_point, end_angle, arrow.head_size as f32);
    let start_head = circular_arrow_head(
        start_point,
        start_angle + std::f32::consts::PI,
        arrow.head_size as f32,
    );
    let head_radius = arrow.head_size as f32 * 0.5;

    for y in 0..media.height {
        for x in 0..media.width {
            let sample_x = if arrow.flip_horizontal {
                media.width as f32 - 1.0 - x as f32
            } else {
                x as f32
            };
            let sample_y = if arrow.flip_vertical {
                media.height as f32 - 1.0 - y as f32
            } else {
                y as f32
            };
            let dx = sample_x + 0.5 - centre_x;
            let dy = sample_y + 0.5 - centre_y;
            let distance = (dx * dx + dy * dy).sqrt();
            let angle = dy.atan2(dx);
            let in_arc = span > 0.0
                && (distance - radius).abs() <= half_line
                && circular_arrow_angle_in_span(angle, start_angle, span);
            let in_end_head = if arrow.head_shape == "circle" {
                distance_to_point(sample_x + 0.5, sample_y + 0.5, end_point.0, end_point.1)
                    <= head_radius
            } else {
                point_in_triangle(sample_x + 0.5, sample_y + 0.5, end_head)
            };
            let in_start_head = arrow.show_tail_head
                && if arrow.head_shape == "circle" {
                    distance_to_point(sample_x + 0.5, sample_y + 0.5, start_point.0, start_point.1)
                        <= head_radius
                } else {
                    point_in_triangle(sample_x + 0.5, sample_y + 0.5, start_head)
                };
            if in_arc || in_end_head || in_start_head {
                let offset = ((y as usize * media.width as usize + x as usize) * 4) as usize;
                pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedCircularArrow media frame is invalid: {error:?}"))
}

fn build_generated_triangle_bracket_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedTriangleBracket media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let bracket: GeneratedTriangleBracketSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedTriangleBracket media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_triangle_bracket_source(&bracket).map_err(|message| {
        format!(
            "Invalid GeneratedTriangleBracket media '{}': {message}",
            media.id
        )
    })?;

    let colour = parse_hex_colour_source(&bracket.bracket_colour).map_err(|message| {
        format!(
            "Invalid GeneratedTriangleBracket media '{}': {message}",
            media.id
        )
    })?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedTriangleBracket media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedTriangleBracket media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    let half_height = bracket.bracket_width as f32 * 0.5;
    let half_angle = (bracket.angle_degrees * 0.5).to_radians();
    let angle_inset = if half_angle.tan().abs() <= f32::EPSILON {
        0.0
    } else {
        half_height / half_angle.tan()
    };
    let total_width = bracket.arm_length as f32 + angle_inset.max(0.0);
    let centre_x = media.width as f32 * 0.5 + bracket.offset_distance as f32;
    let centre_y = media.height as f32 * 0.5;
    let tip = (centre_x - total_width * 0.5, centre_y);
    let right_x = tip.0 + bracket.arm_length as f32;
    let top = (right_x, centre_y - half_height);
    let bottom = (right_x, centre_y + half_height);
    let stroke_width = (bracket.bracket_width as f32 * 0.08).max(2.0);

    for y in 0..media.height {
        for x in 0..media.width {
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;
            let top_distance = distance_to_segment(px, py, tip, top);
            let bottom_distance = distance_to_segment(px, py, tip, bottom);
            if top_distance <= stroke_width || bottom_distance <= stroke_width {
                let offset = ((y as usize * media.width as usize + x as usize) * 4) as usize;
                pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedTriangleBracket media frame is invalid: {error:?}"))
}

fn build_generated_tartan_check_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedTartanCheck media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let tartan: GeneratedTartanCheckSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedTartanCheck media '{}': {error}", media.id))?;
    validate_generated_tartan_check_source(&tartan).map_err(|message| {
        format!(
            "Invalid GeneratedTartanCheck media '{}': {message}",
            media.id
        )
    })?;

    let base = parse_hex_colour_source(&tartan.base_colour).map_err(|message| {
        format!(
            "Invalid GeneratedTartanCheck media '{}': {message}",
            media.id
        )
    })?;
    let stripe_a = parse_hex_colour_source(&tartan.stripe_colour_a).map_err(|message| {
        format!(
            "Invalid GeneratedTartanCheck media '{}': {message}",
            media.id
        )
    })?;
    let stripe_b = parse_hex_colour_source(&tartan.stripe_colour_b).map_err(|message| {
        format!(
            "Invalid GeneratedTartanCheck media '{}': {message}",
            media.id
        )
    })?;
    let line = parse_hex_colour_source(&tartan.line_colour).map_err(|message| {
        format!(
            "Invalid GeneratedTartanCheck media '{}': {message}",
            media.id
        )
    })?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedTartanCheck media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedTartanCheck media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let tile = tartan.tile_size.max(10);
    let red_band = (tile / 4).max(2);
    let yellow_band = (tile / 5).max(2);
    let line_width = (tartan.blur_radius + 1).min(tile / 8).max(1);

    for y in 0..media.height {
        for x in 0..media.width {
            let tx = x % tile;
            let ty = y % tile;
            let mut colour = base;
            if tx < red_band || ty >= tile.saturating_sub(red_band) {
                colour = stripe_a;
            }
            if (tx >= tile / 2 && tx < tile / 2 + yellow_band)
                || (ty >= tile / 3 && ty < tile / 3 + yellow_band)
            {
                colour = blend_rgb8(colour, stripe_b, 0.75);
            }
            if tx < line_width
                || ty < line_width
                || (tx >= tile / 2 && tx < tile / 2 + line_width)
                || (ty >= tile / 2 && ty < tile / 2 + line_width)
            {
                colour = line;
            }
            let offset = ((y as usize * media.width as usize + x as usize) * 4) as usize;
            pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedTartanCheck media frame is invalid: {error:?}"))
}

fn blend_rgb8(left: [u8; 3], right: [u8; 3], right_weight: f32) -> [u8; 3] {
    let weight = right_weight.clamp(0.0, 1.0);
    let left_weight = 1.0 - weight;
    [
        (left[0] as f32 * left_weight + right[0] as f32 * weight).round() as u8,
        (left[1] as f32 * left_weight + right[1] as f32 * weight).round() as u8,
        (left[2] as f32 * left_weight + right[2] as f32 * weight).round() as u8,
    ]
}

fn build_generated_houndstooth_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedHoundstooth media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let houndstooth: GeneratedHoundstoothSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedHoundstooth media '{}': {error}", media.id))?;
    validate_generated_houndstooth_source(&houndstooth).map_err(|message| {
        format!(
            "Invalid GeneratedHoundstooth media '{}': {message}",
            media.id
        )
    })?;

    let foreground =
        parse_hex_colour_source(&houndstooth.foreground_colour).map_err(|message| {
            format!(
                "Invalid GeneratedHoundstooth media '{}': {message}",
                media.id
            )
        })?;
    let background =
        parse_hex_colour_source(&houndstooth.background_colour).map_err(|message| {
            format!(
                "Invalid GeneratedHoundstooth media '{}': {message}",
                media.id
            )
        })?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedHoundstooth media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedHoundstooth media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let tooth = houndstooth.pattern_size.max(10);
    let tile = tooth * 2;
    let half = tooth as f32;

    for y in 0..media.height {
        for x in 0..media.width {
            let lx = (x % tile) as f32;
            let ly = (y % tile) as f32;
            let upper_left = lx < half && ly < half;
            let lower_right = lx >= half && ly >= half;
            let notch_a = lx >= half && ly < half && ly < (lx - half) * 0.35;
            let notch_b = lx < half && ly >= half && (ly - half) > half - lx * 0.35;
            let use_foreground = upper_left || lower_right || notch_a || notch_b;
            let colour = if use_foreground {
                foreground
            } else {
                background
            };
            let offset = (y as usize * media.width as usize + x as usize) * 4;
            pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedHoundstooth media frame is invalid: {error:?}"))
}

fn build_generated_yagasuri_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedYagasuri media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let yagasuri: GeneratedYagasuriSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedYagasuri media '{}': {error}", media.id))?;
    validate_generated_yagasuri_source(&yagasuri)
        .map_err(|message| format!("Invalid GeneratedYagasuri media '{}': {message}", media.id))?;

    let foreground = parse_hex_colour_source(&yagasuri.foreground_colour)
        .map_err(|message| format!("Invalid GeneratedYagasuri media '{}': {message}", media.id))?;
    let background = parse_hex_colour_source(&yagasuri.background_colour)
        .map_err(|message| format!("Invalid GeneratedYagasuri media '{}': {message}", media.id))?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedYagasuri media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedYagasuri media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let arrow_width = yagasuri.arrow_width.max(1) as f32;
    let arrow_height = yagasuri.arrow_height.max(1) as f32;
    let line_width = yagasuri.line_width as f32;
    let period = (arrow_width * 4.0 + line_width * 2.0).max(1.0);
    let row_height = arrow_height.max(1.0);

    for y in 0..media.height {
        let row = (y as f32 / row_height).floor() as u32;
        let row_y = (y as f32).rem_euclid(row_height);
        let row_shift = if yagasuri.staggered && row % 2 == 1 {
            arrow_width * 2.0 + line_width
        } else {
            0.0
        };
        let diagonal = row_y / row_height * arrow_width;
        for x in 0..media.width {
            let local_x = ((x as f32 - row_shift).rem_euclid(period) + period).rem_euclid(period);
            let left_start = (arrow_width - diagonal).max(0.0);
            let left_end = left_start + arrow_width;
            let right_start = arrow_width + line_width + diagonal;
            let right_end = right_start + arrow_width;
            let line_start = arrow_width * 2.0 + line_width;
            let line_end = line_start + line_width.max(1.0);
            let use_foreground = (local_x >= left_start && local_x <= left_end)
                || (local_x >= right_start && local_x <= right_end)
                || (line_width > 0.0 && local_x >= line_start && local_x <= line_end);
            let colour = if use_foreground {
                foreground
            } else {
                background
            };
            let offset = (y as usize * media.width as usize + x as usize) * 4;
            pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedYagasuri media frame is invalid: {error:?}"))
}

fn build_generated_paper_airplane_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedPaperAirplane media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let plane: GeneratedPaperAirplaneSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedPaperAirplane media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_paper_airplane_source(&plane).map_err(|message| {
        format!(
            "Invalid GeneratedPaperAirplane media '{}': {message}",
            media.id
        )
    })?;
    let fill = parse_hex_colour_source(&plane.fill_colour).map_err(|message| {
        format!(
            "Invalid GeneratedPaperAirplane media '{}': {message}",
            media.id
        )
    })?;
    let shadow = [
        (fill[0] as f32 * 0.72).round() as u8,
        (fill[1] as f32 * 0.72).round() as u8,
        (fill[2] as f32 * 0.72).round() as u8,
    ];
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedPaperAirplane media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedPaperAirplane media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let centre_x = media.width as f32 / 2.0;
    let centre_y = media.height as f32 / 2.0;
    let half_length = (plane.body_length as f32 / 2.0).min(media.height as f32 / 2.0 - 2.0);
    let wing_width = plane.wing_width as f32;
    let fold_height = plane.fold_height as f32;
    let gap = plane.gap as f32 / 2.0;
    let nose = (centre_x, (centre_y - half_length).max(0.0));
    let tail_y = (centre_y + half_length).min(media.height as f32 - 1.0);
    let left_tail = ((centre_x - wing_width - gap).max(0.0), tail_y);
    let right_tail = (
        (centre_x + wing_width + gap).min(media.width as f32 - 1.0),
        tail_y,
    );
    let left_inner = ((centre_x - gap).max(0.0), tail_y);
    let right_inner = ((centre_x + gap).min(media.width as f32 - 1.0), tail_y);
    let fold_tip = (centre_x, (tail_y - fold_height).max(nose.1));

    for y in 0..media.height {
        for x in 0..media.width {
            let sample_x = x as f32 + 0.5;
            let sample_y = y as f32 + 0.5;
            let in_left_wing = point_in_triangle(sample_x, sample_y, [nose, left_tail, left_inner]);
            let in_right_wing =
                point_in_triangle(sample_x, sample_y, [nose, right_inner, right_tail]);
            let in_fold = point_in_triangle(sample_x, sample_y, [nose, left_inner, fold_tip])
                || point_in_triangle(sample_x, sample_y, [nose, fold_tip, right_inner]);
            if in_left_wing || in_right_wing || in_fold {
                let colour = if in_fold { shadow } else { fill };
                let offset = (y as usize * media.width as usize + x as usize) * 4;
                pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedPaperAirplane media frame is invalid: {error:?}"))
}

fn build_generated_asanoha_pattern_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedAsanohaPattern media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let asanoha: GeneratedAsanohaPatternSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedAsanohaPattern media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_asanoha_pattern_source(&asanoha).map_err(|message| {
        format!(
            "Invalid GeneratedAsanohaPattern media '{}': {message}",
            media.id
        )
    })?;
    let foreground = parse_hex_colour_source(&asanoha.foreground_colour).map_err(|message| {
        format!(
            "Invalid GeneratedAsanohaPattern media '{}': {message}",
            media.id
        )
    })?;
    let background = parse_hex_colour_source(&asanoha.background_colour).map_err(|message| {
        format!(
            "Invalid GeneratedAsanohaPattern media '{}': {message}",
            media.id
        )
    })?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedAsanohaPattern media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedAsanohaPattern media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    for pixel in pixels.chunks_exact_mut(4) {
        pixel.copy_from_slice(&[background[0], background[1], background[2], 255]);
    }

    let radius = asanoha.pattern_size.max(10) as f32;
    let line_width = asanoha.line_width as f32;
    let row_step = radius * 3.0_f32.sqrt();
    let column_step = radius * 1.5;
    let row_count = (media.height as f32 / row_step).ceil() as i32 + 3;
    let column_count = (media.width as f32 / column_step).ceil() as i32 + 3;

    if line_width <= 0.0 {
        return RgbaFrame::from_rgba8(media.width, media.height, pixels)
            .map_err(|error| format!("GeneratedAsanohaPattern media frame is invalid: {error:?}"));
    }

    for row in -1..row_count {
        let centre_y = row as f32 * row_step + radius;
        let row_offset = if row.rem_euclid(2) == 0 {
            0.0
        } else {
            column_step * 0.5
        };
        for column in -1..column_count {
            let centre_x = column as f32 * column_step + row_offset + radius;
            let points = [
                (centre_x + radius, centre_y),
                (centre_x + radius * 0.5, centre_y + row_step * 0.5),
                (centre_x - radius * 0.5, centre_y + row_step * 0.5),
                (centre_x - radius, centre_y),
                (centre_x - radius * 0.5, centre_y - row_step * 0.5),
                (centre_x + radius * 0.5, centre_y - row_step * 0.5),
            ];
            for index in 0..points.len() {
                draw_line_segment_rgba(
                    &mut pixels,
                    media.width,
                    media.height,
                    points[index],
                    points[(index + 1) % points.len()],
                    foreground,
                    line_width,
                );
                draw_line_segment_rgba(
                    &mut pixels,
                    media.width,
                    media.height,
                    (centre_x, centre_y),
                    points[index],
                    foreground,
                    line_width,
                );
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedAsanohaPattern media frame is invalid: {error:?}"))
}

fn build_generated_focus_lines_plus_source_frame(
    media: &SceneMediaReference,
    source_frame: u64,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedFocusLinesPlus media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let focus_lines: GeneratedFocusLinesPlusSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedFocusLinesPlus media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_focus_lines_plus_source(&focus_lines).map_err(|message| {
        format!(
            "Invalid GeneratedFocusLinesPlus media '{}': {message}",
            media.id
        )
    })?;
    let line_colour = parse_hex_colour_source(&focus_lines.line_colour).map_err(|message| {
        format!(
            "Invalid GeneratedFocusLinesPlus media '{}': {message}",
            media.id
        )
    })?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedFocusLinesPlus media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedFocusLinesPlus media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let max_x = focus_lines
        .centre_x
        .max(media.width as f32 - focus_lines.centre_x);
    let max_y = focus_lines
        .centre_y
        .max(media.height as f32 - focus_lines.centre_y);
    let outer_radius = (max_x * max_x + max_y * max_y).sqrt() * 1.25;
    let rotation = focus_lines.rotation_degrees.to_radians();
    let frame_bucket = if focus_lines.keyframe_interval == 0 {
        0
    } else {
        source_frame / focus_lines.keyframe_interval
    };
    let seed =
        (focus_lines.seed as u64).wrapping_add(frame_bucket.wrapping_mul(0x517c_c1b7_2722_0a95));
    let centre_jitter_radius =
        focus_lines.centre_radius * focus_lines.centre_jitter_percent / 100.0;
    let jitter_angle = deterministic_unit(seed, 0, 21) * std::f32::consts::TAU;
    let jitter_distance = deterministic_unit(seed, 0, 22) * centre_jitter_radius;
    let centre_x = focus_lines.centre_x + jitter_angle.cos() * jitter_distance;
    let centre_y = focus_lines.centre_y + jitter_angle.sin() * jitter_distance;

    let mut cursor = 0.0_f32;
    let mut index = 1_u32;
    while cursor <= 100.0 && index < 512 {
        let gap = deterministic_unit(seed, index, 0) * focus_lines.gap;
        let ray_width = deterministic_unit(seed, index, 1) * focus_lines.ray_width;
        let start = cursor + gap;
        let end = (start + ray_width).min(100.0);
        if end > start {
            let start_angle = rotation + std::f32::consts::TAU * start / 100.0;
            let end_angle = rotation + std::f32::consts::TAU * end / 100.0;
            let mid_angle = (start_angle + end_angle) * 0.5;
            let inner = (
                centre_x + focus_lines.centre_radius * mid_angle.cos(),
                centre_y + focus_lines.centre_radius * mid_angle.sin(),
            );
            let outer_start = (
                centre_x + outer_radius * start_angle.cos(),
                centre_y + outer_radius * start_angle.sin(),
            );
            let outer_mid = (
                centre_x + outer_radius * mid_angle.cos(),
                centre_y + outer_radius * mid_angle.sin(),
            );
            let outer_end = (
                centre_x + outer_radius * end_angle.cos(),
                centre_y + outer_radius * end_angle.sin(),
            );
            fill_focus_lines_plus_ray(
                &mut pixels,
                media.width,
                media.height,
                [inner, outer_start, outer_mid, outer_end],
                line_colour,
            );
        }
        cursor = end;
        index += 1;
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedFocusLinesPlus media frame is invalid: {error:?}"))
}

fn fill_focus_lines_plus_ray(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    quad: [(f32, f32); 4],
    colour: [u8; 3],
) {
    let min_x = quad
        .iter()
        .map(|point| point.0)
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0) as u32;
    let max_x = quad
        .iter()
        .map(|point| point.0)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = quad
        .iter()
        .map(|point| point.1)
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0) as u32;
    let max_y = quad
        .iter()
        .map(|point| point.1)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(height.saturating_sub(1) as f32) as u32;

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let sample_x = x as f32 + 0.5;
            let sample_y = y as f32 + 0.5;
            let inside = point_in_triangle(sample_x, sample_y, [quad[0], quad[1], quad[2]])
                || point_in_triangle(sample_x, sample_y, [quad[0], quad[2], quad[3]]);
            if inside {
                let offset = (y as usize * width as usize + x as usize) * 4;
                pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
            }
        }
    }
}

fn build_generated_random_line_ex_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedRandomLineEx media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let random_line: GeneratedRandomLineExSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedRandomLineEx media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_random_line_ex_source(&random_line).map_err(|message| {
        format!(
            "Invalid GeneratedRandomLineEx media '{}': {message}",
            media.id
        )
    })?;
    let line_colour = parse_hex_colour_source(&random_line.line_colour).map_err(|message| {
        format!(
            "Invalid GeneratedRandomLineEx media '{}': {message}",
            media.id
        )
    })?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedRandomLineEx media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedRandomLineEx media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let diagonal = ((media.width * media.width + media.height * media.height) as f32).sqrt();
    let seed = random_line.seed as u64;

    for index in 0..random_line.line_count {
        let centre_x = (deterministic_unit(seed, index, 0) - 0.5) * media.width as f32;
        let centre_y = (deterministic_unit(seed, index, 1) - 0.5) * media.height as f32;
        let angle = deterministic_unit(seed, index, 2) * std::f32::consts::PI;
        let width = random_line.line_width
            + deterministic_unit(seed, index, 3) * random_line.width_variance;
        let direction = (angle.cos(), angle.sin());
        let normal = (-direction.1, direction.0);
        let half_len = diagonal;
        let half_width = (width * 0.5).max(0.0);
        let quad = [
            (
                centre_x + direction.0 * half_len + normal.0 * half_width,
                centre_y + direction.1 * half_len + normal.1 * half_width,
            ),
            (
                centre_x + direction.0 * half_len - normal.0 * half_width,
                centre_y + direction.1 * half_len - normal.1 * half_width,
            ),
            (
                centre_x - direction.0 * half_len - normal.0 * half_width,
                centre_y - direction.1 * half_len - normal.1 * half_width,
            ),
            (
                centre_x - direction.0 * half_len + normal.0 * half_width,
                centre_y - direction.1 * half_len + normal.1 * half_width,
            ),
        ];
        fill_random_line_ex_quad(
            &mut pixels,
            media.width,
            media.height,
            quad,
            line_colour,
            &random_line,
            index,
        );
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedRandomLineEx media frame is invalid: {error:?}"))
}

fn fill_random_line_ex_quad(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    quad: [(f32, f32); 4],
    colour: [u8; 3],
    source: &GeneratedRandomLineExSource,
    line_index: u32,
) {
    let min_x = quad
        .iter()
        .map(|point| point.0)
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0) as u32;
    let max_x = quad
        .iter()
        .map(|point| point.0)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = quad
        .iter()
        .map(|point| point.1)
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0) as u32;
    let max_y = quad
        .iter()
        .map(|point| point.1)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(height.saturating_sub(1) as f32) as u32;
    let cell = source.noise_cell_size.max(1);

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let sample_x = x as f32 + 0.5;
            let sample_y = y as f32 + 0.5;
            let inside = point_in_triangle(sample_x, sample_y, [quad[0], quad[1], quad[2]])
                || point_in_triangle(sample_x, sample_y, [quad[0], quad[2], quad[3]]);
            if inside {
                let noise_index = (x / cell) ^ ((y / cell) << 8) ^ (line_index << 16);
                let noise =
                    (deterministic_unit(source.seed as u64, noise_index, 37) * 255.0) as u32;
                if noise >= source.threshold {
                    let offset = (y as usize * width as usize + x as usize) * 4;
                    pixels[offset..offset + 4]
                        .copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
                }
            }
        }
    }
}

fn build_generated_hologram_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedHologram media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let hologram: GeneratedHologramSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedHologram media '{}': {error}", media.id))?;
    validate_generated_hologram_source(&hologram)
        .map_err(|message| format!("Invalid GeneratedHologram media '{}': {message}", media.id))?;
    let tint = parse_hex_colour_source(&hologram.tint_colour)
        .map_err(|message| format!("Invalid GeneratedHologram media '{}': {message}", media.id))?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedHologram media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedHologram media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let tile = hologram.tile_size as f32;
    let rotation = hologram.rotation_degrees.to_radians();
    let gradient_angle = hologram.gradient_angle_degrees.to_radians();
    let cos_r = rotation.cos();
    let sin_r = rotation.sin();
    let cos_g = gradient_angle.cos();
    let sin_g = gradient_angle.sin();
    let centre_x = media.width as f32 * 0.5;
    let centre_y = media.height as f32 * 0.5;

    for y in 0..media.height {
        for x in 0..media.width {
            let px = x as f32 + 0.5 - centre_x;
            let py = y as f32 + 0.5 - centre_y;
            let rx = px * cos_r - py * sin_r;
            let ry = px * sin_r + py * cos_r;
            let band = ((rx + ry * 0.65).rem_euclid(tile)) / tile;
            let stripe_phase = (rx.rem_euclid(tile) / tile - 0.5).abs();
            let mut colour = hologram_colour_for_band(band, stripe_phase, tint);

            if hologram.colour_mode == 1 {
                colour = blend_rgb8(colour, tint, 0.18);
            } else if hologram.colour_mode == 2 {
                let gradient_position =
                    ((px * cos_g + py * sin_g) / (media.width.max(media.height) as f32) + 0.5)
                        .rem_euclid(1.0);
                colour = blend_rgb8(
                    colour,
                    hsv_to_rgb8(gradient_position * 360.0, 0.72, 1.0),
                    0.46,
                );
            }

            let offset = (y as usize * media.width as usize + x as usize) * 4;
            pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedHologram media frame is invalid: {error:?}"))
}

fn hologram_colour_for_band(band: f32, stripe_phase: f32, tint: [u8; 3]) -> [u8; 3] {
    let base = [118, 122, 130];
    let cool = [122, 210, 255];
    let warm = [255, 118, 172];
    let white = [242, 248, 255];
    let shadow = [20, 22, 28];
    let dark = [48, 52, 62];

    let colour = if band < 0.10 {
        shadow
    } else if band < 0.18 {
        cool
    } else if band < 0.30 {
        white
    } else if band < 0.43 {
        blend_rgb8(base, tint, 0.18)
    } else if band < 0.52 {
        dark
    } else if band < 0.66 {
        warm
    } else if band < 0.78 {
        blend_rgb8(base, cool, 0.35)
    } else {
        blend_rgb8(base, white, 0.30)
    };

    if stripe_phase < 0.045 {
        blend_rgb8(colour, [255, 255, 255], 0.55)
    } else if stripe_phase > 0.455 {
        blend_rgb8(colour, [0, 0, 0], 0.35)
    } else {
        colour
    }
}

fn build_generated_protractor_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedProtractor media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let protractor: GeneratedProtractorSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedProtractor media '{}': {error}", media.id))?;
    validate_generated_protractor_source(&protractor).map_err(|message| {
        format!(
            "Invalid GeneratedProtractor media '{}': {message}",
            media.id
        )
    })?;
    let line_colour = parse_hex_colour_source(&protractor.line_colour).map_err(|message| {
        format!(
            "Invalid GeneratedProtractor media '{}': {message}",
            media.id
        )
    })?;
    let text_colour = parse_hex_colour_source(&protractor.text_colour).map_err(|message| {
        format!(
            "Invalid GeneratedProtractor media '{}': {message}",
            media.id
        )
    })?;
    let shadow_colour = parse_hex_colour_source(&protractor.shadow_colour).map_err(|message| {
        format!(
            "Invalid GeneratedProtractor media '{}': {message}",
            media.id
        )
    })?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedProtractor media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedProtractor media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let centre_x = media.width as f32 * 0.5;
    let centre_y = media.height as f32 - 24.0;
    let radius = protractor
        .radius
        .min(media.width / 2)
        .min(media.height.saturating_sub(28))
        .max(1) as f32;

    draw_protractor_arc(
        &mut pixels,
        media.width,
        media.height,
        centre_x,
        centre_y,
        radius,
        line_colour,
    );
    draw_line_segment_rgba(
        &mut pixels,
        media.width,
        media.height,
        (centre_x - radius, centre_y),
        (centre_x + radius, centre_y),
        line_colour,
        2.0,
    );

    let mut degree = 0_u32;
    while degree <= 180 {
        let is_major = degree % protractor.major_tick_step_degrees == 0;
        let angle = std::f32::consts::PI - (degree as f32).to_radians();
        let outer = (
            centre_x + angle.cos() * radius,
            centre_y - angle.sin() * radius,
        );
        let tick_len = if is_major { 18.0 } else { 9.0 };
        let inner = (
            centre_x + angle.cos() * (radius - tick_len),
            centre_y - angle.sin() * (radius - tick_len),
        );
        draw_line_segment_rgba(
            &mut pixels,
            media.width,
            media.height,
            inner,
            outer,
            line_colour,
            if is_major { 2.0 } else { 1.0 },
        );
        degree = degree.saturating_add(protractor.tick_step_degrees);
    }

    let measured = protractor.measured_angle_degrees.clamp(0.0, 180.0);
    let measured_angle = std::f32::consts::PI - measured.to_radians();
    draw_line_segment_rgba(
        &mut pixels,
        media.width,
        media.height,
        (centre_x, centre_y),
        (
            centre_x + measured_angle.cos() * (radius - 22.0),
            centre_y - measured_angle.sin() * (radius - 22.0),
        ),
        line_colour,
        3.0,
    );
    draw_filled_circle_rgba(
        &mut pixels,
        media.width,
        media.height,
        centre_x,
        centre_y,
        4.0,
        line_colour,
        255,
    );

    let label = format!("{:.*}", protractor.decimal_places as usize, measured);
    draw_seven_segment_label(
        &mut pixels,
        media.width,
        media.height,
        &label,
        (centre_x - (label.len() as f32 * 14.0) * 0.5).round() as i32,
        (centre_y - radius * 0.48).round() as i32,
        2,
        text_colour,
        shadow_colour,
    );

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedProtractor media frame is invalid: {error:?}"))
}

fn draw_protractor_arc(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius: f32,
    colour: [u8; 3],
) {
    let min_x = (centre_x - radius - 2.0).floor().max(0.0) as u32;
    let max_x = (centre_x + radius + 2.0)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = (centre_y - radius - 2.0).floor().max(0.0) as u32;
    let max_y = centre_y.ceil().min(height.saturating_sub(1) as f32) as u32;

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let dx = x as f32 + 0.5 - centre_x;
            let dy = centre_y - (y as f32 + 0.5);
            if dy < 0.0 {
                continue;
            }
            let distance = (dx * dx + dy * dy).sqrt();
            if (distance - radius).abs() <= 1.4 {
                let offset = (y as usize * width as usize + x as usize) * 4;
                pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
            }
        }
    }
}

fn draw_filled_circle_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius: f32,
    colour: [u8; 3],
    alpha: u8,
) {
    let min_x = (centre_x - radius).floor().max(0.0) as u32;
    let max_x = (centre_x + radius)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = (centre_y - radius).floor().max(0.0) as u32;
    let max_y = (centre_y + radius)
        .ceil()
        .min(height.saturating_sub(1) as f32) as u32;
    let radius_sq = radius * radius;
    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let dx = x as f32 + 0.5 - centre_x;
            let dy = y as f32 + 0.5 - centre_y;
            if dx * dx + dy * dy <= radius_sq {
                let offset = (y as usize * width as usize + x as usize) * 4;
                pixels[offset..offset + 4]
                    .copy_from_slice(&[colour[0], colour[1], colour[2], alpha]);
            }
        }
    }
}

fn draw_seven_segment_label(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    label: &str,
    x: i32,
    y: i32,
    scale: i32,
    colour: [u8; 3],
    shadow_colour: [u8; 3],
) {
    draw_seven_segment_label_at(
        pixels,
        width,
        height,
        label,
        x + 2,
        y + 2,
        scale,
        shadow_colour,
    );
    draw_seven_segment_label_at(pixels, width, height, label, x, y, scale, colour);
}

fn draw_seven_segment_label_at(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    label: &str,
    x: i32,
    y: i32,
    scale: i32,
    colour: [u8; 3],
) {
    let mut cursor_x = x;
    for character in label.chars() {
        if character == '.' {
            fill_rect_rgba_i32(
                pixels,
                width,
                height,
                cursor_x,
                y + 16 * scale,
                2 * scale,
                2 * scale,
                colour,
            );
            cursor_x += 4 * scale;
        } else {
            draw_seven_segment_character(
                pixels, width, height, character, cursor_x, y, scale, colour,
            );
            cursor_x += 9 * scale;
        }
    }
}

fn draw_seven_segment_character(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    character: char,
    x: i32,
    y: i32,
    scale: i32,
    colour: [u8; 3],
) {
    let segments = match character {
        '0' => [true, true, true, true, true, true, false],
        '1' => [false, true, true, false, false, false, false],
        '2' => [true, true, false, true, true, false, true],
        '3' => [true, true, true, true, false, false, true],
        '4' => [false, true, true, false, false, true, true],
        '5' => [true, false, true, true, false, true, true],
        '6' => [true, false, true, true, true, true, true],
        '7' => [true, true, true, false, false, false, false],
        '8' => [true, true, true, true, true, true, true],
        '9' => [true, true, true, true, false, true, true],
        _ => [false, false, false, false, false, false, false],
    };
    let segment_rects = [
        (1, 0, 5, 1),
        (6, 1, 1, 6),
        (6, 9, 1, 6),
        (1, 15, 5, 1),
        (0, 9, 1, 6),
        (0, 1, 1, 6),
        (1, 7, 5, 1),
    ];
    for (enabled, rect) in segments.iter().zip(segment_rects.iter()) {
        if *enabled {
            fill_rect_rgba_i32(
                pixels,
                width,
                height,
                x + rect.0 * scale,
                y + rect.1 * scale,
                rect.2 * scale,
                rect.3 * scale,
                colour,
            );
        }
    }
}

fn fill_rect_rgba_i32(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    rect_width: i32,
    rect_height: i32,
    colour: [u8; 3],
) {
    let min_x = x.max(0) as u32;
    let min_y = y.max(0) as u32;
    let max_x = (x + rect_width).min(width as i32).max(0) as u32;
    let max_y = (y + rect_height).min(height as i32).max(0) as u32;
    for py in min_y..max_y {
        for px in min_x..max_x {
            let offset = (py as usize * width as usize + px as usize) * 4;
            pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
        }
    }
}

fn build_generated_shaking_polygon_source_frame(
    media: &SceneMediaReference,
    source_frame: u64,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedShakingPolygon media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let polygon: GeneratedShakingPolygonSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedShakingPolygon media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_shaking_polygon_source(&polygon).map_err(|message| {
        format!(
            "Invalid GeneratedShakingPolygon media '{}': {message}",
            media.id
        )
    })?;
    let colour = parse_hex_colour_source(&polygon.colour).map_err(|message| {
        format!(
            "Invalid GeneratedShakingPolygon media '{}': {message}",
            media.id
        )
    })?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedShakingPolygon media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedShakingPolygon media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let centre = (media.width as f32 * 0.5, media.height as f32 * 0.5);
    let base_radius = if polygon.fixed_diameter > 0 {
        polygon.fixed_diameter as f32 * 0.5
    } else {
        media.width.min(media.height) as f32 * 0.36
    };
    let base_radius = base_radius.min(media.width.min(media.height) as f32 * 0.48);

    for repeat_index in 0..polygon.repeat_count {
        let rotation = if polygon.repeat_count <= 1 {
            0.0
        } else {
            repeat_index as f32 * std::f32::consts::TAU
                / (polygon.repeat_count * polygon.repeat_frequency) as f32
        };
        let points = shaking_polygon_points(&polygon, source_frame, centre, base_radius, rotation);
        if polygon.fill {
            fill_polygon_fan_rgba(
                &mut pixels,
                media.width,
                media.height,
                &points,
                centre,
                colour,
                96,
            );
        }
        draw_polygon_outline_rgba(
            &mut pixels,
            media.width,
            media.height,
            &points,
            colour,
            polygon.line_width as f32,
        );
        for point in points {
            draw_filled_circle_rgba(
                &mut pixels,
                media.width,
                media.height,
                point.0,
                point.1,
                (polygon.line_width as f32 * 0.55).max(1.0),
                colour,
                255,
            );
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedShakingPolygon media frame is invalid: {error:?}"))
}

fn shaking_polygon_points(
    polygon: &GeneratedShakingPolygonSource,
    source_frame: u64,
    centre: (f32, f32),
    base_radius: f32,
    rotation: f32,
) -> Vec<(f32, f32)> {
    let interval = polygon.jitter_interval.max(1) as u64;
    let phase = source_frame / interval;
    let t = (source_frame % interval) as f32 / interval as f32;
    let eased_t = if polygon.stepped {
        0.0
    } else {
        t * t * (3.0 - 2.0 * t)
    };
    let vertical_scale = if polygon.vertical_distortion_percent < 0.0 {
        1.0 + polygon.vertical_distortion_percent / 100.0
    } else {
        1.0
    };
    let horizontal_scale = if polygon.vertical_distortion_percent > 0.0 {
        1.0 - polygon.vertical_distortion_percent / 100.0
    } else {
        1.0
    };
    let seed = polygon.seed as u64;
    (0..polygon.vertex_count)
        .map(|index| {
            let base_angle = rotation
                + index as f32 * std::f32::consts::TAU / polygon.vertex_count as f32
                + if polygon.vertex_count == 4 {
                    std::f32::consts::FRAC_PI_4
                } else {
                    0.0
                };
            let jitter_x0 = jitter_value(seed, index, phase, 0, polygon.jitter_range);
            let jitter_y0 = jitter_value(seed, index, phase, 1, polygon.jitter_range);
            let jitter_x1 = jitter_value(seed, index, phase + 1, 0, polygon.jitter_range);
            let jitter_y1 = jitter_value(seed, index, phase + 1, 1, polygon.jitter_range);
            let jitter_x = jitter_x0 + (jitter_x1 - jitter_x0) * eased_t;
            let jitter_y = jitter_y0 + (jitter_y1 - jitter_y0) * eased_t;
            (
                centre.0 + base_angle.sin() * base_radius * horizontal_scale + jitter_x,
                centre.1 - base_angle.cos() * base_radius * vertical_scale + jitter_y,
            )
        })
        .collect()
}

fn jitter_value(seed: u64, vertex_index: u32, phase: u64, lane: u64, range: f32) -> f32 {
    (deterministic_unit(
        seed,
        vertex_index,
        phase.saturating_mul(13).saturating_add(lane),
    ) * 2.0
        - 1.0)
        * range
}

fn build_generated_tone_curve_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedToneCurve media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let tone_curve: GeneratedToneCurveSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedToneCurve media '{}': {error}", media.id))?;
    validate_generated_tone_curve_source(&tone_curve)
        .map_err(|message| format!("Invalid GeneratedToneCurve media '{}': {message}", media.id))?;
    let background = parse_hex_colour_source(&tone_curve.background_colour).map_err(|message| {
        format!(
            "Invalid GeneratedToneCurve media '{}': background_colour {message}",
            media.id
        )
    })?;
    let grid = parse_hex_colour_source(&tone_curve.grid_colour).map_err(|message| {
        format!(
            "Invalid GeneratedToneCurve media '{}': grid_colour {message}",
            media.id
        )
    })?;
    let curve = parse_hex_colour_source(&tone_curve.curve_colour).map_err(|message| {
        format!(
            "Invalid GeneratedToneCurve media '{}': curve_colour {message}",
            media.id
        )
    })?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedToneCurve media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedToneCurve media byte length overflows".to_string())?;
    let mut pixels = Vec::with_capacity(byte_len);
    for _ in 0..pixel_count {
        pixels.extend_from_slice(&[background[0], background[1], background[2], 255]);
    }

    let width = media.width as f32;
    let height = media.height as f32;
    let divisions = tone_curve.grid_divisions.max(1);
    for index in 0..=divisions {
        let x = index as f32 * (width - 1.0) / divisions as f32;
        let y = index as f32 * (height - 1.0) / divisions as f32;
        draw_line_segment_rgba(
            &mut pixels,
            media.width,
            media.height,
            (x, 0.0),
            (x, height - 1.0),
            grid,
            1.0,
        );
        draw_line_segment_rgba(
            &mut pixels,
            media.width,
            media.height,
            (0.0, y),
            (width - 1.0, y),
            grid,
            1.0,
        );
    }

    let points = tone_curve_curve_points(&tone_curve.curve_points, width, height);
    for pair in points.windows(2) {
        draw_line_segment_rgba(
            &mut pixels,
            media.width,
            media.height,
            pair[0],
            pair[1],
            curve,
            tone_curve.line_width as f32,
        );
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedToneCurve media frame is invalid: {error:?}"))
}

fn build_generated_hksy_checker_grid_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedHksyCheckerGrid media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let checker_grid: GeneratedHksyCheckerGridSource = serde_json::from_str(&media.source)
        .map_err(|error| {
            format!(
                "Invalid GeneratedHksyCheckerGrid media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_hksy_checker_grid_source(&checker_grid).map_err(|message| {
        format!(
            "Invalid GeneratedHksyCheckerGrid media '{}': {message}",
            media.id
        )
    })?;
    let foreground =
        parse_hex_colour_source(&checker_grid.foreground_colour).map_err(|message| {
            format!(
                "Invalid GeneratedHksyCheckerGrid media '{}': foreground_colour {message}",
                media.id
            )
        })?;
    let secondary = parse_hex_colour_source(&checker_grid.secondary_colour).map_err(|message| {
        format!(
            "Invalid GeneratedHksyCheckerGrid media '{}': secondary_colour {message}",
            media.id
        )
    })?;
    let background =
        parse_hex_colour_source(&checker_grid.background_colour).map_err(|message| {
            format!(
                "Invalid GeneratedHksyCheckerGrid media '{}': background_colour {message}",
                media.id
            )
        })?;
    let palette_colours = checker_grid
        .palette_colours
        .as_ref()
        .map(|colours| {
            colours
                .iter()
                .map(|colour| parse_hex_colour_source(colour))
                .collect::<Result<Vec<[u8; 3]>, String>>()
        })
        .transpose()
        .map_err(|message| {
            format!(
                "Invalid GeneratedHksyCheckerGrid media '{}': palette_colours {message}",
                media.id
            )
        })?
        .unwrap_or_default();

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedHksyCheckerGrid media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedHksyCheckerGrid media byte length overflows".to_string())?;
    let mut pixels = vec![0; byte_len];

    if checker_grid.pattern.as_deref() == Some("diamond") {
        draw_hksy_diamond_pattern_rgba(
            &mut pixels,
            media.width,
            media.height,
            foreground,
            checker_grid.line_width as f32,
        );
        return RgbaFrame::from_rgba8(media.width, media.height, pixels).map_err(|error| {
            format!("GeneratedHksyCheckerGrid media frame is invalid: {error:?}")
        });
    }
    if checker_grid.pattern.as_deref() == Some("measured-grid") {
        draw_hksy_measured_grid_pattern_rgba(
            &mut pixels,
            media.width,
            media.height,
            HksyMeasuredGridStyle {
                background,
                line_colour: secondary,
                separate_colour: foreground,
                cell_size: checker_grid.cell_size,
                line_width: checker_grid.line_width,
                separate_interval: checker_grid.separate_interval.unwrap_or(5),
                separate_line_width: checker_grid.separate_line_width.unwrap_or(3),
            },
        );
        return RgbaFrame::from_rgba8(media.width, media.height, pixels).map_err(|error| {
            format!("GeneratedHksyCheckerGrid media frame is invalid: {error:?}")
        });
    }
    if checker_grid.pattern.as_deref() == Some("anchor-line") {
        let anchor_points = checker_grid.anchor_points.as_deref().unwrap_or(&[]);
        draw_hksy_anchor_line_pattern_rgba(
            &mut pixels,
            media.width,
            media.height,
            anchor_points,
            foreground,
            checker_grid.line_width as f32,
            checker_grid.round_caps.unwrap_or(true),
        );
        return RgbaFrame::from_rgba8(media.width, media.height, pixels).map_err(|error| {
            format!("GeneratedHksyCheckerGrid media frame is invalid: {error:?}")
        });
    }

    for y in 0..media.height {
        for x in 0..media.width {
            let colour = if checker_grid.checker_enabled {
                let tile_x = x / checker_grid.cell_size;
                let tile_y = y / checker_grid.cell_size;
                if !palette_colours.is_empty() {
                    let palette_index = ((tile_x + tile_y) as usize) % palette_colours.len();
                    palette_colours[palette_index]
                } else if (tile_x + tile_y) % 2 == 0 {
                    foreground
                } else {
                    background
                }
            } else {
                background
            };
            let offset = (y as usize * media.width as usize + x as usize) * 4;
            pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
        }
    }

    if checker_grid.grid_enabled && checker_grid.line_width > 0 {
        let line_width = checker_grid.line_width as f32;
        let mut x = 0;
        while x < media.width {
            draw_line_segment_rgba(
                &mut pixels,
                media.width,
                media.height,
                (x as f32, 0.0),
                (x as f32, media.height.saturating_sub(1) as f32),
                secondary,
                line_width,
            );
            x = x.saturating_add(checker_grid.cell_size);
        }
        let mut y = 0;
        while y < media.height {
            draw_line_segment_rgba(
                &mut pixels,
                media.width,
                media.height,
                (0.0, y as f32),
                (media.width.saturating_sub(1) as f32, y as f32),
                secondary,
                line_width,
            );
            y = y.saturating_add(checker_grid.cell_size);
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedHksyCheckerGrid media frame is invalid: {error:?}"))
}

fn draw_hksy_diamond_pattern_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    colour: [u8; 3],
    line_width: f32,
) {
    if width == 0 || height == 0 || line_width <= 0.0 {
        return;
    }

    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let half_width = centre_x;
    let half_height = centre_y;
    let longest_side = width.max(height) as f32;
    let inner_x = (half_width - (width as f32 / longest_side) * line_width).max(0.0);
    let inner_y = (half_height - (height as f32 / longest_side) * line_width).max(0.0);
    let left = 0.0;
    let right = width.saturating_sub(1) as f32;
    let top = 0.0;
    let bottom = height.saturating_sub(1) as f32;

    let polygons = [
        [
            (centre_x, top),
            (left, centre_y),
            (centre_x - inner_x, centre_y),
            (centre_x, centre_y - inner_y),
        ],
        [
            (centre_x, top),
            (right, centre_y),
            (centre_x + inner_x, centre_y),
            (centre_x, centre_y - inner_y),
        ],
        [
            (centre_x, bottom),
            (left, centre_y),
            (centre_x - inner_x, centre_y),
            (centre_x, centre_y + inner_y),
        ],
        [
            (centre_x, bottom),
            (right, centre_y),
            (centre_x + inner_x, centre_y),
            (centre_x, centre_y + inner_y),
        ],
    ];

    for polygon in polygons {
        let fan_centre = (
            polygon.iter().map(|point| point.0).sum::<f32>() / polygon.len() as f32,
            polygon.iter().map(|point| point.1).sum::<f32>() / polygon.len() as f32,
        );
        fill_polygon_fan_rgba(pixels, width, height, &polygon, fan_centre, colour, 255);
    }
}

struct HksyMeasuredGridStyle {
    background: [u8; 3],
    line_colour: [u8; 3],
    separate_colour: [u8; 3],
    cell_size: u32,
    line_width: u32,
    separate_interval: u32,
    separate_line_width: u32,
}

fn draw_hksy_measured_grid_pattern_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    style: HksyMeasuredGridStyle,
) {
    for y in 0..height {
        for x in 0..width {
            let offset = (y as usize * width as usize + x as usize) * 4;
            pixels[offset..offset + 4].copy_from_slice(&[
                style.background[0],
                style.background[1],
                style.background[2],
                255,
            ]);
        }
    }
    if style.cell_size == 0 {
        return;
    }

    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let max_distance = centre_x.max(centre_y);

    let mut index = 0_u32;
    let mut position = 0.0_f32;
    while position <= max_distance + style.cell_size as f32 {
        let is_separate = style.separate_interval > 0 && index % style.separate_interval == 0;
        let line_width = if is_separate {
            style.separate_line_width
        } else {
            style.line_width
        };
        if line_width > 0 {
            let colour = if is_separate {
                style.separate_colour
            } else {
                style.line_colour
            };
            for sign in [-1.0_f32, 1.0_f32] {
                let x = centre_x + position * sign;
                let y = centre_y + position * sign;
                if x >= 0.0 && x <= width.saturating_sub(1) as f32 {
                    draw_line_segment_rgba(
                        pixels,
                        width,
                        height,
                        (x, 0.0),
                        (x, height.saturating_sub(1) as f32),
                        colour,
                        line_width as f32,
                    );
                }
                if y >= 0.0 && y <= height.saturating_sub(1) as f32 {
                    draw_line_segment_rgba(
                        pixels,
                        width,
                        height,
                        (0.0, y),
                        (width.saturating_sub(1) as f32, y),
                        colour,
                        line_width as f32,
                    );
                }
            }
        }
        index = index.saturating_add(1);
        position += style.cell_size as f32;
    }
}

fn draw_hksy_anchor_line_pattern_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    anchor_points: &[GeneratedHksyAnchorPoint],
    colour: [u8; 3],
    line_width: f32,
    round_caps: bool,
) {
    if width == 0 || height == 0 || anchor_points.len() < 2 || line_width <= 0.0 {
        return;
    }

    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let points = anchor_points
        .iter()
        .map(|point| (centre_x + point.x, centre_y + point.y))
        .collect::<Vec<_>>();

    for pair in points.windows(2) {
        draw_line_segment_rgba(pixels, width, height, pair[0], pair[1], colour, line_width);
    }

    if round_caps {
        let radius = (line_width * 0.5).max(0.5);
        for point in points {
            fill_disc_rgba(pixels, width, height, point, radius, colour, 255);
        }
    }
}

fn build_generated_region_frame_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedRegionFrame media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let region_frame: GeneratedRegionFrameSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedRegionFrame media '{}': {error}", media.id))?;
    validate_generated_region_frame_source(&region_frame).map_err(|message| {
        format!(
            "Invalid GeneratedRegionFrame media '{}': {message}",
            media.id
        )
    })?;
    let frame_colour = parse_hex_colour_source(&region_frame.frame_colour).map_err(|message| {
        format!(
            "Invalid GeneratedRegionFrame media '{}': frame_colour {message}",
            media.id
        )
    })?;
    let background_colour =
        parse_hex_colour_source(&region_frame.background_colour).map_err(|message| {
            format!(
                "Invalid GeneratedRegionFrame media '{}': background_colour {message}",
                media.id
            )
        })?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedRegionFrame media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedRegionFrame media byte length overflows".to_string())?;
    let alpha = (region_frame.background_opacity * 255.0)
        .round()
        .clamp(0.0, 255.0) as u8;
    let mut pixels = vec![0; byte_len];
    let background = [
        background_colour[0],
        background_colour[1],
        background_colour[2],
        alpha,
    ];
    let border = [frame_colour[0], frame_colour[1], frame_colour[2], 255];
    let line_width = region_frame.line_width.ceil().max(0.0);
    match region_frame.shape.as_str() {
        "ellipse" => draw_region_frame_ellipse_rgba(
            &mut pixels,
            media.width,
            media.height,
            line_width,
            background,
            border,
        ),
        "cut_corner" => draw_region_frame_cut_corner_rgba(
            &mut pixels,
            media.width,
            media.height,
            line_width,
            region_frame.corner_cut,
            background,
            border,
        ),
        _ => draw_region_frame_rectangle_rgba(
            &mut pixels,
            media.width,
            media.height,
            line_width,
            background,
            border,
        ),
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedRegionFrame media frame is invalid: {error:?}"))
}

fn build_generated_simple_tube_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedSimpleTube media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let simple_tube: GeneratedSimpleTubeSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedSimpleTube media '{}': {error}", media.id))?;
    validate_generated_simple_tube_source(&simple_tube).map_err(|message| {
        format!(
            "Invalid GeneratedSimpleTube media '{}': {message}",
            media.id
        )
    })?;
    let colour = parse_hex_colour_source(&simple_tube.colour).map_err(|message| {
        format!(
            "Invalid GeneratedSimpleTube media '{}': colour {message}",
            media.id
        )
    })?;
    let secondary_colour =
        parse_hex_colour_source(&simple_tube.secondary_colour).map_err(|message| {
            format!(
                "Invalid GeneratedSimpleTube media '{}': secondary_colour {message}",
                media.id
            )
        })?;
    let fog_colour = parse_hex_colour_source(&simple_tube.fog_colour).map_err(|message| {
        format!(
            "Invalid GeneratedSimpleTube media '{}': fog_colour {message}",
            media.id
        )
    })?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedSimpleTube media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedSimpleTube media byte length overflows".to_string())?;
    let mut pixels = vec![0; byte_len];
    draw_simple_tube_rgba(
        &mut pixels,
        media.width,
        media.height,
        &simple_tube,
        colour,
        secondary_colour,
        fog_colour,
    );

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedSimpleTube media frame is invalid: {error:?}"))
}

fn draw_simple_tube_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    tube: &GeneratedSimpleTubeSource,
    colour: [u8; 3],
    secondary_colour: [u8; 3],
    fog_colour: [u8; 3],
) {
    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let radius_x = (tube.radius - 10.0).max(1.0).min(width as f32 * 0.45);
    let radius_y = (radius_x * 0.32).max(1.0).min(height as f32 * 0.3);
    let depth = tube.depth.abs().min(height as f32 * 0.85);
    let stroke_width = tube.stroke_width.max(0.5);

    if tube.torus {
        draw_simple_tube_torus_rgba(
            pixels,
            width,
            height,
            centre_x,
            centre_y,
            radius_x,
            radius_y,
            tube,
            colour,
            secondary_colour,
            fog_colour,
            stroke_width,
        );
        return;
    }

    let ring_count = tube.rings.max(2);
    let segment_count = tube.segments.max(3);
    let top = centre_y - depth * 0.5;
    let step = if ring_count <= 1 {
        0.0
    } else {
        depth / (ring_count - 1) as f32
    };
    let twist_total = tube.twist_degrees.to_radians();
    let mut rings = Vec::new();

    for ring_index in 0..ring_count {
        let phase = ring_index as f32 / (ring_count - 1).max(1) as f32;
        let y = top + step * ring_index as f32;
        let twist = twist_total * phase;
        let perspective = 0.82 + 0.18 * (1.0 - (phase - 0.5).abs() * 2.0);
        let points = simple_tube_ellipse_points(
            centre_x,
            y,
            radius_x * perspective,
            radius_y * perspective,
            segment_count,
            twist,
            tube.random_amount,
            tube.seed + ring_index as i64,
        );
        let ring_colour = simple_tube_colour_for_ring(
            tube,
            ring_index,
            ring_count,
            colour,
            secondary_colour,
            fog_colour,
        );
        for pair in points.windows(2) {
            draw_line_segment_rgba(
                pixels,
                width,
                height,
                pair[0],
                pair[1],
                ring_colour,
                stroke_width,
            );
        }
        if let (Some(first), Some(last)) = (points.first(), points.last()) {
            draw_line_segment_rgba(
                pixels,
                width,
                height,
                *last,
                *first,
                ring_colour,
                stroke_width,
            );
        }
        rings.push(points);
    }

    for segment_index in 0..segment_count as usize {
        let depth_colour = simple_tube_colour_for_ring(
            tube,
            segment_index as u32,
            segment_count,
            colour,
            secondary_colour,
            fog_colour,
        );
        for pair in rings.windows(2) {
            draw_line_segment_rgba(
                pixels,
                width,
                height,
                pair[0][segment_index],
                pair[1][segment_index],
                depth_colour,
                stroke_width,
            );
        }
    }

    let centre_ring = simple_tube_ellipse_points(
        centre_x,
        centre_y,
        radius_x,
        radius_y,
        segment_count,
        twist_total * 0.5,
        tube.random_amount,
        tube.seed + 10_000,
    );
    let centre_colour = simple_tube_colour_for_ring(
        tube,
        ring_count / 2,
        ring_count,
        colour,
        secondary_colour,
        fog_colour,
    );
    for pair in centre_ring.windows(2) {
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            pair[0],
            pair[1],
            centre_colour,
            stroke_width,
        );
    }
    if let (Some(first), Some(last)) = (centre_ring.first(), centre_ring.last()) {
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            *last,
            *first,
            centre_colour,
            stroke_width,
        );
    }

    draw_line_segment_rgba(
        pixels,
        width,
        height,
        (centre_x, top),
        (centre_x, top + depth),
        secondary_colour,
        stroke_width,
    );
}

fn build_generated_sphere_dots_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedSphereDots media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let sphere: GeneratedSphereDotsSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedSphereDots media '{}': {error}", media.id))?;
    validate_generated_sphere_dots_source(&sphere).map_err(|message| {
        format!(
            "Invalid GeneratedSphereDots media '{}': {message}",
            media.id
        )
    })?;
    let colour = parse_hex_colour_source(&sphere.colour).map_err(|message| {
        format!(
            "Invalid GeneratedSphereDots media '{}': colour {message}",
            media.id
        )
    })?;
    let secondary_colour =
        parse_hex_colour_source(&sphere.secondary_colour).map_err(|message| {
            format!(
                "Invalid GeneratedSphereDots media '{}': secondary_colour {message}",
                media.id
            )
        })?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedSphereDots media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedSphereDots media byte length overflows".to_string())?;
    let mut pixels = vec![0; byte_len];
    draw_sphere_dots_rgba(
        &mut pixels,
        media.width,
        media.height,
        &sphere,
        colour,
        secondary_colour,
    );

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedSphereDots media frame is invalid: {error:?}"))
}

fn draw_sphere_dots_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    sphere: &GeneratedSphereDotsSource,
    colour: [u8; 3],
    secondary_colour: [u8; 3],
) {
    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let radius = sphere
        .radius
        .min(width.min(height) as f32 * 0.46)
        .max(1.0);
    let rows = sphere.rows.max(2);
    let columns = sphere.columns.max(3);
    let rotation = sphere.rotation_degrees.to_radians();
    let offset = sphere.offset_degrees.to_radians();
    let line_width = sphere.latitude_line_width.max(0.0);
    let point_radius = (sphere.point_size * 0.5)
        .max(0.0)
        .min(radius * 0.2);
    let luminance_amount = (sphere.luminance_influence / 5000.0).clamp(-1.0, 1.0);
    let _seed = sphere.seed;

    if sphere.plane_mode {
        draw_sphere_dots_plane_rgba(
            pixels,
            width,
            height,
            centre_x,
            centre_y,
            radius,
            sphere,
            colour,
            secondary_colour,
            point_radius,
        );
        return;
    }

    let mut rows_points: Vec<Vec<(f32, f32)>> = Vec::with_capacity(rows as usize);
    for row_index in 0..rows {
        let theta = std::f32::consts::PI * (row_index + 1) as f32 / (rows + 1) as f32;
        let y = centre_y + theta.cos() * radius;
        let x_radius = theta.sin() * radius;
        let mut points = Vec::with_capacity(columns as usize);
        for column_index in 0..columns {
            let phi = offset + rotation + std::f32::consts::TAU * column_index as f32 / columns as f32;
            points.push((centre_x + phi.cos() * x_radius, y));
        }
        rows_points.push(points);
    }

    if line_width > 0.0 {
        for points in &rows_points {
            for pair in points.windows(2) {
                draw_line_segment_rgba(
                    pixels,
                    width,
                    height,
                    pair[0],
                    pair[1],
                    secondary_colour,
                    line_width,
                );
            }
            if let (Some(first), Some(last)) = (points.first(), points.last()) {
                draw_line_segment_rgba(
                    pixels,
                    width,
                    height,
                    *last,
                    *first,
                    secondary_colour,
                    line_width,
                );
            }
        }
    }

    for (row_index, points) in rows_points.iter().enumerate() {
        let row_phase = if rows <= 1 {
            0.0
        } else {
            row_index as f32 / (rows - 1) as f32
        };
        let brightness = (1.0 - luminance_amount.abs() * 0.35)
            + luminance_amount * (1.0 - (row_phase - 0.5).abs() * 2.0) * 0.35;
        let point_colour = scale_rgb_u8(colour, brightness.clamp(0.2, 1.4));
        for point in points {
            fill_disc_rgba(
                pixels,
                width,
                height,
                *point,
                point_radius.max(0.5),
                point_colour,
                255,
            );
        }
    }

    if line_width > 0.0 {
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            (centre_x, centre_y - radius),
            (centre_x, centre_y + radius),
            secondary_colour,
            line_width,
        );
    }
}

fn draw_sphere_dots_plane_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius: f32,
    sphere: &GeneratedSphereDotsSource,
    colour: [u8; 3],
    secondary_colour: [u8; 3],
    point_radius: f32,
) {
    let columns = sphere.columns.max(3);
    let rows = sphere.rows.max(2);
    let left = centre_x - radius;
    let top = centre_y - radius;
    let horizontal_step = if columns <= 1 {
        0.0
    } else {
        radius * 2.0 / (columns - 1) as f32
    };
    let vertical_step = if rows <= 1 {
        0.0
    } else {
        radius * 2.0 / (rows - 1) as f32
    };

    if sphere.latitude_line_width > 0.0 {
        for row_index in 0..rows {
            let y = top + vertical_step * row_index as f32;
            draw_line_segment_rgba(
                pixels,
                width,
                height,
                (left, y),
                (left + radius * 2.0, y),
                secondary_colour,
                sphere.latitude_line_width,
            );
        }
    }

    for row_index in 0..rows {
        for column_index in 0..columns {
            let x = left + horizontal_step * column_index as f32;
            let y = top + vertical_step * row_index as f32;
            fill_disc_rgba(
                pixels,
                width,
                height,
                (x, y),
                point_radius.max(0.5),
                colour,
                255,
            );
        }
    }
}

fn draw_simple_tube_torus_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius_x: f32,
    radius_y: f32,
    tube: &GeneratedSimpleTubeSource,
    colour: [u8; 3],
    secondary_colour: [u8; 3],
    fog_colour: [u8; 3],
    stroke_width: f32,
) {
    let segment_count = tube.segments.max(3);
    let ring_count = tube.rings.max(2);
    let outer_radius_x = radius_x.min(width as f32 * 0.4);
    let outer_radius_y = radius_y.max(1.0).min(height as f32 * 0.22);
    let points = simple_tube_ellipse_points(
        centre_x,
        centre_y,
        outer_radius_x,
        outer_radius_y,
        segment_count,
        tube.twist_degrees.to_radians(),
        tube.random_amount,
        tube.seed,
    );
    let ring_colour = simple_tube_colour_for_ring(tube, 0, 1, colour, secondary_colour, fog_colour);
    for pair in points.windows(2) {
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            pair[0],
            pair[1],
            ring_colour,
            stroke_width,
        );
    }
    if let (Some(first), Some(last)) = (points.first(), points.last()) {
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            *last,
            *first,
            ring_colour,
            stroke_width,
        );
    }
    for ring_index in 0..ring_count {
        let phase = ring_index as f32 / ring_count as f32;
        let angle = phase * std::f32::consts::TAU;
        let x = centre_x + outer_radius_x * angle.cos();
        let y = centre_y + outer_radius_y * angle.sin();
        let spoke_colour = simple_tube_colour_for_ring(
            tube,
            ring_index,
            ring_count,
            colour,
            secondary_colour,
            fog_colour,
        );
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            (centre_x, centre_y),
            (x, y),
            spoke_colour,
            stroke_width,
        );
    }
}

fn simple_tube_colour_for_ring(
    tube: &GeneratedSimpleTubeSource,
    index: u32,
    count: u32,
    colour: [u8; 3],
    secondary_colour: [u8; 3],
    fog_colour: [u8; 3],
) -> [u8; 3] {
    let pattern_colour = match tube.colour_pattern.as_str() {
        "ring" if index % 2 == 1 => secondary_colour,
        "depth" => {
            let amount = if count <= 1 {
                0.0
            } else {
                index as f32 / (count - 1) as f32
            };
            mix_rgb_u8(colour, secondary_colour, amount)
        }
        _ => colour,
    };
    mix_rgb_u8(
        pattern_colour,
        fog_colour,
        tube.fog_strength.clamp(0.0, 1.0),
    )
}

fn mix_rgb_u8(left: [u8; 3], right: [u8; 3], amount: f32) -> [u8; 3] {
    let amount = amount.clamp(0.0, 1.0);
    [
        (left[0] as f32 * (1.0 - amount) + right[0] as f32 * amount).round() as u8,
        (left[1] as f32 * (1.0 - amount) + right[1] as f32 * amount).round() as u8,
        (left[2] as f32 * (1.0 - amount) + right[2] as f32 * amount).round() as u8,
    ]
}

fn scale_rgb_u8(colour: [u8; 3], amount: f32) -> [u8; 3] {
    [
        (colour[0] as f32 * amount).round().clamp(0.0, 255.0) as u8,
        (colour[1] as f32 * amount).round().clamp(0.0, 255.0) as u8,
        (colour[2] as f32 * amount).round().clamp(0.0, 255.0) as u8,
    ]
}

fn simple_tube_ellipse_points(
    centre_x: f32,
    centre_y: f32,
    radius_x: f32,
    radius_y: f32,
    segment_count: u32,
    twist: f32,
    random_amount: f32,
    seed: i64,
) -> Vec<(f32, f32)> {
    (0..segment_count)
        .map(|index| {
            let angle = (index as f32 / segment_count as f32) * std::f32::consts::TAU + twist;
            let jitter = if random_amount.abs() <= f32::EPSILON {
                0.0
            } else {
                deterministic_signed_noise(seed, index as i64) * random_amount * 0.01
            };
            let scale = (1.0 + jitter).max(0.1);
            (
                centre_x + angle.cos() * radius_x * scale,
                centre_y + angle.sin() * radius_y * scale,
            )
        })
        .collect()
}

fn deterministic_signed_noise(seed: i64, index: i64) -> f32 {
    let mut value = (seed as u64)
        .wrapping_mul(6364136223846793005)
        .wrapping_add(index as u64)
        .wrapping_add(1442695040888963407);
    value ^= value >> 33;
    value = value.wrapping_mul(0xff51afd7ed558ccd);
    value ^= value >> 33;
    let unit = (value & 0xffff) as f32 / 65535.0;
    unit * 2.0 - 1.0
}

fn draw_region_frame_rectangle_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    line_width: f32,
    background: [u8; 4],
    border: [u8; 4],
) {
    fill_rect_rgba(
        pixels,
        width,
        height,
        0,
        0,
        width as i32,
        height as i32,
        background,
    );
    let line_width = line_width as i32;
    if line_width <= 0 {
        return;
    }
    let right = width as i32;
    let bottom = height as i32;
    fill_rect_rgba(pixels, width, height, 0, 0, right, line_width, border);
    fill_rect_rgba(
        pixels,
        width,
        height,
        0,
        bottom.saturating_sub(line_width),
        right,
        bottom,
        border,
    );
    fill_rect_rgba(pixels, width, height, 0, 0, line_width, bottom, border);
    fill_rect_rgba(
        pixels,
        width,
        height,
        right.saturating_sub(line_width),
        0,
        right,
        bottom,
        border,
    );
}

fn draw_region_frame_ellipse_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    line_width: f32,
    background: [u8; 4],
    border: [u8; 4],
) {
    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let radius_x = centre_x.max(0.5);
    let radius_y = centre_y.max(0.5);
    let inner_radius_x = (radius_x - line_width).max(0.0);
    let inner_radius_y = (radius_y - line_width).max(0.0);

    for y in 0..height {
        for x in 0..width {
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;
            if !point_in_ellipse(px, py, centre_x, centre_y, radius_x, radius_y) {
                continue;
            }
            let colour = if inner_radius_x > 0.0
                && inner_radius_y > 0.0
                && point_in_ellipse(px, py, centre_x, centre_y, inner_radius_x, inner_radius_y)
            {
                background
            } else {
                border
            };
            write_particle_pixel(pixels, width, height, x as i32, y as i32, colour);
        }
    }
}

fn point_in_ellipse(
    x: f32,
    y: f32,
    centre_x: f32,
    centre_y: f32,
    radius_x: f32,
    radius_y: f32,
) -> bool {
    let normalised_x = (x - centre_x) / radius_x.max(0.5);
    let normalised_y = (y - centre_y) / radius_y.max(0.5);
    normalised_x * normalised_x + normalised_y * normalised_y <= 1.0
}

fn draw_region_frame_cut_corner_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    line_width: f32,
    corner_cut: f32,
    background: [u8; 4],
    border: [u8; 4],
) {
    let corner_cut = corner_cut.max(0.0).min((width.min(height) as f32) * 0.5);
    for y in 0..height {
        for x in 0..width {
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;
            if !point_in_cut_corner_region(px, py, width, height, corner_cut, 0.0) {
                continue;
            }
            let colour = if line_width > 0.0
                && point_in_cut_corner_region(px, py, width, height, corner_cut, line_width)
            {
                background
            } else if line_width > 0.0 {
                border
            } else {
                background
            };
            write_particle_pixel(pixels, width, height, x as i32, y as i32, colour);
        }
    }
}

fn point_in_cut_corner_region(
    x: f32,
    y: f32,
    width: u32,
    height: u32,
    corner_cut: f32,
    inset: f32,
) -> bool {
    let left = inset;
    let top = inset;
    let right = width as f32 - inset;
    let bottom = height as f32 - inset;
    if x < left || x >= right || y < top || y >= bottom {
        return false;
    }
    let corner_cut = (corner_cut - inset)
        .max(0.0)
        .min(((right - left).min(bottom - top)) * 0.5);
    if corner_cut <= 0.0 {
        return true;
    }
    if x < left + corner_cut && y < top + corner_cut && (x - left) + (y - top) < corner_cut {
        return false;
    }
    if x >= right - corner_cut && y < top + corner_cut && (right - x) + (y - top) < corner_cut {
        return false;
    }
    if x < left + corner_cut && y >= bottom - corner_cut && (x - left) + (bottom - y) < corner_cut {
        return false;
    }
    if x >= right - corner_cut
        && y >= bottom - corner_cut
        && (right - x) + (bottom - y) < corner_cut
    {
        return false;
    }
    true
}

fn build_generated_getcolor_dots_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedGetColorDots media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let dots: GeneratedGetColorDotsSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedGetColorDots media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_getcolor_dots_source(&dots).map_err(|message| {
        format!(
            "Invalid GeneratedGetColorDots media '{}': {message}",
            media.id
        )
    })?;

    let foreground = parse_hex_colour_source(&dots.foreground_colour).map_err(|message| {
        format!(
            "Invalid GeneratedGetColorDots media '{}': foreground_colour {message}",
            media.id
        )
    })?;
    let secondary = parse_hex_colour_source(&dots.secondary_colour).map_err(|message| {
        format!(
            "Invalid GeneratedGetColorDots media '{}': secondary_colour {message}",
            media.id
        )
    })?;
    let background = parse_hex_colour_source(&dots.background_colour).map_err(|message| {
        format!(
            "Invalid GeneratedGetColorDots media '{}': background_colour {message}",
            media.id
        )
    })?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedGetColorDots media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedGetColorDots media byte length overflows".to_string())?;
    let mut pixels = Vec::with_capacity(byte_len);
    for _ in 0..pixel_count {
        pixels.extend_from_slice(&[background[0], background[1], background[2], 255]);
    }

    if dots.dot_size <= 0.0 {
        return RgbaFrame::from_rgba8(media.width, media.height, pixels)
            .map_err(|error| format!("GeneratedGetColorDots media frame is invalid: {error:?}"));
    }

    let cell_width = media.width as f32 / dots.columns as f32;
    let cell_height = media.height as f32 / dots.rows as f32;
    let max_radius = (cell_width.min(cell_height) * 0.48).max(0.5);
    let base_radius = (dots.dot_size * 0.5).min(max_radius);
    let seed = dots.seed as u64;
    for row in 0..dots.rows {
        for column in 0..dots.columns {
            let index = row.saturating_mul(dots.columns).saturating_add(column);
            let u = if dots.columns > 1 {
                column as f32 / (dots.columns - 1) as f32
            } else {
                0.5
            };
            let v = if dots.rows > 1 {
                row as f32 / (dots.rows - 1) as f32
            } else {
                0.5
            };
            let random = deterministic_unit(seed, index, 11);
            let hue_wave =
                ((u + dots.hue_shift_degrees / 360.0) * std::f32::consts::TAU).sin() * 0.5 + 0.5;
            let luminance = ((u * 0.35) + ((1.0 - v) * 0.35) + (random * 0.2) + (hue_wave * 0.1))
                .clamp(0.0, 1.0);
            let radius_factor = (1.0 - dots.size_influence)
                + dots.size_influence * (0.35 + luminance * dots.luminance_influence);
            let radius = (base_radius * radius_factor).clamp(0.5, max_radius);
            let offset_x = if dots.alternate_rows && row % 2 == 1 {
                cell_width * 0.5
            } else {
                0.0
            };
            let centre_x = (column as f32 + 0.5) * cell_width + offset_x;
            if centre_x >= media.width as f32 {
                continue;
            }
            let centre_y = (row as f32 + 0.5) * cell_height;
            let colour = if luminance >= 0.55 {
                foreground
            } else {
                secondary
            };
            draw_getcolor_dot_shape_rgba(
                &mut pixels,
                media.width,
                media.height,
                centre_x,
                centre_y,
                radius,
                dots.dot_shape.as_deref().unwrap_or("circle"),
                dots.stroke_width.unwrap_or(0.0),
                colour,
                background,
                255,
            );
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedGetColorDots media frame is invalid: {error:?}"))
}

fn draw_getcolor_dot_shape_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius: f32,
    shape: &str,
    stroke_width: f32,
    colour: [u8; 3],
    background: [u8; 3],
    alpha: u8,
) {
    let stroke_width = stroke_width.clamp(0.0, radius);
    match shape {
        "square" => {
            draw_getcolor_square_dot_rgba(
                pixels, width, height, centre_x, centre_y, radius, colour, alpha,
            );
            if stroke_width > 0.0 && radius > stroke_width {
                draw_getcolor_square_dot_rgba(
                    pixels,
                    width,
                    height,
                    centre_x,
                    centre_y,
                    radius - stroke_width,
                    background,
                    alpha,
                );
            }
        }
        "diamond" => {
            draw_getcolor_diamond_dot_rgba(
                pixels, width, height, centre_x, centre_y, radius, colour, alpha,
            );
            if stroke_width > 0.0 && radius > stroke_width {
                draw_getcolor_diamond_dot_rgba(
                    pixels,
                    width,
                    height,
                    centre_x,
                    centre_y,
                    radius - stroke_width,
                    background,
                    alpha,
                );
            }
        }
        _ => {
            draw_filled_circle_rgba(
                pixels, width, height, centre_x, centre_y, radius, colour, alpha,
            );
            if stroke_width > 0.0 && radius > stroke_width {
                draw_filled_circle_rgba(
                    pixels,
                    width,
                    height,
                    centre_x,
                    centre_y,
                    radius - stroke_width,
                    background,
                    alpha,
                );
            }
        }
    }
}

fn draw_getcolor_square_dot_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius: f32,
    colour: [u8; 3],
    alpha: u8,
) {
    fill_rect_rgba(
        pixels,
        width,
        height,
        (centre_x - radius).floor() as i32,
        (centre_y - radius).floor() as i32,
        (centre_x + radius).ceil() as i32,
        (centre_y + radius).ceil() as i32,
        [colour[0], colour[1], colour[2], alpha],
    );
}

fn draw_getcolor_diamond_dot_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius: f32,
    colour: [u8; 3],
    alpha: u8,
) {
    let points = [
        (centre_x, centre_y - radius),
        (centre_x + radius, centre_y),
        (centre_x, centre_y + radius),
        (centre_x - radius, centre_y),
    ];
    fill_polygon_fan_rgba(
        pixels,
        width,
        height,
        &points,
        (centre_x, centre_y),
        colour,
        alpha,
    );
}

fn tone_curve_curve_points(points: &[f32], width: f32, height: f32) -> Vec<(f32, f32)> {
    let last_index = points.len().saturating_sub(1).max(1) as f32;
    points
        .iter()
        .enumerate()
        .map(|(index, value)| {
            let x = index as f32 * (width - 1.0) / last_index;
            let y = (1.0 - value.clamp(0.0, 1.0)) * (height - 1.0);
            (x, y)
        })
        .collect()
}

fn draw_polygon_outline_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    points: &[(f32, f32)],
    colour: [u8; 3],
    line_width: f32,
) {
    if points.len() < 2 {
        return;
    }
    for index in 0..points.len() {
        let start = points[index];
        let end = points[(index + 1) % points.len()];
        draw_line_segment_rgba(pixels, width, height, start, end, colour, line_width);
    }
}

fn fill_polygon_fan_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    points: &[(f32, f32)],
    centre: (f32, f32),
    colour: [u8; 3],
    alpha: u8,
) {
    if points.len() < 3 {
        return;
    }
    for index in 0..points.len() {
        fill_triangle_rgba(
            pixels,
            width,
            height,
            [centre, points[index], points[(index + 1) % points.len()]],
            colour,
            alpha,
        );
    }
}

fn fill_triangle_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    triangle: [(f32, f32); 3],
    colour: [u8; 3],
    alpha: u8,
) {
    let min_x = triangle
        .iter()
        .map(|point| point.0)
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0) as u32;
    let max_x = triangle
        .iter()
        .map(|point| point.0)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = triangle
        .iter()
        .map(|point| point.1)
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0) as u32;
    let max_y = triangle
        .iter()
        .map(|point| point.1)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(height.saturating_sub(1) as f32) as u32;
    for y in min_y..=max_y {
        for x in min_x..=max_x {
            if point_in_triangle(x as f32 + 0.5, y as f32 + 0.5, triangle) {
                let offset = (y as usize * width as usize + x as usize) * 4;
                pixels[offset..offset + 4]
                    .copy_from_slice(&[colour[0], colour[1], colour[2], alpha]);
            }
        }
    }
}

fn fill_disc_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre: (f32, f32),
    radius: f32,
    colour: [u8; 3],
    alpha: u8,
) {
    if width == 0 || height == 0 || radius <= 0.0 {
        return;
    }
    let min_x = (centre.0 - radius).floor().max(0.0) as u32;
    let max_x = (centre.0 + radius)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = (centre.1 - radius).floor().max(0.0) as u32;
    let max_y = (centre.1 + radius)
        .ceil()
        .min(height.saturating_sub(1) as f32) as u32;
    let radius_squared = radius * radius;

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let dx = x as f32 + 0.5 - centre.0;
            let dy = y as f32 + 0.5 - centre.1;
            if dx * dx + dy * dy <= radius_squared {
                let offset = (y as usize * width as usize + x as usize) * 4;
                pixels[offset..offset + 4]
                    .copy_from_slice(&[colour[0], colour[1], colour[2], alpha]);
            }
        }
    }
}

fn draw_line_segment_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    start: (f32, f32),
    end: (f32, f32),
    colour: [u8; 3],
    line_width: f32,
) {
    let half_line = (line_width * 0.5).max(0.5);
    let min_x = (start.0.min(end.0) - half_line - 1.0).floor().max(0.0) as u32;
    let max_x = (start.0.max(end.0) + half_line + 1.0)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = (start.1.min(end.1) - half_line - 1.0).floor().max(0.0) as u32;
    let max_y = (start.1.max(end.1) + half_line + 1.0)
        .ceil()
        .min(height.saturating_sub(1) as f32) as u32;

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            if distance_to_segment(x as f32 + 0.5, y as f32 + 0.5, start, end) <= half_line {
                let offset = (y as usize * width as usize + x as usize) * 4;
                pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
            }
        }
    }
}

fn point_on_circle(centre_x: f32, centre_y: f32, radius: f32, angle: f32) -> (f32, f32) {
    (
        centre_x + angle.cos() * radius,
        centre_y + angle.sin() * radius,
    )
}

fn circular_arrow_angle_in_span(angle: f32, start_angle: f32, span: f32) -> bool {
    let phase = (angle - start_angle).rem_euclid(std::f32::consts::TAU);
    phase <= span
}

fn circular_arrow_head(tip: (f32, f32), tangent_angle: f32, head_size: f32) -> [(f32, f32); 3] {
    let length = head_size.max(0.0);
    let width = length * 0.75;
    let base_centre = (
        tip.0 - tangent_angle.cos() * length,
        tip.1 - tangent_angle.sin() * length,
    );
    let normal = (-tangent_angle.sin(), tangent_angle.cos());
    [
        tip,
        (
            base_centre.0 + normal.0 * width * 0.5,
            base_centre.1 + normal.1 * width * 0.5,
        ),
        (
            base_centre.0 - normal.0 * width * 0.5,
            base_centre.1 - normal.1 * width * 0.5,
        ),
    ]
}

fn point_in_triangle(x: f32, y: f32, triangle: [(f32, f32); 3]) -> bool {
    let area = triangle_edge(triangle[0], triangle[1], (x, y));
    let b = triangle_edge(triangle[1], triangle[2], (x, y));
    let c = triangle_edge(triangle[2], triangle[0], (x, y));
    (area >= 0.0 && b >= 0.0 && c >= 0.0) || (area <= 0.0 && b <= 0.0 && c <= 0.0)
}

fn triangle_edge(a: (f32, f32), b: (f32, f32), p: (f32, f32)) -> f32 {
    (p.0 - a.0) * (b.1 - a.1) - (p.1 - a.1) * (b.0 - a.0)
}

fn distance_to_point(x: f32, y: f32, point_x: f32, point_y: f32) -> f32 {
    let dx = x - point_x;
    let dy = y - point_y;
    (dx * dx + dy * dy).sqrt()
}

fn distance_to_segment(x: f32, y: f32, start: (f32, f32), end: (f32, f32)) -> f32 {
    let vx = end.0 - start.0;
    let vy = end.1 - start.1;
    let length_squared = vx * vx + vy * vy;
    if length_squared <= f32::EPSILON {
        return distance_to_point(x, y, start.0, start.1);
    }
    let t = (((x - start.0) * vx + (y - start.1) * vy) / length_squared).clamp(0.0, 1.0);
    let closest_x = start.0 + vx * t;
    let closest_y = start.1 + vy * t;
    distance_to_point(x, y, closest_x, closest_y)
}

fn fill_rect_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
    colour: [u8; 4],
) {
    let left = left.clamp(0, width as i32);
    let right = right.clamp(0, width as i32);
    let top = top.clamp(0, height as i32);
    let bottom = bottom.clamp(0, height as i32);
    if left >= right || top >= bottom {
        return;
    }
    for y in top..bottom {
        for x in left..right {
            write_particle_pixel(pixels, width, height, x, y, colour);
        }
    }
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

fn validate_generated_barcode_source(source: &GeneratedBarcodeSource) -> Result<(), String> {
    if source.generator != "barcode-t" {
        return Err("generator must be barcode-t".to_string());
    }
    if source.data.is_empty() || source.data.chars().count() > 128 {
        return Err("data length must be 1..128".to_string());
    }
    if source.minimum_bar_width == 0 || source.minimum_bar_width > 32 {
        return Err("minimum_bar_width must be 1..32".to_string());
    }
    if source.horizontal_margin > 1000 {
        return Err("horizontal_margin must be 0..1000".to_string());
    }
    if source.vertical_margin > 1000 {
        return Err("vertical_margin must be 0..1000".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

fn validate_generated_puzzle_piece_source(
    source: &GeneratedPuzzlePieceSource,
) -> Result<(), String> {
    if source.generator != "puzzle-piece" {
        return Err("generator must be puzzle-piece".to_string());
    }
    if source.size == 0 || source.size > 2000 {
        return Err("size must be 1..2000".to_string());
    }
    if source.shape_variant == 0 || source.shape_variant > 22 {
        return Err("shape_variant must be 1..22".to_string());
    }
    if source.connector_mode != "convex" && source.connector_mode != "concave" {
        return Err("connector_mode must be convex or concave".to_string());
    }
    parse_hex_colour_source(&source.fill_colour)?;
    Ok(())
}

fn validate_generated_colour_wheel_source(
    source: &GeneratedColourWheelSource,
) -> Result<(), String> {
    if source.generator != "colour-wheel" {
        return Err("generator must be colour-wheel".to_string());
    }
    if source.radius == 0 || source.radius > 2000 {
        return Err("radius must be 1..2000".to_string());
    }
    if !source.saturation.is_finite() || source.saturation < 0.0 || source.saturation > 100.0 {
        return Err("saturation must be 0..100".to_string());
    }
    if !source.brightness.is_finite() || source.brightness < 0.0 || source.brightness > 100.0 {
        return Err("brightness must be 0..100".to_string());
    }
    if !source.ring_width_percent.is_finite()
        || source.ring_width_percent <= 0.0
        || source.ring_width_percent > 100.0
    {
        return Err("ring_width_percent must be 0..100".to_string());
    }
    if source.segment_count < 3 || source.segment_count > 360 {
        return Err("segment_count must be 3..360".to_string());
    }
    Ok(())
}

fn validate_generated_gourd_source(source: &GeneratedGourdSource) -> Result<(), String> {
    if source.generator != "gourd-tm" {
        return Err("generator must be gourd-tm".to_string());
    }
    if source.body_radius == 0 || source.body_radius > 2000 {
        return Err("body_radius must be 1..2000".to_string());
    }
    if source.body_width == 0 || source.body_width > 4000 {
        return Err("body_width must be 1..4000".to_string());
    }
    if source.waist_radius > 2000 {
        return Err("waist_radius must be 0..2000".to_string());
    }
    if !source.squash_percent.is_finite()
        || source.squash_percent < 0.0
        || source.squash_percent > 100.0
    {
        return Err("squash_percent must be 0..100".to_string());
    }
    if source.repeat_count == 0 || source.repeat_count > 36 {
        return Err("repeat_count must be 1..36".to_string());
    }
    parse_hex_colour_source(&source.fill_colour)?;
    Ok(())
}

fn validate_generated_gear_source(source: &GeneratedGearSource) -> Result<(), String> {
    if source.generator != "gear-t" {
        return Err("generator must be gear-t".to_string());
    }
    if source.outer_radius == 0 || source.outer_radius > 2000 {
        return Err("outer_radius must be 1..2000".to_string());
    }
    if !source.inner_radius_percent.is_finite()
        || source.inner_radius_percent < 0.0
        || source.inner_radius_percent >= 100.0
    {
        return Err("inner_radius_percent must be 0..<100".to_string());
    }
    if source.tooth_count < 3 || source.tooth_count > 240 {
        return Err("tooth_count must be 3..240".to_string());
    }
    if !source.tooth_depth_percent.is_finite()
        || source.tooth_depth_percent <= 0.0
        || source.tooth_depth_percent > 95.0
    {
        return Err("tooth_depth_percent must be 0..95".to_string());
    }
    if !source.tooth_skew_percent.is_finite()
        || source.tooth_skew_percent < -100.0
        || source.tooth_skew_percent > 100.0
    {
        return Err("tooth_skew_percent must be -100..100".to_string());
    }
    parse_hex_colour_source(&source.fill_colour)?;
    Ok(())
}

fn validate_generated_track_bar_source(source: &GeneratedTrackBarSource) -> Result<(), String> {
    if source.generator != "custom-track-bar" {
        return Err("generator must be custom-track-bar".to_string());
    }
    if source.track_values.len() != 4 {
        return Err("track_values must contain 4 values".to_string());
    }
    if source.track_ranges.len() != 4 {
        return Err("track_ranges must contain 4 ranges".to_string());
    }
    if source.labels.len() != 4 {
        return Err("labels must contain 4 values".to_string());
    }
    if source.track_values.iter().any(|value| !value.is_finite()) {
        return Err("track_values must be finite".to_string());
    }
    for range in &source.track_ranges {
        if !range[0].is_finite()
            || !range[1].is_finite()
            || (range[0] - range[1]).abs() < f32::EPSILON
        {
            return Err("track_ranges must be finite non-zero ranges".to_string());
        }
    }
    if source.labels.iter().any(|label| label.chars().count() > 64) {
        return Err("labels must be at most 64 characters".to_string());
    }
    if !source.background_opacity.is_finite()
        || source.background_opacity < 0.0
        || source.background_opacity > 1.0
    {
        return Err("background_opacity must be 0..1".to_string());
    }
    parse_hex_colour_source(&source.bar_colour)?;
    Ok(())
}

fn validate_generated_pie_chart_source(source: &GeneratedPieChartSource) -> Result<(), String> {
    if source.generator != "pie-sheet-graph" {
        return Err("generator must be pie-sheet-graph".to_string());
    }
    if source.values.is_empty() || source.values.len() > 64 {
        return Err("values must contain 1..64 values".to_string());
    }
    if source
        .values
        .iter()
        .any(|value| !value.is_finite() || *value < 0.0)
    {
        return Err("values must be finite non-negative numbers".to_string());
    }
    if source.values.iter().all(|value| *value <= f32::EPSILON) {
        return Err("values must contain at least one positive value".to_string());
    }
    if source.sort_mode != "none"
        && source.sort_mode != "descending"
        && source.sort_mode != "ascending"
    {
        return Err("sort_mode must be none, descending, or ascending".to_string());
    }
    if source.label_mode != "none"
        && source.label_mode != "percentage"
        && source.label_mode != "input"
    {
        return Err("label_mode must be none, percentage, or input".to_string());
    }
    if !source.progress_percent.is_finite()
        || source.progress_percent < 0.0
        || source.progress_percent > 100.0
    {
        return Err("progress_percent must be 0..100".to_string());
    }
    if !source.stroke_width.is_finite() || source.stroke_width <= 0.0 {
        return Err("stroke_width must be positive".to_string());
    }
    if source.slice_colours.is_empty() || source.slice_colours.len() > 64 {
        return Err("slice_colours must contain 1..64 colours".to_string());
    }
    for colour in &source.slice_colours {
        parse_hex_colour_source(colour)?;
    }
    Ok(())
}

fn validate_generated_histogram_source(source: &GeneratedHistogramSource) -> Result<(), String> {
    if source.generator != "simple-histogram" {
        return Err("generator must be simple-histogram".to_string());
    }
    if source.bin_values.is_empty() || source.bin_values.len() > 256 {
        return Err("bin_values must contain 1..256 values".to_string());
    }
    if source
        .bin_values
        .iter()
        .any(|value| !value.is_finite() || *value < 0.0 || *value > 1.0)
    {
        return Err("bin_values must be finite numbers in 0..1".to_string());
    }
    if !source.height_scale_percent.is_finite()
        || source.height_scale_percent <= 0.0
        || source.height_scale_percent > 1000.0
    {
        return Err("height_scale_percent must be 1..1000".to_string());
    }
    if !source.line_width.is_finite() || source.line_width <= 0.0 {
        return Err("line_width must be positive".to_string());
    }
    if !source.show_luminance && !source.show_red && !source.show_green && !source.show_blue {
        return Err("at least one histogram channel must be visible".to_string());
    }
    if source.channel_colours.len() != 4 {
        return Err("channel_colours must contain 4 colours".to_string());
    }
    for colour in &source.channel_colours {
        parse_hex_colour_source(colour)?;
    }
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

fn validate_generated_sunburst_source(source: &GeneratedSunburstSource) -> Result<(), String> {
    if source.generator != "sunrise" {
        return Err("generator must be sunrise".to_string());
    }
    if source.ray_count == 0 || source.ray_count > 360 {
        return Err("ray_count must be 1..360".to_string());
    }
    if !source.ray_coverage_percent.is_finite()
        || source.ray_coverage_percent < 0.0
        || source.ray_coverage_percent > 100.0
    {
        return Err("ray_coverage_percent must be 0..100".to_string());
    }
    if !source.rotation_offset_degrees.is_finite() {
        return Err("rotation_offset_degrees must be finite".to_string());
    }
    if !source.centre_x_percent.is_finite()
        || source.centre_x_percent < -100.0
        || source.centre_x_percent > 200.0
        || !source.centre_y_percent.is_finite()
        || source.centre_y_percent < -100.0
        || source.centre_y_percent > 200.0
    {
        return Err("centre percentages must be -100..200".to_string());
    }
    if source.motif_shape != "circle" && source.motif_shape != "rect" {
        return Err("motif_shape must be circle or rect".to_string());
    }
    parse_hex_colour_source(&source.ray_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

fn validate_generated_circular_arrow_source(
    source: &GeneratedCircularArrowSource,
) -> Result<(), String> {
    if source.generator != "circular-arrow" {
        return Err("generator must be circular-arrow".to_string());
    }
    if source.radius == 0 || source.radius > 2000 {
        return Err("radius must be 1..2000".to_string());
    }
    if source.line_width == 0 || source.line_width > 1000 {
        return Err("line_width must be 1..1000".to_string());
    }
    if source.head_size > 1000 {
        return Err("head_size must be 0..1000".to_string());
    }
    if !source.angle_degrees.is_finite()
        || source.angle_degrees < 0.0
        || source.angle_degrees > 360.0
    {
        return Err("angle_degrees must be 0..360".to_string());
    }
    if !source.centre_angle_degrees.is_finite() {
        return Err("centre_angle_degrees must be finite".to_string());
    }
    if source.head_shape != "triangle" && source.head_shape != "circle" {
        return Err("head_shape must be triangle or circle".to_string());
    }
    parse_hex_colour_source(&source.arrow_colour)?;
    Ok(())
}

fn validate_generated_triangle_bracket_source(
    source: &GeneratedTriangleBracketSource,
) -> Result<(), String> {
    if source.generator != "triangle-bracket" {
        return Err("generator must be triangle-bracket".to_string());
    }
    if source.bracket_width == 0 || source.bracket_width > 2000 {
        return Err("bracket_width must be 1..2000".to_string());
    }
    if !source.angle_degrees.is_finite()
        || source.angle_degrees < 1.0
        || source.angle_degrees > 180.0
    {
        return Err("angle_degrees must be 1..180".to_string());
    }
    if source.arm_length > 2000 {
        return Err("arm_length must be 0..2000".to_string());
    }
    if source.offset_distance < -10000 || source.offset_distance > 10000 {
        return Err("offset_distance must be -10000..10000".to_string());
    }
    parse_hex_colour_source(&source.bracket_colour)?;
    Ok(())
}

fn validate_generated_tartan_check_source(
    source: &GeneratedTartanCheckSource,
) -> Result<(), String> {
    if source.generator != "tartan-check" {
        return Err("generator must be tartan-check".to_string());
    }
    if source.tile_size < 10 || source.tile_size > 800 {
        return Err("tile_size must be 10..800".to_string());
    }
    if source.blur_radius > 300 {
        return Err("blur_radius must be 0..300".to_string());
    }
    parse_hex_colour_source(&source.base_colour)?;
    parse_hex_colour_source(&source.stripe_colour_a)?;
    parse_hex_colour_source(&source.stripe_colour_b)?;
    parse_hex_colour_source(&source.line_colour)?;
    Ok(())
}

fn validate_generated_houndstooth_source(
    source: &GeneratedHoundstoothSource,
) -> Result<(), String> {
    if source.generator != "houndstooth" {
        return Err("generator must be houndstooth".to_string());
    }
    if source.pattern_size < 10 || source.pattern_size > 200 {
        return Err("pattern_size must be 10..200".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

fn validate_generated_yagasuri_source(source: &GeneratedYagasuriSource) -> Result<(), String> {
    if source.generator != "yagasuri" {
        return Err("generator must be yagasuri".to_string());
    }
    if source.arrow_width == 0 || source.arrow_width > 500 {
        return Err("arrow_width must be 1..500".to_string());
    }
    if source.arrow_height == 0 || source.arrow_height > 500 {
        return Err("arrow_height must be 1..500".to_string());
    }
    if source.line_width > 100 {
        return Err("line_width must be 0..100".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

fn validate_generated_paper_airplane_source(
    source: &GeneratedPaperAirplaneSource,
) -> Result<(), String> {
    if source.generator != "paper-airplane" {
        return Err("generator must be paper-airplane".to_string());
    }
    if source.body_length == 0 || source.body_length > 2000 {
        return Err("body_length must be 1..2000".to_string());
    }
    if source.wing_width > 1000 {
        return Err("wing_width must be 0..1000".to_string());
    }
    if source.fold_height > 1000 {
        return Err("fold_height must be 0..1000".to_string());
    }
    if source.gap > 1000 {
        return Err("gap must be 0..1000".to_string());
    }
    if source.axis_mode > 1 {
        return Err("axis_mode must be 0 or 1".to_string());
    }
    let _ = source.follow_motion_direction;
    parse_hex_colour_source(&source.fill_colour)?;
    Ok(())
}

fn validate_generated_asanoha_pattern_source(
    source: &GeneratedAsanohaPatternSource,
) -> Result<(), String> {
    if source.generator != "asanoha-pattern" {
        return Err("generator must be asanoha-pattern".to_string());
    }
    if source.pattern_size < 10 || source.pattern_size > 500 {
        return Err("pattern_size must be 10..500".to_string());
    }
    if source.line_width > 50 {
        return Err("line_width must be 0..50".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

fn validate_generated_focus_lines_plus_source(
    source: &GeneratedFocusLinesPlusSource,
) -> Result<(), String> {
    if source.generator != "focus-lines-plus" {
        return Err("generator must be focus-lines-plus".to_string());
    }
    if !source.ray_width.is_finite() || source.ray_width < 0.1 || source.ray_width > 10.0 {
        return Err("ray_width must be 0.1..10".to_string());
    }
    if !source.gap.is_finite() || source.gap < 1.0 || source.gap > 20.0 {
        return Err("gap must be 1..20".to_string());
    }
    if !source.centre_radius.is_finite()
        || source.centre_radius < 0.0
        || source.centre_radius > 800.0
    {
        return Err("centre_radius must be 0..800".to_string());
    }
    if !source.rotation_degrees.is_finite()
        || source.rotation_degrees < -720.0
        || source.rotation_degrees > 720.0
    {
        return Err("rotation_degrees must be -720..720".to_string());
    }
    if !source.centre_x.is_finite() || !source.centre_y.is_finite() {
        return Err("centre coordinates must be finite".to_string());
    }
    if !source.centre_jitter_percent.is_finite()
        || source.centre_jitter_percent < 0.0
        || source.centre_jitter_percent > 100.0
    {
        return Err("centre_jitter_percent must be 0..100".to_string());
    }
    parse_hex_colour_source(&source.line_colour)?;
    Ok(())
}

fn validate_generated_random_line_ex_source(
    source: &GeneratedRandomLineExSource,
) -> Result<(), String> {
    if source.generator != "random-line-ex" {
        return Err("generator must be random-line-ex".to_string());
    }
    if source.line_count == 0 || source.line_count > 100 {
        return Err("line_count must be 1..100".to_string());
    }
    if !source.line_width.is_finite() || source.line_width < 0.0 || source.line_width > 2000.0 {
        return Err("line_width must be 0..2000".to_string());
    }
    if source.threshold > 255 {
        return Err("threshold must be 0..255".to_string());
    }
    if source.noise_cell_size > 50 {
        return Err("noise_cell_size must be 0..50".to_string());
    }
    if !source.width_variance.is_finite()
        || source.width_variance < 0.0
        || source.width_variance > 2000.0
    {
        return Err("width_variance must be 0..2000".to_string());
    }
    parse_hex_colour_source(&source.line_colour)?;
    Ok(())
}

fn validate_generated_hologram_source(source: &GeneratedHologramSource) -> Result<(), String> {
    if source.generator != "hologram" {
        return Err("generator must be hologram".to_string());
    }
    if source.tile_size < 10 || source.tile_size > 1000 {
        return Err("tile_size must be 10..1000".to_string());
    }
    if !source.rotation_degrees.is_finite()
        || source.rotation_degrees < -720.0
        || source.rotation_degrees > 720.0
    {
        return Err("rotation_degrees must be -720..720".to_string());
    }
    if !source.gradient_angle_degrees.is_finite()
        || source.gradient_angle_degrees < -720.0
        || source.gradient_angle_degrees > 720.0
    {
        return Err("gradient_angle_degrees must be -720..720".to_string());
    }
    if source.colour_mode > 2 {
        return Err("colour_mode must be 0..2".to_string());
    }
    parse_hex_colour_source(&source.tint_colour)?;
    Ok(())
}

fn validate_generated_protractor_source(source: &GeneratedProtractorSource) -> Result<(), String> {
    if source.generator != "protractor" {
        return Err("generator must be protractor".to_string());
    }
    if source.radius == 0 || source.radius > 2000 {
        return Err("radius must be 1..2000".to_string());
    }
    if !source.measured_angle_degrees.is_finite()
        || source.measured_angle_degrees < 0.0
        || source.measured_angle_degrees > 180.0
    {
        return Err("measured_angle_degrees must be 0..180".to_string());
    }
    if source.tick_step_degrees == 0 || source.tick_step_degrees > 90 {
        return Err("tick_step_degrees must be 1..90".to_string());
    }
    if source.major_tick_step_degrees == 0 || source.major_tick_step_degrees > 180 {
        return Err("major_tick_step_degrees must be 1..180".to_string());
    }
    if source.decimal_places > 5 {
        return Err("decimal_places must be 0..5".to_string());
    }
    parse_hex_colour_source(&source.line_colour)?;
    parse_hex_colour_source(&source.text_colour)?;
    parse_hex_colour_source(&source.shadow_colour)?;
    Ok(())
}

fn validate_generated_shaking_polygon_source(
    source: &GeneratedShakingPolygonSource,
) -> Result<(), String> {
    if source.generator != "shaking-polygon" {
        return Err("generator must be shaking-polygon".to_string());
    }
    if source.line_width == 0 || source.line_width > 100 {
        return Err("line_width must be 1..100".to_string());
    }
    if source.vertex_count < 2 || source.vertex_count > 16 {
        return Err("vertex_count must be 2..16".to_string());
    }
    if source.fixed_diameter > 2000 {
        return Err("fixed_diameter must be 0..2000".to_string());
    }
    if !source.vertical_distortion_percent.is_finite()
        || source.vertical_distortion_percent < -100.0
        || source.vertical_distortion_percent > 100.0
    {
        return Err("vertical_distortion_percent must be -100..100".to_string());
    }
    if source.repeat_count == 0 || source.repeat_count > 100 {
        return Err("repeat_count must be 1..100".to_string());
    }
    if source.repeat_frequency == 0 {
        return Err("repeat_frequency must be at least 1".to_string());
    }
    if !source.jitter_range.is_finite() || source.jitter_range < 0.0 || source.jitter_range > 2000.0
    {
        return Err("jitter_range must be 0..2000".to_string());
    }
    if source.jitter_interval == 0 {
        return Err("jitter_interval must be at least 1".to_string());
    }
    parse_hex_colour_source(&source.colour)?;
    Ok(())
}

fn validate_generated_tone_curve_source(source: &GeneratedToneCurveSource) -> Result<(), String> {
    if source.generator != "simple-tone-curve" {
        return Err("generator must be simple-tone-curve".to_string());
    }
    if source.grid_divisions == 0 || source.grid_divisions > 16 {
        return Err("grid_divisions must be 1..16".to_string());
    }
    if source.line_width == 0 || source.line_width > 100 {
        return Err("line_width must be 1..100".to_string());
    }
    if source.curve_points.len() < 2 || source.curve_points.len() > 64 {
        return Err("curve_points length must be 2..64".to_string());
    }
    if !source
        .curve_points
        .iter()
        .all(|point| point.is_finite() && *point >= 0.0 && *point <= 1.0)
    {
        return Err("curve_points must be finite values in 0..1".to_string());
    }
    parse_hex_colour_source(&source.curve_colour)?;
    parse_hex_colour_source(&source.grid_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

fn validate_generated_hksy_checker_grid_source(
    source: &GeneratedHksyCheckerGridSource,
) -> Result<(), String> {
    if source.generator != "hksy-checker-grid" {
        return Err("generator must be hksy-checker-grid".to_string());
    }
    if let Some(pattern) = source.pattern.as_deref() {
        if pattern != "checker-grid"
            && pattern != "diamond"
            && pattern != "measured-grid"
            && pattern != "anchor-line"
        {
            return Err(
                "pattern must be checker-grid, diamond, measured-grid or anchor-line".to_string(),
            );
        }
    }
    if source.cell_size == 0 || source.cell_size > 1000 {
        return Err("cell_size must be 1..1000".to_string());
    }
    if source.line_width > 100 {
        return Err("line_width must be 0..100".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.secondary_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    if let Some(palette_colours) = &source.palette_colours {
        if palette_colours.len() < 2 || palette_colours.len() > 16 {
            return Err("palette_colours must contain 2..16 colours".to_string());
        }
        for colour in palette_colours {
            parse_hex_colour_source(colour)?;
        }
    }
    if let Some(separate_interval) = source.separate_interval {
        if separate_interval == 0 || separate_interval > 1000 {
            return Err("separate_interval must be 1..1000".to_string());
        }
    }
    if let Some(separate_line_width) = source.separate_line_width {
        if separate_line_width > 100 {
            return Err("separate_line_width must be 0..100".to_string());
        }
    }
    if source.pattern.as_deref() == Some("anchor-line") {
        let anchor_points = source
            .anchor_points
            .as_ref()
            .ok_or_else(|| "anchor_points is required for anchor-line".to_string())?;
        if anchor_points.len() < 2 || anchor_points.len() > 16 {
            return Err("anchor_points must contain 2..16 points".to_string());
        }
        if anchor_points.iter().any(|point| {
            !point.x.is_finite()
                || !point.y.is_finite()
                || point.x < -1000.0
                || point.x > 1000.0
                || point.y < -1000.0
                || point.y > 1000.0
        }) {
            return Err("anchor_points must be finite values in -1000..1000".to_string());
        }
        if source.round_caps.is_none() {
            return Err("round_caps is required for anchor-line".to_string());
        }
        let max_join_distance = source
            .max_join_distance
            .ok_or_else(|| "max_join_distance is required for anchor-line".to_string())?;
        if !max_join_distance.is_finite() || !(0.0..=300.0).contains(&max_join_distance) {
            return Err("max_join_distance must be 0..300".to_string());
        }
    }
    Ok(())
}

fn validate_generated_region_frame_source(
    source: &GeneratedRegionFrameSource,
) -> Result<(), String> {
    if source.generator != "region-frame-93" {
        return Err("generator must be region-frame-93".to_string());
    }
    if !source.line_width.is_finite() || !(0.0..=5000.0).contains(&source.line_width) {
        return Err("line_width must be 0..5000".to_string());
    }
    if source.shape != "rectangle" && source.shape != "ellipse" && source.shape != "cut_corner" {
        return Err("shape must be rectangle, ellipse, or cut_corner".to_string());
    }
    if !source.corner_cut.is_finite() || !(0.0..=5000.0).contains(&source.corner_cut) {
        return Err("corner_cut must be 0..5000".to_string());
    }
    if !source.extra_width.is_finite() || !(-5000.0..=5000.0).contains(&source.extra_width) {
        return Err("extra_width must be -5000..5000".to_string());
    }
    if !source.extra_height.is_finite() || !(-5000.0..=5000.0).contains(&source.extra_height) {
        return Err("extra_height must be -5000..5000".to_string());
    }
    if !source.background_opacity.is_finite() || !(0.0..=1.0).contains(&source.background_opacity) {
        return Err("background_opacity must be 0..1".to_string());
    }
    parse_hex_colour_source(&source.frame_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

fn validate_generated_simple_tube_source(source: &GeneratedSimpleTubeSource) -> Result<(), String> {
    if source.generator != "simple-tube-93" {
        return Err("generator must be simple-tube-93".to_string());
    }
    if !source.radius.is_finite() || !(0.0..=9000.0).contains(&source.radius) {
        return Err("radius must be 0..9000".to_string());
    }
    if !source.depth.is_finite() || !(-12000.0..=12000.0).contains(&source.depth) {
        return Err("depth must be -12000..12000".to_string());
    }
    if source.segments < 3 || source.segments > 128 {
        return Err("segments must be 3..128".to_string());
    }
    if source.rings < 2 || source.rings > 128 {
        return Err("rings must be 2..128".to_string());
    }
    if !source.twist_degrees.is_finite() || !(-1800.0..=1800.0).contains(&source.twist_degrees) {
        return Err("twist_degrees must be -1800..1800".to_string());
    }
    if !source.random_amount.is_finite() || !(-300.0..=300.0).contains(&source.random_amount) {
        return Err("random_amount must be -300..300".to_string());
    }
    if !source.stroke_width.is_finite() || !(0.0..=200.0).contains(&source.stroke_width) {
        return Err("stroke_width must be 0..200".to_string());
    }
    if source.colour_pattern != "single"
        && source.colour_pattern != "ring"
        && source.colour_pattern != "depth"
    {
        return Err("colour_pattern must be single, ring, or depth".to_string());
    }
    if !source.fog_strength.is_finite() || !(0.0..=1.0).contains(&source.fog_strength) {
        return Err("fog_strength must be 0..1".to_string());
    }
    parse_hex_colour_source(&source.colour)?;
    parse_hex_colour_source(&source.secondary_colour)?;
    parse_hex_colour_source(&source.fog_colour)?;
    Ok(())
}

fn validate_generated_sphere_dots_source(source: &GeneratedSphereDotsSource) -> Result<(), String> {
    if source.generator != "sphere-drawpixel-93" {
        return Err("generator must be sphere-drawpixel-93".to_string());
    }
    if !source.radius.is_finite() || !(1.0..=5000.0).contains(&source.radius) {
        return Err("radius must be 1..5000".to_string());
    }
    if source.columns < 3 || source.columns > 256 {
        return Err("columns must be 3..256".to_string());
    }
    if source.rows < 2 || source.rows > 256 {
        return Err("rows must be 2..256".to_string());
    }
    if !source.rotation_degrees.is_finite()
        || !(-1000.0..=1000.0).contains(&source.rotation_degrees)
    {
        return Err("rotation_degrees must be -1000..1000".to_string());
    }
    if !source.offset_degrees.is_finite()
        || !(-360.0..=360.0).contains(&source.offset_degrees)
    {
        return Err("offset_degrees must be -360..360".to_string());
    }
    if !source.luminance_influence.is_finite()
        || !(-5000.0..=5000.0).contains(&source.luminance_influence)
    {
        return Err("luminance_influence must be -5000..5000".to_string());
    }
    if !source.point_size.is_finite() || !(0.0..=200.0).contains(&source.point_size) {
        return Err("point_size must be 0..200".to_string());
    }
    if !source.latitude_line_width.is_finite()
        || !(0.0..=100.0).contains(&source.latitude_line_width)
    {
        return Err("latitude_line_width must be 0..100".to_string());
    }
    parse_hex_colour_source(&source.colour)?;
    parse_hex_colour_source(&source.secondary_colour)?;
    Ok(())
}

fn validate_generated_getcolor_dots_source(
    source: &GeneratedGetColorDotsSource,
) -> Result<(), String> {
    if source.generator != "getcolor-v2r-dot-field" {
        return Err("generator must be getcolor-v2r-dot-field".to_string());
    }
    if source.columns == 0 || source.columns > 512 {
        return Err("columns must be 1..512".to_string());
    }
    if source.rows == 0 || source.rows > 512 {
        return Err("rows must be 1..512".to_string());
    }
    if !source.dot_size.is_finite() || source.dot_size < 0.0 || source.dot_size > 2000.0 {
        return Err("dot_size must be 0..2000".to_string());
    }
    if let Some(dot_shape) = source.dot_shape.as_deref() {
        if dot_shape != "circle" && dot_shape != "square" && dot_shape != "diamond" {
            return Err("dot_shape must be circle, square or diamond".to_string());
        }
    }
    if let Some(stroke_width) = source.stroke_width {
        if !stroke_width.is_finite() || !(0.0..=200.0).contains(&stroke_width) {
            return Err("stroke_width must be 0..200".to_string());
        }
    }
    if !source.size_influence.is_finite()
        || source.size_influence < 0.0
        || source.size_influence > 4.0
    {
        return Err("size_influence must be 0..4".to_string());
    }
    if !source.luminance_influence.is_finite()
        || source.luminance_influence < 0.0
        || source.luminance_influence > 4.0
    {
        return Err("luminance_influence must be 0..4".to_string());
    }
    if !source.hue_shift_degrees.is_finite()
        || source.hue_shift_degrees < -720.0
        || source.hue_shift_degrees > 720.0
    {
        return Err("hue_shift_degrees must be -720..720".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.secondary_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

fn hsv_to_rgb8(hue_degrees: f32, saturation: f32, value: f32) -> [u8; 3] {
    let hue = hue_degrees.rem_euclid(360.0) / 60.0;
    let chroma = value * saturation;
    let x = chroma * (1.0 - ((hue % 2.0) - 1.0).abs());
    let m = value - chroma;
    let (red, green, blue) = if hue < 1.0 {
        (chroma, x, 0.0)
    } else if hue < 2.0 {
        (x, chroma, 0.0)
    } else if hue < 3.0 {
        (0.0, chroma, x)
    } else if hue < 4.0 {
        (0.0, x, chroma)
    } else if hue < 5.0 {
        (x, 0.0, chroma)
    } else {
        (chroma, 0.0, x)
    };
    [
        ((red + m).clamp(0.0, 1.0) * 255.0).round() as u8,
        ((green + m).clamp(0.0, 1.0) * 255.0).round() as u8,
        ((blue + m).clamp(0.0, 1.0) * 255.0).round() as u8,
    ]
}

fn puzzle_piece_connectors(shape_variant: u32) -> [(u8, bool); 4] {
    match shape_variant {
        1 => [(0, true), (1, false), (2, true), (3, false)],
        2 => [(0, true), (1, true), (2, false), (3, false)],
        3 => [(0, true), (1, true), (2, true), (3, true)],
        4 => [(0, true), (1, false), (2, false), (3, false)],
        9 | 13 | 18 => [(0, true), (1, false), (2, true), (3, false)],
        10 | 14 | 19 => [(0, true), (1, true), (2, false), (3, false)],
        11 | 15 | 20 => [(0, true), (1, true), (2, true), (3, true)],
        12 | 16 | 21 => [(0, true), (1, false), (2, false), (3, false)],
        17 | 22 => [(0, true), (1, true), (2, true), (3, true)],
        _ => [(0, false), (1, true), (2, false), (3, true)],
    }
}

fn barcode_bar_pattern(data: &str) -> Vec<u8> {
    let mut pattern = vec![2, 1, 1, 2, 1, 4];
    let mut checksum = 104_u32;
    for (position, byte) in data.bytes().enumerate() {
        let value = byte.saturating_sub(32).min(94) as u32;
        checksum = checksum.wrapping_add((position as u32 + 1) * value);
        pattern.extend_from_slice(&[
            ((value % 3) + 1) as u8,
            (((value / 3) % 2) + 1) as u8,
            (((value / 7) % 4) + 1) as u8,
            (((value / 11) % 2) + 1) as u8,
        ]);
    }
    pattern.extend_from_slice(&[
        ((checksum % 4) + 1) as u8,
        (((checksum / 5) % 3) + 1) as u8,
        2,
        3,
        3,
        1,
        1,
    ]);
    pattern
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_barcode_source_frame_contains_background_and_bars() {
        let media = SceneMediaReference {
            id: "barcode-1".to_string(),
            kind: MediaKind::GeneratedBarcode,
            source: r##"{"generator":"barcode-t","data":"AviUtl","minimum_bar_width":2,"horizontal_margin":8,"vertical_margin":6,"foreground_colour":"#000000","background_colour":"#ffffff"}"##.to_string(),
            width: 96,
            height: 48,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_barcode_source_frame(&media)
            .expect("generated barcode frame should render");
        let has_black_bar = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 255]);
        let has_white_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 255, 255, 255]);

        assert!(has_black_bar);
        assert!(has_white_background);
    }

    #[test]
    fn generated_puzzle_piece_source_frame_contains_shape_and_transparency() {
        let media = SceneMediaReference {
            id: "puzzle-1".to_string(),
            kind: MediaKind::GeneratedPuzzlePiece,
            source: r##"{"generator":"puzzle-piece","size":48,"shape_variant":1,"connector_mode":"convex","fill_colour":"#ffffff"}"##.to_string(),
            width: 96,
            height: 96,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_puzzle_piece_source_frame(&media)
            .expect("generated puzzle piece frame should render");
        let has_white_shape = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 255, 255, 255]);
        let has_transparent_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 0]);

        assert!(has_white_shape);
        assert!(has_transparent_background);
    }

    #[test]
    fn generated_colour_wheel_source_frame_contains_hues_and_transparency() {
        let media = SceneMediaReference {
            id: "colour-wheel-1".to_string(),
            kind: MediaKind::GeneratedColourWheel,
            source: r##"{"generator":"colour-wheel","radius":48,"saturation":100,"brightness":100,"ring_width_percent":25,"segment_count":24}"##.to_string(),
            width: 96,
            height: 96,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_colour_wheel_source_frame(&media)
            .expect("generated colour wheel frame should render");
        let has_transparent_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 0]);
        let has_red = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba[0] > 220 && rgba[1] < 80 && rgba[2] < 80 && rgba[3] == 255);
        let has_blue = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba[2] > 220 && rgba[0] < 120 && rgba[1] < 120 && rgba[3] == 255);

        assert!(has_transparent_background);
        assert!(has_red);
        assert!(has_blue);
    }

    #[test]
    fn generated_gourd_source_frame_contains_shape_and_transparency() {
        let media = SceneMediaReference {
            id: "gourd-1".to_string(),
            kind: MediaKind::GeneratedGourd,
            source: r##"{"generator":"gourd-tm","body_radius":80,"body_width":250,"waist_radius":10,"squash_percent":40,"repeat_count":1,"fill_colour":"#ffffff"}"##.to_string(),
            width: 400,
            height: 400,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_gourd_source_frame(&media)
            .expect("generated gourd frame should render");
        let has_white_shape = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 255, 255, 255]);
        let has_transparent_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 0]);

        assert!(has_white_shape);
        assert!(has_transparent_background);
    }

    #[test]
    fn generated_gear_source_frame_contains_teeth_hole_and_transparency() {
        let media = SceneMediaReference {
            id: "gear-1".to_string(),
            kind: MediaKind::GeneratedGear,
            source: r##"{"generator":"gear-t","outer_radius":160,"inner_radius_percent":45,"tooth_count":20,"tooth_depth_percent":18,"tooth_skew_percent":0,"fill_colour":"#ffffff"}"##.to_string(),
            width: 320,
            height: 320,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame =
            build_generated_gear_source_frame(&media).expect("generated gear frame should render");
        let has_white_shape = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 255, 255, 255]);
        let has_transparent_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 0]);
        let centre_offset = ((160 * 320 + 160) * 4) as usize;
        let centre_is_hole = frame.pixels[centre_offset..centre_offset + 4] == [0, 0, 0, 0];

        assert!(has_white_shape);
        assert!(has_transparent_background);
        assert!(centre_is_hole);
    }

    #[test]
    fn generated_track_bar_source_frame_contains_bars_and_background() {
        let media = SceneMediaReference {
            id: "track-bar-1".to_string(),
            kind: MediaKind::GeneratedTrackBar,
            source: r##"{"generator":"custom-track-bar","track_values":[0,25,50,-50],"track_ranges":[[0,100],[0,100],[0,100],[-100,100]],"labels":["TrackA","TrackB","TrackC","TrackD"],"bar_colour":"#ffffff","background_opacity":0.05}"##.to_string(),
            width: 360,
            height: 120,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_track_bar_source_frame(&media)
            .expect("generated track bar frame should render");
        let has_solid_bar = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 255, 255, 255]);
        let has_low_alpha_background = frame.pixels.chunks_exact(4).any(|rgba| {
            rgba[0] == 255 && rgba[1] == 255 && rgba[2] == 255 && rgba[3] > 0 && rgba[3] < 32
        });
        let has_transparent_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 0]);

        assert!(has_solid_bar);
        assert!(has_low_alpha_background);
        assert!(has_transparent_background);
    }

    #[test]
    fn generated_pie_chart_source_frame_contains_slices_hole_and_transparency() {
        let media = SceneMediaReference {
            id: "pie-chart-1".to_string(),
            kind: MediaKind::GeneratedPieChart,
            source: r##"{"generator":"pie-sheet-graph","values":[10,20,30,40],"sort_mode":"descending","normalise_to_hundred":true,"label_mode":"percentage","progress_percent":100,"stroke_width":20,"slice_colours":["#389ba6","#f2e2c4","#f29422","#f27830","#f24b0f"]}"##.to_string(),
            width: 400,
            height: 400,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_pie_chart_source_frame(&media)
            .expect("generated pie chart frame should render");
        let has_first_colour = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0x38, 0x9b, 0xa6, 255]);
        let has_second_colour = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0xf2, 0xe2, 0xc4, 255]);
        let centre_offset = ((200 * 400 + 200) * 4) as usize;
        let centre_is_hole = frame.pixels[centre_offset..centre_offset + 4] == [0, 0, 0, 0];
        let has_transparent_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 0]);

        assert!(has_first_colour);
        assert!(has_second_colour);
        assert!(centre_is_hole);
        assert!(has_transparent_background);
    }

    #[test]
    fn generated_histogram_source_frame_contains_channel_bars_and_background() {
        let media = SceneMediaReference {
            id: "histogram-1".to_string(),
            kind: MediaKind::GeneratedHistogram,
            source: r##"{"generator":"simple-histogram","bin_values":[0.08,0.18,0.32,0.55,0.78,0.92,0.64,0.36],"height_scale_percent":100,"line_width":1,"show_luminance":true,"show_red":true,"show_green":true,"show_blue":true,"channel_colours":["#ffffff","#ff4b4b","#4bff6a","#4b8cff"],"background_colour":"#000000"}"##.to_string(),
            width: 256,
            height: 200,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_histogram_source_frame(&media)
            .expect("generated histogram frame should render");
        let has_luminance = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 255, 255, 255]);
        let has_red = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 75, 75, 255]);
        let has_green = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [75, 255, 106, 255]);
        let has_blue = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [75, 140, 255, 255]);
        let has_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 255]);

        assert!(has_luminance);
        assert!(has_red);
        assert!(has_green);
        assert!(has_blue);
        assert!(has_background);
    }

    #[test]
    fn generated_sunburst_source_frame_contains_rays_background_and_motif() {
        let media = SceneMediaReference {
            id: "sunburst-1".to_string(),
            kind: MediaKind::GeneratedSunburst,
            source: r##"{"generator":"sunrise","ray_count":10,"ray_coverage_percent":50,"rotation_offset_degrees":0,"centre_x_percent":50,"centre_y_percent":50,"motif_size":200,"motif_shape":"circle","ray_colour":"#ff0000","background_colour":"#ffff00"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_sunburst_source_frame(&media)
            .expect("generated sunburst frame should render");
        let has_ray = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 0, 0, 255]);
        let has_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 255, 0, 255]);
        let centre_offset = ((225 * 800 + 400) * 4) as usize;
        let centre_is_motif = frame.pixels[centre_offset..centre_offset + 4] == [255, 0, 0, 255];

        assert!(has_ray);
        assert!(has_background);
        assert!(centre_is_motif);
    }

    #[test]
    fn generated_circular_arrow_source_frame_contains_arc_head_and_transparency() {
        let media = SceneMediaReference {
            id: "circular-arrow-1".to_string(),
            kind: MediaKind::GeneratedCircularArrow,
            source: r##"{"generator":"circular-arrow","radius":80,"line_width":16,"head_size":40,"angle_degrees":260,"centre_angle_degrees":0,"head_shape":"triangle","show_tail_head":false,"flip_vertical":false,"flip_horizontal":false,"arrow_colour":"#ffff00"}"##.to_string(),
            width: 200,
            height: 200,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_circular_arrow_source_frame(&media)
            .expect("generated circular arrow frame should render");
        let yellow_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 0, 255])
            .count();
        let transparent_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();

        assert!(yellow_count > 500);
        assert!(transparent_count > 10_000);
    }

    #[test]
    fn generated_triangle_bracket_source_frame_contains_arms_and_transparency() {
        let media = SceneMediaReference {
            id: "triangle-bracket-1".to_string(),
            kind: MediaKind::GeneratedTriangleBracket,
            source: r##"{"generator":"triangle-bracket","bracket_width":100,"angle_degrees":120,"arm_length":50,"offset_distance":0,"bracket_colour":"#ffffff"}"##.to_string(),
            width: 160,
            height: 100,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_triangle_bracket_source_frame(&media)
            .expect("generated triangle bracket frame should render");
        let white_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let transparent_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();

        assert!(white_count > 300);
        assert!(transparent_count > 10_000);
    }

    #[test]
    fn generated_tartan_check_source_frame_contains_all_pattern_colours() {
        let media = SceneMediaReference {
            id: "tartan-check-1".to_string(),
            kind: MediaKind::GeneratedTartanCheck,
            source: r##"{"generator":"tartan-check","tile_size":100,"blur_radius":1,"base_colour":"#143e10","stripe_colour_a":"#a81616","stripe_colour_b":"#c9c526","line_colour":"#000000"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_tartan_check_source_frame(&media)
            .expect("generated tartan check frame should render");
        let has_base = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0x14, 0x3e, 0x10, 255]);
        let has_stripe_a = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0xa8, 0x16, 0x16, 255]);
        let has_line = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 255]);
        let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

        assert!(has_base);
        assert!(has_stripe_a);
        assert!(has_line);
        assert!(fully_opaque);
    }

    #[test]
    fn generated_houndstooth_source_frame_contains_foreground_background_and_opacity() {
        let media = SceneMediaReference {
            id: "houndstooth-1".to_string(),
            kind: MediaKind::GeneratedHoundstooth,
            source: r##"{"generator":"houndstooth","pattern_size":50,"foreground_colour":"#000000","background_colour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_houndstooth_source_frame(&media)
            .expect("generated houndstooth frame should render");
        let foreground_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [0, 0, 0, 255])
            .count();
        let background_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

        assert!(foreground_count > 100_000);
        assert!(background_count > 100_000);
        assert!(fully_opaque);
    }

    #[test]
    fn generated_yagasuri_source_frame_contains_arrow_pattern_and_opacity() {
        let media = SceneMediaReference {
            id: "yagasuri-1".to_string(),
            kind: MediaKind::GeneratedYagasuri,
            source: r##"{"generator":"yagasuri","arrow_width":15,"arrow_height":65,"line_width":2,"staggered":true,"foreground_colour":"#000000","background_colour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_yagasuri_source_frame(&media)
            .expect("generated yagasuri frame should render");
        let foreground_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [0, 0, 0, 255])
            .count();
        let background_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

        assert!(foreground_count > 80_000);
        assert!(background_count > 120_000);
        assert!(fully_opaque);
    }

    #[test]
    fn generated_paper_airplane_source_frame_contains_wings_shadow_and_transparency() {
        let media = SceneMediaReference {
            id: "paper-airplane-1".to_string(),
            kind: MediaKind::GeneratedPaperAirplane,
            source: r##"{"generator":"paper-airplane","body_length":200,"wing_width":80,"fold_height":50,"gap":50,"follow_motion_direction":false,"axis_mode":0,"fill_colour":"#ffffff"}"##.to_string(),
            width: 320,
            height: 240,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_paper_airplane_source_frame(&media)
            .expect("generated paper airplane frame should render");
        let white_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let shadow_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [184, 184, 184, 255])
            .count();
        let transparent_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();

        assert!(white_count > 5_000);
        assert!(shadow_count > 500);
        assert!(transparent_count > 40_000);
    }

    #[test]
    fn generated_asanoha_pattern_source_frame_contains_foreground_background_and_opacity() {
        let media = SceneMediaReference {
            id: "asanoha-pattern-1".to_string(),
            kind: MediaKind::GeneratedAsanohaPattern,
            source: r##"{"generator":"asanoha-pattern","pattern_size":50,"line_width":2,"foreground_colour":"#000000","background_colour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_asanoha_pattern_source_frame(&media)
            .expect("generated asanoha pattern frame should render");
        let foreground_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [0, 0, 0, 255])
            .count();
        let background_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

        assert!(foreground_count > 5_000);
        assert!(background_count > 100_000);
        assert!(fully_opaque);
    }

    #[test]
    fn generated_focus_lines_plus_source_frame_contains_rays_and_centre_hole() {
        let media = SceneMediaReference {
            id: "focus-lines-plus-1".to_string(),
            kind: MediaKind::GeneratedFocusLinesPlus,
            source: r##"{"generator":"focus-lines-plus","ray_width":1,"gap":5,"centre_radius":100,"rotation_degrees":0,"centre_x":400,"centre_y":225,"centre_jitter_percent":20,"seed":0,"keyframe_interval":0,"line_colour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_focus_lines_plus_source_frame(&media, 0)
            .expect("generated focus lines plus frame should render");
        let white_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let transparent_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();
        let centre_offset = (225_usize * 800 + 400) * 4;
        let centre_is_transparent = frame.pixels[centre_offset + 3] == 0;

        assert!(white_count > 5_000);
        assert!(transparent_count > 150_000);
        assert!(centre_is_transparent);
    }

    #[test]
    fn generated_random_line_ex_source_frame_contains_noisy_lines_and_transparency() {
        let media = SceneMediaReference {
            id: "random-line-ex-1".to_string(),
            kind: MediaKind::GeneratedRandomLineEx,
            source: r##"{"generator":"random-line-ex","line_count":3,"line_width":6,"threshold":128,"noise_cell_size":12,"width_variance":0,"seed":0,"line_colour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_random_line_ex_source_frame(&media)
            .expect("generated random line EX frame should render");
        let white_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let transparent_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();

        assert!(white_count > 1_000);
        assert!(transparent_count > 250_000);
    }

    #[test]
    fn generated_hologram_source_frame_contains_prism_stripes_and_opacity() {
        let media = SceneMediaReference {
            id: "hologram-1".to_string(),
            kind: MediaKind::GeneratedHologram,
            source: r##"{"generator":"hologram","tile_size":80,"rotation_degrees":0,"gradient_angle_degrees":-60,"colour_mode":1,"tint_colour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_hologram_source_frame(&media)
            .expect("generated hologram frame should render");
        let opaque_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 255)
            .count();
        let bright_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[0] > 210 && rgba[1] > 210 && rgba[2] > 210 && rgba[3] == 255)
            .count();
        let shadow_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[0] < 80 && rgba[1] < 85 && rgba[2] < 95 && rgba[3] == 255)
            .count();
        let coloured_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| {
                rgba[3] == 255
                    && ((rgba[0] as i16 - rgba[1] as i16).abs() > 30
                        || (rgba[1] as i16 - rgba[2] as i16).abs() > 30)
            })
            .count();

        assert_eq!(opaque_count, 800 * 450);
        assert!(bright_count > 15_000);
        assert!(shadow_count > 10_000);
        assert!(coloured_count > 40_000);
    }

    #[test]
    fn generated_protractor_source_frame_contains_ticks_angle_line_and_transparency() {
        let media = SceneMediaReference {
            id: "protractor-1".to_string(),
            kind: MediaKind::GeneratedProtractor,
            source: r##"{"generator":"protractor","radius":180,"measured_angle_degrees":90,"tick_step_degrees":10,"major_tick_step_degrees":30,"decimal_places":1,"line_colour":"#ffffff","text_colour":"#ffffff","shadow_colour":"#000000"}"##.to_string(),
            width: 420,
            height: 240,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_protractor_source_frame(&media)
            .expect("generated protractor frame should render");
        let white_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let shadow_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [0, 0, 0, 255])
            .count();
        let transparent_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();
        let centre_offset = (216_usize * 420 + 210) * 4;
        let ninety_degree_line_offset = (80_usize * 420 + 210) * 4;

        assert!(white_count > 2_000);
        assert!(shadow_count > 100);
        assert!(transparent_count > 90_000);
        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            &[255, 255, 255, 255]
        );
        assert_eq!(
            &frame.pixels[ninety_degree_line_offset..ninety_degree_line_offset + 4],
            &[255, 255, 255, 255]
        );
    }

    #[test]
    fn generated_shaking_polygon_source_frame_contains_jittered_outline_and_transparency() {
        let media = SceneMediaReference {
            id: "shaking-polygon-1".to_string(),
            kind: MediaKind::GeneratedShakingPolygon,
            source: r##"{"generator":"shaking-polygon","line_width":20,"vertex_count":3,"fixed_diameter":260,"vertical_distortion_percent":0,"repeat_count":1,"repeat_frequency":1,"fill":false,"jitter_range":20,"jitter_interval":10,"stepped":false,"colour":"#ffffff","seed":0}"##.to_string(),
            width: 360,
            height: 360,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame_a = build_generated_shaking_polygon_source_frame(&media, 0)
            .expect("generated shaking polygon frame should render");
        let frame_b = build_generated_shaking_polygon_source_frame(&media, 60)
            .expect("generated shaking polygon frame should render at a later frame");
        let white_count = frame_a
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let transparent_count = frame_a
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();
        let changed_bytes = frame_a
            .pixels
            .iter()
            .zip(frame_b.pixels.iter())
            .filter(|(left, right)| left != right)
            .count();

        assert!(white_count > 8_000);
        assert!(transparent_count > 90_000);
        assert!(changed_bytes > 2_000);
    }

    #[test]
    fn generated_tone_curve_source_frame_contains_grid_and_curve() {
        let media = SceneMediaReference {
            id: "tone-curve-1".to_string(),
            kind: MediaKind::GeneratedToneCurve,
            source: r##"{"generator":"simple-tone-curve","grid_divisions":4,"line_width":3,"curve_points":[0,0.16,0.42,0.7,1],"curve_colour":"#ffffff","grid_colour":"#333333","background_colour":"#000000"}"##.to_string(),
            width: 360,
            height: 360,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_tone_curve_source_frame(&media)
            .expect("generated tone curve frame should render");
        let white_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let grid_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [51, 51, 51, 255])
            .count();
        let background_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [0, 0, 0, 255])
            .count();

        assert!(white_count > 1_000);
        assert!(grid_count > 2_000);
        assert!(background_count > 100_000);
    }

    #[test]
    fn generated_hksy_checker_grid_source_frame_contains_checker_cells_and_grid() {
        let media = SceneMediaReference {
            id: "hksy-checker-grid-1".to_string(),
            kind: MediaKind::GeneratedHksyCheckerGrid,
            source: r##"{"generator":"hksy-checker-grid","cell_size":50,"line_width":2,"checker_enabled":true,"grid_enabled":true,"foreground_colour":"#ffffff","secondary_colour":"#333333","background_colour":"#000000"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_hksy_checker_grid_source_frame(&media)
            .expect("generated hksy checker grid frame should render");
        let foreground_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let grid_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [51, 51, 51, 255])
            .count();
        let background_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [0, 0, 0, 255])
            .count();
        let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

        assert!(foreground_count > 120_000);
        assert!(grid_count > 15_000);
        assert!(background_count > 120_000);
        assert!(fully_opaque);
    }

    #[test]
    fn generated_hksy_checker_grid_source_frame_uses_palette_colours_for_checker_tiles() {
        let media = SceneMediaReference {
            id: "hksy-multi-colour-checker-1".to_string(),
            kind: MediaKind::GeneratedHksyCheckerGrid,
            source: r##"{"generator":"hksy-checker-grid","cell_size":20,"line_width":0,"checker_enabled":true,"grid_enabled":false,"foreground_colour":"#ff5c8a","secondary_colour":"#36c2ff","background_colour":"#111111","palette_colours":["#ff5c8a","#36c2ff","#ffd166","#70e000"]}"##.to_string(),
            width: 120,
            height: 80,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_hksy_checker_grid_source_frame(&media)
            .expect("generated hksy multi-colour checker frame should render");
        let pink_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 92, 138, 255])
            .count();
        let blue_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [54, 194, 255, 255])
            .count();
        let yellow_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 209, 102, 255])
            .count();
        let green_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [112, 224, 0, 255])
            .count();

        assert!(pink_count > 0);
        assert!(blue_count > 0);
        assert!(yellow_count > 0);
        assert!(green_count > 0);
    }

    #[test]
    fn generated_hksy_checker_grid_source_frame_renders_diamond_pattern_with_transparency() {
        let media = SceneMediaReference {
            id: "hksy-diamond-1".to_string(),
            kind: MediaKind::GeneratedHksyCheckerGrid,
            source: r##"{"generator":"hksy-checker-grid","pattern":"diamond","cell_size":64,"line_width":96,"checker_enabled":false,"grid_enabled":false,"foreground_colour":"#ffffff","secondary_colour":"#ffffff","background_colour":"#000000"}"##.to_string(),
            width: 480,
            height: 360,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_hksy_checker_grid_source_frame(&media)
            .expect("generated hksy diamond frame should render");
        let white_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let transparent_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();
        let centre_offset =
            ((media.height as usize / 2) * media.width as usize + (media.width as usize / 2)) * 4;
        let centre_pixel = &frame.pixels[centre_offset..centre_offset + 4];

        assert!(white_count > 20_000);
        assert!(transparent_count > 40_000);
        assert_eq!(centre_pixel, [0, 0, 0, 0]);
    }

    #[test]
    fn generated_hksy_checker_grid_source_frame_renders_measured_grid_lines() {
        let media = SceneMediaReference {
            id: "hksy-measured-grid-1".to_string(),
            kind: MediaKind::GeneratedHksyCheckerGrid,
            source: r##"{"generator":"hksy-checker-grid","pattern":"measured-grid","cell_size":32,"line_width":1,"checker_enabled":false,"grid_enabled":true,"foreground_colour":"#ffffff","secondary_colour":"#bbeeff","background_colour":"#10131a","separate_interval":5,"separate_line_width":3}"##.to_string(),
            width: 320,
            height: 240,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_hksy_checker_grid_source_frame(&media)
            .expect("generated hksy measured grid frame should render");
        let base_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [16, 19, 26, 255])
            .count();
        let line_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [187, 238, 255, 255])
            .count();
        let separate_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();

        assert!(base_count > 60_000);
        assert!(line_count > 1_000);
        assert!(separate_count > 1_000);
    }

    #[test]
    fn generated_hksy_checker_grid_source_frame_renders_anchor_line_pattern() {
        let media = SceneMediaReference {
            id: "hksy-anchor-line-1".to_string(),
            kind: MediaKind::GeneratedHksyCheckerGrid,
            source: r##"{"generator":"hksy-checker-grid","pattern":"anchor-line","cell_size":64,"line_width":20,"checker_enabled":false,"grid_enabled":false,"foreground_colour":"#ffffff","secondary_colour":"#ffffff","background_colour":"#000000","anchor_points":[{"x":-88,"y":50},{"x":0,"y":-100},{"x":88,"y":50}],"round_caps":true,"max_join_distance":50}"##.to_string(),
            width: 480,
            height: 360,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_hksy_checker_grid_source_frame(&media)
            .expect("generated hksy anchor line frame should render");
        let white_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let transparent_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();
        let apex_offset = ((80_usize * media.width as usize) + 240_usize) * 4;
        let apex_pixel = &frame.pixels[apex_offset..apex_offset + 4];

        assert!(white_count > 6_000);
        assert!(transparent_count > 140_000);
        assert_eq!(apex_pixel, [255, 255, 255, 255]);
    }

    #[test]
    fn generated_getcolor_dots_source_frame_contains_dot_field_and_background() {
        let media = SceneMediaReference {
            id: "getcolor-dot-field-1".to_string(),
            kind: MediaKind::GeneratedGetColorDots,
            source: r##"{"generator":"getcolor-v2r-dot-field","columns":32,"rows":18,"dot_size":14,"size_influence":0.65,"luminance_influence":0.7,"hue_shift_degrees":0,"alternate_rows":true,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_getcolor_dots_source_frame(&media)
            .expect("generated GetColor dot field frame should render");
        let foreground_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let secondary_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [54, 194, 255, 255])
            .count();
        let background_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [0, 0, 0, 255])
            .count();
        let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

        assert!(foreground_count > 10_000);
        assert!(secondary_count > 10_000);
        assert!(background_count > 180_000);
        assert!(fully_opaque);
    }

    #[test]
    fn generated_getcolor_dots_source_frame_renders_diamond_dot_shape() {
        let media = SceneMediaReference {
            id: "getcolor-diamond-dot-field-1".to_string(),
            kind: MediaKind::GeneratedGetColorDots,
            source: r##"{"generator":"getcolor-v2r-dot-field","columns":1,"rows":1,"dot_size":40,"size_influence":0,"luminance_influence":0,"hue_shift_degrees":0,"alternate_rows":false,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93,"dot_shape":"diamond","stroke_width":0}"##.to_string(),
            width: 100,
            height: 100,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_getcolor_dots_source_frame(&media)
            .expect("generated GetColor diamond dot frame should render");
        let centre_offset = ((50_usize * media.width as usize) + 50_usize) * 4;
        let circle_only_corner_offset = ((63_usize * media.width as usize) + 63_usize) * 4;

        assert_ne!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [0, 0, 0, 255]
        );
        assert_eq!(
            &frame.pixels[circle_only_corner_offset..circle_only_corner_offset + 4],
            [0, 0, 0, 255]
        );
    }

    #[test]
    fn generated_getcolor_dots_source_frame_renders_outlined_square_dot_shape() {
        let media = SceneMediaReference {
            id: "getcolor-outlined-square-dot-field-1".to_string(),
            kind: MediaKind::GeneratedGetColorDots,
            source: r##"{"generator":"getcolor-v2r-dot-field","columns":1,"rows":1,"dot_size":40,"size_influence":0,"luminance_influence":0,"hue_shift_degrees":0,"alternate_rows":false,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93,"dot_shape":"square","stroke_width":8}"##.to_string(),
            width: 100,
            height: 100,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_getcolor_dots_source_frame(&media)
            .expect("generated GetColor outlined square dot frame should render");
        let centre_offset = ((50_usize * media.width as usize) + 50_usize) * 4;
        let edge_offset = ((35_usize * media.width as usize) + 50_usize) * 4;

        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [0, 0, 0, 255]
        );
        assert_ne!(&frame.pixels[edge_offset..edge_offset + 4], [0, 0, 0, 255]);
    }

    #[test]
    fn generated_region_frame_source_frame_renders_border_and_background() {
        let media = SceneMediaReference {
            id: "region-frame-1".to_string(),
            kind: MediaKind::GeneratedRegionFrame,
            source: r##"{"generator":"region-frame-93","line_width":10,"shape":"rectangle","extra_width":0,"extra_height":0,"background_opacity":0.2,"frame_colour":"#ffffff","background_colour":"#ccccff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_region_frame_source_frame(&media)
            .expect("generated region frame should render");
        let top_border_offset = ((4_usize * media.width as usize) + 400_usize) * 4;
        let centre_offset = ((225_usize * media.width as usize) + 400_usize) * 4;

        assert_eq!(
            &frame.pixels[top_border_offset..top_border_offset + 4],
            [255, 255, 255, 255]
        );
        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [204, 204, 255, 51]
        );
    }

    #[test]
    fn generated_region_frame_source_frame_renders_ellipse_variant_with_transparent_corners() {
        let media = SceneMediaReference {
            id: "ellipse-region-frame-1".to_string(),
            kind: MediaKind::GeneratedRegionFrame,
            source: r##"{"generator":"region-frame-93","line_width":10,"shape":"ellipse","extra_width":0,"extra_height":0,"background_opacity":0.2,"frame_colour":"#ffffff","background_colour":"#ccccff"}"##.to_string(),
            width: 200,
            height: 120,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_region_frame_source_frame(&media)
            .expect("generated ellipse region frame should render");
        let corner_offset = 0_usize;
        let top_border_offset = ((1_usize * media.width as usize) + 100_usize) * 4;
        let centre_offset = ((60_usize * media.width as usize) + 100_usize) * 4;

        assert_eq!(
            &frame.pixels[corner_offset..corner_offset + 4],
            [0, 0, 0, 0]
        );
        assert_eq!(
            &frame.pixels[top_border_offset..top_border_offset + 4],
            [255, 255, 255, 255]
        );
        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [204, 204, 255, 51]
        );
    }

    #[test]
    fn generated_region_frame_source_frame_renders_cut_corner_variant() {
        let media = SceneMediaReference {
            id: "cut-region-frame-1".to_string(),
            kind: MediaKind::GeneratedRegionFrame,
            source: r##"{"generator":"region-frame-93","line_width":8,"shape":"cut_corner","corner_cut":24,"extra_width":0,"extra_height":0,"background_opacity":0.2,"frame_colour":"#ffffff","background_colour":"#ccccff"}"##.to_string(),
            width: 200,
            height: 120,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_region_frame_source_frame(&media)
            .expect("generated cut-corner region frame should render");
        let corner_offset = 0_usize;
        let top_border_offset = ((1_usize * media.width as usize) + 100_usize) * 4;
        let centre_offset = ((60_usize * media.width as usize) + 100_usize) * 4;

        assert_eq!(
            &frame.pixels[corner_offset..corner_offset + 4],
            [0, 0, 0, 0]
        );
        assert_eq!(
            &frame.pixels[top_border_offset..top_border_offset + 4],
            [255, 255, 255, 255]
        );
        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [204, 204, 255, 51]
        );
    }

    #[test]
    fn generated_simple_tube_source_frame_renders_tube_lines() {
        let media = SceneMediaReference {
            id: "simple-tube-1".to_string(),
            kind: MediaKind::GeneratedSimpleTube,
            source: r##"{"generator":"simple-tube-93","radius":150,"depth":280,"segments":16,"rings":10,"twist_degrees":0,"random_amount":0,"stroke_width":3,"colour":"#0e769f","secondary_colour":"#ffffff","seed":93,"torus":false}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_simple_tube_source_frame(&media)
            .expect("generated SimpleTube frame should render");
        let centre_line_offset = ((225_usize * media.width as usize) + 400_usize) * 4;
        let edge_line_offset = ((225_usize * media.width as usize) + 260_usize) * 4;
        let empty_corner_offset = 0_usize;

        assert_eq!(
            &frame.pixels[centre_line_offset..centre_line_offset + 4],
            [255, 255, 255, 255]
        );
        assert_eq!(
            &frame.pixels[edge_line_offset..edge_line_offset + 4],
            [14, 118, 159, 255]
        );
        assert_eq!(
            &frame.pixels[empty_corner_offset..empty_corner_offset + 4],
            [0, 0, 0, 0]
        );
    }

    #[test]
    fn generated_simple_tube_source_frame_renders_torus_with_fogged_ring_pattern() {
        let media = SceneMediaReference {
            id: "simple-tube-torus-1".to_string(),
            kind: MediaKind::GeneratedSimpleTube,
            source: r##"{"generator":"simple-tube-93","radius":170,"depth":260,"segments":24,"rings":16,"twist_degrees":120,"random_amount":0,"stroke_width":3,"colour":"#0e769f","secondary_colour":"#f9f9f9","colour_pattern":"ring","fog_strength":0.35,"fog_colour":"#ffffff","seed":93,"torus":true}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_simple_tube_source_frame(&media)
            .expect("generated SimpleTube torus frame should render");
        let centre_offset = ((225_usize * media.width as usize) + 400_usize) * 4;
        let right_ring_offset = ((225_usize * media.width as usize) + 553_usize) * 4;
        let empty_corner_offset = 0_usize;

        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [251, 251, 251, 255]
        );
        assert_ne!(
            &frame.pixels[right_ring_offset..right_ring_offset + 4],
            [14, 118, 159, 255]
        );
        assert_eq!(
            &frame.pixels[empty_corner_offset..empty_corner_offset + 4],
            [0, 0, 0, 0]
        );
    }

    #[test]
    fn generated_sphere_dots_source_frame_renders_equator_points() {
        let media = SceneMediaReference {
            id: "sphere-dots-1".to_string(),
            kind: MediaKind::GeneratedSphereDots,
            source: r##"{"generator":"sphere-drawpixel-93","radius":170,"columns":16,"rows":11,"rotation_degrees":0,"offset_degrees":0,"luminance_influence":0,"point_size":6,"latitude_line_width":2,"colour":"#ffffff","secondary_colour":"#36c2ff","seed":93,"plane_mode":false}"##.to_string(),
            width: 480,
            height: 480,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_sphere_dots_source_frame(&media)
            .expect("generated Sphere(DrawPixel) frame should render");
        let right_equator_offset = ((240_usize * media.width as usize) + 410_usize) * 4;
        let centre_offset = ((240_usize * media.width as usize) + 240_usize) * 4;
        let empty_corner_offset = 0_usize;

        assert_eq!(
            &frame.pixels[right_equator_offset..right_equator_offset + 4],
            [255, 255, 255, 255]
        );
        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [54, 194, 255, 255]
        );
        assert_eq!(
            &frame.pixels[empty_corner_offset..empty_corner_offset + 4],
            [0, 0, 0, 0]
        );
    }

    #[test]
    fn generated_spherical_field_source_frame_renders_force_ring() {
        let media = SceneMediaReference {
            id: "spherical-field-1".to_string(),
            kind: MediaKind::GeneratedSphericalField,
            source: r##"{"generator":"spherical-field-93","radius":160,"strength":100,"colour_amount":100,"alpha_amount":0,"line_width":3,"ring_count":4,"vector_count":16,"field_colour":"#ff3b30","secondary_colour":"#36c2ff","background_opacity":0.08,"container":false,"seed":93}"##.to_string(),
            width: 480,
            height: 480,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_spherical_field_source_frame(&media)
            .expect("generated SphericalField frame should render");
        let right_ring_offset = ((240_usize * media.width as usize) + 400_usize) * 4;
        let centre_offset = ((240_usize * media.width as usize) + 240_usize) * 4;
        let empty_corner_offset = 0_usize;

        assert_eq!(
            &frame.pixels[right_ring_offset..right_ring_offset + 4],
            [255, 59, 48, 255]
        );
        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [54, 194, 255, 255]
        );
        assert_eq!(
            &frame.pixels[empty_corner_offset..empty_corner_offset + 4],
            [0, 0, 0, 0]
        );
    }
}
