use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

use super::*;

pub(crate) fn build_generated_hologram_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedHologram media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let hologram: GeneratedHologramSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedHologram media '{}': {error}", media.id))?;
    validate_generated_hologram_source(&hologram)
        .map_err(|message| format!("Invalid GeneratedHologram media '{}': {message}", media.id))?;
    let tint = parse_hex_colour_source(&hologram.tint_colour)
        .map_err(|message| format!("Invalid GeneratedHologram media '{}': {message}", media.id))?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedHologram media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedHologram media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let tile = hologram.tile_size as f32;
    let rotation = hologram.rotation_degrees.to_radians();
    let gradient_angle = hologram.gradient_angle_degrees.to_radians();
    let cos_r = rotation.cos();
    let sin_r = rotation.sin();
    let cos_g = gradient_angle.cos();
    let sin_g = gradient_angle.sin();
    let centre_x = media.width as f32 * 0.5;
    let centre_y = media.height as f32 * 0.5;

    for y in 0..media.height {
        for x in 0..media.width {
            let px = x as f32 + 0.5 - centre_x;
            let py = y as f32 + 0.5 - centre_y;
            let rx = px * cos_r - py * sin_r;
            let ry = px * sin_r + py * cos_r;
            let band = ((rx + ry * 0.65).rem_euclid(tile)) / tile;
            let stripe_phase = (rx.rem_euclid(tile) / tile - 0.5).abs();
            let mut colour = hologram_colour_for_band(band, stripe_phase, tint);

            if hologram.colour_mode == 1 {
                colour = blend_rgb8(colour, tint, 0.18);
            } else if hologram.colour_mode == 2 {
                let gradient_position =
                    ((px * cos_g + py * sin_g) / (media.width.max(media.height) as f32) + 0.5)
                        .rem_euclid(1.0);
                colour = blend_rgb8(
                    colour,
                    hsv_to_rgb8(gradient_position * 360.0, 0.72, 1.0),
                    0.46,
                );
            }

            let offset = (y as usize * media.width as usize + x as usize) * 4;
            pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedHologram media frame is invalid: {error:?}"))
}

fn hologram_colour_for_band(band: f32, stripe_phase: f32, tint: [u8; 3]) -> [u8; 3] {
    let base = [118, 122, 130];
    let cool = [122, 210, 255];
    let warm = [255, 118, 172];
    let white = [242, 248, 255];
    let shadow = [20, 22, 28];
    let dark = [48, 52, 62];

    let colour = if band < 0.10 {
        shadow
    } else if band < 0.18 {
        cool
    } else if band < 0.30 {
        white
    } else if band < 0.43 {
        blend_rgb8(base, tint, 0.18)
    } else if band < 0.52 {
        dark
    } else if band < 0.66 {
        warm
    } else if band < 0.78 {
        blend_rgb8(base, cool, 0.35)
    } else {
        blend_rgb8(base, white, 0.30)
    };

    if stripe_phase < 0.045 {
        blend_rgb8(colour, [255, 255, 255], 0.55)
    } else if stripe_phase > 0.455 {
        blend_rgb8(colour, [0, 0, 0], 0.35)
    } else {
        colour
    }
}
