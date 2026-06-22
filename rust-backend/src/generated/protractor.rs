use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

use super::*;

pub(crate) fn build_generated_protractor_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedProtractor media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let protractor: GeneratedProtractorSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedProtractor media '{}': {error}", media.id))?;
    validate_generated_protractor_source(&protractor).map_err(|message| {
        format!(
            "Invalid GeneratedProtractor media '{}': {message}",
            media.id
        )
    })?;
    let line_colour = parse_hex_colour_source(&protractor.line_colour).map_err(|message| {
        format!(
            "Invalid GeneratedProtractor media '{}': {message}",
            media.id
        )
    })?;
    let text_colour = parse_hex_colour_source(&protractor.text_colour).map_err(|message| {
        format!(
            "Invalid GeneratedProtractor media '{}': {message}",
            media.id
        )
    })?;
    let shadow_colour = parse_hex_colour_source(&protractor.shadow_colour).map_err(|message| {
        format!(
            "Invalid GeneratedProtractor media '{}': {message}",
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
        .ok_or_else(|| "GeneratedProtractor media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedProtractor media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let centre_x = media.width as f32 * 0.5;
    let centre_y = media.height as f32 - 24.0;
    let radius = protractor
        .radius
        .min(media.width / 2)
        .min(media.height.saturating_sub(28))
        .max(1) as f32;

    draw_protractor_arc(
        &mut pixels,
        media.width,
        media.height,
        centre_x,
        centre_y,
        radius,
        line_colour,
    );
    draw_line_segment_rgba(
        &mut pixels,
        media.width,
        media.height,
        (centre_x - radius, centre_y),
        (centre_x + radius, centre_y),
        line_colour,
        2.0,
    );

    let mut degree = 0_u32;
    while degree <= 180 {
        let is_major = degree % protractor.major_tick_step_degrees == 0;
        let angle = std::f32::consts::PI - (degree as f32).to_radians();
        let outer = (
            centre_x + angle.cos() * radius,
            centre_y - angle.sin() * radius,
        );
        let tick_len = if is_major { 18.0 } else { 9.0 };
        let inner = (
            centre_x + angle.cos() * (radius - tick_len),
            centre_y - angle.sin() * (radius - tick_len),
        );
        draw_line_segment_rgba(
            &mut pixels,
            media.width,
            media.height,
            inner,
            outer,
            line_colour,
            if is_major { 2.0 } else { 1.0 },
        );
        degree = degree.saturating_add(protractor.tick_step_degrees);
    }

    let measured = protractor.measured_angle_degrees.clamp(0.0, 180.0);
    let measured_angle = std::f32::consts::PI - measured.to_radians();
    draw_line_segment_rgba(
        &mut pixels,
        media.width,
        media.height,
        (centre_x, centre_y),
        (
            centre_x + measured_angle.cos() * (radius - 22.0),
            centre_y - measured_angle.sin() * (radius - 22.0),
        ),
        line_colour,
        3.0,
    );
    draw_filled_circle_rgba(
        &mut pixels,
        media.width,
        media.height,
        centre_x,
        centre_y,
        4.0,
        line_colour,
        255,
    );

    let label = format!("{:.*}", protractor.decimal_places as usize, measured);
    draw_seven_segment_label(
        &mut pixels,
        media.width,
        media.height,
        &label,
        (centre_x - (label.len() as f32 * 14.0) * 0.5).round() as i32,
        (centre_y - radius * 0.48).round() as i32,
        2,
        text_colour,
        shadow_colour,
    );

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedProtractor media frame is invalid: {error:?}"))
}

fn draw_protractor_arc(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius: f32,
    colour: [u8; 3],
) {
    let min_x = (centre_x - radius - 2.0).floor().max(0.0) as u32;
    let max_x = (centre_x + radius + 2.0)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = (centre_y - radius - 2.0).floor().max(0.0) as u32;
    let max_y = centre_y.ceil().min(height.saturating_sub(1) as f32) as u32;

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let dx = x as f32 + 0.5 - centre_x;
            let dy = centre_y - (y as f32 + 0.5);
            if dy < 0.0 {
                continue;
            }
            let distance = (dx * dx + dy * dy).sqrt();
            if (distance - radius).abs() <= 1.4 {
                let offset = (y as usize * width as usize + x as usize) * 4;
                pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
            }
        }
    }
}

fn draw_seven_segment_label(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    label: &str,
    x: i32,
    y: i32,
    scale: i32,
    colour: [u8; 3],
    shadow_colour: [u8; 3],
) {
    draw_seven_segment_label_at(
        pixels,
        width,
        height,
        label,
        x + 2,
        y + 2,
        scale,
        shadow_colour,
    );
    draw_seven_segment_label_at(pixels, width, height, label, x, y, scale, colour);
}

fn draw_seven_segment_label_at(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    label: &str,
    x: i32,
    y: i32,
    scale: i32,
    colour: [u8; 3],
) {
    let mut cursor_x = x;
    for character in label.chars() {
        if character == '.' {
            fill_rect_rgba_i32(
                pixels,
                width,
                height,
                cursor_x,
                y + 16 * scale,
                2 * scale,
                2 * scale,
                colour,
            );
            cursor_x += 4 * scale;
        } else {
            draw_seven_segment_character(
                pixels, width, height, character, cursor_x, y, scale, colour,
            );
            cursor_x += 9 * scale;
        }
    }
}

fn draw_seven_segment_character(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    character: char,
    x: i32,
    y: i32,
    scale: i32,
    colour: [u8; 3],
) {
    let segments = match character {
        '0' => [true, true, true, true, true, true, false],
        '1' => [false, true, true, false, false, false, false],
        '2' => [true, true, false, true, true, false, true],
        '3' => [true, true, true, true, false, false, true],
        '4' => [false, true, true, false, false, true, true],
        '5' => [true, false, true, true, false, true, true],
        '6' => [true, false, true, true, true, true, true],
        '7' => [true, true, true, false, false, false, false],
        '8' => [true, true, true, true, true, true, true],
        '9' => [true, true, true, true, false, true, true],
        _ => [false, false, false, false, false, false, false],
    };
    let segment_rects = [
        (1, 0, 5, 1),
        (6, 1, 1, 6),
        (6, 9, 1, 6),
        (1, 15, 5, 1),
        (0, 9, 1, 6),
        (0, 1, 1, 6),
        (1, 7, 5, 1),
    ];
    for (enabled, rect) in segments.iter().zip(segment_rects.iter()) {
        if *enabled {
            fill_rect_rgba_i32(
                pixels,
                width,
                height,
                x + rect.0 * scale,
                y + rect.1 * scale,
                rect.2 * scale,
                rect.3 * scale,
                colour,
            );
        }
    }
}

fn fill_rect_rgba_i32(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    rect_width: i32,
    rect_height: i32,
    colour: [u8; 3],
) {
    let min_x = x.max(0) as u32;
    let min_y = y.max(0) as u32;
    let max_x = (x + rect_width).min(width as i32).max(0) as u32;
    let max_y = (y + rect_height).min(height as i32).max(0) as u32;
    for py in min_y..max_y {
        for px in min_x..max_x {
            let offset = (py as usize * width as usize + px as usize) * 4;
            pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
        }
    }
}
