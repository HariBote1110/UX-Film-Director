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
}

impl AudioWaveformSource {
    pub fn from_json(raw: &str) -> Result<Self, AudioWaveformSceneError> {
        let source: Self =
            serde_json::from_str(raw).map_err(|_| AudioWaveformSceneError::InvalidSourceJson)?;
        if source.generator != "audio-waveform-r"
            || source.target_audio_id.is_empty()
            || source.target_source.is_empty()
            || !source.sample_window_seconds.is_finite()
            || source.sample_window_seconds <= 0.0
            || !source.thickness.is_finite()
            || source.thickness <= 0.0
            || !source.amplitude.is_finite()
            || source.amplitude < 0.0
        {
            return Err(AudioWaveformSceneError::InvalidSourceMetadata);
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
