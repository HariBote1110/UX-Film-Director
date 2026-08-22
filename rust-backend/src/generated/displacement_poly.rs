use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

use super::*;

pub(crate) fn build_generated_displacement_poly_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedDisplacementPoly media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let displacement: DisplacementPolyObjectFields = serde_json::from_str(&media.source)
        .map_err(|error| {
            format!(
                "Invalid GeneratedDisplacementPoly media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_displacement_poly_source(&displacement).map_err(|message| {
        format!(
            "Invalid GeneratedDisplacementPoly media '{}': {message}",
            media.id
        )
    })?;
    let line_colour = parse_hex_colour_source(&displacement.line_colour).map_err(|message| {
        format!(
            "Invalid GeneratedDisplacementPoly media '{}': {message}",
            media.id
        )
    })?;
    let line_colour = blend_rgb8([0, 0, 0], line_colour, displacement.mesh_opacity);
    let fill_colour = parse_hex_colour_source(&displacement.fill_colour).map_err(|message| {
        format!(
            "Invalid GeneratedDisplacementPoly media '{}': {message}",
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
        .ok_or_else(|| "GeneratedDisplacementPoly media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedDisplacementPoly media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let points = build_displacement_poly_points(media.width, media.height, &displacement);
    let columns = displacement.columns as usize;
    let rows = displacement.rows as usize;
    let fill_alpha = (displacement.fill_opacity.clamp(0.0, 1.0) * 255.0).round() as u8;

    if fill_alpha > 0 {
        for row in 0..rows {
            for column in 0..columns {
                let top_left = points[row * (columns + 1) + column];
                let top_right = points[row * (columns + 1) + column + 1];
                let bottom_right = points[(row + 1) * (columns + 1) + column + 1];
                let bottom_left = points[(row + 1) * (columns + 1) + column];
                fill_displacement_poly_quad(
                    &mut pixels,
                    media.width,
                    media.height,
                    [top_left, top_right, bottom_right, bottom_left],
                    [fill_colour[0], fill_colour[1], fill_colour[2], fill_alpha],
                );
            }
        }
    }

    let line_width = (1.0 + displacement.depth_scale / 36.0).clamp(1.0, 12.0);
    for row in 0..=rows {
        for column in 0..columns {
            let start = points[row * (columns + 1) + column];
            let end = points[row * (columns + 1) + column + 1];
            draw_line_segment_rgba(
                &mut pixels,
                media.width,
                media.height,
                start,
                end,
                line_colour,
                line_width,
            );
        }
    }
    for column in 0..=columns {
        for row in 0..rows {
            let start = points[row * (columns + 1) + column];
            let end = points[(row + 1) * (columns + 1) + column];
            draw_line_segment_rgba(
                &mut pixels,
                media.width,
                media.height,
                start,
                end,
                line_colour,
                line_width,
            );
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedDisplacementPoly media frame is invalid: {error:?}"))
}

fn build_displacement_poly_points(
    width: u32,
    height: u32,
    displacement: &DisplacementPolyObjectFields,
) -> Vec<(f32, f32)> {
    let columns = displacement.columns as usize;
    let rows = displacement.rows as usize;
    let margin_x = (width as f32 * 0.08).max(12.0);
    let margin_y = (height as f32 * 0.08).max(12.0);
    let usable_width = (width as f32 - margin_x * 2.0).max(1.0);
    let usable_height = (height as f32 - margin_y * 2.0).max(1.0);
    let seed = displacement.seed as u64;
    let mut points = Vec::with_capacity((columns + 1) * (rows + 1));

    for row in 0..=rows {
        for column in 0..=columns {
            let nx = column as f32 / columns.max(1) as f32;
            let ny = row as f32 / rows.max(1) as f32;
            let wave = ((nx * std::f32::consts::TAU * 2.0) + (ny * std::f32::consts::TAU)).sin();
            let random_x = deterministic_unit(seed, row as u32, column as u64 * 2 + 1) - 0.5;
            let random_y = deterministic_unit(seed, row as u32, column as u64 * 2 + 2) - 0.5;
            let centre_bias = (ny - 0.5) * displacement.depth_scale;
            let x = margin_x
                + nx * usable_width
                + random_x * displacement.displacement_scale
                + wave * displacement.displacement_scale * 0.18;
            let y = margin_y
                + ny * usable_height
                + random_y * displacement.displacement_scale
                + centre_bias * (nx - 0.5);
            points.push((x, y));
        }
    }

    points
}

fn fill_displacement_poly_quad(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    quad: [(f32, f32); 4],
    colour: [u8; 4],
) {
    let min_x = quad
        .iter()
        .map(|point| point.0)
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0) as u32;
    let max_x = quad
        .iter()
        .map(|point| point.0)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = quad
        .iter()
        .map(|point| point.1)
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0) as u32;
    let max_y = quad
        .iter()
        .map(|point| point.1)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(height.saturating_sub(1) as f32) as u32;

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let sample_x = x as f32 + 0.5;
            let sample_y = y as f32 + 0.5;
            if point_in_triangle(sample_x, sample_y, [quad[0], quad[1], quad[2]])
                || point_in_triangle(sample_x, sample_y, [quad[0], quad[2], quad[3]])
            {
                let offset = (y as usize * width as usize + x as usize) * 4;
                pixels[offset..offset + 4].copy_from_slice(&colour);
            }
        }
    }
}
