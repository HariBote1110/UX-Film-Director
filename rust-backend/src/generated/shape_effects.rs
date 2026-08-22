use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

use super::*;

pub(crate) fn build_generated_puzzle_piece_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedPuzzlePiece media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let puzzle: PuzzlePieceObjectFields = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedPuzzlePiece media '{}': {error}", media.id))?;
    validate_generated_puzzle_piece_source(&puzzle).map_err(|message| {
        format!(
            "Invalid GeneratedPuzzlePiece media '{}': {message}",
            media.id
        )
    })?;
    let [red, green, blue] = parse_hex_colour_source(&puzzle.fill_colour).map_err(|message| {
        format!(
            "Invalid GeneratedPuzzlePiece media '{}': {message}",
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
        .ok_or_else(|| "GeneratedPuzzlePiece media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedPuzzlePiece media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    let centre_x = media.width as f32 / 2.0;
    let centre_y = media.height as f32 / 2.0;
    let half = (puzzle.size / 2.0).min(media.width.min(media.height) as f32 / 2.0);
    let knob_radius = (puzzle.size * 0.18).max(2.0);
    let connector_distance = half;
    let connectors = puzzle_piece_connectors(puzzle.shape_variant);

    for y in 0..media.height {
        for x in 0..media.width {
            let px = x as f32 + 0.5 - centre_x;
            let py = y as f32 + 0.5 - centre_y;
            let mut inside = px.abs() <= half && py.abs() <= half;

            for (direction, enabled) in connectors {
                if !enabled {
                    continue;
                }
                let (cx, cy) = match direction {
                    0 => (0.0, -connector_distance),
                    1 => (connector_distance, 0.0),
                    2 => (0.0, connector_distance),
                    _ => (-connector_distance, 0.0),
                };
                let distance = ((px - cx).powi(2) + (py - cy).powi(2)).sqrt();
                let in_knob = distance <= knob_radius;
                if matches!(puzzle.connector_mode, uxfd_rust_core::PuzzleConnectorMode::Convex) {
                    inside = inside || in_knob;
                } else if in_knob {
                    inside = false;
                }
            }

            if inside {
                write_particle_pixel(
                    &mut pixels,
                    media.width,
                    media.height,
                    x as i32,
                    y as i32,
                    [red, green, blue, 255],
                );
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedPuzzlePiece media frame is invalid: {error:?}"))
}

pub(crate) fn build_generated_gourd_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedGourd media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let gourd: GourdObjectFields = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedGourd media '{}': {error}", media.id))?;
    validate_generated_gourd_source(&gourd)
        .map_err(|message| format!("Invalid GeneratedGourd media '{}': {message}", media.id))?;
    let [red, green, blue] = parse_hex_colour_source(&gourd.fill_colour)
        .map_err(|message| format!("Invalid GeneratedGourd media '{}': {message}", media.id))?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedGourd media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedGourd media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    let radius = (gourd.body_radius as f32 * 0.5).max(1.0);
    let half_width = (gourd.body_width as f32 * 0.5).max(radius);
    let waist = (gourd.waist_radius as f32 * 0.5).min(radius);
    let aspect = (1.0 - gourd.squash_percent * 0.01).clamp(0.05, 1.0);
    let fit_width = media.width as f32 / (half_width * 2.0);
    let fit_height = media.height as f32 / (radius * 2.0);
    let scale = fit_width.min(fit_height).max(0.001) * 0.9;
    let centre_x = media.width as f32 / 2.0;
    let centre_y = media.height as f32 / 2.0;
    let repeats = gourd.repeat_count.max(1);

    for y in 0..media.height {
        for x in 0..media.width {
            let local_x = (x as f32 + 0.5 - centre_x) / scale;
            let local_y = (y as f32 + 0.5 - centre_y) / scale;
            let mut inside = false;
            for index in 0..repeats {
                let angle = index as f32 / repeats as f32 * std::f32::consts::PI;
                let (sin, cos) = angle.sin_cos();
                let rotated_x = local_x * cos + local_y * sin;
                let rotated_y = -local_x * sin + local_y * cos;
                if point_inside_gourd(rotated_x, rotated_y, radius, half_width, waist, aspect) {
                    inside = true;
                    break;
                }
            }
            if inside {
                write_particle_pixel(
                    &mut pixels,
                    media.width,
                    media.height,
                    x as i32,
                    y as i32,
                    [red, green, blue, 255],
                );
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedGourd media frame is invalid: {error:?}"))
}

pub(crate) fn build_generated_gear_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedGear media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let gear: GearObjectFields = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedGear media '{}': {error}", media.id))?;
    validate_generated_gear_source(&gear)
        .map_err(|message| format!("Invalid GeneratedGear media '{}': {message}", media.id))?;
    let [red, green, blue] = parse_hex_colour_source(&gear.fill_colour)
        .map_err(|message| format!("Invalid GeneratedGear media '{}': {message}", media.id))?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedGear media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedGear media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    let centre_x = media.width as f32 / 2.0;
    let centre_y = media.height as f32 / 2.0;
    let outer_radius = (gear.outer_radius as f32).min(media.width.min(media.height) as f32 / 2.0);
    let inner_radius = outer_radius * (gear.inner_radius_percent * 0.01).clamp(0.0, 0.99);
    let root_radius = outer_radius * (1.0 - gear.tooth_depth_percent * 0.01).clamp(0.05, 0.99);
    let tooth_count = gear.tooth_count.max(3) as f32;
    let skew = (gear.tooth_skew_percent * 0.005).clamp(-0.5, 0.5);

    for y in 0..media.height {
        for x in 0..media.width {
            let px = x as f32 + 0.5 - centre_x;
            let py = y as f32 + 0.5 - centre_y;
            let radius = (px * px + py * py).sqrt();
            if radius < inner_radius || radius > outer_radius {
                continue;
            }

            let angle = py.atan2(px).rem_euclid(std::f32::consts::TAU);
            let tooth_phase = (angle / std::f32::consts::TAU * tooth_count + skew).fract();
            let tooth_top = trapezoid_tooth_factor(tooth_phase);
            let boundary = root_radius + (outer_radius - root_radius) * tooth_top;
            if radius <= boundary {
                write_particle_pixel(
                    &mut pixels,
                    media.width,
                    media.height,
                    x as i32,
                    y as i32,
                    [red, green, blue, 255],
                );
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedGear media frame is invalid: {error:?}"))
}
