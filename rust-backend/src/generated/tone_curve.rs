use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

use super::*;

pub(crate) fn build_generated_tone_curve_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedToneCurve media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let tone_curve: ToneCurveObjectFields = serde_json::from_str(&media.source)
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
