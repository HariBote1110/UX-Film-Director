use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

use super::*;

pub(crate) fn build_generated_plain_effector_line_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedPlainEffectorLine media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let source: GeneratedPlainEffectorLineSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedPlainEffectorLine media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_plain_effector_line_source(&source).map_err(|message| {
        format!(
            "Invalid GeneratedPlainEffectorLine media '{}': {message}",
            media.id
        )
    })?;
    let parsed_colour = parse_hex_colour_source(&source.colour).map_err(|message| {
        format!(
            "Invalid GeneratedPlainEffectorLine media '{}': {message}",
            media.id
        )
    })?;
    let colour = if source.invert {
        [
            255_u8.saturating_sub(parsed_colour[0]),
            255_u8.saturating_sub(parsed_colour[1]),
            255_u8.saturating_sub(parsed_colour[2]),
        ]
    } else {
        parsed_colour
    };
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedPlainEffectorLine media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedPlainEffectorLine media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    draw_plain_effector_lines(&mut pixels, media.width, media.height, &source, colour);

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedPlainEffectorLine media frame is invalid: {error:?}"))
}

fn draw_plain_effector_lines(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    source: &GeneratedPlainEffectorLineSource,
    colour: [u8; 3],
) {
    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let diagonal = ((width as f32).powi(2) + (height as f32).powi(2)).sqrt();
    let base_radius = source.radius.max(1.0) * source.zoom.max(0.05);
    let line_length = (base_radius * (1.6 + source.strength.abs() * 0.18)).min(diagonal * 1.2);
    let alpha = (source.colour_amount.clamp(0.0, 1.0) * 255.0).round() as u8;
    if alpha == 0 {
        return;
    }

    for index in 0..source.line_count {
        let phase = index as f32 / source.line_count.max(1) as f32;
        let random_angle = deterministic_unit(source.seed as u64, index, 11) - 0.5;
        let random_shift = deterministic_unit(source.seed as u64, index, 23) - 0.5;
        let wobble = random_angle * source.randomness / 1000.0;
        let angle = phase * std::f32::consts::TAU + wobble + source.strength * 0.05;
        let radius = base_radius + random_shift * source.randomness.abs() * 0.25;
        let normal = (-angle.sin(), angle.cos());
        let anchor = (
            centre_x + angle.cos() * radius,
            centre_y + angle.sin() * radius,
        );
        let half = line_length * 0.5;
        let start = (anchor.0 - normal.0 * half, anchor.1 - normal.1 * half);
        let end = (anchor.0 + normal.0 * half, anchor.1 + normal.1 * half);
        draw_line_segment_rgba_alpha(
            pixels,
            width,
            height,
            start,
            end,
            colour,
            alpha,
            source.line_width,
        );
    }
}

fn draw_line_segment_rgba_alpha(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    start: (f32, f32),
    end: (f32, f32),
    colour: [u8; 3],
    alpha: u8,
    line_width: f32,
) {
    let half_line = (line_width * 0.5).max(0.5);
    let min_x = (start.0.min(end.0) - half_line - 1.0).floor().max(0.0) as u32;
    let max_x = (start.0.max(end.0) + half_line + 1.0)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = (start.1.min(end.1) - half_line - 1.0).floor().max(0.0) as u32;
    let max_y = (start.1.max(end.1) + half_line + 1.0)
        .ceil()
        .min(height.saturating_sub(1) as f32) as u32;

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            if distance_to_segment(x as f32 + 0.5, y as f32 + 0.5, start, end) <= half_line {
                let offset = (y as usize * width as usize + x as usize) * 4;
                pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], alpha]);
            }
        }
    }
}

pub(crate) fn build_generated_focus_lines_plus_source_frame(
    media: &SceneMediaReference,
    source_frame: u64,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedFocusLinesPlus media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let focus_lines: GeneratedFocusLinesPlusSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedFocusLinesPlus media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_focus_lines_plus_source(&focus_lines).map_err(|message| {
        format!(
            "Invalid GeneratedFocusLinesPlus media '{}': {message}",
            media.id
        )
    })?;
    let line_colour = parse_hex_colour_source(&focus_lines.line_colour).map_err(|message| {
        format!(
            "Invalid GeneratedFocusLinesPlus media '{}': {message}",
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
        .ok_or_else(|| "GeneratedFocusLinesPlus media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedFocusLinesPlus media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let max_x = focus_lines
        .centre_x
        .max(media.width as f32 - focus_lines.centre_x);
    let max_y = focus_lines
        .centre_y
        .max(media.height as f32 - focus_lines.centre_y);
    let outer_radius = (max_x * max_x + max_y * max_y).sqrt() * 1.25;
    let rotation = focus_lines.rotation_degrees.to_radians();
    let frame_bucket = if focus_lines.keyframe_interval == 0 {
        0
    } else {
        source_frame / focus_lines.keyframe_interval
    };
    let seed =
        (focus_lines.seed as u64).wrapping_add(frame_bucket.wrapping_mul(0x517c_c1b7_2722_0a95));
    let centre_jitter_radius =
        focus_lines.centre_radius * focus_lines.centre_jitter_percent / 100.0;
    let jitter_angle = deterministic_unit(seed, 0, 21) * std::f32::consts::TAU;
    let jitter_distance = deterministic_unit(seed, 0, 22) * centre_jitter_radius;
    let centre_x = focus_lines.centre_x + jitter_angle.cos() * jitter_distance;
    let centre_y = focus_lines.centre_y + jitter_angle.sin() * jitter_distance;

    let mut cursor = 0.0_f32;
    let mut index = 1_u32;
    while cursor <= 100.0 && index < 512 {
        let gap = deterministic_unit(seed, index, 0) * focus_lines.gap;
        let ray_width = deterministic_unit(seed, index, 1) * focus_lines.ray_width;
        let start = cursor + gap;
        let end = (start + ray_width).min(100.0);
        if end > start {
            let start_angle = rotation + std::f32::consts::TAU * start / 100.0;
            let end_angle = rotation + std::f32::consts::TAU * end / 100.0;
            let mid_angle = (start_angle + end_angle) * 0.5;
            let inner = (
                centre_x + focus_lines.centre_radius * mid_angle.cos(),
                centre_y + focus_lines.centre_radius * mid_angle.sin(),
            );
            let outer_start = (
                centre_x + outer_radius * start_angle.cos(),
                centre_y + outer_radius * start_angle.sin(),
            );
            let outer_mid = (
                centre_x + outer_radius * mid_angle.cos(),
                centre_y + outer_radius * mid_angle.sin(),
            );
            let outer_end = (
                centre_x + outer_radius * end_angle.cos(),
                centre_y + outer_radius * end_angle.sin(),
            );
            fill_focus_lines_plus_ray(
                &mut pixels,
                media.width,
                media.height,
                [inner, outer_start, outer_mid, outer_end],
                line_colour,
            );
        }
        cursor = end;
        index += 1;
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedFocusLinesPlus media frame is invalid: {error:?}"))
}

fn fill_focus_lines_plus_ray(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    quad: [(f32, f32); 4],
    colour: [u8; 3],
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
            let inside = point_in_triangle(sample_x, sample_y, [quad[0], quad[1], quad[2]])
                || point_in_triangle(sample_x, sample_y, [quad[0], quad[2], quad[3]]);
            if inside {
                let offset = (y as usize * width as usize + x as usize) * 4;
                pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
            }
        }
    }
}

pub(crate) fn build_generated_random_line_ex_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedRandomLineEx media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let random_line: GeneratedRandomLineExSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedRandomLineEx media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_random_line_ex_source(&random_line).map_err(|message| {
        format!(
            "Invalid GeneratedRandomLineEx media '{}': {message}",
            media.id
        )
    })?;
    let line_colour = parse_hex_colour_source(&random_line.line_colour).map_err(|message| {
        format!(
            "Invalid GeneratedRandomLineEx media '{}': {message}",
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
        .ok_or_else(|| "GeneratedRandomLineEx media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedRandomLineEx media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let diagonal = ((media.width * media.width + media.height * media.height) as f32).sqrt();
    let seed = random_line.seed as u64;

    for index in 0..random_line.line_count {
        let centre_x = (deterministic_unit(seed, index, 0) - 0.5) * media.width as f32;
        let centre_y = (deterministic_unit(seed, index, 1) - 0.5) * media.height as f32;
        let angle = deterministic_unit(seed, index, 2) * std::f32::consts::PI;
        let width = random_line.line_width
            + deterministic_unit(seed, index, 3) * random_line.width_variance;
        let direction = (angle.cos(), angle.sin());
        let normal = (-direction.1, direction.0);
        let half_len = diagonal;
        let half_width = (width * 0.5).max(0.0);
        let quad = [
            (
                centre_x + direction.0 * half_len + normal.0 * half_width,
                centre_y + direction.1 * half_len + normal.1 * half_width,
            ),
            (
                centre_x + direction.0 * half_len - normal.0 * half_width,
                centre_y + direction.1 * half_len - normal.1 * half_width,
            ),
            (
                centre_x - direction.0 * half_len - normal.0 * half_width,
                centre_y - direction.1 * half_len - normal.1 * half_width,
            ),
            (
                centre_x - direction.0 * half_len + normal.0 * half_width,
                centre_y - direction.1 * half_len + normal.1 * half_width,
            ),
        ];
        fill_random_line_ex_quad(
            &mut pixels,
            media.width,
            media.height,
            quad,
            line_colour,
            &random_line,
            index,
        );
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedRandomLineEx media frame is invalid: {error:?}"))
}

pub(crate) fn build_generated_contour_trace_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedContourTrace media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let contour: GeneratedContourTraceSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedContourTrace media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_contour_trace_source(&contour).map_err(|message| {
        format!(
            "Invalid GeneratedContourTrace media '{}': {message}",
            media.id
        )
    })?;
    let trace_colour = parse_hex_colour_source(&contour.trace_colour).map_err(|message| {
        format!(
            "Invalid GeneratedContourTrace media '{}': {message}",
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
        .ok_or_else(|| "GeneratedContourTrace media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedContourTrace media byte length overflows".to_string())?;
    let background_alpha = (contour.background_opacity.clamp(0.0, 1.0) * 255.0).round() as u8;
    let mut pixels = vec![0_u8; byte_len];
    if background_alpha > 0 {
        for rgba in pixels.chunks_exact_mut(4) {
            rgba.copy_from_slice(&[0, 0, 0, background_alpha]);
        }
    }

    let centre_x = media.width as f32 * 0.5;
    let centre_y = media.height as f32 * 0.5;
    let base_rx = media.width as f32 * 0.32;
    let base_ry = media.height as f32 * 0.28;
    let stroke_half = contour.line_width * 0.5;
    let seed = contour.seed as u64;

    for index in 0..contour.contour_count {
        let t = if contour.contour_count <= 1 {
            0.0
        } else {
            index as f32 / (contour.contour_count - 1) as f32
        };
        let scale = 1.0 + (t - 0.5) * 0.36;
        let jitter_x = (deterministic_unit(seed, index, 31) - 0.5) * contour.jitter_amount * 2.0;
        let jitter_y = (deterministic_unit(seed, index, 32) - 0.5) * contour.jitter_amount * 2.0;
        let rx = (base_rx * scale + jitter_x.abs()).max(1.0);
        let ry = (base_ry * scale + jitter_y.abs()).max(1.0);
        let cx = centre_x + jitter_x;
        let cy = centre_y + jitter_y;
        draw_contour_trace_ellipse(
            &mut pixels,
            media.width,
            media.height,
            cx,
            cy,
            rx,
            ry,
            stroke_half,
            trace_colour,
        );
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedContourTrace media frame is invalid: {error:?}"))
}

fn draw_contour_trace_ellipse(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius_x: f32,
    radius_y: f32,
    stroke_half: f32,
    colour: [u8; 3],
) {
    let min_x = (centre_x - radius_x - stroke_half - 1.0).floor().max(0.0) as u32;
    let max_x = (centre_x + radius_x + stroke_half + 1.0)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = (centre_y - radius_y - stroke_half - 1.0).floor().max(0.0) as u32;
    let max_y = (centre_y + radius_y + stroke_half + 1.0)
        .ceil()
        .min(height.saturating_sub(1) as f32) as u32;
    let average_radius = ((radius_x + radius_y) * 0.5).max(1.0);
    let normalised_half = (stroke_half / average_radius).max(0.001);

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let dx = (x as f32 + 0.5 - centre_x) / radius_x;
            let dy = (y as f32 + 0.5 - centre_y) / radius_y;
            let distance = (dx * dx + dy * dy).sqrt();
            if (distance - 1.0).abs() <= normalised_half {
                let offset = (y as usize * width as usize + x as usize) * 4;
                pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
            }
        }
    }
}

fn fill_random_line_ex_quad(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    quad: [(f32, f32); 4],
    colour: [u8; 3],
    source: &GeneratedRandomLineExSource,
    line_index: u32,
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
    let cell = source.noise_cell_size.max(1);

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let sample_x = x as f32 + 0.5;
            let sample_y = y as f32 + 0.5;
            let inside = point_in_triangle(sample_x, sample_y, [quad[0], quad[1], quad[2]])
                || point_in_triangle(sample_x, sample_y, [quad[0], quad[2], quad[3]]);
            if inside {
                let noise_index = (x / cell) ^ ((y / cell) << 8) ^ (line_index << 16);
                let noise =
                    (deterministic_unit(source.seed as u64, noise_index, 37) * 255.0) as u32;
                if noise >= source.threshold {
                    let offset = (y as usize * width as usize + x as usize) * 4;
                    pixels[offset..offset + 4]
                        .copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
                }
            }
        }
    }
}
