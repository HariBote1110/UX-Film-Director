use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;
use uxfd_rust_core::{Nv12IoSurfaceRef, SceneMediaReference, SceneSnapshot};
use uxfd_sidecar_protocol::{ColourMetadata, FrameFormat, SharedFrame};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DecodeStopRequest {
    pub(crate) job_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EncodeStartParams {
    pub(crate) session_id: String,
    pub(crate) file_path: String,
    #[serde(default)]
    pub(crate) audio_path: Option<String>,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) fps: u32,
    #[serde(default)]
    pub(crate) iosurface_encode: bool,
    pub(crate) pixel_format: FrameFormat,
    pub(crate) colour: ColourMetadata,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EncodeWriteFrameParams {
    pub(crate) session_id: String,
    pub(crate) frame_index: u64,
    pub(crate) timestamp_us: u64,
    pub(crate) slot_count: u32,
    pub(crate) frame: SharedFrame,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EncodeWriteNativeFrameParams {
    pub(crate) session_id: String,
    pub(crate) render_id: String,
    pub(crate) frame_index: u64,
    pub(crate) timestamp_us: u64,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) snapshot: SceneSnapshot,
    #[serde(default)]
    pub(crate) media: Vec<SceneMediaReference>,
    pub(crate) sources: Vec<NativeRenderSharedFrameSource>,
    #[serde(default)]
    pub(crate) audio_waveforms: Vec<NativeRenderAudioWaveformSource>,
    #[serde(default)]
    pub(crate) nv12_sources: HashMap<String, Nv12IoSurfaceRef>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EncodeWriteResidentSceneFrameParams {
    pub(crate) session_id: String,
    pub(crate) scene_id: String,
    pub(crate) revision: u64,
    pub(crate) frame_index: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EncodeFinishParams {
    pub(crate) session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EncodeAbortParams {
    pub(crate) session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EncodeTranscodeVideoParams {
    #[serde(default)]
    pub(crate) session_id: Option<String>,
    pub(crate) input_path: String,
    pub(crate) output_path: String,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) fps: u32,
    pub(crate) duration_seconds: f64,
    #[serde(default)]
    pub(crate) start_seconds: Option<f64>,
    #[serde(default)]
    pub(crate) object_x: Option<i32>,
    #[serde(default)]
    pub(crate) object_y: Option<i32>,
    #[serde(default)]
    pub(crate) object_width: Option<u32>,
    #[serde(default)]
    pub(crate) object_height: Option<u32>,
    #[serde(default)]
    pub(crate) audio_path: Option<String>,
    #[serde(default)]
    pub(crate) include_audio: bool,
    #[serde(default)]
    pub(crate) audio_volume: Option<f64>,
    #[serde(default)]
    pub(crate) quality_preset: Option<String>,
    #[serde(default)]
    pub(crate) video_bitrate_kbps: Option<u32>,
    #[serde(default)]
    pub(crate) overlays: Vec<EncodeTranscodeVideoOverlayParams>,
    #[serde(default)]
    pub(crate) ffmpeg_path: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EncodeTranscodeVideoOverlayParams {
    pub(crate) kind: String,
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) width: u32,
    pub(crate) height: u32,
    #[serde(default)]
    pub(crate) colour: Option<String>,
    #[serde(default)]
    pub(crate) opacity: Option<f64>,
    #[serde(default)]
    pub(crate) path: Option<String>,
    #[serde(default)]
    pub(crate) active_layer_ids: Vec<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct NormalisedTranscodeOverlay {
    pub(crate) kind: NormalisedTranscodeOverlayKind,
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) opacity: f64,
}

pub(crate) struct NormalisedTranscodeOverlays {
    pub(crate) overlays: Vec<NormalisedTranscodeOverlay>,
    pub(crate) psd_overlay_cache_hits: u64,
}

#[derive(Debug, Clone)]
pub(crate) enum NormalisedTranscodeOverlayKind {
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

pub(crate) fn normalise_transcode_quality_preset(value: Option<&str>) -> &'static str {
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

pub(crate) fn default_transcode_video_bitrate_kbps(quality_preset: &str) -> u32 {
    match quality_preset {
        "compact" => 4_000,
        "speed" => 6_000,
        "quality" => 14_000,
        _ => 8_000,
    }
}

pub(crate) fn resolve_transcode_video_bitrate_kbps(
    quality_preset: &str,
    requested: Option<u32>,
) -> u32 {
    requested
        .filter(|value| *value > 0)
        .map(|value| value.clamp(500, 80_000))
        .unwrap_or_else(|| default_transcode_video_bitrate_kbps(quality_preset))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeRenderSharedFrameParams {
    pub(crate) render_id: String,
    pub(crate) memory_id: String,
    pub(crate) slot_count: u32,
    pub(crate) pts_frame: u64,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) snapshot: SceneSnapshot,
    #[serde(default)]
    pub(crate) media: Vec<SceneMediaReference>,
    pub(crate) sources: Vec<NativeRenderSharedFrameSource>,
    #[serde(default)]
    pub(crate) audio_waveforms: Vec<NativeRenderAudioWaveformSource>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeRenderSharedFrameSource {
    pub(crate) media_id: String,
    #[serde(default)]
    pub(crate) job_id: Option<String>,
    pub(crate) slot_count: u32,
    pub(crate) frame: SharedFrame,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeRenderAudioWaveformSource {
    pub(crate) media_id: String,
    pub(crate) source: String,
    pub(crate) samples: Vec<f32>,
    pub(crate) sample_rate: u32,
    pub(crate) width: u32,
    pub(crate) height: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeRenderReleaseSharedFrameParams {
    pub(crate) memory_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MediaProbeParams {
    pub(crate) file_path: String,
    #[serde(default)]
    pub(crate) ffprobe_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AudioWaveformSamplesParams {
    pub(crate) source: String,
    pub(crate) sample_rate: u32,
    pub(crate) max_samples: u32,
    #[serde(default)]
    pub(crate) start_seconds: Option<f64>,
    #[serde(default)]
    pub(crate) duration_seconds: Option<f64>,
    #[serde(default)]
    pub(crate) ffmpeg_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PsdParseParams {
    pub(crate) file_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PsdRenderCompositeParams {
    pub(crate) file_path: String,
    /// 指定時はこのレイヤー(stable_id)集合のみを合成する。省略時は
    /// visible な全リーフレイヤーを合成する（psd_fast::composite_visible_psd_layers
    /// と同じ既定動作）。
    #[serde(default)]
    pub(crate) active_layer_ids: Option<Vec<String>>,
}
