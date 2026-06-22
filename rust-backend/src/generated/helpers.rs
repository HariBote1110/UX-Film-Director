use super::GeneratedGradientSource;

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

pub(crate) fn point_on_circle(centre_x: f32, centre_y: f32, radius: f32, angle: f32) -> (f32, f32) {
    (
        centre_x + angle.cos() * radius,
        centre_y + angle.sin() * radius,
    )
}

pub(super) fn circular_arrow_angle_in_span(angle: f32, start_angle: f32, span: f32) -> bool {
    let phase = (angle - start_angle).rem_euclid(std::f32::consts::TAU);
    phase <= span
}

pub(super) fn circular_arrow_head(
    tip: (f32, f32),
    tangent_angle: f32,
    head_size: f32,
) -> [(f32, f32); 3] {
    let length = head_size.max(0.0);
    let width = length * 0.75;
    let base_centre = (
        tip.0 - tangent_angle.cos() * length,
        tip.1 - tangent_angle.sin() * length,
    );
    let normal = (-tangent_angle.sin(), tangent_angle.cos());
    [
        tip,
        (
            base_centre.0 + normal.0 * width * 0.5,
            base_centre.1 + normal.1 * width * 0.5,
        ),
        (
            base_centre.0 - normal.0 * width * 0.5,
            base_centre.1 - normal.1 * width * 0.5,
        ),
    ]
}

pub(crate) fn point_in_triangle(x: f32, y: f32, triangle: [(f32, f32); 3]) -> bool {
    let area = triangle_edge(triangle[0], triangle[1], (x, y));
    let b = triangle_edge(triangle[1], triangle[2], (x, y));
    let c = triangle_edge(triangle[2], triangle[0], (x, y));
    (area >= 0.0 && b >= 0.0 && c >= 0.0) || (area <= 0.0 && b <= 0.0 && c <= 0.0)
}

fn triangle_edge(a: (f32, f32), b: (f32, f32), p: (f32, f32)) -> f32 {
    (p.0 - a.0) * (b.1 - a.1) - (p.1 - a.1) * (b.0 - a.0)
}

pub(super) fn distance_to_point(x: f32, y: f32, point_x: f32, point_y: f32) -> f32 {
    ((x - point_x).powi(2) + (y - point_y).powi(2)).sqrt()
}

pub(crate) fn distance_to_segment(x: f32, y: f32, start: (f32, f32), end: (f32, f32)) -> f32 {
    let dx = end.0 - start.0;
    let dy = end.1 - start.1;
    let length_squared = dx * dx + dy * dy;
    if length_squared <= f32::EPSILON {
        return distance_to_point(x, y, start.0, start.1);
    }
    let t = (((x - start.0) * dx + (y - start.1) * dy) / length_squared).clamp(0.0, 1.0);
    let closest_x = start.0 + t * dx;
    let closest_y = start.1 + t * dy;
    distance_to_point(x, y, closest_x, closest_y)
}

pub(crate) fn draw_line_segment_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    start: (f32, f32),
    end: (f32, f32),
    colour: [u8; 3],
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
                pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
            }
        }
    }
}

pub(crate) fn fill_disc_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre: (f32, f32),
    radius: f32,
    colour: [u8; 3],
    alpha: u8,
) {
    if width == 0 || height == 0 || radius <= 0.0 {
        return;
    }
    let min_x = (centre.0 - radius).floor().max(0.0) as u32;
    let max_x = (centre.0 + radius)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = (centre.1 - radius).floor().max(0.0) as u32;
    let max_y = (centre.1 + radius)
        .ceil()
        .min(height.saturating_sub(1) as f32) as u32;
    let radius_squared = radius * radius;

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let dx = x as f32 + 0.5 - centre.0;
            let dy = y as f32 + 0.5 - centre.1;
            if dx * dx + dy * dy <= radius_squared {
                let offset = (y as usize * width as usize + x as usize) * 4;
                pixels[offset..offset + 4]
                    .copy_from_slice(&[colour[0], colour[1], colour[2], alpha]);
            }
        }
    }
}

pub(crate) fn draw_filled_circle_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius: f32,
    colour: [u8; 3],
    alpha: u8,
) {
    let min_x = (centre_x - radius).floor().max(0.0) as u32;
    let max_x = (centre_x + radius)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = (centre_y - radius).floor().max(0.0) as u32;
    let max_y = (centre_y + radius)
        .ceil()
        .min(height.saturating_sub(1) as f32) as u32;
    let radius_sq = radius * radius;
    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let dx = x as f32 + 0.5 - centre_x;
            let dy = y as f32 + 0.5 - centre_y;
            if dx * dx + dy * dy <= radius_sq {
                let offset = (y as usize * width as usize + x as usize) * 4;
                pixels[offset..offset + 4]
                    .copy_from_slice(&[colour[0], colour[1], colour[2], alpha]);
            }
        }
    }
}

pub(crate) fn fill_polygon_fan_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    points: &[(f32, f32)],
    centre: (f32, f32),
    colour: [u8; 3],
    alpha: u8,
) {
    if points.len() < 3 {
        return;
    }
    for index in 0..points.len() {
        fill_triangle_rgba(
            pixels,
            width,
            height,
            [centre, points[index], points[(index + 1) % points.len()]],
            colour,
            alpha,
        );
    }
}

fn fill_triangle_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    triangle: [(f32, f32); 3],
    colour: [u8; 3],
    alpha: u8,
) {
    let min_x = triangle
        .iter()
        .map(|point| point.0)
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0) as u32;
    let max_x = triangle
        .iter()
        .map(|point| point.0)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = triangle
        .iter()
        .map(|point| point.1)
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0) as u32;
    let max_y = triangle
        .iter()
        .map(|point| point.1)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(height.saturating_sub(1) as f32) as u32;
    for y in min_y..=max_y {
        for x in min_x..=max_x {
            if point_in_triangle(x as f32 + 0.5, y as f32 + 0.5, triangle) {
                let offset = (y as usize * width as usize + x as usize) * 4;
                pixels[offset..offset + 4]
                    .copy_from_slice(&[colour[0], colour[1], colour[2], alpha]);
            }
        }
    }
}

pub(super) fn normalise_gradient_stops(
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

pub(super) fn gradient_position(
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

pub(super) fn sample_gradient_colour(stops: &[(f32, [u8; 3])], t: f32) -> [u8; 3] {
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

pub(super) fn barcode_bar_pattern(data: &str) -> Vec<u8> {
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

pub(super) fn trapezoid_tooth_factor(phase: f32) -> f32 {
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

pub(super) fn puzzle_piece_connectors(shape_variant: u32) -> [(u8, bool); 4] {
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

pub(crate) fn mix_rgb_u8(left: [u8; 3], right: [u8; 3], amount: f32) -> [u8; 3] {
    let amount = amount.clamp(0.0, 1.0);
    [
        (left[0] as f32 * (1.0 - amount) + right[0] as f32 * amount).round() as u8,
        (left[1] as f32 * (1.0 - amount) + right[1] as f32 * amount).round() as u8,
        (left[2] as f32 * (1.0 - amount) + right[2] as f32 * amount).round() as u8,
    ]
}

pub(crate) fn scale_rgb_u8(colour: [u8; 3], amount: f32) -> [u8; 3] {
    [
        (colour[0] as f32 * amount).round().clamp(0.0, 255.0) as u8,
        (colour[1] as f32 * amount).round().clamp(0.0, 255.0) as u8,
        (colour[2] as f32 * amount).round().clamp(0.0, 255.0) as u8,
    ]
}

pub(crate) fn deterministic_signed_noise(seed: i64, index: i64) -> f32 {
    let mut value = (seed as u64)
        .wrapping_mul(6364136223846793005)
        .wrapping_add(index as u64)
        .wrapping_add(1442695040888963407);
    value ^= value >> 33;
    value = value.wrapping_mul(0xff51afd7ed558ccd);
    value ^= value >> 33;
    let unit = (value & 0xffff) as f32 / 65535.0;
    unit * 2.0 - 1.0
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

pub(super) fn point_inside_gourd(
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
