use serde_json::{json, Value};
use std::fs;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::params::{
    AudioWaveformSamplesParams, MediaProbeParams, PsdParseParams, PsdRenderCompositeParams,
};
use crate::psd_fast;
use crate::rpc::{response_error, RpcResponse};
use crate::state::{BackendState, BlobWriteResult};

pub(crate) fn handle_media_probe(id: u64, params: Value) -> RpcResponse {
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

pub(crate) fn handle_audio_waveform_samples(id: u64, params: Value) -> RpcResponse {
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

pub(crate) fn handle_psd_parse(id: u64, params: Value, state: &mut BackendState) -> RpcResponse {
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

    let tmp_path = {
        let pid = std::process::id();
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("uxfd-psd-{pid}-{ts}.raw"))
    };
    let tmp_path_str = tmp_path.to_string_lossy().into_owned();

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

/// Metadata-only counterpart to `psd.parse`: returns the same layer-tree
/// `nodes` JSON but skips the RGBA blob write entirely (no background
/// thread, no `state.psd_blob_result`, no temp file). Preview rendering
/// stays untouched — it already re-decodes the PSD independently via
/// `source_frames.rs`, so ag-psd's pixel bitmaps were dead data for display.
pub(crate) fn handle_psd_parse_meta(id: u64, params: Value, _state: &mut BackendState) -> RpcResponse {
    let parsed = match serde_json::from_value::<PsdParseParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(id, -32602, &format!("Invalid psd.parseMeta params: {error}"));
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

    let nodes: Vec<Value> = result
        .layers
        .iter()
        .enumerate()
        .map(|(idx, layer)| {
            let psd_id: Value = if layer.is_group {
                layer.own_group_id.map(|v| json!(v)).unwrap_or(json!(idx))
            } else {
                json!(idx)
            };

            let parent_psd_id: Value = layer
                .parent_group_id
                .map(|v| json!(v))
                .unwrap_or(Value::Null);

            json!({
                "psdId": psd_id,
                "parentPsdId": parent_psd_id,
                "isGroup": layer.is_group,
                "name": layer.name,
                "width": layer.width,
                "height": layer.height,
                "top": layer.top,
                "left": layer.left,
                "defaultVisible": layer.visible,
                "order": idx,
            })
        })
        .collect();

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "width": result.width,
            "height": result.height,
            "nodes": nodes,
        })),
        error: None,
    }
}

pub(crate) fn handle_psd_await_blob(id: u64, state: &mut BackendState) -> RpcResponse {
    let shared = match state.psd_blob_result.take() {
        Some(s) => s,
        None => return response_error(id, -32030, "No pending PSD blob write"),
    };

    loop {
        {
            let guard = shared.lock().unwrap();
            if guard.is_some() {
                break;
            }
        }
        std::thread::sleep(Duration::from_millis(5));
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

/// PSDファイルを解析し、visible なレイヤー（または `activeLayerIds` で
/// 指定したレイヤーのみ）を合成した単一の RGBA ラスタを返す。3Dステージ
/// モードの PSD ビルボードは PixiJS の `renderer.extract.canvas` に依存
/// していたが撤去済みのため、同じ「PSDファイル→合成RGBA」を rust-backend
/// 側で提供する。ピクセルデータは `psd.parse` と同じ非同期一時ファイル
/// 経由（`psd.await_blob` で待ち受け）で受け渡す。
pub(crate) fn handle_psd_render_composite(
    id: u64,
    params: Value,
    state: &mut BackendState,
) -> RpcResponse {
    let parsed = match serde_json::from_value::<PsdRenderCompositeParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid psd.renderComposite params: {error}"),
            );
        }
    };

    if parsed.file_path.trim().is_empty() {
        return response_error(id, -32602, "filePath must not be empty");
    }

    let bytes = match fs::read(&parsed.file_path) {
        Ok(b) => b,
        Err(e) => return response_error(id, -32020, &format!("Failed to read PSD file: {e}")),
    };

    let psd = match psd_fast::parse_psd_fast(&bytes) {
        Ok(r) => r,
        Err(e) => return response_error(id, -32021, &format!("Failed to parse PSD: {e}")),
    };

    let frame = match psd_fast::select_psd_composite_frame(
        &psd,
        parsed.active_layer_ids.as_deref(),
    ) {
        Ok(f) => f,
        Err(e) => return response_error(id, -32022, &format!("Failed to composite PSD: {e}")),
    };

    let tmp_path = {
        let pid = std::process::id();
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("uxfd-psd-composite-{pid}-{ts}.raw"))
    };
    let tmp_path_str = tmp_path.to_string_lossy().into_owned();

    let blob_result: BlobWriteResult = Arc::new(Mutex::new(None));
    let blob_result_clone = Arc::clone(&blob_result);
    let write_path = tmp_path.clone();
    let pixels = frame.pixels;
    std::thread::spawn(move || {
        let outcome = fs::write(&write_path, &pixels)
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
            "width": frame.width,
            "height": frame.height,
        })),
        error: None,
    }
}
