use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

use super::*;

pub(crate) fn build_generated_region_frame_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedRegionFrame media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let region_frame: GeneratedRegionFrameSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedRegionFrame media '{}': {error}", media.id))?;
    validate_generated_region_frame_source(&region_frame).map_err(|message| {
        format!(
            "Invalid GeneratedRegionFrame media '{}': {message}",
            media.id
        )
    })?;
    let frame_colour = parse_hex_colour_source(&region_frame.frame_colour).map_err(|message| {
        format!(
            "Invalid GeneratedRegionFrame media '{}': frame_colour {message}",
            media.id
        )
    })?;
    let background_colour =
        parse_hex_colour_source(&region_frame.background_colour).map_err(|message| {
            format!(
                "Invalid GeneratedRegionFrame media '{}': background_colour {message}",
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
        .ok_or_else(|| "GeneratedRegionFrame media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedRegionFrame media byte length overflows".to_string())?;
    let alpha = (region_frame.background_opacity * 255.0)
        .round()
        .clamp(0.0, 255.0) as u8;
    let mut pixels = vec![0; byte_len];
    let background = [
        background_colour[0],
        background_colour[1],
        background_colour[2],
        alpha,
    ];
    let border = [frame_colour[0], frame_colour[1], frame_colour[2], 255];
    let line_width = region_frame.line_width.ceil().max(0.0);
    match region_frame.shape.as_str() {
        "ellipse" => draw_region_frame_ellipse_rgba(
            &mut pixels,
            media.width,
            media.height,
            line_width,
            background,
            border,
        ),
        "cut_corner" => draw_region_frame_cut_corner_rgba(
            &mut pixels,
            media.width,
            media.height,
            line_width,
            region_frame.corner_cut,
            background,
            border,
        ),
        _ => draw_region_frame_rectangle_rgba(
            &mut pixels,
            media.width,
            media.height,
            line_width,
            background,
            border,
        ),
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedRegionFrame media frame is invalid: {error:?}"))
}

fn draw_region_frame_rectangle_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    line_width: f32,
    background: [u8; 4],
    border: [u8; 4],
) {
    fill_rect_rgba(
        pixels,
        width,
        height,
        0,
        0,
        width as i32,
        height as i32,
        background,
    );
    let line_width = line_width as i32;
    if line_width <= 0 {
        return;
    }
    let right = width as i32;
    let bottom = height as i32;
    fill_rect_rgba(pixels, width, height, 0, 0, right, line_width, border);
    fill_rect_rgba(
        pixels,
        width,
        height,
        0,
        bottom.saturating_sub(line_width),
        right,
        bottom,
        border,
    );
    fill_rect_rgba(pixels, width, height, 0, 0, line_width, bottom, border);
    fill_rect_rgba(
        pixels,
        width,
        height,
        right.saturating_sub(line_width),
        0,
        right,
        bottom,
        border,
    );
}

fn draw_region_frame_ellipse_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    line_width: f32,
    background: [u8; 4],
    border: [u8; 4],
) {
    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let radius_x = centre_x.max(0.5);
    let radius_y = centre_y.max(0.5);
    let inner_radius_x = (radius_x - line_width).max(0.0);
    let inner_radius_y = (radius_y - line_width).max(0.0);

    for y in 0..height {
        for x in 0..width {
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;
            if !point_in_ellipse(px, py, centre_x, centre_y, radius_x, radius_y) {
                continue;
            }
            let colour = if inner_radius_x > 0.0
                && inner_radius_y > 0.0
                && point_in_ellipse(px, py, centre_x, centre_y, inner_radius_x, inner_radius_y)
            {
                background
            } else {
                border
            };
            write_particle_pixel(pixels, width, height, x as i32, y as i32, colour);
        }
    }
}

fn point_in_ellipse(
    x: f32,
    y: f32,
    centre_x: f32,
    centre_y: f32,
    radius_x: f32,
    radius_y: f32,
) -> bool {
    let normalised_x = (x - centre_x) / radius_x.max(0.5);
    let normalised_y = (y - centre_y) / radius_y.max(0.5);
    normalised_x * normalised_x + normalised_y * normalised_y <= 1.0
}

fn draw_region_frame_cut_corner_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    line_width: f32,
    corner_cut: f32,
    background: [u8; 4],
    border: [u8; 4],
) {
    let corner_cut = corner_cut.max(0.0).min((width.min(height) as f32) * 0.5);
    for y in 0..height {
        for x in 0..width {
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;
            if !point_in_cut_corner_region(px, py, width, height, corner_cut, 0.0) {
                continue;
            }
            let colour = if line_width > 0.0
                && point_in_cut_corner_region(px, py, width, height, corner_cut, line_width)
            {
                background
            } else if line_width > 0.0 {
                border
            } else {
                background
            };
            write_particle_pixel(pixels, width, height, x as i32, y as i32, colour);
        }
    }
}

fn point_in_cut_corner_region(
    x: f32,
    y: f32,
    width: u32,
    height: u32,
    corner_cut: f32,
    inset: f32,
) -> bool {
    let left = inset;
    let top = inset;
    let right = width as f32 - inset;
    let bottom = height as f32 - inset;
    if x < left || x >= right || y < top || y >= bottom {
        return false;
    }
    let corner_cut = (corner_cut - inset)
        .max(0.0)
        .min(((right - left).min(bottom - top)) * 0.5);
    if corner_cut <= 0.0 {
        return true;
    }
    if x < left + corner_cut && y < top + corner_cut && (x - left) + (y - top) < corner_cut {
        return false;
    }
    if x >= right - corner_cut && y < top + corner_cut && (right - x) + (y - top) < corner_cut {
        return false;
    }
    if x < left + corner_cut && y >= bottom - corner_cut && (x - left) + (bottom - y) < corner_cut {
        return false;
    }
    if x >= right - corner_cut
        && y >= bottom - corner_cut
        && (right - x) + (bottom - y) < corner_cut
    {
        return false;
    }
    true
}
