use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

use super::*;

pub(crate) fn build_generated_simple_tube_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedSimpleTube media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let simple_tube: GeneratedSimpleTubeSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedSimpleTube media '{}': {error}", media.id))?;
    validate_generated_simple_tube_source(&simple_tube).map_err(|message| {
        format!(
            "Invalid GeneratedSimpleTube media '{}': {message}",
            media.id
        )
    })?;
    let colour = parse_hex_colour_source(&simple_tube.colour).map_err(|message| {
        format!(
            "Invalid GeneratedSimpleTube media '{}': colour {message}",
            media.id
        )
    })?;
    let secondary_colour =
        parse_hex_colour_source(&simple_tube.secondary_colour).map_err(|message| {
            format!(
                "Invalid GeneratedSimpleTube media '{}': secondary_colour {message}",
                media.id
            )
        })?;
    let fog_colour = parse_hex_colour_source(&simple_tube.fog_colour).map_err(|message| {
        format!(
            "Invalid GeneratedSimpleTube media '{}': fog_colour {message}",
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
        .ok_or_else(|| "GeneratedSimpleTube media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedSimpleTube media byte length overflows".to_string())?;
    let mut pixels = vec![0; byte_len];
    draw_simple_tube_rgba(
        &mut pixels,
        media.width,
        media.height,
        &simple_tube,
        colour,
        secondary_colour,
        fog_colour,
    );

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedSimpleTube media frame is invalid: {error:?}"))
}

fn draw_simple_tube_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    tube: &GeneratedSimpleTubeSource,
    colour: [u8; 3],
    secondary_colour: [u8; 3],
    fog_colour: [u8; 3],
) {
    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let radius_x = (tube.radius - 10.0).max(1.0).min(width as f32 * 0.45);
    let radius_y = (radius_x * 0.32).max(1.0).min(height as f32 * 0.3);
    let depth = tube.depth.abs().min(height as f32 * 0.85);
    let stroke_width = tube.stroke_width.max(0.5);

    if tube.torus {
        draw_simple_tube_torus_rgba(
            pixels,
            width,
            height,
            centre_x,
            centre_y,
            radius_x,
            radius_y,
            tube,
            colour,
            secondary_colour,
            fog_colour,
            stroke_width,
        );
        return;
    }

    let ring_count = tube.rings.max(2);
    let segment_count = tube.segments.max(3);
    let top = centre_y - depth * 0.5;
    let step = if ring_count <= 1 {
        0.0
    } else {
        depth / (ring_count - 1) as f32
    };
    let twist_total = tube.twist_degrees.to_radians();
    let mut rings = Vec::new();

    for ring_index in 0..ring_count {
        let phase = ring_index as f32 / (ring_count - 1).max(1) as f32;
        let y = top + step * ring_index as f32;
        let twist = twist_total * phase;
        let perspective = 0.82 + 0.18 * (1.0 - (phase - 0.5).abs() * 2.0);
        let points = simple_tube_ellipse_points(
            centre_x,
            y,
            radius_x * perspective,
            radius_y * perspective,
            segment_count,
            twist,
            tube.random_amount,
            tube.seed + ring_index as i64,
        );
        let ring_colour = simple_tube_colour_for_ring(
            tube,
            ring_index,
            ring_count,
            colour,
            secondary_colour,
            fog_colour,
        );
        for pair in points.windows(2) {
            draw_line_segment_rgba(
                pixels,
                width,
                height,
                pair[0],
                pair[1],
                ring_colour,
                stroke_width,
            );
        }
        if let (Some(first), Some(last)) = (points.first(), points.last()) {
            draw_line_segment_rgba(
                pixels,
                width,
                height,
                *last,
                *first,
                ring_colour,
                stroke_width,
            );
        }
        rings.push(points);
    }

    for segment_index in 0..segment_count as usize {
        let depth_colour = simple_tube_colour_for_ring(
            tube,
            segment_index as u32,
            segment_count,
            colour,
            secondary_colour,
            fog_colour,
        );
        for pair in rings.windows(2) {
            draw_line_segment_rgba(
                pixels,
                width,
                height,
                pair[0][segment_index],
                pair[1][segment_index],
                depth_colour,
                stroke_width,
            );
        }
    }

    let centre_ring = simple_tube_ellipse_points(
        centre_x,
        centre_y,
        radius_x,
        radius_y,
        segment_count,
        twist_total * 0.5,
        tube.random_amount,
        tube.seed + 10_000,
    );
    let centre_colour = simple_tube_colour_for_ring(
        tube,
        ring_count / 2,
        ring_count,
        colour,
        secondary_colour,
        fog_colour,
    );
    for pair in centre_ring.windows(2) {
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            pair[0],
            pair[1],
            centre_colour,
            stroke_width,
        );
    }
    if let (Some(first), Some(last)) = (centre_ring.first(), centre_ring.last()) {
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            *last,
            *first,
            centre_colour,
            stroke_width,
        );
    }

    draw_line_segment_rgba(
        pixels,
        width,
        height,
        (centre_x, top),
        (centre_x, top + depth),
        secondary_colour,
        stroke_width,
    );
}

fn draw_simple_tube_torus_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius_x: f32,
    radius_y: f32,
    tube: &GeneratedSimpleTubeSource,
    colour: [u8; 3],
    secondary_colour: [u8; 3],
    fog_colour: [u8; 3],
    stroke_width: f32,
) {
    let segment_count = tube.segments.max(3);
    let ring_count = tube.rings.max(2);
    let outer_radius_x = radius_x.min(width as f32 * 0.4);
    let outer_radius_y = radius_y.max(1.0).min(height as f32 * 0.22);
    let points = simple_tube_ellipse_points(
        centre_x,
        centre_y,
        outer_radius_x,
        outer_radius_y,
        segment_count,
        tube.twist_degrees.to_radians(),
        tube.random_amount,
        tube.seed,
    );
    let ring_colour = simple_tube_colour_for_ring(tube, 0, 1, colour, secondary_colour, fog_colour);
    for pair in points.windows(2) {
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            pair[0],
            pair[1],
            ring_colour,
            stroke_width,
        );
    }
    if let (Some(first), Some(last)) = (points.first(), points.last()) {
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            *last,
            *first,
            ring_colour,
            stroke_width,
        );
    }
    for ring_index in 0..ring_count {
        let phase = ring_index as f32 / ring_count as f32;
        let angle = phase * std::f32::consts::TAU;
        let x = centre_x + outer_radius_x * angle.cos();
        let y = centre_y + outer_radius_y * angle.sin();
        let spoke_colour = simple_tube_colour_for_ring(
            tube,
            ring_index,
            ring_count,
            colour,
            secondary_colour,
            fog_colour,
        );
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            (centre_x, centre_y),
            (x, y),
            spoke_colour,
            stroke_width,
        );
    }
}

fn simple_tube_colour_for_ring(
    tube: &GeneratedSimpleTubeSource,
    index: u32,
    count: u32,
    colour: [u8; 3],
    secondary_colour: [u8; 3],
    fog_colour: [u8; 3],
) -> [u8; 3] {
    let pattern_colour = match tube.colour_pattern.as_str() {
        "ring" if index % 2 == 1 => secondary_colour,
        "depth" => {
            let amount = if count <= 1 {
                0.0
            } else {
                index as f32 / (count - 1) as f32
            };
            mix_rgb_u8(colour, secondary_colour, amount)
        }
        _ => colour,
    };
    mix_rgb_u8(
        pattern_colour,
        fog_colour,
        tube.fog_strength.clamp(0.0, 1.0),
    )
}

fn simple_tube_ellipse_points(
    centre_x: f32,
    centre_y: f32,
    radius_x: f32,
    radius_y: f32,
    segment_count: u32,
    twist: f32,
    random_amount: f32,
    seed: i64,
) -> Vec<(f32, f32)> {
    (0..segment_count)
        .map(|index| {
            let angle = (index as f32 / segment_count as f32) * std::f32::consts::TAU + twist;
            let jitter = if random_amount.abs() <= f32::EPSILON {
                0.0
            } else {
                deterministic_signed_noise(seed, index as i64) * random_amount * 0.01
            };
            let scale = (1.0 + jitter).max(0.1);
            (
                centre_x + angle.cos() * radius_x * scale,
                centre_y + angle.sin() * radius_y * scale,
            )
        })
        .collect()
}
