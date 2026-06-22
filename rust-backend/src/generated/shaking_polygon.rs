use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

use super::*;

pub(crate) fn build_generated_shaking_polygon_source_frame(
    media: &SceneMediaReference,
    source_frame: u64,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedShakingPolygon media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let polygon: GeneratedShakingPolygonSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedShakingPolygon media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_shaking_polygon_source(&polygon).map_err(|message| {
        format!(
            "Invalid GeneratedShakingPolygon media '{}': {message}",
            media.id
        )
    })?;
    let colour = parse_hex_colour_source(&polygon.colour).map_err(|message| {
        format!(
            "Invalid GeneratedShakingPolygon media '{}': {message}",
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
        .ok_or_else(|| "GeneratedShakingPolygon media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedShakingPolygon media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let centre = (media.width as f32 * 0.5, media.height as f32 * 0.5);
    let base_radius = if polygon.fixed_diameter > 0 {
        polygon.fixed_diameter as f32 * 0.5
    } else {
        media.width.min(media.height) as f32 * 0.36
    };
    let base_radius = base_radius.min(media.width.min(media.height) as f32 * 0.48);

    for repeat_index in 0..polygon.repeat_count {
        let rotation = if polygon.repeat_count <= 1 {
            0.0
        } else {
            repeat_index as f32 * std::f32::consts::TAU
                / (polygon.repeat_count * polygon.repeat_frequency) as f32
        };
        let points = shaking_polygon_points(&polygon, source_frame, centre, base_radius, rotation);
        if polygon.fill {
            fill_polygon_fan_rgba(
                &mut pixels,
                media.width,
                media.height,
                &points,
                centre,
                colour,
                96,
            );
        }
        draw_polygon_outline_rgba(
            &mut pixels,
            media.width,
            media.height,
            &points,
            colour,
            polygon.line_width as f32,
        );
        for point in points {
            draw_filled_circle_rgba(
                &mut pixels,
                media.width,
                media.height,
                point.0,
                point.1,
                (polygon.line_width as f32 * 0.55).max(1.0),
                colour,
                255,
            );
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedShakingPolygon media frame is invalid: {error:?}"))
}

fn shaking_polygon_points(
    polygon: &GeneratedShakingPolygonSource,
    source_frame: u64,
    centre: (f32, f32),
    base_radius: f32,
    rotation: f32,
) -> Vec<(f32, f32)> {
    let interval = polygon.jitter_interval.max(1) as u64;
    let phase = source_frame / interval;
    let t = (source_frame % interval) as f32 / interval as f32;
    let eased_t = if polygon.stepped {
        0.0
    } else {
        t * t * (3.0 - 2.0 * t)
    };
    let vertical_scale = if polygon.vertical_distortion_percent < 0.0 {
        1.0 + polygon.vertical_distortion_percent / 100.0
    } else {
        1.0
    };
    let horizontal_scale = if polygon.vertical_distortion_percent > 0.0 {
        1.0 - polygon.vertical_distortion_percent / 100.0
    } else {
        1.0
    };
    let seed = polygon.seed as u64;
    (0..polygon.vertex_count)
        .map(|index| {
            let base_angle = rotation
                + index as f32 * std::f32::consts::TAU / polygon.vertex_count as f32
                + if polygon.vertex_count == 4 {
                    std::f32::consts::FRAC_PI_4
                } else {
                    0.0
                };
            let jitter_x0 = jitter_value(seed, index, phase, 0, polygon.jitter_range);
            let jitter_y0 = jitter_value(seed, index, phase, 1, polygon.jitter_range);
            let jitter_x1 = jitter_value(seed, index, phase + 1, 0, polygon.jitter_range);
            let jitter_y1 = jitter_value(seed, index, phase + 1, 1, polygon.jitter_range);
            let jitter_x = jitter_x0 + (jitter_x1 - jitter_x0) * eased_t;
            let jitter_y = jitter_y0 + (jitter_y1 - jitter_y0) * eased_t;
            (
                centre.0 + base_angle.sin() * base_radius * horizontal_scale + jitter_x,
                centre.1 - base_angle.cos() * base_radius * vertical_scale + jitter_y,
            )
        })
        .collect()
}

fn jitter_value(seed: u64, vertex_index: u32, phase: u64, lane: u64, range: f32) -> f32 {
    (deterministic_unit(
        seed,
        vertex_index,
        phase.saturating_mul(13).saturating_add(lane),
    ) * 2.0
        - 1.0)
        * range
}

fn draw_polygon_outline_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    points: &[(f32, f32)],
    colour: [u8; 3],
    line_width: f32,
) {
    if points.len() < 2 {
        return;
    }
    for index in 0..points.len() {
        let start = points[index];
        let end = points[(index + 1) % points.len()];
        draw_line_segment_rgba(pixels, width, height, start, end, colour, line_width);
    }
}
