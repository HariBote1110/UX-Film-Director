use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

use super::*;

pub(crate) fn build_generated_tartan_check_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedTartanCheck media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let tartan: TartanCheckObjectFields = serde_json::from_str(&media.source)
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
    let tile_size = tartan.tile_size.round().max(10.0) as u32;
    let blur_radius = tartan.blur_radius.round().max(0.0) as u32;
    let tile = tile_size.max(10);
    let red_band = (tile / 4).max(2);
    let yellow_band = (tile / 5).max(2);
    let line_width = (blur_radius + 1).min(tile / 8).max(1);

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

pub(crate) fn build_generated_houndstooth_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedHoundstooth media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let houndstooth: HoundstoothObjectFields = serde_json::from_str(&media.source)
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
    let pattern_size = houndstooth.pattern_size.round().max(10.0) as u32;
    let tooth = pattern_size.max(10);
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

pub(crate) fn build_generated_yagasuri_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedYagasuri media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let yagasuri: YagasuriObjectFields = serde_json::from_str(&media.source)
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
    let arrow_width = yagasuri.arrow_width.max(1.0);
    let arrow_height = yagasuri.arrow_height.max(1.0);
    let line_width = yagasuri.line_width;
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
