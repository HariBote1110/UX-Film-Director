use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

use super::*;

pub(crate) fn build_generated_sphere_dots_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedSphereDots media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let sphere: GeneratedSphereDotsSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedSphereDots media '{}': {error}", media.id))?;
    validate_generated_sphere_dots_source(&sphere).map_err(|message| {
        format!(
            "Invalid GeneratedSphereDots media '{}': {message}",
            media.id
        )
    })?;
    let colour = parse_hex_colour_source(&sphere.colour).map_err(|message| {
        format!(
            "Invalid GeneratedSphereDots media '{}': colour {message}",
            media.id
        )
    })?;
    let secondary_colour =
        parse_hex_colour_source(&sphere.secondary_colour).map_err(|message| {
            format!(
                "Invalid GeneratedSphereDots media '{}': secondary_colour {message}",
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
        .ok_or_else(|| "GeneratedSphereDots media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedSphereDots media byte length overflows".to_string())?;
    let mut pixels = vec![0; byte_len];
    draw_sphere_dots_rgba(
        &mut pixels,
        media.width,
        media.height,
        &sphere,
        colour,
        secondary_colour,
    );

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedSphereDots media frame is invalid: {error:?}"))
}

fn draw_sphere_dots_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    sphere: &GeneratedSphereDotsSource,
    colour: [u8; 3],
    secondary_colour: [u8; 3],
) {
    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let radius = sphere.radius.min(width.min(height) as f32 * 0.46).max(1.0);
    let rows = sphere.rows.max(2);
    let columns = sphere.columns.max(3);
    let rotation = sphere.rotation_degrees.to_radians();
    let offset = sphere.offset_degrees.to_radians();
    let line_width = sphere.latitude_line_width.max(0.0);
    let point_radius = (sphere.point_size * 0.5).max(0.0).min(radius * 0.2);
    let luminance_amount = (sphere.luminance_influence / 5000.0).clamp(-1.0, 1.0);
    let _seed = sphere.seed;

    if sphere.plane_mode {
        draw_sphere_dots_plane_rgba(
            pixels,
            width,
            height,
            centre_x,
            centre_y,
            radius,
            sphere,
            colour,
            secondary_colour,
            point_radius,
        );
        return;
    }

    let mut rows_points: Vec<Vec<(f32, f32)>> = Vec::with_capacity(rows as usize);
    for row_index in 0..rows {
        let theta = std::f32::consts::PI * (row_index + 1) as f32 / (rows + 1) as f32;
        let y = centre_y + theta.cos() * radius;
        let x_radius = theta.sin() * radius;
        let mut points = Vec::with_capacity(columns as usize);
        for column_index in 0..columns {
            let phi =
                offset + rotation + std::f32::consts::TAU * column_index as f32 / columns as f32;
            points.push((centre_x + phi.cos() * x_radius, y));
        }
        rows_points.push(points);
    }

    if line_width > 0.0 {
        for points in &rows_points {
            for pair in points.windows(2) {
                draw_line_segment_rgba(
                    pixels,
                    width,
                    height,
                    pair[0],
                    pair[1],
                    secondary_colour,
                    line_width,
                );
            }
            if let (Some(first), Some(last)) = (points.first(), points.last()) {
                draw_line_segment_rgba(
                    pixels,
                    width,
                    height,
                    *last,
                    *first,
                    secondary_colour,
                    line_width,
                );
            }
        }
    }

    for (row_index, points) in rows_points.iter().enumerate() {
        let row_phase = if rows <= 1 {
            0.0
        } else {
            row_index as f32 / (rows - 1) as f32
        };
        let brightness = (1.0 - luminance_amount.abs() * 0.35)
            + luminance_amount * (1.0 - (row_phase - 0.5).abs() * 2.0) * 0.35;
        let point_colour = scale_rgb_u8(colour, brightness.clamp(0.2, 1.4));
        for point in points {
            fill_disc_rgba(
                pixels,
                width,
                height,
                *point,
                point_radius.max(0.5),
                point_colour,
                255,
            );
        }
    }

    if line_width > 0.0 {
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            (centre_x, centre_y - radius),
            (centre_x, centre_y + radius),
            secondary_colour,
            line_width,
        );
    }
}

fn draw_sphere_dots_plane_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius: f32,
    sphere: &GeneratedSphereDotsSource,
    colour: [u8; 3],
    secondary_colour: [u8; 3],
    point_radius: f32,
) {
    let columns = sphere.columns.max(3);
    let rows = sphere.rows.max(2);
    let left = centre_x - radius;
    let top = centre_y - radius;
    let horizontal_step = if columns <= 1 {
        0.0
    } else {
        radius * 2.0 / (columns - 1) as f32
    };
    let vertical_step = if rows <= 1 {
        0.0
    } else {
        radius * 2.0 / (rows - 1) as f32
    };

    if sphere.latitude_line_width > 0.0 {
        for row_index in 0..rows {
            let y = top + vertical_step * row_index as f32;
            draw_line_segment_rgba(
                pixels,
                width,
                height,
                (left, y),
                (left + radius * 2.0, y),
                secondary_colour,
                sphere.latitude_line_width,
            );
        }
    }

    for row_index in 0..rows {
        for column_index in 0..columns {
            let x = left + horizontal_step * column_index as f32;
            let y = top + vertical_step * row_index as f32;
            fill_disc_rgba(
                pixels,
                width,
                height,
                (x, y),
                point_radius.max(0.5),
                colour,
                255,
            );
        }
    }
}

pub(crate) fn build_generated_spherical_field_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedSphericalField media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let field: GeneratedSphericalFieldSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedSphericalField media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_spherical_field_source(&field).map_err(|message| {
        format!(
            "Invalid GeneratedSphericalField media '{}': {message}",
            media.id
        )
    })?;
    let field_colour = parse_hex_colour_source(&field.field_colour).map_err(|message| {
        format!(
            "Invalid GeneratedSphericalField media '{}': field_colour {message}",
            media.id
        )
    })?;
    let secondary_colour = parse_hex_colour_source(&field.secondary_colour).map_err(|message| {
        format!(
            "Invalid GeneratedSphericalField media '{}': secondary_colour {message}",
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
        .ok_or_else(|| "GeneratedSphericalField media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedSphericalField media byte length overflows".to_string())?;
    let mut pixels = vec![0; byte_len];
    draw_spherical_field_rgba(
        &mut pixels,
        media.width,
        media.height,
        &field,
        field_colour,
        secondary_colour,
    );

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedSphericalField media frame is invalid: {error:?}"))
}

fn draw_spherical_field_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    field: &GeneratedSphericalFieldSource,
    field_colour: [u8; 3],
    secondary_colour: [u8; 3],
) {
    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let radius = field.radius.min(width.min(height) as f32 * 0.46).max(1.0);
    let line_width = field.line_width.max(0.5);
    let ring_count = field.ring_count.max(1);
    let vector_count = field.vector_count;
    let strength_amount = (field.strength / 100.0).clamp(-2.0, 2.0);
    let colour_amount = (field.colour_amount.abs() / 100.0).clamp(0.0, 1.0);
    let alpha_factor = if field.alpha_amount >= 0.0 {
        1.0 - (field.alpha_amount / 100.0).clamp(0.0, 1.0) * 0.5
    } else {
        1.0
    };
    let field_line_colour = mix_rgb_u8(secondary_colour, field_colour, colour_amount);
    let fill_alpha = (field.background_opacity.clamp(0.0, 1.0) * 255.0 * alpha_factor)
        .round()
        .clamp(0.0, 255.0) as u8;
    let _seed = field.seed;

    if fill_alpha > 0 {
        fill_disc_rgba(
            pixels,
            width,
            height,
            (centre_x, centre_y),
            radius,
            field_line_colour,
            fill_alpha,
        );
    }

    for ring_index in 1..=ring_count {
        let ring_radius = radius * ring_index as f32 / ring_count as f32;
        draw_circle_outline_rgba(
            pixels,
            width,
            height,
            (centre_x, centre_y),
            ring_radius,
            field_line_colour,
            line_width,
        );
    }

    if vector_count > 0 {
        for vector_index in 0..vector_count {
            let angle = std::f32::consts::TAU * vector_index as f32 / vector_count as f32;
            let inner = radius * 0.16;
            let outer = radius * (0.88 + strength_amount.abs().min(1.0) * 0.08);
            let start_radius = if field.container || strength_amount < 0.0 {
                outer
            } else {
                inner
            };
            let end_radius = if field.container || strength_amount < 0.0 {
                inner
            } else {
                outer
            };
            draw_line_segment_rgba(
                pixels,
                width,
                height,
                (
                    centre_x + angle.cos() * start_radius,
                    centre_y + angle.sin() * start_radius,
                ),
                (
                    centre_x + angle.cos() * end_radius,
                    centre_y + angle.sin() * end_radius,
                ),
                secondary_colour,
                (line_width * 0.75).max(0.5),
            );
        }
    }

    fill_disc_rgba(
        pixels,
        width,
        height,
        (centre_x, centre_y),
        (line_width * 1.5).max(2.0),
        secondary_colour,
        255,
    );
}

fn draw_circle_outline_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre: (f32, f32),
    radius: f32,
    colour: [u8; 3],
    line_width: f32,
) {
    if radius <= 0.0 || line_width <= 0.0 {
        return;
    }
    let segments = ((radius * 0.75).round() as u32).clamp(24, 192);
    let mut previous = point_on_circle(centre.0, centre.1, radius, 0.0);
    for segment_index in 1..=segments {
        let angle = std::f32::consts::TAU * segment_index as f32 / segments as f32;
        let next = point_on_circle(centre.0, centre.1, radius, angle);
        draw_line_segment_rgba(pixels, width, height, previous, next, colour, line_width);
        previous = next;
    }
}
