use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

use super::*;

/// `ShapeObject.shapeType` のうち `rect` 以外を CPU ラスタライズする。
/// `rect` は既存の `SolidColour` / `GeneratedGradient` 経路のまま維持されるため、
/// ここでは非矩形（および角丸矩形）のみを扱う。
pub(crate) fn build_generated_shape_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedShape media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let shape: GeneratedShapeSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedShape media '{}': {error}", media.id))?;
    validate_generated_shape_source(&shape)
        .map_err(|message| format!("Invalid GeneratedShape media '{}': {message}", media.id))?;

    let fill_colour = parse_hex_colour_source(&shape.fill_colour)
        .map_err(|message| format!("Invalid GeneratedShape media '{}': {message}", media.id))?;
    let gradient_stops = shape
        .gradient
        .as_ref()
        .map(normalise_gradient_stops)
        .transpose()
        .map_err(|message| format!("Invalid GeneratedShape media '{}': {message}", media.id))?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedShape media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedShape media byte length overflows".to_string())?;
    let mut pixels = vec![0u8; byte_len];

    let width = media.width;
    let height = media.height;
    let colour_at = |x: f32, y: f32| -> [u8; 3] {
        match (&shape.gradient, &gradient_stops) {
            (Some(gradient), Some(stops)) => {
                let t = gradient_position(gradient, width, height, x, y);
                sample_gradient_colour(stops, t)
            }
            _ => fill_colour,
        }
    };

    match shape.shape_type.as_str() {
        "circle" => draw_shape_ellipse_rgba(&mut pixels, width, height, colour_at, true),
        "ellipse" => draw_shape_ellipse_rgba(&mut pixels, width, height, colour_at, false),
        "rounded_rect" => {
            draw_shape_rounded_rect_rgba(&mut pixels, width, height, shape.corner_radius, colour_at)
        }
        "triangle" => draw_shape_polygon_rgba(
            &mut pixels,
            width,
            height,
            &shape_polygon_points(width, height, 3, -std::f32::consts::FRAC_PI_2, 1.0),
            colour_at,
        ),
        "pentagon" => draw_shape_polygon_rgba(
            &mut pixels,
            width,
            height,
            &shape_polygon_points(width, height, 5, -std::f32::consts::FRAC_PI_2, 1.0),
            colour_at,
        ),
        "diamond" => draw_shape_polygon_rgba(
            &mut pixels,
            width,
            height,
            &shape_polygon_points(width, height, 4, -std::f32::consts::FRAC_PI_2, 1.0),
            colour_at,
        ),
        "star" => draw_shape_polygon_rgba(
            &mut pixels,
            width,
            height,
            &shape_star_points(width, height, 5, 0.45),
            colour_at,
        ),
        "cross" => draw_shape_polygon_rgba(
            &mut pixels,
            width,
            height,
            &shape_cross_points(width, height, 0.32),
            colour_at,
        ),
        "arrow" => draw_shape_polygon_rgba(
            &mut pixels,
            width,
            height,
            &shape_arrow_points(width, height),
            colour_at,
        ),
        "heart" => draw_shape_heart_rgba(&mut pixels, width, height, colour_at),
        other => {
            return Err(format!(
                "Invalid GeneratedShape media '{}': unsupported shape_type '{other}'",
                media.id
            ))
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedShape media frame is invalid: {error:?}"))
}

fn write_shape_pixel(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    colour: [u8; 3],
) {
    if x < 0 || y < 0 || x >= width as i32 || y >= height as i32 {
        return;
    }
    let offset = ((y as u32 * width + x as u32) * 4) as usize;
    pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
}

fn draw_shape_ellipse_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    colour_at: impl Fn(f32, f32) -> [u8; 3],
    force_circle: bool,
) {
    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let (radius_x, radius_y) = if force_circle {
        let radius = centre_x.min(centre_y).max(0.5);
        (radius, radius)
    } else {
        (centre_x.max(0.5), centre_y.max(0.5))
    };

    for y in 0..height {
        for x in 0..width {
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;
            let normalised_x = (px - centre_x) / radius_x;
            let normalised_y = (py - centre_y) / radius_y;
            if normalised_x * normalised_x + normalised_y * normalised_y <= 1.0 {
                write_shape_pixel(pixels, width, height, x as i32, y as i32, colour_at(px, py));
            }
        }
    }
}

fn draw_shape_rounded_rect_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    corner_radius: f32,
    colour_at: impl Fn(f32, f32) -> [u8; 3],
) {
    let radius = corner_radius
        .max(0.0)
        .min((width.min(height) as f32) * 0.5);
    for y in 0..height {
        for x in 0..width {
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;
            if point_in_rounded_rect(px, py, width as f32, height as f32, radius) {
                write_shape_pixel(pixels, width, height, x as i32, y as i32, colour_at(px, py));
            }
        }
    }
}

fn point_in_rounded_rect(x: f32, y: f32, width: f32, height: f32, radius: f32) -> bool {
    if x < 0.0 || y < 0.0 || x >= width || y >= height {
        return false;
    }
    if radius <= 0.0 {
        return true;
    }
    let nearest_x = x.clamp(radius, width - radius);
    let nearest_y = y.clamp(radius, height - radius);
    let dx = x - nearest_x;
    let dy = y - nearest_y;
    dx * dx + dy * dy <= radius * radius
}

/// 中心を基準とした正多角形の頂点を計算する。`start_angle` は最初の頂点の角度、
/// `radius_scale` は矩形に内接する円の半径に対する倍率。
fn shape_polygon_points(
    width: u32,
    height: u32,
    vertex_count: u32,
    start_angle: f32,
    radius_scale: f32,
) -> Vec<(f32, f32)> {
    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let radius = centre_x.min(centre_y) * radius_scale;
    (0..vertex_count)
        .map(|index| {
            let angle = start_angle + (index as f32 / vertex_count as f32) * std::f32::consts::TAU;
            (
                centre_x + angle.cos() * radius,
                centre_y + angle.sin() * radius,
            )
        })
        .collect()
}

fn shape_star_points(width: u32, height: u32, point_count: u32, inner_ratio: f32) -> Vec<(f32, f32)> {
    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let outer_radius = centre_x.min(centre_y);
    let inner_radius = outer_radius * inner_ratio;
    let total_vertices = point_count * 2;
    (0..total_vertices)
        .map(|index| {
            let angle = -std::f32::consts::FRAC_PI_2
                + (index as f32 / total_vertices as f32) * std::f32::consts::TAU;
            let radius = if index % 2 == 0 { outer_radius } else { inner_radius };
            (
                centre_x + angle.cos() * radius,
                centre_y + angle.sin() * radius,
            )
        })
        .collect()
}

fn shape_cross_points(width: u32, height: u32, arm_ratio: f32) -> Vec<(f32, f32)> {
    let w = width as f32;
    let h = height as f32;
    let arm_w = w * arm_ratio;
    let arm_h = h * arm_ratio;
    let left = (w - arm_w) * 0.5;
    let right = left + arm_w;
    let top = (h - arm_h) * 0.5;
    let bottom = top + arm_h;
    vec![
        (left, 0.0),
        (right, 0.0),
        (right, top),
        (w, top),
        (w, bottom),
        (right, bottom),
        (right, h),
        (left, h),
        (left, bottom),
        (0.0, bottom),
        (0.0, top),
        (left, top),
    ]
}

fn shape_arrow_points(width: u32, height: u32) -> Vec<(f32, f32)> {
    let w = width as f32;
    let h = height as f32;
    let shaft_top = h * 0.35;
    let shaft_bottom = h * 0.65;
    let head_start = w * 0.55;
    vec![
        (0.0, shaft_top),
        (head_start, shaft_top),
        (head_start, 0.0),
        (w, h * 0.5),
        (head_start, h),
        (head_start, shaft_bottom),
        (0.0, shaft_bottom),
    ]
}

/// 任意個数の凸/凹頂点で構成される多角形を、中心からの扇状三角形分割で塗りつぶす。
/// 凹多角形（星・十字）にも対応するため、扇状分割後に point-in-polygon で再検証する。
fn draw_shape_polygon_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    points: &[(f32, f32)],
    colour_at: impl Fn(f32, f32) -> [u8; 3],
) {
    if points.len() < 3 {
        return;
    }
    let min_x = points.iter().map(|p| p.0).fold(f32::INFINITY, f32::min).floor().max(0.0) as u32;
    let max_x = points
        .iter()
        .map(|p| p.0)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = points.iter().map(|p| p.1).fold(f32::INFINITY, f32::min).floor().max(0.0) as u32;
    let max_y = points
        .iter()
        .map(|p| p.1)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(height.saturating_sub(1) as f32) as u32;

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;
            if point_in_general_polygon(px, py, points) {
                write_shape_pixel(pixels, width, height, x as i32, y as i32, colour_at(px, py));
            }
        }
    }
}

/// 任意の単純多角形（凸・凹の両方）に対応する point-in-polygon 判定
/// （crossing number アルゴリズム）。
fn point_in_general_polygon(x: f32, y: f32, points: &[(f32, f32)]) -> bool {
    let mut inside = false;
    let count = points.len();
    let mut previous = points[count - 1];
    for &current in points {
        let (x1, y1) = previous;
        let (x2, y2) = current;
        if (y1 > y) != (y2 > y) {
            let intersect_x = x1 + (y - y1) / (y2 - y1) * (x2 - x1);
            if x < intersect_x {
                inside = !inside;
            }
        }
        previous = current;
    }
    inside
}

fn draw_shape_heart_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    colour_at: impl Fn(f32, f32) -> [u8; 3],
) {
    for y in 0..height {
        for x in 0..width {
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;
            if point_in_heart(px, py, width as f32, height as f32) {
                write_shape_pixel(pixels, width, height, x as i32, y as i32, colour_at(px, py));
            }
        }
    }
}

/// 正規化座標（-1..1 幅、-1.2..1 高さ程度）上のハート型陰関数
/// `(x^2 + y^2 - 1)^3 - x^2 * y^3 <= 0` を画像座標系にマップして判定する。
fn point_in_heart(x: f32, y: f32, width: f32, height: f32) -> bool {
    let nx = (x / width) * 2.4 - 1.2;
    // 画像は下方向が +y のため、ハートの尖りを下に向けるよう反転する。
    let ny = -((y / height) * 2.4 - 1.3);
    let a = nx * nx + ny * ny - 1.0;
    a * a * a - nx * nx * ny * ny * ny <= 0.0
}
