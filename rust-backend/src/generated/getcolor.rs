use crate::{is_jpeg_source, is_psd_source, local_media_source_path, psd_fast};
use std::fs;
use uxfd_golden_harness::{load_rgba_jpeg, load_rgba_png, RgbaFrame};
use uxfd_rust_core::SceneMediaReference;

use super::*;

pub(crate) fn build_generated_getcolor_dots_source_frame(
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
    let sample_frame = if let Some(source_image) = dots.source_image.as_deref() {
        Some(load_getcolor_source_image_frame(
            source_image,
            dots.source_active_layer_ids.as_deref().unwrap_or(&[]),
            &media.id,
        )?)
    } else {
        None
    };
    let sample_strength = dots.sample_strength.unwrap_or(1.0).clamp(0.0, 1.0);
    let sample_hue_shift_degrees = dots
        .sample_hue_shift_degrees
        .unwrap_or(0.0)
        .clamp(-720.0, 720.0);

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
            let (colour, alpha) = sample_getcolor_dot_colour(
                sample_frame.as_ref(),
                u,
                v,
                colour,
                255,
                sample_strength,
                sample_hue_shift_degrees,
            );
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
                alpha,
            );
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedGetColorDots media frame is invalid: {error:?}"))
}

pub(crate) fn load_generated_getcolor_sample_frame(
    media: &SceneMediaReference,
) -> Result<Option<RgbaFrame>, String> {
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
    dots.source_image
        .as_deref()
        .map(|source_image| {
            load_getcolor_source_image_frame(
                source_image,
                dots.source_active_layer_ids.as_deref().unwrap_or(&[]),
                &media.id,
            )
        })
        .transpose()
}

fn load_getcolor_source_image_frame(
    source: &str,
    active_layer_ids: &[String],
    media_id: &str,
) -> Result<RgbaFrame, String> {
    let source_path = local_media_source_path(source, "GeneratedGetColorDots source_image")?;
    if is_psd_source(&source_path) {
        return load_getcolor_psd_source_frame(&source_path, active_layer_ids, media_id);
    }
    if is_jpeg_source(&source_path) {
        return load_rgba_jpeg(&source_path).map_err(|error| {
            format!(
                "Invalid GeneratedGetColorDots media '{media_id}': failed to load source_image JPEG: {error:?}"
            )
        });
    }

    load_rgba_png(&source_path).map_err(|error| {
        format!(
            "Invalid GeneratedGetColorDots media '{media_id}': failed to load source_image PNG: {error:?}"
        )
    })
}

fn load_getcolor_psd_source_frame(
    source_path: &str,
    active_layer_ids: &[String],
    media_id: &str,
) -> Result<RgbaFrame, String> {
    let bytes = fs::read(source_path).map_err(|error| {
        format!(
            "Invalid GeneratedGetColorDots media '{media_id}': failed to read source_image PSD: {error}"
        )
    })?;
    let psd = psd_fast::parse_psd_fast(&bytes).map_err(|error| {
        format!(
            "Invalid GeneratedGetColorDots media '{media_id}': failed to parse source_image PSD: {error}"
        )
    })?;
    psd_fast::composite_visible_psd_layers_with_active_layer_ids(&psd, active_layer_ids).map_err(
        |error| {
            format!(
                "Invalid GeneratedGetColorDots media '{media_id}': failed to composite source_image PSD: {error}"
            )
        },
    )
}

fn sample_getcolor_dot_colour(
    source: Option<&RgbaFrame>,
    u: f32,
    v: f32,
    fallback_colour: [u8; 3],
    fallback_alpha: u8,
    sample_strength: f32,
    sample_hue_shift_degrees: f32,
) -> ([u8; 3], u8) {
    let Some(source) = source else {
        return (fallback_colour, fallback_alpha);
    };
    if sample_strength <= 0.0 || source.width == 0 || source.height == 0 {
        return (fallback_colour, fallback_alpha);
    }

    let sample_x = ((source.width.saturating_sub(1)) as f32 * u.clamp(0.0, 1.0)).round() as u32;
    let sample_y = ((source.height.saturating_sub(1)) as f32 * v.clamp(0.0, 1.0)).round() as u32;
    let offset = ((sample_y as usize * source.width as usize) + sample_x as usize) * 4;
    if offset + 3 >= source.pixels.len() {
        return (fallback_colour, fallback_alpha);
    }

    let sampled = [
        source.pixels[offset],
        source.pixels[offset + 1],
        source.pixels[offset + 2],
    ];
    let sampled_alpha = source.pixels[offset + 3];
    let mix_channel = |fallback: u8, sampled: u8| -> u8 {
        ((fallback as f32 * (1.0 - sample_strength)) + (sampled as f32 * sample_strength))
            .round()
            .clamp(0.0, 255.0) as u8
    };

    let mixed_colour = [
        mix_channel(fallback_colour[0], sampled[0]),
        mix_channel(fallback_colour[1], sampled[1]),
        mix_channel(fallback_colour[2], sampled[2]),
    ];
    let colour = if sample_hue_shift_degrees.abs() > f32::EPSILON {
        shift_rgb_hue(mixed_colour, sample_hue_shift_degrees)
    } else {
        mixed_colour
    };

    (colour, mix_channel(fallback_alpha, sampled_alpha))
}

fn shift_rgb_hue(colour: [u8; 3], shift_degrees: f32) -> [u8; 3] {
    let (hue, saturation, value) = rgb8_to_hsv(colour);
    hsv_to_rgb8(hue + shift_degrees, saturation, value)
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

fn rgb8_to_hsv(colour: [u8; 3]) -> (f32, f32, f32) {
    let red = colour[0] as f32 / 255.0;
    let green = colour[1] as f32 / 255.0;
    let blue = colour[2] as f32 / 255.0;
    let max = red.max(green).max(blue);
    let min = red.min(green).min(blue);
    let delta = max - min;
    let hue = if delta <= f32::EPSILON {
        0.0
    } else if (max - red).abs() <= f32::EPSILON {
        60.0 * ((green - blue) / delta).rem_euclid(6.0)
    } else if (max - green).abs() <= f32::EPSILON {
        60.0 * (((blue - red) / delta) + 2.0)
    } else {
        60.0 * (((red - green) / delta) + 4.0)
    };
    let saturation = if max <= f32::EPSILON {
        0.0
    } else {
        delta / max
    };
    (hue, saturation, max)
}
