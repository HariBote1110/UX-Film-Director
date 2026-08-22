use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

use super::*;

pub(crate) fn build_generated_shattered_sphere_source_frame(
    media: &SceneMediaReference,
    source_frame: u64,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedShatteredSphere media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let sphere: GeneratedShatteredSphereSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedShatteredSphere media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_shattered_sphere_source(&sphere).map_err(|message| {
        format!(
            "Invalid GeneratedShatteredSphere media '{}': {message}",
            media.id
        )
    })?;
    let colour = parse_hex_colour_source(&sphere.colour).map_err(|message| {
        format!(
            "Invalid GeneratedShatteredSphere media '{}': {message}",
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
        .ok_or_else(|| "GeneratedShatteredSphere media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedShatteredSphere media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    draw_shattered_sphere(
        &mut pixels,
        media.width,
        media.height,
        &sphere,
        source_frame,
        colour,
    );

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedShatteredSphere media frame is invalid: {error:?}"))
}

fn draw_shattered_sphere(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    sphere: &GeneratedShatteredSphereSource,
    source_frame: u64,
    colour: [u8; 3],
) {
    let centre = (width as f32 * 0.5, height as f32 * 0.5);
    let radius = sphere.radius.min(width.min(height) as f32 * 0.48).max(1.0);
    let fragment_size = sphere.fragment_size.max(1.0);
    let columns = ((radius * 2.0) / fragment_size).ceil().clamp(2.0, 64.0) as u32;
    let rows = columns;
    let seed = sphere.seed as u64;
    let time = source_frame as f32 / 60.0;
    let effect_strength = (sphere.fracture_amount / 100.0).clamp(0.0, 50.0);

    for row in 0..rows {
        for column in 0..columns {
            let index = row * columns + column;
            let cell_x = (column as f32 + 0.5) / columns as f32 * 2.0 - 1.0;
            let cell_y = (row as f32 + 0.5) / rows as f32 * 2.0 - 1.0;
            let distance_sq = cell_x * cell_x + cell_y * cell_y;
            if distance_sq > 1.0 {
                continue;
            }

            let delay_seconds = deterministic_unit(seed, index, 41) * sphere.delay / 60.0;
            let local_time = (time - delay_seconds).max(0.0);
            let progress =
                (local_time * (0.55 + sphere.speed / 120.0) * effect_strength).clamp(0.0, 1.5);
            let z = (1.0 - distance_sq).sqrt();
            let base_x = centre.0 + cell_x * radius;
            let base_y = centre.1 + cell_y * radius;
            let diffusion = sphere.direction_diffusion / 100.0;
            let random_angle = deterministic_unit(seed, index, 11) * std::f32::consts::TAU;
            let random_distance = deterministic_unit(seed, index, 12) * diffusion;
            let direction_x = cell_x * 0.72 + random_angle.cos() * random_distance;
            let direction_y = cell_y * 0.72 + random_angle.sin() * random_distance;
            let outward = sphere.limit_distance + sphere.impact * 0.35 + sphere.speed * 0.25;
            let gravity_x = sphere.gravity_x * progress * progress * 0.035;
            let gravity_y = sphere.gravity_y * progress * progress * 0.035;
            let moved_x = base_x + direction_x * outward * progress + gravity_x;
            let moved_y =
                base_y + direction_y * outward * progress + gravity_y - z * sphere.thickness * 0.12;
            let scale = (1.0 + z * sphere.thickness / 160.0).max(0.2);
            let size = fragment_size
                * scale
                * (0.45 + deterministic_unit(seed, index, 13) * 0.35)
                * (1.0 - (progress * 0.18).min(0.55));
            let rotation = deterministic_unit(seed, index, 14) * std::f32::consts::TAU
                + source_frame as f32 * sphere.spin / 6000.0;
            let fragment_colour = shade_fragment(colour, z, progress);
            let alpha = (255.0 * (1.0 - (progress - 0.75).max(0.0) * 0.22))
                .round()
                .clamp(64.0, 255.0) as u8;
            let points = fragment_points(
                (moved_x, moved_y),
                size,
                rotation,
                sphere.random_shape,
                seed,
                index,
            );
            fill_polygon_fan_rgba(
                pixels,
                width,
                height,
                &points,
                (moved_x, moved_y),
                fragment_colour,
                alpha,
            );
        }
    }
}

fn fragment_points(
    centre: (f32, f32),
    size: f32,
    rotation: f32,
    random_shape: f32,
    seed: u64,
    index: u32,
) -> Vec<(f32, f32)> {
    let jitter = (random_shape / 100.0).clamp(0.0, 1.0);
    (0..4)
        .map(|corner| {
            let angle = rotation
                + std::f32::consts::FRAC_PI_4
                + corner as f32 * std::f32::consts::FRAC_PI_2;
            let radius = size
                * (0.55
                    + (deterministic_unit(seed, index, 51 + corner as u64) - 0.5) * jitter * 0.38);
            (
                centre.0 + angle.cos() * radius,
                centre.1 + angle.sin() * radius,
            )
        })
        .collect()
}

fn shade_fragment(colour: [u8; 3], z: f32, progress: f32) -> [u8; 3] {
    let light = (0.58 + z * 0.42 - progress * 0.12).clamp(0.28, 1.15);
    [
        (colour[0] as f32 * light).round().clamp(0.0, 255.0) as u8,
        (colour[1] as f32 * light).round().clamp(0.0, 255.0) as u8,
        (colour[2] as f32 * light).round().clamp(0.0, 255.0) as u8,
    ]
}
