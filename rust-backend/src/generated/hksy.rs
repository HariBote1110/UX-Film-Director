use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

use super::*;

pub(crate) fn build_generated_hksy_checker_grid_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedHksyCheckerGrid media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let checker_grid: HksyCheckerGridObjectFields = serde_json::from_str(&media.source)
        .map_err(|error| {
            format!(
                "Invalid GeneratedHksyCheckerGrid media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_hksy_checker_grid_source(&checker_grid).map_err(|message| {
        format!(
            "Invalid GeneratedHksyCheckerGrid media '{}': {message}",
            media.id
        )
    })?;
    let cell_size = checker_grid.cell_size.round().max(1.0) as u32;
    let line_width_u32 = checker_grid.line_width.round().max(0.0) as u32;
    let separate_interval = checker_grid
        .separate_interval
        .map(|value| value.round().max(1.0) as u32)
        .unwrap_or(5);
    let separate_line_width = checker_grid
        .separate_line_width
        .map(|value| value.round().max(0.0) as u32)
        .unwrap_or(3);
    let foreground =
        parse_hex_colour_source(&checker_grid.foreground_colour).map_err(|message| {
            format!(
                "Invalid GeneratedHksyCheckerGrid media '{}': foreground_colour {message}",
                media.id
            )
        })?;
    let secondary = parse_hex_colour_source(&checker_grid.secondary_colour).map_err(|message| {
        format!(
            "Invalid GeneratedHksyCheckerGrid media '{}': secondary_colour {message}",
            media.id
        )
    })?;
    let background =
        parse_hex_colour_source(&checker_grid.background_colour).map_err(|message| {
            format!(
                "Invalid GeneratedHksyCheckerGrid media '{}': background_colour {message}",
                media.id
            )
        })?;
    let palette_colours = checker_grid
        .palette_colours
        .as_ref()
        .map(|colours| {
            colours
                .iter()
                .map(|colour| parse_hex_colour_source(colour))
                .collect::<Result<Vec<[u8; 3]>, String>>()
        })
        .transpose()
        .map_err(|message| {
            format!(
                "Invalid GeneratedHksyCheckerGrid media '{}': palette_colours {message}",
                media.id
            )
        })?
        .unwrap_or_default();

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedHksyCheckerGrid media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedHksyCheckerGrid media byte length overflows".to_string())?;
    let mut pixels = vec![0; byte_len];

    if checker_grid.pattern.as_deref() == Some("diamond") {
        draw_hksy_diamond_pattern_rgba(
            &mut pixels,
            media.width,
            media.height,
            foreground,
            line_width_u32 as f32,
        );
        return RgbaFrame::from_rgba8(media.width, media.height, pixels).map_err(|error| {
            format!("GeneratedHksyCheckerGrid media frame is invalid: {error:?}")
        });
    }
    if checker_grid.pattern.as_deref() == Some("measured-grid") {
        draw_hksy_measured_grid_pattern_rgba(
            &mut pixels,
            media.width,
            media.height,
            HksyMeasuredGridStyle {
                background,
                line_colour: secondary,
                separate_colour: foreground,
                cell_size,
                line_width: line_width_u32,
                separate_interval,
                separate_line_width,
            },
        );
        return RgbaFrame::from_rgba8(media.width, media.height, pixels).map_err(|error| {
            format!("GeneratedHksyCheckerGrid media frame is invalid: {error:?}")
        });
    }
    if checker_grid.pattern.as_deref() == Some("anchor-line") {
        let anchor_points = checker_grid.anchor_points.as_deref().unwrap_or(&[]);
        draw_hksy_anchor_line_pattern_rgba(
            &mut pixels,
            media.width,
            media.height,
            anchor_points,
            foreground,
            line_width_u32 as f32,
            checker_grid.round_caps.unwrap_or(true),
        );
        return RgbaFrame::from_rgba8(media.width, media.height, pixels).map_err(|error| {
            format!("GeneratedHksyCheckerGrid media frame is invalid: {error:?}")
        });
    }

    for y in 0..media.height {
        for x in 0..media.width {
            let colour = if checker_grid.checker_enabled {
                let tile_x = x / cell_size;
                let tile_y = y / cell_size;
                if !palette_colours.is_empty() {
                    let palette_index = ((tile_x + tile_y) as usize) % palette_colours.len();
                    palette_colours[palette_index]
                } else if (tile_x + tile_y) % 2 == 0 {
                    foreground
                } else {
                    background
                }
            } else {
                background
            };
            let offset = (y as usize * media.width as usize + x as usize) * 4;
            pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
        }
    }

    if checker_grid.grid_enabled && line_width_u32 > 0 {
        let line_width = line_width_u32 as f32;
        let mut x = 0;
        while x < media.width {
            draw_line_segment_rgba(
                &mut pixels,
                media.width,
                media.height,
                (x as f32, 0.0),
                (x as f32, media.height.saturating_sub(1) as f32),
                secondary,
                line_width,
            );
            x = x.saturating_add(cell_size);
        }
        let mut y = 0;
        while y < media.height {
            draw_line_segment_rgba(
                &mut pixels,
                media.width,
                media.height,
                (0.0, y as f32),
                (media.width.saturating_sub(1) as f32, y as f32),
                secondary,
                line_width,
            );
            y = y.saturating_add(cell_size);
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedHksyCheckerGrid media frame is invalid: {error:?}"))
}

fn draw_hksy_diamond_pattern_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    colour: [u8; 3],
    line_width: f32,
) {
    if width == 0 || height == 0 || line_width <= 0.0 {
        return;
    }

    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let half_width = centre_x;
    let half_height = centre_y;
    let longest_side = width.max(height) as f32;
    let inner_x = (half_width - (width as f32 / longest_side) * line_width).max(0.0);
    let inner_y = (half_height - (height as f32 / longest_side) * line_width).max(0.0);
    let left = 0.0;
    let right = width.saturating_sub(1) as f32;
    let top = 0.0;
    let bottom = height.saturating_sub(1) as f32;

    let polygons = [
        [
            (centre_x, top),
            (left, centre_y),
            (centre_x - inner_x, centre_y),
            (centre_x, centre_y - inner_y),
        ],
        [
            (centre_x, top),
            (right, centre_y),
            (centre_x + inner_x, centre_y),
            (centre_x, centre_y - inner_y),
        ],
        [
            (centre_x, bottom),
            (left, centre_y),
            (centre_x - inner_x, centre_y),
            (centre_x, centre_y + inner_y),
        ],
        [
            (centre_x, bottom),
            (right, centre_y),
            (centre_x + inner_x, centre_y),
            (centre_x, centre_y + inner_y),
        ],
    ];

    for polygon in polygons {
        let fan_centre = (
            polygon.iter().map(|point| point.0).sum::<f32>() / polygon.len() as f32,
            polygon.iter().map(|point| point.1).sum::<f32>() / polygon.len() as f32,
        );
        fill_polygon_fan_rgba(pixels, width, height, &polygon, fan_centre, colour, 255);
    }
}

struct HksyMeasuredGridStyle {
    background: [u8; 3],
    line_colour: [u8; 3],
    separate_colour: [u8; 3],
    cell_size: u32,
    line_width: u32,
    separate_interval: u32,
    separate_line_width: u32,
}

fn draw_hksy_measured_grid_pattern_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    style: HksyMeasuredGridStyle,
) {
    for y in 0..height {
        for x in 0..width {
            let offset = (y as usize * width as usize + x as usize) * 4;
            pixels[offset..offset + 4].copy_from_slice(&[
                style.background[0],
                style.background[1],
                style.background[2],
                255,
            ]);
        }
    }
    if style.cell_size == 0 {
        return;
    }

    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let max_distance = centre_x.max(centre_y);

    let mut index = 0_u32;
    let mut position = 0.0_f32;
    while position <= max_distance + style.cell_size as f32 {
        let is_separate = style.separate_interval > 0 && index % style.separate_interval == 0;
        let line_width = if is_separate {
            style.separate_line_width
        } else {
            style.line_width
        };
        if line_width > 0 {
            let colour = if is_separate {
                style.separate_colour
            } else {
                style.line_colour
            };
            for sign in [-1.0_f32, 1.0_f32] {
                let x = centre_x + position * sign;
                let y = centre_y + position * sign;
                if x >= 0.0 && x <= width.saturating_sub(1) as f32 {
                    draw_line_segment_rgba(
                        pixels,
                        width,
                        height,
                        (x, 0.0),
                        (x, height.saturating_sub(1) as f32),
                        colour,
                        line_width as f32,
                    );
                }
                if y >= 0.0 && y <= height.saturating_sub(1) as f32 {
                    draw_line_segment_rgba(
                        pixels,
                        width,
                        height,
                        (0.0, y),
                        (width.saturating_sub(1) as f32, y),
                        colour,
                        line_width as f32,
                    );
                }
            }
        }
        index = index.saturating_add(1);
        position += style.cell_size as f32;
    }
}

fn draw_hksy_anchor_line_pattern_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    anchor_points: &[HksyAnchorPoint],
    colour: [u8; 3],
    line_width: f32,
    round_caps: bool,
) {
    if width == 0 || height == 0 || anchor_points.len() < 2 || line_width <= 0.0 {
        return;
    }

    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let points = anchor_points
        .iter()
        .map(|point| (centre_x + point.x, centre_y + point.y))
        .collect::<Vec<_>>();

    for pair in points.windows(2) {
        draw_line_segment_rgba(pixels, width, height, pair[0], pair[1], colour, line_width);
    }

    if round_caps {
        let radius = (line_width * 0.5).max(0.5);
        for point in points {
            fill_disc_rgba(pixels, width, height, point, radius, colour, 255);
        }
    }
}
