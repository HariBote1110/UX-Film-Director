use std::collections::HashMap;
use uxfd_golden_harness::{RgbaFrame, RgbaFrameError};
use uxfd_rust_core::{Effect, EvaluatedClip, SamplingMode, SceneSnapshot, Transform};

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
    UnsupportedTransform {
        media_id: String,
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
        validate_transform(&clip)?;

        let gain = clip.effects.iter().fold(1.0_f32, |current_gain, effect| {
            current_gain * effect_gain(effect)
        });

        for y in 0..height {
            for x in 0..width {
                let Some(source_colour) = sample_source(source, &clip.transform, x, y) else {
                    continue;
                };
                let pixel_index = (y as usize) * (width as usize) + x as usize;
                canvas[pixel_index] = source_colour
                    .to_premultiplied(clip.opacity, gain)
                    .over(canvas[pixel_index]);
            }
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
        Effect::ColourAberration { .. } => 1.0,
        Effect::Outline { .. } => 1.0,
        Effect::Wipe { .. } => 1.0,
        Effect::Clipping { .. } => 1.0,
        Effect::SpotLight { .. } => 1.0,
        Effect::DisplacementMap { .. } => 1.0,
    }
}

fn validate_transform(clip: &EvaluatedClip) -> Result<(), ReferenceRenderError> {
    if !clip.transform.rotation_degrees.is_finite()
        || clip.transform.scale_x <= 0.0
        || clip.transform.scale_y <= 0.0
    {
        return Err(ReferenceRenderError::UnsupportedTransform {
            media_id: clip.media_id.clone(),
        });
    }

    Ok(())
}

fn sample_source(
    source: &RgbaFrame,
    transform: &Transform,
    output_x: u32,
    output_y: u32,
) -> Option<StraightLinearRgba> {
    let dx = output_x as f32 - transform.translation_x;
    let dy = output_y as f32 - transform.translation_y;
    let radians = transform.rotation_degrees.to_radians();
    let cos = radians.cos();
    let sin = radians.sin();
    let source_x = (dx * cos + dy * sin) / transform.scale_x;
    let source_y = (-dx * sin + dy * cos) / transform.scale_y;

    if source_x < 0.0
        || source_y < 0.0
        || source_x >= source.width as f32
        || source_y >= source.height as f32
    {
        return None;
    }

    match transform.sampling {
        SamplingMode::Nearest => sample_nearest_source(source, source_x, source_y),
        SamplingMode::Bilinear => sample_bilinear_source(source, source_x, source_y),
    }
}

fn sample_nearest_source(
    source: &RgbaFrame,
    source_x: f32,
    source_y: f32,
) -> Option<StraightLinearRgba> {
    let x = source_x.floor() as u32;
    let y = source_y.floor() as u32;
    Some(load_straight_linear(source, x, y))
}

fn sample_bilinear_source(
    source: &RgbaFrame,
    source_x: f32,
    source_y: f32,
) -> Option<StraightLinearRgba> {
    let x0 = source_x.floor() as u32;
    let y0 = source_y.floor() as u32;
    let x1 = (x0 + 1).min(source.width - 1);
    let y1 = (y0 + 1).min(source.height - 1);
    let tx = source_x - x0 as f32;
    let ty = source_y - y0 as f32;

    let top = load_straight_linear(source, x0, y0).lerp(load_straight_linear(source, x1, y0), tx);
    let bottom =
        load_straight_linear(source, x0, y1).lerp(load_straight_linear(source, x1, y1), tx);

    Some(top.lerp(bottom, ty))
}

fn load_straight_linear(source: &RgbaFrame, x: u32, y: u32) -> StraightLinearRgba {
    let source_index = (y as usize * source.width as usize + x as usize) * 4;
    StraightLinearRgba::from_straight_rgba8(&source.pixels[source_index..source_index + 4])
}

#[derive(Debug, Clone, Copy)]
struct StraightLinearRgba {
    red: f32,
    green: f32,
    blue: f32,
    alpha: f32,
}

impl StraightLinearRgba {
    fn from_straight_rgba8(pixel: &[u8]) -> Self {
        Self {
            red: srgb_u8_to_linear(pixel[0]),
            green: srgb_u8_to_linear(pixel[1]),
            blue: srgb_u8_to_linear(pixel[2]),
            alpha: f32::from(pixel[3]) / 255.0,
        }
    }

    fn lerp(self, other: Self, t: f32) -> Self {
        Self {
            red: lerp(self.red, other.red, t),
            green: lerp(self.green, other.green, t),
            blue: lerp(self.blue, other.blue, t),
            alpha: lerp(self.alpha, other.alpha, t),
        }
    }

    fn to_premultiplied(self, opacity: f32, gain: f32) -> PremultipliedLinearRgba {
        let alpha = self.alpha * opacity;
        PremultipliedLinearRgba {
            red: self.red * gain * alpha,
            green: self.green * gain * alpha,
            blue: self.blue * gain * alpha,
            alpha,
        }
    }
}

fn lerp(left: f32, right: f32, t: f32) -> f32 {
    left + (right - left) * t
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
