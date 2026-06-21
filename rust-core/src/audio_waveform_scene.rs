use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AudioWaveformSource {
    pub generator: String,
    pub target_audio_id: String,
    pub target_source: String,
    pub sample_window_seconds: f32,
    pub colour: String,
    pub thickness: f32,
    pub amplitude: f32,
    pub columns: Option<u32>,
    pub rows: Option<u32>,
    pub base_radius: Option<f32>,
    pub audio_influence: Option<f32>,
    pub point_size: Option<f32>,
    pub polygon_size: Option<f32>,
    pub random_amount: Option<f32>,
    pub seed: Option<i64>,
}

impl AudioWaveformSource {
    pub fn from_json(raw: &str) -> Result<Self, AudioWaveformSceneError> {
        let source: Self =
            serde_json::from_str(raw).map_err(|_| AudioWaveformSceneError::InvalidSourceJson)?;
        if source.target_audio_id.is_empty()
            || source.target_source.is_empty()
            || !source.sample_window_seconds.is_finite()
            || source.sample_window_seconds <= 0.0
        {
            return Err(AudioWaveformSceneError::InvalidSourceMetadata);
        }
        match source.generator.as_str() {
            "audio-waveform-r" => {
                if !source.thickness.is_finite()
                    || source.thickness <= 0.0
                    || !source.amplitude.is_finite()
                    || source.amplitude < 0.0
                {
                    return Err(AudioWaveformSceneError::InvalidSourceMetadata);
                }
            }
            "audio-sphere-93" => {
                let columns = source.columns.unwrap_or(0);
                let rows = source.rows.unwrap_or(0);
                let base_radius = source.base_radius.unwrap_or(0.0);
                let audio_influence = source.audio_influence.unwrap_or(-1.0);
                let point_size = source.point_size.unwrap_or(-1.0);
                let polygon_size = source.polygon_size.unwrap_or(-1.0);
                let random_amount = source.random_amount.unwrap_or(-1.0);
                if columns < 2
                    || columns > 64
                    || rows < 2
                    || rows > 64
                    || !base_radius.is_finite()
                    || base_radius <= 0.0
                    || !audio_influence.is_finite()
                    || audio_influence < 0.0
                    || !point_size.is_finite()
                    || point_size < 0.0
                    || !polygon_size.is_finite()
                    || polygon_size < 0.0
                    || !random_amount.is_finite()
                    || random_amount < 0.0
                {
                    return Err(AudioWaveformSceneError::InvalidSourceMetadata);
                }
            }
            _ => return Err(AudioWaveformSceneError::InvalidSourceMetadata),
        }
        Ok(source)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct AudioWaveformLineStrip {
    pub points: Vec<(f32, f32)>,
    pub colour: [f32; 4],
    pub thickness: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioWaveformSceneError {
    InvalidSourceJson,
    InvalidSourceMetadata,
    InvalidSampleRate,
    InvalidFrameRate,
    InvalidDimensions,
}

pub fn build_audio_waveform_line_strip(
    source: &AudioWaveformSource,
    samples: &[f32],
    sample_rate: u32,
    source_frame: u64,
    fps: u32,
    width: u32,
    height: u32,
) -> Result<AudioWaveformLineStrip, AudioWaveformSceneError> {
    if sample_rate == 0 {
        return Err(AudioWaveformSceneError::InvalidSampleRate);
    }
    if fps == 0 {
        return Err(AudioWaveformSceneError::InvalidFrameRate);
    }
    if width == 0 || height == 0 {
        return Err(AudioWaveformSceneError::InvalidDimensions);
    }

    let start_seconds = source_frame as f32 / fps as f32;
    let start_sample = (start_seconds * sample_rate as f32).floor().max(0.0) as usize;
    let samples_to_show = (source.sample_window_seconds * sample_rate as f32)
        .floor()
        .max(1.0) as usize;
    let step = (samples_to_show / width as usize).max(1);
    let centre_y = height as f32 / 2.0;
    let half_height = height as f32 / 2.0;
    let mut points = Vec::with_capacity(width as usize);

    for x in 0..width {
        let sample_index = start_sample.saturating_add(x as usize * step);
        let sample = samples.get(sample_index).copied().unwrap_or(0.0);
        let normalised = if sample.is_finite() {
            sample.clamp(-1.0, 1.0)
        } else {
            0.0
        };
        let y = (centre_y + normalised * half_height * source.amplitude).clamp(0.0, height as f32);
        points.push((x as f32, y));
    }

    Ok(AudioWaveformLineStrip {
        points,
        colour: parse_hex_colour(&source.colour),
        thickness: source.thickness,
    })
}

fn parse_hex_colour(raw: &str) -> [f32; 4] {
    let value = raw.trim().strip_prefix('#').unwrap_or(raw.trim());
    if value.len() != 6 {
        return [0.0, 1.0, 0.0, 1.0];
    }

    let parse = |range: std::ops::Range<usize>| -> f32 {
        u8::from_str_radix(&value[range], 16).unwrap_or(0) as f32 / 255.0
    };

    [parse(0..2), parse(2..4), parse(4..6), 1.0]
}
