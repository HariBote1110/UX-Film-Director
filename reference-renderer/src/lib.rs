use std::collections::HashMap;
use uxfd_golden_harness::{RgbaFrame, RgbaFrameError};
use uxfd_rust_core::{Effect, SceneSnapshot};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReferenceRenderError {
    MissingSource {
        media_id: String,
    },
    SourceSizeMismatch {
        media_id: String,
        expected_width: u32,
        expected_height: u32,
        actual_width: u32,
        actual_height: u32,
    },
    InvalidFrame(RgbaFrameError),
}

pub fn render_reference_frame(
    snapshot: &SceneSnapshot,
    sources: &HashMap<String, RgbaFrame>,
    width: u32,
    height: u32,
) -> Result<RgbaFrame, ReferenceRenderError> {
    let pixel_count = (width as usize) * (height as usize);
    let mut canvas = vec![PremultipliedLinearRgba::transparent(); pixel_count];

    let mut clips = snapshot.clips.clone();
    clips.sort_by_key(|clip| clip.z_index);

    for clip in clips {
        let source =
            sources
                .get(&clip.media_id)
                .ok_or_else(|| ReferenceRenderError::MissingSource {
                    media_id: clip.media_id.clone(),
                })?;
        if source.width != width || source.height != height {
            return Err(ReferenceRenderError::SourceSizeMismatch {
                media_id: clip.media_id,
                expected_width: width,
                expected_height: height,
                actual_width: source.width,
                actual_height: source.height,
            });
        }

        let gain = clip.effects.iter().fold(1.0_f32, |current_gain, effect| {
            current_gain * effect_gain(effect)
        });

        for (pixel_index, source_pixel) in source.pixels.chunks_exact(4).enumerate() {
            let source_colour =
                PremultipliedLinearRgba::from_straight_rgba8(source_pixel, clip.opacity, gain);
            canvas[pixel_index] = source_colour.over(canvas[pixel_index]);
        }
    }

    let mut pixels = Vec::with_capacity(pixel_count * 4);
    for pixel in canvas {
        pixels.extend(pixel.to_straight_rgba8());
    }

    RgbaFrame::from_rgba8(width, height, pixels).map_err(ReferenceRenderError::InvalidFrame)
}

fn effect_gain(effect: &Effect) -> f32 {
    match effect {
        Effect::LinearGain { gain } => *gain,
    }
}

#[derive(Debug, Clone, Copy)]
struct PremultipliedLinearRgba {
    red: f32,
    green: f32,
    blue: f32,
    alpha: f32,
}

impl PremultipliedLinearRgba {
    fn transparent() -> Self {
        Self {
            red: 0.0,
            green: 0.0,
            blue: 0.0,
            alpha: 0.0,
        }
    }

    fn from_straight_rgba8(pixel: &[u8], opacity: f32, gain: f32) -> Self {
        let alpha = (f32::from(pixel[3]) / 255.0) * opacity;
        Self {
            red: srgb_u8_to_linear(pixel[0]) * gain * alpha,
            green: srgb_u8_to_linear(pixel[1]) * gain * alpha,
            blue: srgb_u8_to_linear(pixel[2]) * gain * alpha,
            alpha,
        }
    }

    fn over(self, destination: Self) -> Self {
        let inverse_alpha = 1.0 - self.alpha;
        Self {
            red: self.red + destination.red * inverse_alpha,
            green: self.green + destination.green * inverse_alpha,
            blue: self.blue + destination.blue * inverse_alpha,
            alpha: self.alpha + destination.alpha * inverse_alpha,
        }
    }

    fn to_straight_rgba8(self) -> [u8; 4] {
        if self.alpha <= 0.0 {
            return [0, 0, 0, 0];
        }

        [
            linear_to_srgb_u8(self.red / self.alpha),
            linear_to_srgb_u8(self.green / self.alpha),
            linear_to_srgb_u8(self.blue / self.alpha),
            encode_unorm8(self.alpha),
        ]
    }
}

fn srgb_u8_to_linear(value: u8) -> f32 {
    let encoded = f32::from(value) / 255.0;
    if encoded <= 0.04045 {
        encoded / 12.92
    } else {
        ((encoded + 0.055) / 1.055).powf(2.4)
    }
}

fn linear_to_srgb_u8(value: f32) -> u8 {
    let linear = value.clamp(0.0, 1.0);
    let encoded = if linear <= 0.003_130_8 {
        linear * 12.92
    } else {
        1.055 * linear.powf(1.0 / 2.4) - 0.055
    };

    encode_unorm8(encoded)
}

fn encode_unorm8(value: f32) -> u8 {
    (value.clamp(0.0, 1.0) * 255.0).round() as u8
}
