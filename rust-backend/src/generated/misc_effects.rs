use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

use super::*;

pub(crate) fn build_generated_particle_source_frame(
    media: &SceneMediaReference,
    source_frame: u64,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedParticle media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let particle: GeneratedParticleSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedParticle media '{}': {error}", media.id))?;
    validate_generated_particle_source(&particle)
        .map_err(|message| format!("Invalid GeneratedParticle media '{}': {message}", media.id))?;
    let [red, green, blue] = parse_hex_colour_source(&particle.colour)
        .map_err(|message| format!("Invalid GeneratedParticle media '{}': {message}", media.id))?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedParticle media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedParticle media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let centre_x = media.width as f32 / 2.0;
    let centre_y = media.height as f32 / 2.0;
    let radius = ((particle.size.max(1.0).round() as i32) - 1) / 2;
    let source_seconds = source_frame as f32 / 60.0;

    for index in 0..particle.particle_count {
        let angle = deterministic_unit(particle.seed, index, 0) * std::f32::consts::TAU;
        let distance = deterministic_unit(particle.seed, index, 1) * particle.spread;
        let lifetime_position = if particle.lifetime_seconds <= f32::EPSILON {
            0.0
        } else {
            source_seconds.rem_euclid(particle.lifetime_seconds)
        };
        let motion = particle.speed * lifetime_position;
        let x = (centre_x + angle.cos() * (distance + motion)).round() as i32;
        let y = (centre_y + angle.sin() * (distance + motion)).round() as i32;
        for offset_y in -radius..=radius {
            for offset_x in -radius..=radius {
                write_particle_pixel(
                    &mut pixels,
                    media.width,
                    media.height,
                    x + offset_x,
                    y + offset_y,
                    [red, green, blue, 255],
                );
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedParticle media frame is invalid: {error:?}"))
}

pub(crate) fn build_generated_paper_airplane_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedPaperAirplane media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let plane: GeneratedPaperAirplaneSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedPaperAirplane media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_paper_airplane_source(&plane).map_err(|message| {
        format!(
            "Invalid GeneratedPaperAirplane media '{}': {message}",
            media.id
        )
    })?;
    let fill = parse_hex_colour_source(&plane.fill_colour).map_err(|message| {
        format!(
            "Invalid GeneratedPaperAirplane media '{}': {message}",
            media.id
        )
    })?;
    let shadow = [
        (fill[0] as f32 * 0.72).round() as u8,
        (fill[1] as f32 * 0.72).round() as u8,
        (fill[2] as f32 * 0.72).round() as u8,
    ];
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedPaperAirplane media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedPaperAirplane media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let centre_x = media.width as f32 / 2.0;
    let centre_y = media.height as f32 / 2.0;
    let half_length = (plane.body_length as f32 / 2.0).min(media.height as f32 / 2.0 - 2.0);
    let wing_width = plane.wing_width as f32;
    let fold_height = plane.fold_height as f32;
    let gap = plane.gap as f32 / 2.0;
    let nose = (centre_x, (centre_y - half_length).max(0.0));
    let tail_y = (centre_y + half_length).min(media.height as f32 - 1.0);
    let left_tail = ((centre_x - wing_width - gap).max(0.0), tail_y);
    let right_tail = (
        (centre_x + wing_width + gap).min(media.width as f32 - 1.0),
        tail_y,
    );
    let left_inner = ((centre_x - gap).max(0.0), tail_y);
    let right_inner = ((centre_x + gap).min(media.width as f32 - 1.0), tail_y);
    let fold_tip = (centre_x, (tail_y - fold_height).max(nose.1));

    for y in 0..media.height {
        for x in 0..media.width {
            let sample_x = x as f32 + 0.5;
            let sample_y = y as f32 + 0.5;
            let in_left_wing = point_in_triangle(sample_x, sample_y, [nose, left_tail, left_inner]);
            let in_right_wing =
                point_in_triangle(sample_x, sample_y, [nose, right_inner, right_tail]);
            let in_fold = point_in_triangle(sample_x, sample_y, [nose, left_inner, fold_tip])
                || point_in_triangle(sample_x, sample_y, [nose, fold_tip, right_inner]);
            if in_left_wing || in_right_wing || in_fold {
                let colour = if in_fold { shadow } else { fill };
                let offset = (y as usize * media.width as usize + x as usize) * 4;
                pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedPaperAirplane media frame is invalid: {error:?}"))
}

pub(crate) fn build_generated_asanoha_pattern_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedAsanohaPattern media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let asanoha: GeneratedAsanohaPatternSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedAsanohaPattern media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_asanoha_pattern_source(&asanoha).map_err(|message| {
        format!(
            "Invalid GeneratedAsanohaPattern media '{}': {message}",
            media.id
        )
    })?;
    let foreground = parse_hex_colour_source(&asanoha.foreground_colour).map_err(|message| {
        format!(
            "Invalid GeneratedAsanohaPattern media '{}': {message}",
            media.id
        )
    })?;
    let background = parse_hex_colour_source(&asanoha.background_colour).map_err(|message| {
        format!(
            "Invalid GeneratedAsanohaPattern media '{}': {message}",
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
        .ok_or_else(|| "GeneratedAsanohaPattern media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedAsanohaPattern media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    for pixel in pixels.chunks_exact_mut(4) {
        pixel.copy_from_slice(&[background[0], background[1], background[2], 255]);
    }

    let radius = asanoha.pattern_size.max(10) as f32;
    let line_width = asanoha.line_width as f32;
    let row_step = radius * 3.0_f32.sqrt();
    let column_step = radius * 1.5;
    let row_count = (media.height as f32 / row_step).ceil() as i32 + 3;
    let column_count = (media.width as f32 / column_step).ceil() as i32 + 3;

    if line_width <= 0.0 {
        return RgbaFrame::from_rgba8(media.width, media.height, pixels)
            .map_err(|error| format!("GeneratedAsanohaPattern media frame is invalid: {error:?}"));
    }

    for row in -1..row_count {
        let centre_y = row as f32 * row_step + radius;
        let row_offset = if row.rem_euclid(2) == 0 {
            0.0
        } else {
            column_step * 0.5
        };
        for column in -1..column_count {
            let centre_x = column as f32 * column_step + row_offset + radius;
            let points = [
                (centre_x + radius, centre_y),
                (centre_x + radius * 0.5, centre_y + row_step * 0.5),
                (centre_x - radius * 0.5, centre_y + row_step * 0.5),
                (centre_x - radius, centre_y),
                (centre_x - radius * 0.5, centre_y - row_step * 0.5),
                (centre_x + radius * 0.5, centre_y - row_step * 0.5),
            ];
            for index in 0..points.len() {
                draw_line_segment_rgba(
                    &mut pixels,
                    media.width,
                    media.height,
                    points[index],
                    points[(index + 1) % points.len()],
                    foreground,
                    line_width,
                );
                draw_line_segment_rgba(
                    &mut pixels,
                    media.width,
                    media.height,
                    (centre_x, centre_y),
                    points[index],
                    foreground,
                    line_width,
                );
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedAsanohaPattern media frame is invalid: {error:?}"))
}
