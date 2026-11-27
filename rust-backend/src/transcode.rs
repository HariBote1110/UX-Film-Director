use std::collections::HashMap;
use std::fs;
use std::io::{self, BufRead, Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::encode::ffmpeg_video_codec_args;
use crate::local_media_source_path;
use crate::params::{
    normalise_transcode_quality_preset, resolve_transcode_video_bitrate_kbps,
    EncodeTranscodeVideoOverlayParams, EncodeTranscodeVideoParams, NormalisedTranscodeOverlay,
    validate_video_codec_output_path, NormalisedTranscodeOverlayKind, NormalisedTranscodeOverlays,
    VideoCodec,
};
use crate::psd_fast;
use crate::rpc::{response_error, RpcResponse};
use crate::state::{BackendState, PsdOverlayCacheEntry};
use serde_json::{json, Value};

pub(crate) fn handle_encode_transcode_video(
    id: u64,
    params: Value,
    state: &mut BackendState,
) -> RpcResponse {
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
    let video_codec = parsed.video_codec.unwrap_or(VideoCodec::H264);
    if let Err(message) = validate_video_codec_output_path(video_codec, &parsed.output_path) {
        return response_error(id, -32602, message);
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
    let cpu_placement_filter = format!(
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
    let identity_placement = is_identity_placement(
        object_x, object_y, object_width, object_height, parsed.width, parsed.height, overlays.is_empty(),
    );
    let scale_vt_placement = object_x == 0
        && object_y == 0
        && (object_width != parsed.width || object_height != parsed.height);
    let scale_vt_placement = scale_vt_placement && overlays.is_empty() && transcode_videotoolbox_decode_enabled();
    let mut video_decode_path = if scale_vt_placement {
        "videotoolboxScaleVt"
    } else if transcode_videotoolbox_decode_enabled() {
        "videotoolbox"
    } else {
        "cpu"
    };

    let mut cmd = Command::new(&ffmpeg_path);
    cmd.arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-nostats")
        .arg("-y");
    cmd.args(build_transcode_main_input_args(
        start_seconds,
        &parsed.input_path,
        scale_vt_placement,
    ));
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
            build_transcode_filter_complex(&cpu_placement_filter, &overlays, &overlay_inputs);
        cmd.arg("-filter_complex")
            .arg(filter_complex)
            .arg("-map")
            .arg(final_label);
    }
    cmd.arg("-t")
        .arg(format!("{:.6}", parsed.duration_seconds))
        .arg("-progress")
        .arg("pipe:1");
    if !mapped_complex_video && !identity_placement {
        cmd.arg("-vf").arg(if scale_vt_placement {
            format!("scale_vt=w={}:h={}", parsed.width, parsed.height)
        } else {
            cpu_placement_filter.clone()
        });
    }
    cmd.arg("-r")
        .arg(parsed.fps.to_string())
        .args(ffmpeg_video_codec_args(video_codec, video_bitrate_kbps));

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

    let cpu_retry_args = if video_decode_path != "cpu" {
        Some(build_cpu_retry_args(
            &cmd.get_args().map(|arg| arg.to_string_lossy().into_owned()).collect::<Vec<_>>(),
            &cpu_placement_filter,
        ))
    } else {
        None
    };

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

    if !status.success() {
        if let Some(retry_args) = cpu_retry_args {
            let retry_status = Command::new(&ffmpeg_path)
                .args(&retry_args)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
            if matches!(retry_status, Ok(value) if value.success()) {
                video_decode_path = "cpu";
                remove_temporary_transcode_overlay_inputs(&overlays);
                emit_transcode_progress_event(session_id, frame_count, frame_count, "completed");
                return RpcResponse {
                    id,
                    ok: true,
                    result: Some(json!({
                        "transcoded": true, "outputPath": parsed.output_path,
                        "frameCount": frame_count, "width": parsed.width, "height": parsed.height,
                        "fps": parsed.fps, "overlayCount": overlays.len(),
                        "psdOverlayCacheHits": psd_overlay_cache_hits,
                        "includedAudio": audio_path.is_some() || include_source_audio,
                        "videoDecodePath": video_decode_path,
                        "videoCodec": match video_codec { VideoCodec::H264 => "h264", VideoCodec::Hevc => "hevc", VideoCodec::Prores => "prores" },
                        "encodeSettings": { "qualityPreset": quality_preset, "videoBitrateKbps": video_bitrate_kbps },
                    })), error: None,
                };
            }
        }
        let stderr_suffix = if stderr_detail.is_empty() {
            String::new()
        } else {
            format!(" stderr: {stderr_detail}")
        };
        remove_temporary_transcode_overlay_inputs(&overlays);
        return response_error(
            id,
            -32059,
            &format!(
                "Rust transcode ffmpeg exited with failure status: code={:?}.{stderr_suffix}",
                status.code()
            ),
        );
    }
    remove_temporary_transcode_overlay_inputs(&overlays);
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
            "videoDecodePath": video_decode_path,
            "videoCodec": match video_codec { VideoCodec::H264 => "h264", VideoCodec::Hevc => "hevc", VideoCodec::Prores => "prores" },
            "encodeSettings": {
                "qualityPreset": quality_preset,
                "videoBitrateKbps": video_bitrate_kbps,
            },
        })),
        error: None,
    }
}

/// Converts a hardware ffmpeg attempt into the pre-existing CPU-filter command.
/// Kept pure so retry policy and argument removal stay independently testable.
fn build_cpu_retry_args(hardware_args: &[String], cpu_filter: &str) -> Vec<String> {
    let mut result = Vec::with_capacity(hardware_args.len());
    let mut index = 0;
    while index < hardware_args.len() {
        let arg = &hardware_args[index];
        if arg == "-hwaccel" || arg == "-hwaccel_output_format" {
            index += 2;
            continue;
        }
        result.push(arg.clone());
        index += 1;
    }
    if let Some(index) = result.iter().position(|arg| arg == "scale_vt=w=1920:h=1080") {
        result[index] = cpu_filter.to_string();
    } else if let Some(index) = result.iter().position(|arg| arg.starts_with("scale_vt=w=")) {
        result[index] = cpu_filter.to_string();
    }
    result
}

fn is_identity_placement(
    object_x: i32,
    object_y: i32,
    object_width: u32,
    object_height: u32,
    output_width: u32,
    output_height: u32,
    has_no_overlays: bool,
) -> bool {
    object_x == 0
        && object_y == 0
        && object_width == output_width
        && object_height == output_height
        && has_no_overlays
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

pub(crate) fn normalise_transcode_overlays(
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
    let bytes = fs::read(source_path)
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

pub(crate) fn remove_temporary_transcode_overlay_inputs(overlays: &[NormalisedTranscodeOverlay]) {
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

/// Builds the ffmpeg argument sequence that introduces the main video
/// input, requesting VideoToolbox hardware decode on macOS when enabled.
///
/// `-hwaccel` is a decoder option: it must be declared before the `-i` it
/// applies to and it only affects the input that follows it, so overlay
/// image/rawvideo inputs (pushed onto the command separately, after this
/// prefix) are unaffected. `-hwaccel_output_format` is intentionally
/// omitted: the filter chain below runs CPU scale/pad/crop/overlay filters,
/// so frames must land back in system memory after decode rather than
/// staying in a VideoToolbox surface.
fn build_transcode_main_input_args(start_seconds: f64, input_path: &str, videotoolbox_output: bool) -> Vec<String> {
    build_transcode_main_input_args_with_hwaccel(
        start_seconds,
        input_path,
        transcode_videotoolbox_decode_enabled(),
        videotoolbox_output,
    )
}

fn build_transcode_main_input_args_with_hwaccel(
    start_seconds: f64,
    input_path: &str,
    hwaccel_enabled: bool,
    videotoolbox_output: bool,
) -> Vec<String> {
    let mut args = Vec::new();
    if hwaccel_enabled {
        args.push("-hwaccel".to_string());
        args.push("videotoolbox".to_string());
        if videotoolbox_output {
            args.push("-hwaccel_output_format".to_string());
            args.push("videotoolbox_vld".to_string());
        }
    }
    if start_seconds > 0.0 {
        args.push("-ss".to_string());
        args.push(format!("{start_seconds:.6}"));
    }
    args.push("-i".to_string());
    args.push(input_path.to_string());
    args
}

#[cfg(target_os = "macos")]
fn transcode_videotoolbox_decode_enabled() -> bool {
    std::env::var("UXFD_DISABLE_VIDEOTOOLBOX_DECODE")
        .map(|value| value != "1")
        .unwrap_or(true)
}

#[cfg(not(target_os = "macos"))]
fn transcode_videotoolbox_decode_enabled() -> bool {
    false
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

pub(crate) fn build_transcode_filter_complex(
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "macos")]
    fn transcode_main_input_args_use_videotoolbox_before_input_on_macos() {
        let args = build_transcode_main_input_args_with_hwaccel(0.0, "/tmp/input.mp4", true, false);

        let hwaccel_index = args
            .iter()
            .position(|arg| arg == "-hwaccel")
            .expect("macOS transcode decode should request VideoToolbox");
        let input_index = args
            .iter()
            .position(|arg| arg == "-i")
            .expect("ffmpeg input argument");
        assert_eq!(args[hwaccel_index + 1], "videotoolbox");
        assert!(
            hwaccel_index < input_index,
            "VideoToolbox hwaccel must be declared before the main input"
        );
        assert!(
            !args.iter().any(|arg| arg == "-hwaccel_output_format"),
            "hwaccel_output_format must be omitted so CPU filters keep working"
        );
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn transcode_main_input_args_keep_hwaccel_before_seek() {
        let args = build_transcode_main_input_args_with_hwaccel(1.5, "/tmp/input.mp4", true, false);

        let hwaccel_index = args
            .iter()
            .position(|arg| arg == "-hwaccel")
            .expect("macOS transcode decode should request VideoToolbox");
        let seek_index = args
            .iter()
            .position(|arg| arg == "-ss")
            .expect("ffmpeg seek argument");
        let input_index = args
            .iter()
            .position(|arg| arg == "-i")
            .expect("ffmpeg input argument");
        assert!(
            hwaccel_index < seek_index,
            "VideoToolbox hwaccel should precede -ss"
        );
        assert!(seek_index < input_index, "-ss must precede -i");
        assert_eq!(args[seek_index + 1], "1.500000");
        assert_eq!(args[input_index + 1], "/tmp/input.mp4");
    }

    #[test]
    fn transcode_main_input_args_only_target_main_input_slot() {
        // Regardless of platform, only one `-hwaccel` (if any) and exactly
        // one `-i` should be produced by this helper: overlay/audio inputs
        // are appended separately by the caller and must stay unaffected.
        for hwaccel_enabled in [false, true] {
            let args = build_transcode_main_input_args_with_hwaccel(
                0.0,
                "/tmp/input.mp4",
                hwaccel_enabled,
                false,
            );

            assert_eq!(args.iter().filter(|arg| *arg == "-i").count(), 1);
            assert_eq!(
                args.iter().filter(|arg| *arg == "-hwaccel").count(),
                usize::from(hwaccel_enabled)
            );
        }
    }

    #[test]
    fn transcode_main_input_args_disabled_omits_hwaccel() {
        // Mirrors what `transcode_videotoolbox_decode_enabled()` returns
        // when `UXFD_DISABLE_VIDEOTOOLBOX_DECODE=1` (or on non-macOS
        // targets): no `-hwaccel` flag should be emitted at all.
        let args = build_transcode_main_input_args_with_hwaccel(0.0, "/tmp/input.mp4", false, false);

        assert!(
            !args.iter().any(|arg| arg == "-hwaccel"),
            "disabled hwaccel must not appear in the ffmpeg args"
        );
        assert_eq!(args, vec!["-i".to_string(), "/tmp/input.mp4".to_string()]);
    }

    #[test]
    fn cpu_retry_removes_videotoolbox_options_and_restores_cpu_scale() {
        let retry = build_cpu_retry_args(
            &[
                "-hwaccel".into(), "videotoolbox".into(),
                "-hwaccel_output_format".into(), "videotoolbox_vld".into(),
                "-i".into(), "input.mp4".into(), "-vf".into(), "scale_vt=w=1280:h=720".into(),
            ],
            "scale=1280:720,setsar=1",
        );
        assert!(!retry.iter().any(|arg| arg == "-hwaccel"));
        assert!(!retry.iter().any(|arg| arg == "-hwaccel_output_format"));
        assert!(retry.iter().any(|arg| arg == "scale=1280:720,setsar=1"));
    }

    #[test]
    fn identity_placement_omits_the_filter_but_overlay_keeps_cpu_filtering() {
        assert!(is_identity_placement(0, 0, 1920, 1080, 1920, 1080, true));
        assert!(!is_identity_placement(0, 0, 1920, 1080, 1920, 1080, false));
        assert!(!is_identity_placement(8, 0, 1920, 1080, 1920, 1080, true));
    }
}
