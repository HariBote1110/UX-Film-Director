use crate::local_media_source_path;
use serde::Deserialize;
use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

pub(crate) fn parse_hex_colour_source(source: &str) -> Result<[u8; 3], String> {
    let source = source.trim();
    let Some(hex) = source.strip_prefix('#') else {
        return Err("source must be a #rrggbb hex colour".to_string());
    };
    if hex.len() != 6 || !hex.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err("source must be a #rrggbb hex colour".to_string());
    }

    let red = u8::from_str_radix(&hex[0..2], 16)
        .map_err(|_| "source must be a #rrggbb hex colour".to_string())?;
    let green = u8::from_str_radix(&hex[2..4], 16)
        .map_err(|_| "source must be a #rrggbb hex colour".to_string())?;
    let blue = u8::from_str_radix(&hex[4..6], 16)
        .map_err(|_| "source must be a #rrggbb hex colour".to_string())?;

    Ok([red, green, blue])
}

pub(crate) fn build_generated_gradient_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedGradient media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let gradient: GeneratedGradientSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedGradient media '{}': {error}", media.id))?;
    let stops = normalise_gradient_stops(&gradient)
        .map_err(|message| format!("Invalid GeneratedGradient media '{}': {message}", media.id))?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedGradient media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedGradient media byte length overflows".to_string())?;
    let mut pixels = Vec::with_capacity(byte_len);
    for y in 0..media.height {
        for x in 0..media.width {
            let t = gradient_position(
                &gradient,
                media.width,
                media.height,
                x as f32 + 0.5,
                y as f32 + 0.5,
            );
            let [red, green, blue] = sample_gradient_colour(&stops, t);
            pixels.extend_from_slice(&[red, green, blue, 255]);
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedGradient media frame is invalid: {error:?}"))
}

pub(crate) fn build_generated_barcode_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedBarcode media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let barcode: GeneratedBarcodeSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedBarcode media '{}': {error}", media.id))?;
    validate_generated_barcode_source(&barcode)
        .map_err(|message| format!("Invalid GeneratedBarcode media '{}': {message}", media.id))?;
    let [fg_red, fg_green, fg_blue] = parse_hex_colour_source(&barcode.foreground_colour)
        .map_err(|message| format!("Invalid GeneratedBarcode media '{}': {message}", media.id))?;
    let [bg_red, bg_green, bg_blue] = parse_hex_colour_source(&barcode.background_colour)
        .map_err(|message| format!("Invalid GeneratedBarcode media '{}': {message}", media.id))?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedBarcode media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedBarcode media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    for chunk in pixels.chunks_exact_mut(4) {
        chunk.copy_from_slice(&[bg_red, bg_green, bg_blue, 255]);
    }

    let left = barcode.horizontal_margin.min(media.width);
    let right = media
        .width
        .saturating_sub(barcode.horizontal_margin.min(media.width));
    let top = barcode.vertical_margin.min(media.height);
    let bottom = media
        .height
        .saturating_sub(barcode.vertical_margin.min(media.height));
    if right <= left || bottom <= top {
        return RgbaFrame::from_rgba8(media.width, media.height, pixels)
            .map_err(|error| format!("GeneratedBarcode media frame is invalid: {error:?}"));
    }

    let pattern = barcode_bar_pattern(&barcode.data);
    let mut x = left;
    let mut index = 0_usize;
    while x < right {
        let width_units = pattern[index % pattern.len()];
        let bar_width = barcode
            .minimum_bar_width
            .saturating_mul(width_units as u32)
            .max(1);
        let draw_foreground = index % 2 == 0;
        let end_x = (x.saturating_add(bar_width)).min(right);
        if draw_foreground {
            for py in top..bottom {
                for px in x..end_x {
                    write_particle_pixel(
                        &mut pixels,
                        media.width,
                        media.height,
                        px as i32,
                        py as i32,
                        [fg_red, fg_green, fg_blue, 255],
                    );
                }
            }
        }
        x = end_x;
        index += 1;
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedBarcode media frame is invalid: {error:?}"))
}

pub(crate) fn build_generated_colour_wheel_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedColourWheel media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let wheel: GeneratedColourWheelSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedColourWheel media '{}': {error}", media.id))?;
    validate_generated_colour_wheel_source(&wheel).map_err(|message| {
        format!(
            "Invalid GeneratedColourWheel media '{}': {message}",
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
        .ok_or_else(|| "GeneratedColourWheel media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedColourWheel media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    let centre_x = media.width as f32 / 2.0;
    let centre_y = media.height as f32 / 2.0;
    let outer_radius = (wheel.radius as f32).min(media.width.min(media.height) as f32 / 2.0);
    let inner_radius = outer_radius * (1.0 - wheel.ring_width_percent * 0.01).clamp(0.0, 0.99);
    let saturation = (wheel.saturation * 0.01).clamp(0.0, 1.0);
    let brightness = (wheel.brightness * 0.01).clamp(0.0, 1.0);
    let segment_count = wheel.segment_count.max(3) as f32;

    for y in 0..media.height {
        for x in 0..media.width {
            let px = x as f32 + 0.5 - centre_x;
            let py = y as f32 + 0.5 - centre_y;
            let radius = (px * px + py * py).sqrt();
            if radius < inner_radius || radius > outer_radius {
                continue;
            }

            let angle = py.atan2(px).rem_euclid(std::f32::consts::TAU);
            let segment = (angle / std::f32::consts::TAU * segment_count).floor();
            let hue = segment / segment_count * 360.0;
            let [red, green, blue] = hsv_to_rgb8(hue, saturation, brightness);
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

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedColourWheel media frame is invalid: {error:?}"))
}

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

pub(crate) fn build_generated_puzzle_piece_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedPuzzlePiece media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let puzzle: GeneratedPuzzlePieceSource = serde_json::from_str(&media.source)
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
    let half = (puzzle.size as f32 / 2.0).min(media.width.min(media.height) as f32 / 2.0);
    let knob_radius = (puzzle.size as f32 * 0.18).max(2.0);
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
                if puzzle.connector_mode == "convex" {
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
    let gourd: GeneratedGourdSource = serde_json::from_str(&media.source)
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
    let gear: GeneratedGearSource = serde_json::from_str(&media.source)
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

pub(crate) fn build_generated_track_bar_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedTrackBar media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let track_bar: GeneratedTrackBarSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedTrackBar media '{}': {error}", media.id))?;
    validate_generated_track_bar_source(&track_bar)
        .map_err(|message| format!("Invalid GeneratedTrackBar media '{}': {message}", media.id))?;
    let [red, green, blue] = parse_hex_colour_source(&track_bar.bar_colour)
        .map_err(|message| format!("Invalid GeneratedTrackBar media '{}': {message}", media.id))?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedTrackBar media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedTrackBar media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    let margin = (media.width.min(media.height) as f32 * 0.066)
        .max(6.0)
        .round() as i32;
    let row_count = track_bar.track_values.len() as i32;
    let gap = (media.height as f32 * 0.06).max(4.0).round() as i32;
    let row_height =
        ((media.height as i32 - margin * 2 - gap * (row_count - 1)) / row_count).max(4);
    let label_width = (media.width as f32 * 0.28).round() as i32;
    let bar_left = margin + label_width;
    let bar_right = media.width as i32 - margin;
    let bar_width = (bar_right - bar_left).max(1);
    let bg_alpha = (track_bar.background_opacity.clamp(0.0, 1.0) * 255.0).round() as u8;

    for index in 0..track_bar.track_values.len() {
        let top = margin + index as i32 * (row_height + gap);
        let bottom = (top + row_height).min(media.height as i32 - margin);
        fill_rect_rgba(
            &mut pixels,
            media.width,
            media.height,
            margin,
            top,
            media.width as i32 - margin,
            bottom,
            [red, green, blue, bg_alpha],
        );

        let value = track_bar.track_values[index];
        let [min, max] = track_bar.track_ranges[index];
        let progress = ((value - min) / (max - min)).clamp(0.0, 1.0);
        let fill_right = bar_left + (bar_width as f32 * progress).round() as i32;
        fill_rect_rgba(
            &mut pixels,
            media.width,
            media.height,
            bar_left,
            top + 2,
            fill_right.max(bar_left + 1),
            bottom - 2,
            [red, green, blue, 255],
        );
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedTrackBar media frame is invalid: {error:?}"))
}

fn normalise_gradient_stops(
    gradient: &GeneratedGradientSource,
) -> Result<Vec<(f32, [u8; 3])>, String> {
    if gradient.gradient_type != "linear" && gradient.gradient_type != "radial" {
        return Err("gradient type must be linear or radial".to_string());
    }

    let colours = if gradient.colours.is_empty() {
        vec!["#ffffff".to_string(), "#000000".to_string()]
    } else {
        gradient.colours.clone()
    };
    let last_index = colours.len().saturating_sub(1);
    let mut stops = Vec::with_capacity(colours.len());
    for (index, colour) in colours.iter().enumerate() {
        let colour = parse_hex_colour_source(colour)?;
        let fallback_stop = if last_index == 0 {
            0.0
        } else {
            index as f32 / last_index as f32
        };
        let stop = gradient.stops.get(index).copied().unwrap_or(fallback_stop);
        if !stop.is_finite() {
            return Err("gradient stop must be finite".to_string());
        }
        stops.push((stop.clamp(0.0, 1.0), colour));
    }
    stops.sort_by(|left, right| left.0.total_cmp(&right.0));
    Ok(stops)
}

fn gradient_position(
    gradient: &GeneratedGradientSource,
    width: u32,
    height: u32,
    x: f32,
    y: f32,
) -> f32 {
    if gradient.gradient_type == "radial" {
        let cx = width as f32 / 2.0;
        let cy = height as f32 / 2.0;
        let radius = width.max(height) as f32 / 2.0;
        if radius <= 0.0 {
            return 0.0;
        }
        let distance = ((x - cx).powi(2) + (y - cy).powi(2)).sqrt();
        return (distance / radius).clamp(0.0, 1.0);
    }

    let radians = gradient.direction.to_radians();
    let cx = width as f32 / 2.0;
    let cy = height as f32 / 2.0;
    let half_line = width.max(height) as f32 / 2.0;
    let x1 = cx - radians.cos() * half_line;
    let y1 = cy - radians.sin() * half_line;
    let x2 = cx + radians.cos() * half_line;
    let y2 = cy + radians.sin() * half_line;
    let dx = x2 - x1;
    let dy = y2 - y1;
    let length_squared = dx * dx + dy * dy;
    if length_squared <= f32::EPSILON {
        return 0.0;
    }
    (((x - x1) * dx + (y - y1) * dy) / length_squared).clamp(0.0, 1.0)
}

fn sample_gradient_colour(stops: &[(f32, [u8; 3])], t: f32) -> [u8; 3] {
    if stops.is_empty() {
        return [255, 255, 255];
    }
    if t <= stops[0].0 {
        return stops[0].1;
    }
    for pair in stops.windows(2) {
        let (left_stop, left_colour) = pair[0];
        let (right_stop, right_colour) = pair[1];
        if t <= right_stop {
            let span = right_stop - left_stop;
            let local_t = if span <= f32::EPSILON {
                0.0
            } else {
                ((t - left_stop) / span).clamp(0.0, 1.0)
            };
            return [
                lerp_u8(left_colour[0], right_colour[0], local_t),
                lerp_u8(left_colour[1], right_colour[1], local_t),
                lerp_u8(left_colour[2], right_colour[2], local_t),
            ];
        }
    }
    stops[stops.len() - 1].1
}

fn lerp_u8(left: u8, right: u8, t: f32) -> u8 {
    ((left as f32 + (right as f32 - left as f32) * t).round()).clamp(0.0, 255.0) as u8
}

fn barcode_bar_pattern(data: &str) -> Vec<u8> {
    let mut pattern = vec![2, 1, 1, 2, 1, 4];
    let mut checksum = 104_u32;
    for (position, byte) in data.bytes().enumerate() {
        let value = byte.saturating_sub(32).min(94) as u32;
        checksum = checksum.wrapping_add((position as u32 + 1) * value);
        pattern.extend_from_slice(&[
            ((value % 3) + 1) as u8,
            (((value / 3) % 2) + 1) as u8,
            (((value / 7) % 4) + 1) as u8,
            (((value / 11) % 2) + 1) as u8,
        ]);
    }
    pattern.extend_from_slice(&[
        ((checksum % 4) + 1) as u8,
        (((checksum / 5) % 3) + 1) as u8,
        2,
        3,
        3,
        1,
        1,
    ]);
    pattern
}

pub(crate) fn write_particle_pixel(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    colour: [u8; 4],
) {
    if x < 0 || y < 0 || x >= width as i32 || y >= height as i32 {
        return;
    }
    let offset = ((y as u32 * width + x as u32) * 4) as usize;
    pixels[offset..offset + 4].copy_from_slice(&colour);
}

pub(crate) fn hsv_to_rgb8(hue_degrees: f32, saturation: f32, value: f32) -> [u8; 3] {
    let hue = hue_degrees.rem_euclid(360.0) / 60.0;
    let chroma = value * saturation;
    let x = chroma * (1.0 - ((hue % 2.0) - 1.0).abs());
    let m = value - chroma;
    let (red, green, blue) = if hue < 1.0 {
        (chroma, x, 0.0)
    } else if hue < 2.0 {
        (x, chroma, 0.0)
    } else if hue < 3.0 {
        (0.0, chroma, x)
    } else if hue < 4.0 {
        (0.0, x, chroma)
    } else if hue < 5.0 {
        (x, 0.0, chroma)
    } else {
        (chroma, 0.0, x)
    };
    [
        ((red + m).clamp(0.0, 1.0) * 255.0).round() as u8,
        ((green + m).clamp(0.0, 1.0) * 255.0).round() as u8,
        ((blue + m).clamp(0.0, 1.0) * 255.0).round() as u8,
    ]
}

fn trapezoid_tooth_factor(phase: f32) -> f32 {
    let phase = phase.rem_euclid(1.0);
    if phase < 0.18 {
        phase / 0.18
    } else if phase < 0.5 {
        1.0
    } else if phase < 0.68 {
        1.0 - (phase - 0.5) / 0.18
    } else {
        0.0
    }
}

fn puzzle_piece_connectors(shape_variant: u32) -> [(u8, bool); 4] {
    match shape_variant {
        1 => [(0, true), (1, false), (2, true), (3, false)],
        2 => [(0, true), (1, true), (2, false), (3, false)],
        3 => [(0, true), (1, true), (2, true), (3, true)],
        4 => [(0, true), (1, false), (2, false), (3, false)],
        9 | 13 | 18 => [(0, true), (1, false), (2, true), (3, false)],
        10 | 14 | 19 => [(0, true), (1, true), (2, false), (3, false)],
        11 | 15 | 20 => [(0, true), (1, true), (2, true), (3, true)],
        12 | 16 | 21 => [(0, true), (1, false), (2, false), (3, false)],
        17 | 22 => [(0, true), (1, true), (2, true), (3, true)],
        _ => [(0, false), (1, true), (2, false), (3, true)],
    }
}

pub(crate) fn deterministic_unit(seed: u64, index: u32, lane: u64) -> f32 {
    let mut value = seed
        ^ ((index as u64).wrapping_mul(0x9e37_79b9_7f4a_7c15))
        ^ lane.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value ^= value >> 30;
    value = value.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value ^= value >> 27;
    value = value.wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^= value >> 31;
    (value as f64 / u64::MAX as f64) as f32
}

pub(crate) fn fill_rect_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
    colour: [u8; 4],
) {
    let left = left.clamp(0, width as i32);
    let right = right.clamp(0, width as i32);
    let top = top.clamp(0, height as i32);
    let bottom = bottom.clamp(0, height as i32);
    if left >= right || top >= bottom {
        return;
    }
    for y in top..bottom {
        for x in left..right {
            write_particle_pixel(pixels, width, height, x, y, colour);
        }
    }
}

fn point_inside_gourd(
    x: f32,
    y: f32,
    radius: f32,
    half_width: f32,
    waist: f32,
    aspect: f32,
) -> bool {
    let x_abs = x.abs();
    if x_abs > half_width {
        return false;
    }

    let radius = radius.min(half_width).max(1.0);
    let waist = waist.min(radius);
    let m = half_width - radius;
    let boundary = if (radius - waist).abs() < f32::EPSILON {
        radius * aspect
    } else {
        let r2 = 0.5 * (m * m / (radius - waist) - radius - waist);
        let x0 = if (radius + r2).abs() > f32::EPSILON {
            m * r2 / (radius + r2)
        } else {
            0.0
        };
        if r2 > 0.0 && x0 > 0.0 && x_abs <= x0 {
            let inner = r2 * r2 - x_abs * x_abs;
            if inner < 0.0 {
                return false;
            }
            (waist + r2 - inner.sqrt()) * aspect
        } else {
            let inner = radius * radius - (x_abs - m) * (x_abs - m);
            if inner < 0.0 {
                return false;
            }
            inner.sqrt() * aspect
        }
    };

    y.abs() <= boundary
}

pub(crate) fn validate_generated_barcode_source(
    source: &GeneratedBarcodeSource,
) -> Result<(), String> {
    if source.generator != "barcode-t" {
        return Err("generator must be barcode-t".to_string());
    }
    if source.data.is_empty() || source.data.chars().count() > 128 {
        return Err("data length must be 1..128".to_string());
    }
    if source.minimum_bar_width == 0 || source.minimum_bar_width > 32 {
        return Err("minimum_bar_width must be 1..32".to_string());
    }
    if source.horizontal_margin > 1000 {
        return Err("horizontal_margin must be 0..1000".to_string());
    }
    if source.vertical_margin > 1000 {
        return Err("vertical_margin must be 0..1000".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_puzzle_piece_source(
    source: &GeneratedPuzzlePieceSource,
) -> Result<(), String> {
    if source.generator != "puzzle-piece" {
        return Err("generator must be puzzle-piece".to_string());
    }
    if source.size == 0 || source.size > 2000 {
        return Err("size must be 1..2000".to_string());
    }
    if source.shape_variant == 0 || source.shape_variant > 22 {
        return Err("shape_variant must be 1..22".to_string());
    }
    if source.connector_mode != "convex" && source.connector_mode != "concave" {
        return Err("connector_mode must be convex or concave".to_string());
    }
    parse_hex_colour_source(&source.fill_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_colour_wheel_source(
    source: &GeneratedColourWheelSource,
) -> Result<(), String> {
    if source.generator != "colour-wheel" {
        return Err("generator must be colour-wheel".to_string());
    }
    if source.radius == 0 || source.radius > 2000 {
        return Err("radius must be 1..2000".to_string());
    }
    if !source.saturation.is_finite() || source.saturation < 0.0 || source.saturation > 100.0 {
        return Err("saturation must be 0..100".to_string());
    }
    if !source.brightness.is_finite() || source.brightness < 0.0 || source.brightness > 100.0 {
        return Err("brightness must be 0..100".to_string());
    }
    if !source.ring_width_percent.is_finite()
        || source.ring_width_percent <= 0.0
        || source.ring_width_percent > 100.0
    {
        return Err("ring_width_percent must be 0..100".to_string());
    }
    if source.segment_count < 3 || source.segment_count > 360 {
        return Err("segment_count must be 3..360".to_string());
    }
    Ok(())
}

pub(crate) fn validate_generated_gourd_source(source: &GeneratedGourdSource) -> Result<(), String> {
    if source.generator != "gourd-tm" {
        return Err("generator must be gourd-tm".to_string());
    }
    if source.body_radius == 0 || source.body_radius > 2000 {
        return Err("body_radius must be 1..2000".to_string());
    }
    if source.body_width == 0 || source.body_width > 4000 {
        return Err("body_width must be 1..4000".to_string());
    }
    if source.waist_radius > 2000 {
        return Err("waist_radius must be 0..2000".to_string());
    }
    if !source.squash_percent.is_finite()
        || source.squash_percent < 0.0
        || source.squash_percent > 100.0
    {
        return Err("squash_percent must be 0..100".to_string());
    }
    if source.repeat_count == 0 || source.repeat_count > 36 {
        return Err("repeat_count must be 1..36".to_string());
    }
    parse_hex_colour_source(&source.fill_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_gear_source(source: &GeneratedGearSource) -> Result<(), String> {
    if source.generator != "gear-t" {
        return Err("generator must be gear-t".to_string());
    }
    if source.outer_radius == 0 || source.outer_radius > 2000 {
        return Err("outer_radius must be 1..2000".to_string());
    }
    if !source.inner_radius_percent.is_finite()
        || source.inner_radius_percent < 0.0
        || source.inner_radius_percent >= 100.0
    {
        return Err("inner_radius_percent must be 0..<100".to_string());
    }
    if source.tooth_count < 3 || source.tooth_count > 240 {
        return Err("tooth_count must be 3..240".to_string());
    }
    if !source.tooth_depth_percent.is_finite()
        || source.tooth_depth_percent <= 0.0
        || source.tooth_depth_percent > 95.0
    {
        return Err("tooth_depth_percent must be 0..95".to_string());
    }
    if !source.tooth_skew_percent.is_finite()
        || source.tooth_skew_percent < -100.0
        || source.tooth_skew_percent > 100.0
    {
        return Err("tooth_skew_percent must be -100..100".to_string());
    }
    parse_hex_colour_source(&source.fill_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_track_bar_source(
    source: &GeneratedTrackBarSource,
) -> Result<(), String> {
    if source.generator != "custom-track-bar" {
        return Err("generator must be custom-track-bar".to_string());
    }
    if source.track_values.len() != 4 {
        return Err("track_values must contain 4 values".to_string());
    }
    if source.track_ranges.len() != 4 {
        return Err("track_ranges must contain 4 ranges".to_string());
    }
    if source.labels.len() != 4 {
        return Err("labels must contain 4 values".to_string());
    }
    if source.track_values.iter().any(|value| !value.is_finite()) {
        return Err("track_values must be finite".to_string());
    }
    for range in &source.track_ranges {
        if !range[0].is_finite()
            || !range[1].is_finite()
            || (range[0] - range[1]).abs() < f32::EPSILON
        {
            return Err("track_ranges must be finite non-zero ranges".to_string());
        }
    }
    if source.labels.iter().any(|label| label.chars().count() > 64) {
        return Err("labels must be at most 64 characters".to_string());
    }
    if !source.background_opacity.is_finite()
        || source.background_opacity < 0.0
        || source.background_opacity > 1.0
    {
        return Err("background_opacity must be 0..1".to_string());
    }
    parse_hex_colour_source(&source.bar_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_pie_chart_source(
    source: &GeneratedPieChartSource,
) -> Result<(), String> {
    if source.generator != "pie-sheet-graph" {
        return Err("generator must be pie-sheet-graph".to_string());
    }
    if source.values.is_empty() || source.values.len() > 64 {
        return Err("values must contain 1..64 values".to_string());
    }
    if source
        .values
        .iter()
        .any(|value| !value.is_finite() || *value < 0.0)
    {
        return Err("values must be finite non-negative numbers".to_string());
    }
    if source.values.iter().all(|value| *value <= f32::EPSILON) {
        return Err("values must contain at least one positive value".to_string());
    }
    if source.sort_mode != "none"
        && source.sort_mode != "descending"
        && source.sort_mode != "ascending"
    {
        return Err("sort_mode must be none, descending, or ascending".to_string());
    }
    if source.label_mode != "none"
        && source.label_mode != "percentage"
        && source.label_mode != "input"
    {
        return Err("label_mode must be none, percentage, or input".to_string());
    }
    if !source.progress_percent.is_finite()
        || source.progress_percent < 0.0
        || source.progress_percent > 100.0
    {
        return Err("progress_percent must be 0..100".to_string());
    }
    if !source.stroke_width.is_finite() || source.stroke_width <= 0.0 {
        return Err("stroke_width must be positive".to_string());
    }
    if source.slice_colours.is_empty() || source.slice_colours.len() > 64 {
        return Err("slice_colours must contain 1..64 colours".to_string());
    }
    for colour in &source.slice_colours {
        parse_hex_colour_source(colour)?;
    }
    Ok(())
}

pub(crate) fn validate_generated_histogram_source(
    source: &GeneratedHistogramSource,
) -> Result<(), String> {
    if source.generator != "simple-histogram" {
        return Err("generator must be simple-histogram".to_string());
    }
    if source.bin_values.is_empty() || source.bin_values.len() > 256 {
        return Err("bin_values must contain 1..256 values".to_string());
    }
    if source
        .bin_values
        .iter()
        .any(|value| !value.is_finite() || *value < 0.0 || *value > 1.0)
    {
        return Err("bin_values must be finite numbers in 0..1".to_string());
    }
    if !source.height_scale_percent.is_finite()
        || source.height_scale_percent <= 0.0
        || source.height_scale_percent > 1000.0
    {
        return Err("height_scale_percent must be 1..1000".to_string());
    }
    if !source.line_width.is_finite() || source.line_width <= 0.0 {
        return Err("line_width must be positive".to_string());
    }
    if !source.show_luminance && !source.show_red && !source.show_green && !source.show_blue {
        return Err("at least one histogram channel must be visible".to_string());
    }
    if source.channel_colours.len() != 4 {
        return Err("channel_colours must contain 4 colours".to_string());
    }
    for colour in &source.channel_colours {
        parse_hex_colour_source(colour)?;
    }
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_sunburst_source(
    source: &GeneratedSunburstSource,
) -> Result<(), String> {
    if source.generator != "sunrise" {
        return Err("generator must be sunrise".to_string());
    }
    if source.ray_count == 0 || source.ray_count > 360 {
        return Err("ray_count must be 1..360".to_string());
    }
    if !source.ray_coverage_percent.is_finite()
        || source.ray_coverage_percent < 0.0
        || source.ray_coverage_percent > 100.0
    {
        return Err("ray_coverage_percent must be 0..100".to_string());
    }
    if !source.rotation_offset_degrees.is_finite() {
        return Err("rotation_offset_degrees must be finite".to_string());
    }
    if !source.centre_x_percent.is_finite()
        || source.centre_x_percent < -100.0
        || source.centre_x_percent > 200.0
        || !source.centre_y_percent.is_finite()
        || source.centre_y_percent < -100.0
        || source.centre_y_percent > 200.0
    {
        return Err("centre percentages must be -100..200".to_string());
    }
    if source.motif_shape != "circle" && source.motif_shape != "rect" {
        return Err("motif_shape must be circle or rect".to_string());
    }
    parse_hex_colour_source(&source.ray_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_circular_arrow_source(
    source: &GeneratedCircularArrowSource,
) -> Result<(), String> {
    if source.generator != "circular-arrow" {
        return Err("generator must be circular-arrow".to_string());
    }
    if source.radius == 0 || source.radius > 2000 {
        return Err("radius must be 1..2000".to_string());
    }
    if source.line_width == 0 || source.line_width > 1000 {
        return Err("line_width must be 1..1000".to_string());
    }
    if source.head_size > 1000 {
        return Err("head_size must be 0..1000".to_string());
    }
    if !source.angle_degrees.is_finite()
        || source.angle_degrees < 0.0
        || source.angle_degrees > 360.0
    {
        return Err("angle_degrees must be 0..360".to_string());
    }
    if !source.centre_angle_degrees.is_finite() {
        return Err("centre_angle_degrees must be finite".to_string());
    }
    if source.head_shape != "triangle" && source.head_shape != "circle" {
        return Err("head_shape must be triangle or circle".to_string());
    }
    parse_hex_colour_source(&source.arrow_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_triangle_bracket_source(
    source: &GeneratedTriangleBracketSource,
) -> Result<(), String> {
    if source.generator != "triangle-bracket" {
        return Err("generator must be triangle-bracket".to_string());
    }
    if source.bracket_width == 0 || source.bracket_width > 2000 {
        return Err("bracket_width must be 1..2000".to_string());
    }
    if !source.angle_degrees.is_finite()
        || source.angle_degrees < 1.0
        || source.angle_degrees > 180.0
    {
        return Err("angle_degrees must be 1..180".to_string());
    }
    if source.arm_length > 2000 {
        return Err("arm_length must be 0..2000".to_string());
    }
    if source.offset_distance < -10000 || source.offset_distance > 10000 {
        return Err("offset_distance must be -10000..10000".to_string());
    }
    parse_hex_colour_source(&source.bracket_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_tartan_check_source(
    source: &GeneratedTartanCheckSource,
) -> Result<(), String> {
    if source.generator != "tartan-check" {
        return Err("generator must be tartan-check".to_string());
    }
    if source.tile_size < 10 || source.tile_size > 800 {
        return Err("tile_size must be 10..800".to_string());
    }
    if source.blur_radius > 300 {
        return Err("blur_radius must be 0..300".to_string());
    }
    parse_hex_colour_source(&source.base_colour)?;
    parse_hex_colour_source(&source.stripe_colour_a)?;
    parse_hex_colour_source(&source.stripe_colour_b)?;
    parse_hex_colour_source(&source.line_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_houndstooth_source(
    source: &GeneratedHoundstoothSource,
) -> Result<(), String> {
    if source.generator != "houndstooth" {
        return Err("generator must be houndstooth".to_string());
    }
    if source.pattern_size < 10 || source.pattern_size > 200 {
        return Err("pattern_size must be 10..200".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_yagasuri_source(
    source: &GeneratedYagasuriSource,
) -> Result<(), String> {
    if source.generator != "yagasuri" {
        return Err("generator must be yagasuri".to_string());
    }
    if source.arrow_width == 0 || source.arrow_width > 500 {
        return Err("arrow_width must be 1..500".to_string());
    }
    if source.arrow_height == 0 || source.arrow_height > 500 {
        return Err("arrow_height must be 1..500".to_string());
    }
    if source.line_width > 100 {
        return Err("line_width must be 0..100".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_paper_airplane_source(
    source: &GeneratedPaperAirplaneSource,
) -> Result<(), String> {
    if source.generator != "paper-airplane" {
        return Err("generator must be paper-airplane".to_string());
    }
    if source.body_length == 0 || source.body_length > 2000 {
        return Err("body_length must be 1..2000".to_string());
    }
    if source.wing_width > 1000 {
        return Err("wing_width must be 0..1000".to_string());
    }
    if source.fold_height > 1000 {
        return Err("fold_height must be 0..1000".to_string());
    }
    if source.gap > 1000 {
        return Err("gap must be 0..1000".to_string());
    }
    if source.axis_mode > 1 {
        return Err("axis_mode must be 0 or 1".to_string());
    }
    let _ = source.follow_motion_direction;
    parse_hex_colour_source(&source.fill_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_asanoha_pattern_source(
    source: &GeneratedAsanohaPatternSource,
) -> Result<(), String> {
    if source.generator != "asanoha-pattern" {
        return Err("generator must be asanoha-pattern".to_string());
    }
    if source.pattern_size < 10 || source.pattern_size > 500 {
        return Err("pattern_size must be 10..500".to_string());
    }
    if source.line_width > 50 {
        return Err("line_width must be 0..50".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_focus_lines_plus_source(
    source: &GeneratedFocusLinesPlusSource,
) -> Result<(), String> {
    if source.generator != "focus-lines-plus" {
        return Err("generator must be focus-lines-plus".to_string());
    }
    if !source.ray_width.is_finite() || source.ray_width < 0.1 || source.ray_width > 10.0 {
        return Err("ray_width must be 0.1..10".to_string());
    }
    if !source.gap.is_finite() || source.gap < 1.0 || source.gap > 20.0 {
        return Err("gap must be 1..20".to_string());
    }
    if !source.centre_radius.is_finite()
        || source.centre_radius < 0.0
        || source.centre_radius > 800.0
    {
        return Err("centre_radius must be 0..800".to_string());
    }
    if !source.rotation_degrees.is_finite()
        || source.rotation_degrees < -720.0
        || source.rotation_degrees > 720.0
    {
        return Err("rotation_degrees must be -720..720".to_string());
    }
    if !source.centre_x.is_finite() || !source.centre_y.is_finite() {
        return Err("centre coordinates must be finite".to_string());
    }
    if !source.centre_jitter_percent.is_finite()
        || source.centre_jitter_percent < 0.0
        || source.centre_jitter_percent > 100.0
    {
        return Err("centre_jitter_percent must be 0..100".to_string());
    }
    parse_hex_colour_source(&source.line_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_random_line_ex_source(
    source: &GeneratedRandomLineExSource,
) -> Result<(), String> {
    if source.generator != "random-line-ex" {
        return Err("generator must be random-line-ex".to_string());
    }
    if source.line_count == 0 || source.line_count > 100 {
        return Err("line_count must be 1..100".to_string());
    }
    if !source.line_width.is_finite() || source.line_width < 0.0 || source.line_width > 2000.0 {
        return Err("line_width must be 0..2000".to_string());
    }
    if source.threshold > 255 {
        return Err("threshold must be 0..255".to_string());
    }
    if source.noise_cell_size > 50 {
        return Err("noise_cell_size must be 0..50".to_string());
    }
    if !source.width_variance.is_finite()
        || source.width_variance < 0.0
        || source.width_variance > 2000.0
    {
        return Err("width_variance must be 0..2000".to_string());
    }
    parse_hex_colour_source(&source.line_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_hologram_source(
    source: &GeneratedHologramSource,
) -> Result<(), String> {
    if source.generator != "hologram" {
        return Err("generator must be hologram".to_string());
    }
    if source.tile_size < 10 || source.tile_size > 1000 {
        return Err("tile_size must be 10..1000".to_string());
    }
    if !source.rotation_degrees.is_finite()
        || source.rotation_degrees < -720.0
        || source.rotation_degrees > 720.0
    {
        return Err("rotation_degrees must be -720..720".to_string());
    }
    if !source.gradient_angle_degrees.is_finite()
        || source.gradient_angle_degrees < -720.0
        || source.gradient_angle_degrees > 720.0
    {
        return Err("gradient_angle_degrees must be -720..720".to_string());
    }
    if source.colour_mode > 2 {
        return Err("colour_mode must be 0..2".to_string());
    }
    parse_hex_colour_source(&source.tint_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_protractor_source(
    source: &GeneratedProtractorSource,
) -> Result<(), String> {
    if source.generator != "protractor" {
        return Err("generator must be protractor".to_string());
    }
    if source.radius == 0 || source.radius > 2000 {
        return Err("radius must be 1..2000".to_string());
    }
    if !source.measured_angle_degrees.is_finite()
        || source.measured_angle_degrees < 0.0
        || source.measured_angle_degrees > 180.0
    {
        return Err("measured_angle_degrees must be 0..180".to_string());
    }
    if source.tick_step_degrees == 0 || source.tick_step_degrees > 90 {
        return Err("tick_step_degrees must be 1..90".to_string());
    }
    if source.major_tick_step_degrees == 0 || source.major_tick_step_degrees > 180 {
        return Err("major_tick_step_degrees must be 1..180".to_string());
    }
    if source.decimal_places > 5 {
        return Err("decimal_places must be 0..5".to_string());
    }
    parse_hex_colour_source(&source.line_colour)?;
    parse_hex_colour_source(&source.text_colour)?;
    parse_hex_colour_source(&source.shadow_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_shaking_polygon_source(
    source: &GeneratedShakingPolygonSource,
) -> Result<(), String> {
    if source.generator != "shaking-polygon" {
        return Err("generator must be shaking-polygon".to_string());
    }
    if source.line_width == 0 || source.line_width > 100 {
        return Err("line_width must be 1..100".to_string());
    }
    if source.vertex_count < 2 || source.vertex_count > 16 {
        return Err("vertex_count must be 2..16".to_string());
    }
    if source.fixed_diameter > 2000 {
        return Err("fixed_diameter must be 0..2000".to_string());
    }
    if !source.vertical_distortion_percent.is_finite()
        || source.vertical_distortion_percent < -100.0
        || source.vertical_distortion_percent > 100.0
    {
        return Err("vertical_distortion_percent must be -100..100".to_string());
    }
    if source.repeat_count == 0 || source.repeat_count > 100 {
        return Err("repeat_count must be 1..100".to_string());
    }
    if source.repeat_frequency == 0 {
        return Err("repeat_frequency must be at least 1".to_string());
    }
    if !source.jitter_range.is_finite() || source.jitter_range < 0.0 || source.jitter_range > 2000.0
    {
        return Err("jitter_range must be 0..2000".to_string());
    }
    if source.jitter_interval == 0 {
        return Err("jitter_interval must be at least 1".to_string());
    }
    parse_hex_colour_source(&source.colour)?;
    Ok(())
}

pub(crate) fn validate_generated_tone_curve_source(
    source: &GeneratedToneCurveSource,
) -> Result<(), String> {
    if source.generator != "simple-tone-curve" {
        return Err("generator must be simple-tone-curve".to_string());
    }
    if source.grid_divisions == 0 || source.grid_divisions > 16 {
        return Err("grid_divisions must be 1..16".to_string());
    }
    if source.line_width == 0 || source.line_width > 100 {
        return Err("line_width must be 1..100".to_string());
    }
    if source.curve_points.len() < 2 || source.curve_points.len() > 64 {
        return Err("curve_points length must be 2..64".to_string());
    }
    if !source
        .curve_points
        .iter()
        .all(|point| point.is_finite() && *point >= 0.0 && *point <= 1.0)
    {
        return Err("curve_points must be finite values in 0..1".to_string());
    }
    parse_hex_colour_source(&source.curve_colour)?;
    parse_hex_colour_source(&source.grid_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_particle_source(
    source: &GeneratedParticleSource,
) -> Result<(), String> {
    if source.generator != "standard-particle" {
        return Err("generator must be standard-particle".to_string());
    }
    if source.particle_count == 0 || source.particle_count > 10_000 {
        return Err("particle_count must be 1..10000".to_string());
    }
    if !source.spread.is_finite() || source.spread < 0.0 {
        return Err("spread must be a finite non-negative number".to_string());
    }
    if !source.speed.is_finite() || source.speed < 0.0 {
        return Err("speed must be a finite non-negative number".to_string());
    }
    if !source.size.is_finite() || source.size <= 0.0 {
        return Err("size must be a finite positive number".to_string());
    }
    if !source.lifetime_seconds.is_finite() || source.lifetime_seconds <= 0.0 {
        return Err("lifetime_seconds must be a finite positive number".to_string());
    }
    parse_hex_colour_source(&source.colour)?;
    Ok(())
}

pub(crate) fn validate_generated_region_frame_source(
    source: &GeneratedRegionFrameSource,
) -> Result<(), String> {
    if source.generator != "region-frame-93" {
        return Err("generator must be region-frame-93".to_string());
    }
    if !source.line_width.is_finite() || !(0.0..=5000.0).contains(&source.line_width) {
        return Err("line_width must be 0..5000".to_string());
    }
    if source.shape != "rectangle" && source.shape != "ellipse" && source.shape != "cut_corner" {
        return Err("shape must be rectangle, ellipse, or cut_corner".to_string());
    }
    if !source.corner_cut.is_finite() || !(0.0..=5000.0).contains(&source.corner_cut) {
        return Err("corner_cut must be 0..5000".to_string());
    }
    if !source.extra_width.is_finite() || !(-5000.0..=5000.0).contains(&source.extra_width) {
        return Err("extra_width must be -5000..5000".to_string());
    }
    if !source.extra_height.is_finite() || !(-5000.0..=5000.0).contains(&source.extra_height) {
        return Err("extra_height must be -5000..5000".to_string());
    }
    if !source.background_opacity.is_finite() || !(0.0..=1.0).contains(&source.background_opacity) {
        return Err("background_opacity must be 0..1".to_string());
    }
    parse_hex_colour_source(&source.frame_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_simple_tube_source(
    source: &GeneratedSimpleTubeSource,
) -> Result<(), String> {
    if source.generator != "simple-tube-93" {
        return Err("generator must be simple-tube-93".to_string());
    }
    if !source.radius.is_finite() || !(0.0..=9000.0).contains(&source.radius) {
        return Err("radius must be 0..9000".to_string());
    }
    if !source.depth.is_finite() || !(-12000.0..=12000.0).contains(&source.depth) {
        return Err("depth must be -12000..12000".to_string());
    }
    if source.segments < 3 || source.segments > 128 {
        return Err("segments must be 3..128".to_string());
    }
    if source.rings < 2 || source.rings > 128 {
        return Err("rings must be 2..128".to_string());
    }
    if !source.twist_degrees.is_finite() || !(-1800.0..=1800.0).contains(&source.twist_degrees) {
        return Err("twist_degrees must be -1800..1800".to_string());
    }
    if !source.random_amount.is_finite() || !(-300.0..=300.0).contains(&source.random_amount) {
        return Err("random_amount must be -300..300".to_string());
    }
    if !source.stroke_width.is_finite() || !(0.0..=200.0).contains(&source.stroke_width) {
        return Err("stroke_width must be 0..200".to_string());
    }
    if source.colour_pattern != "single"
        && source.colour_pattern != "ring"
        && source.colour_pattern != "depth"
    {
        return Err("colour_pattern must be single, ring, or depth".to_string());
    }
    if !source.fog_strength.is_finite() || !(0.0..=1.0).contains(&source.fog_strength) {
        return Err("fog_strength must be 0..1".to_string());
    }
    parse_hex_colour_source(&source.colour)?;
    parse_hex_colour_source(&source.secondary_colour)?;
    parse_hex_colour_source(&source.fog_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_sphere_dots_source(
    source: &GeneratedSphereDotsSource,
) -> Result<(), String> {
    if source.generator != "sphere-drawpixel-93" {
        return Err("generator must be sphere-drawpixel-93".to_string());
    }
    if !source.radius.is_finite() || !(1.0..=5000.0).contains(&source.radius) {
        return Err("radius must be 1..5000".to_string());
    }
    if source.columns < 3 || source.columns > 256 {
        return Err("columns must be 3..256".to_string());
    }
    if source.rows < 2 || source.rows > 256 {
        return Err("rows must be 2..256".to_string());
    }
    if !source.rotation_degrees.is_finite()
        || !(-1000.0..=1000.0).contains(&source.rotation_degrees)
    {
        return Err("rotation_degrees must be -1000..1000".to_string());
    }
    if !source.offset_degrees.is_finite() || !(-360.0..=360.0).contains(&source.offset_degrees) {
        return Err("offset_degrees must be -360..360".to_string());
    }
    if !source.luminance_influence.is_finite()
        || !(-5000.0..=5000.0).contains(&source.luminance_influence)
    {
        return Err("luminance_influence must be -5000..5000".to_string());
    }
    if !source.point_size.is_finite() || !(0.0..=200.0).contains(&source.point_size) {
        return Err("point_size must be 0..200".to_string());
    }
    if !source.latitude_line_width.is_finite()
        || !(0.0..=100.0).contains(&source.latitude_line_width)
    {
        return Err("latitude_line_width must be 0..100".to_string());
    }
    parse_hex_colour_source(&source.colour)?;
    parse_hex_colour_source(&source.secondary_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_spherical_field_source(
    source: &GeneratedSphericalFieldSource,
) -> Result<(), String> {
    if source.generator != "spherical-field-93" {
        return Err("generator must be spherical-field-93".to_string());
    }
    if !source.radius.is_finite() || !(0.0..=5000.0).contains(&source.radius) {
        return Err("radius must be 0..5000".to_string());
    }
    if !source.strength.is_finite() || !(-200.0..=200.0).contains(&source.strength) {
        return Err("strength must be -200..200".to_string());
    }
    if !source.colour_amount.is_finite() || !(-100.0..=100.0).contains(&source.colour_amount) {
        return Err("colour_amount must be -100..100".to_string());
    }
    if !source.alpha_amount.is_finite() || !(-100.0..=100.0).contains(&source.alpha_amount) {
        return Err("alpha_amount must be -100..100".to_string());
    }
    if !source.line_width.is_finite() || !(0.0..=100.0).contains(&source.line_width) {
        return Err("line_width must be 0..100".to_string());
    }
    if source.ring_count == 0 || source.ring_count > 64 {
        return Err("ring_count must be 1..64".to_string());
    }
    if source.vector_count > 256 {
        return Err("vector_count must be 0..256".to_string());
    }
    if !source.background_opacity.is_finite() || !(0.0..=1.0).contains(&source.background_opacity) {
        return Err("background_opacity must be 0..1".to_string());
    }
    parse_hex_colour_source(&source.field_colour)?;
    parse_hex_colour_source(&source.secondary_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_hksy_checker_grid_source(
    source: &GeneratedHksyCheckerGridSource,
) -> Result<(), String> {
    if source.generator != "hksy-checker-grid" {
        return Err("generator must be hksy-checker-grid".to_string());
    }
    if let Some(pattern) = source.pattern.as_deref() {
        if pattern != "checker-grid"
            && pattern != "diamond"
            && pattern != "measured-grid"
            && pattern != "anchor-line"
        {
            return Err(
                "pattern must be checker-grid, diamond, measured-grid or anchor-line".to_string(),
            );
        }
    }
    if source.cell_size == 0 || source.cell_size > 1000 {
        return Err("cell_size must be 1..1000".to_string());
    }
    if source.line_width > 100 {
        return Err("line_width must be 0..100".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.secondary_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    if let Some(palette_colours) = &source.palette_colours {
        if palette_colours.len() < 2 || palette_colours.len() > 16 {
            return Err("palette_colours must contain 2..16 colours".to_string());
        }
        for colour in palette_colours {
            parse_hex_colour_source(colour)?;
        }
    }
    if let Some(separate_interval) = source.separate_interval {
        if separate_interval == 0 || separate_interval > 1000 {
            return Err("separate_interval must be 1..1000".to_string());
        }
    }
    if let Some(separate_line_width) = source.separate_line_width {
        if separate_line_width > 100 {
            return Err("separate_line_width must be 0..100".to_string());
        }
    }
    if source.pattern.as_deref() == Some("anchor-line") {
        let anchor_points = source
            .anchor_points
            .as_ref()
            .ok_or_else(|| "anchor_points is required for anchor-line".to_string())?;
        if anchor_points.len() < 2 || anchor_points.len() > 16 {
            return Err("anchor_points must contain 2..16 points".to_string());
        }
        if anchor_points.iter().any(|point| {
            !point.x.is_finite()
                || !point.y.is_finite()
                || point.x < -1000.0
                || point.x > 1000.0
                || point.y < -1000.0
                || point.y > 1000.0
        }) {
            return Err("anchor_points must be finite values in -1000..1000".to_string());
        }
        if source.round_caps.is_none() {
            return Err("round_caps is required for anchor-line".to_string());
        }
        let max_join_distance = source
            .max_join_distance
            .ok_or_else(|| "max_join_distance is required for anchor-line".to_string())?;
        if !max_join_distance.is_finite() || !(0.0..=300.0).contains(&max_join_distance) {
            return Err("max_join_distance must be 0..300".to_string());
        }
    }
    Ok(())
}

pub(crate) fn validate_generated_getcolor_dots_source(
    source: &GeneratedGetColorDotsSource,
) -> Result<(), String> {
    if source.generator != "getcolor-v2r-dot-field" {
        return Err("generator must be getcolor-v2r-dot-field".to_string());
    }
    if source.columns == 0 || source.columns > 512 {
        return Err("columns must be 1..512".to_string());
    }
    if source.rows == 0 || source.rows > 512 {
        return Err("rows must be 1..512".to_string());
    }
    if !source.dot_size.is_finite() || source.dot_size < 0.0 || source.dot_size > 2000.0 {
        return Err("dot_size must be 0..2000".to_string());
    }
    if let Some(dot_shape) = source.dot_shape.as_deref() {
        if dot_shape != "circle" && dot_shape != "square" && dot_shape != "diamond" {
            return Err("dot_shape must be circle, square or diamond".to_string());
        }
    }
    if let Some(stroke_width) = source.stroke_width {
        if !stroke_width.is_finite() || !(0.0..=200.0).contains(&stroke_width) {
            return Err("stroke_width must be 0..200".to_string());
        }
    }
    if !source.size_influence.is_finite()
        || source.size_influence < 0.0
        || source.size_influence > 4.0
    {
        return Err("size_influence must be 0..4".to_string());
    }
    if !source.luminance_influence.is_finite()
        || source.luminance_influence < 0.0
        || source.luminance_influence > 4.0
    {
        return Err("luminance_influence must be 0..4".to_string());
    }
    if !source.hue_shift_degrees.is_finite()
        || source.hue_shift_degrees < -720.0
        || source.hue_shift_degrees > 720.0
    {
        return Err("hue_shift_degrees must be -720..720".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.secondary_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    if let Some(source_image) = source.source_image.as_deref() {
        let source_path =
            local_media_source_path(source_image, "GeneratedGetColorDots source_image")?;
        let lower = source_path.to_ascii_lowercase();
        if !(lower.ends_with(".png")
            || lower.ends_with(".jpg")
            || lower.ends_with(".jpeg")
            || lower.ends_with(".psd"))
        {
            return Err("source_image must be PNG, JPEG or PSD".to_string());
        }
    }
    if let Some(active_layer_ids) = source.source_active_layer_ids.as_ref() {
        if active_layer_ids.iter().any(|layer_id| layer_id.is_empty()) {
            return Err("source_active_layer_ids must not contain empty ids".to_string());
        }
    }
    if let Some(sample_strength) = source.sample_strength {
        if !sample_strength.is_finite() || !(0.0..=1.0).contains(&sample_strength) {
            return Err("sample_strength must be 0..1".to_string());
        }
    }
    if let Some(sample_hue_shift_degrees) = source.sample_hue_shift_degrees {
        if !sample_hue_shift_degrees.is_finite()
            || !(-720.0..=720.0).contains(&sample_hue_shift_degrees)
        {
            return Err("sample_hue_shift_degrees must be -720..720".to_string());
        }
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedGradientSource {
    #[serde(rename = "type")]
    pub(crate) gradient_type: String,
    pub(crate) colours: Vec<String>,
    #[serde(default)]
    pub(crate) stops: Vec<f32>,
    #[serde(default)]
    pub(crate) direction: f32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedParticleSource {
    pub(crate) generator: String,
    pub(crate) seed: u64,
    pub(crate) particle_count: u32,
    pub(crate) spread: f32,
    pub(crate) speed: f32,
    pub(crate) size: f32,
    pub(crate) colour: String,
    pub(crate) lifetime_seconds: f32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedBarcodeSource {
    pub(crate) generator: String,
    pub(crate) data: String,
    pub(crate) minimum_bar_width: u32,
    pub(crate) horizontal_margin: u32,
    pub(crate) vertical_margin: u32,
    pub(crate) foreground_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedPuzzlePieceSource {
    pub(crate) generator: String,
    pub(crate) size: u32,
    pub(crate) shape_variant: u32,
    pub(crate) connector_mode: String,
    pub(crate) fill_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedColourWheelSource {
    pub(crate) generator: String,
    pub(crate) radius: u32,
    pub(crate) saturation: f32,
    pub(crate) brightness: f32,
    pub(crate) ring_width_percent: f32,
    pub(crate) segment_count: u32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedGourdSource {
    pub(crate) generator: String,
    pub(crate) body_radius: u32,
    pub(crate) body_width: u32,
    pub(crate) waist_radius: u32,
    pub(crate) squash_percent: f32,
    pub(crate) repeat_count: u32,
    pub(crate) fill_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedGearSource {
    pub(crate) generator: String,
    pub(crate) outer_radius: u32,
    pub(crate) inner_radius_percent: f32,
    pub(crate) tooth_count: u32,
    pub(crate) tooth_depth_percent: f32,
    pub(crate) tooth_skew_percent: f32,
    pub(crate) fill_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedTrackBarSource {
    pub(crate) generator: String,
    pub(crate) track_values: Vec<f32>,
    pub(crate) track_ranges: Vec<[f32; 2]>,
    pub(crate) labels: Vec<String>,
    pub(crate) bar_colour: String,
    pub(crate) background_opacity: f32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedPieChartSource {
    pub(crate) generator: String,
    pub(crate) values: Vec<f32>,
    pub(crate) sort_mode: String,
    pub(crate) normalise_to_hundred: bool,
    pub(crate) label_mode: String,
    pub(crate) progress_percent: f32,
    pub(crate) stroke_width: f32,
    pub(crate) slice_colours: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedHistogramSource {
    pub(crate) generator: String,
    pub(crate) bin_values: Vec<f32>,
    pub(crate) height_scale_percent: f32,
    pub(crate) line_width: f32,
    pub(crate) show_luminance: bool,
    pub(crate) show_red: bool,
    pub(crate) show_green: bool,
    pub(crate) show_blue: bool,
    pub(crate) channel_colours: Vec<String>,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedSunburstSource {
    pub(crate) generator: String,
    pub(crate) ray_count: u32,
    pub(crate) ray_coverage_percent: f32,
    pub(crate) rotation_offset_degrees: f32,
    pub(crate) centre_x_percent: f32,
    pub(crate) centre_y_percent: f32,
    pub(crate) motif_size: u32,
    pub(crate) motif_shape: String,
    pub(crate) ray_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedCircularArrowSource {
    pub(crate) generator: String,
    pub(crate) radius: u32,
    pub(crate) line_width: u32,
    pub(crate) head_size: u32,
    pub(crate) angle_degrees: f32,
    pub(crate) centre_angle_degrees: f32,
    pub(crate) head_shape: String,
    pub(crate) show_tail_head: bool,
    pub(crate) flip_vertical: bool,
    pub(crate) flip_horizontal: bool,
    pub(crate) arrow_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedTriangleBracketSource {
    pub(crate) generator: String,
    pub(crate) bracket_width: u32,
    pub(crate) angle_degrees: f32,
    pub(crate) arm_length: u32,
    pub(crate) offset_distance: i32,
    pub(crate) bracket_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedTartanCheckSource {
    pub(crate) generator: String,
    pub(crate) tile_size: u32,
    pub(crate) blur_radius: u32,
    pub(crate) base_colour: String,
    pub(crate) stripe_colour_a: String,
    pub(crate) stripe_colour_b: String,
    pub(crate) line_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedHoundstoothSource {
    pub(crate) generator: String,
    pub(crate) pattern_size: u32,
    pub(crate) foreground_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedYagasuriSource {
    pub(crate) generator: String,
    pub(crate) arrow_width: u32,
    pub(crate) arrow_height: u32,
    pub(crate) line_width: u32,
    pub(crate) staggered: bool,
    pub(crate) foreground_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedPaperAirplaneSource {
    pub(crate) generator: String,
    pub(crate) body_length: u32,
    pub(crate) wing_width: u32,
    pub(crate) fold_height: u32,
    pub(crate) gap: u32,
    pub(crate) follow_motion_direction: bool,
    pub(crate) axis_mode: u32,
    pub(crate) fill_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedAsanohaPatternSource {
    pub(crate) generator: String,
    pub(crate) pattern_size: u32,
    pub(crate) line_width: u32,
    pub(crate) foreground_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedFocusLinesPlusSource {
    pub(crate) generator: String,
    pub(crate) ray_width: f32,
    pub(crate) gap: f32,
    pub(crate) centre_radius: f32,
    pub(crate) rotation_degrees: f32,
    pub(crate) centre_x: f32,
    pub(crate) centre_y: f32,
    pub(crate) centre_jitter_percent: f32,
    pub(crate) seed: i64,
    pub(crate) keyframe_interval: u64,
    pub(crate) line_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedRandomLineExSource {
    pub(crate) generator: String,
    pub(crate) line_count: u32,
    pub(crate) line_width: f32,
    pub(crate) threshold: u32,
    pub(crate) noise_cell_size: u32,
    pub(crate) width_variance: f32,
    pub(crate) seed: i64,
    pub(crate) line_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedHologramSource {
    pub(crate) generator: String,
    pub(crate) tile_size: u32,
    pub(crate) rotation_degrees: f32,
    pub(crate) gradient_angle_degrees: f32,
    pub(crate) colour_mode: u32,
    pub(crate) tint_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedProtractorSource {
    pub(crate) generator: String,
    pub(crate) radius: u32,
    pub(crate) measured_angle_degrees: f32,
    pub(crate) tick_step_degrees: u32,
    pub(crate) major_tick_step_degrees: u32,
    pub(crate) decimal_places: u32,
    pub(crate) line_colour: String,
    pub(crate) text_colour: String,
    pub(crate) shadow_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedShakingPolygonSource {
    pub(crate) generator: String,
    pub(crate) line_width: u32,
    pub(crate) vertex_count: u32,
    pub(crate) fixed_diameter: u32,
    pub(crate) vertical_distortion_percent: f32,
    pub(crate) repeat_count: u32,
    pub(crate) repeat_frequency: u32,
    pub(crate) fill: bool,
    pub(crate) jitter_range: f32,
    pub(crate) jitter_interval: u32,
    pub(crate) stepped: bool,
    pub(crate) colour: String,
    pub(crate) seed: i64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedToneCurveSource {
    pub(crate) generator: String,
    pub(crate) grid_divisions: u32,
    pub(crate) line_width: u32,
    pub(crate) curve_points: Vec<f32>,
    pub(crate) curve_colour: String,
    pub(crate) grid_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedGetColorDotsSource {
    pub(crate) generator: String,
    pub(crate) columns: u32,
    pub(crate) rows: u32,
    pub(crate) dot_size: f32,
    pub(crate) dot_shape: Option<String>,
    pub(crate) stroke_width: Option<f32>,
    pub(crate) size_influence: f32,
    pub(crate) luminance_influence: f32,
    pub(crate) hue_shift_degrees: f32,
    pub(crate) alternate_rows: bool,
    pub(crate) foreground_colour: String,
    pub(crate) secondary_colour: String,
    pub(crate) background_colour: String,
    pub(crate) source_image: Option<String>,
    pub(crate) source_active_layer_ids: Option<Vec<String>>,
    pub(crate) sample_strength: Option<f32>,
    pub(crate) sample_hue_shift_degrees: Option<f32>,
    pub(crate) seed: i64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedHksyCheckerGridSource {
    pub(crate) generator: String,
    pub(crate) pattern: Option<String>,
    pub(crate) cell_size: u32,
    pub(crate) line_width: u32,
    pub(crate) checker_enabled: bool,
    pub(crate) grid_enabled: bool,
    pub(crate) foreground_colour: String,
    pub(crate) secondary_colour: String,
    pub(crate) background_colour: String,
    pub(crate) palette_colours: Option<Vec<String>>,
    pub(crate) separate_interval: Option<u32>,
    pub(crate) separate_line_width: Option<u32>,
    pub(crate) anchor_points: Option<Vec<GeneratedHksyAnchorPoint>>,
    pub(crate) round_caps: Option<bool>,
    pub(crate) max_join_distance: Option<f32>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
pub(crate) struct GeneratedHksyAnchorPoint {
    pub(crate) x: f32,
    pub(crate) y: f32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedRegionFrameSource {
    pub(crate) generator: String,
    pub(crate) line_width: f32,
    #[serde(default = "default_region_frame_shape")]
    pub(crate) shape: String,
    #[serde(default = "default_region_frame_corner_cut")]
    pub(crate) corner_cut: f32,
    pub(crate) extra_width: f32,
    pub(crate) extra_height: f32,
    pub(crate) background_opacity: f32,
    pub(crate) frame_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedSimpleTubeSource {
    pub(crate) generator: String,
    pub(crate) radius: f32,
    pub(crate) depth: f32,
    pub(crate) segments: u32,
    pub(crate) rings: u32,
    pub(crate) twist_degrees: f32,
    pub(crate) random_amount: f32,
    pub(crate) stroke_width: f32,
    pub(crate) colour: String,
    pub(crate) secondary_colour: String,
    #[serde(default = "default_simple_tube_colour_pattern")]
    pub(crate) colour_pattern: String,
    #[serde(default)]
    pub(crate) fog_strength: f32,
    #[serde(default = "default_simple_tube_fog_colour")]
    pub(crate) fog_colour: String,
    pub(crate) seed: i64,
    pub(crate) torus: bool,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedSphereDotsSource {
    pub(crate) generator: String,
    pub(crate) radius: f32,
    pub(crate) columns: u32,
    pub(crate) rows: u32,
    pub(crate) rotation_degrees: f32,
    pub(crate) offset_degrees: f32,
    pub(crate) luminance_influence: f32,
    pub(crate) point_size: f32,
    pub(crate) latitude_line_width: f32,
    pub(crate) colour: String,
    pub(crate) secondary_colour: String,
    pub(crate) seed: i64,
    pub(crate) plane_mode: bool,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedSphericalFieldSource {
    pub(crate) generator: String,
    pub(crate) radius: f32,
    pub(crate) strength: f32,
    pub(crate) colour_amount: f32,
    pub(crate) alpha_amount: f32,
    pub(crate) line_width: f32,
    pub(crate) ring_count: u32,
    pub(crate) vector_count: u32,
    pub(crate) field_colour: String,
    pub(crate) secondary_colour: String,
    pub(crate) background_opacity: f32,
    pub(crate) container: bool,
    pub(crate) seed: i64,
}

pub(crate) fn default_simple_tube_colour_pattern() -> String {
    "single".to_string()
}

pub(crate) fn default_simple_tube_fog_colour() -> String {
    "#ffffff".to_string()
}

pub(crate) fn default_region_frame_shape() -> String {
    "rectangle".to_string()
}

pub(crate) fn default_region_frame_corner_cut() -> f32 {
    20.0
}
