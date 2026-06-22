mod cpu_simple_video;
pub(crate) mod decode;
mod encode;
mod frames;
mod generated;
mod media;
mod native_render;
mod native_shared;
mod params;
mod proxy;
mod psd_fast;
mod rpc;
mod sessions;
mod state;
mod transcode;

use decode::{
    handle_decode_release_frame, handle_decode_request_frame, handle_decode_start,
    handle_decode_stop,
};
use encode::{
    handle_encode_abort, handle_encode_finish, handle_encode_start, handle_encode_write_frame,
};
use generated::*;
use media::{
    handle_audio_waveform_samples, handle_media_probe, handle_psd_await_blob, handle_psd_parse,
};
use native_render::{handle_encode_write_native_frame, handle_native_render_shared_frame};
use native_shared::{handle_release_native_render_shared_frame, read_native_render_source_frame};
use params::*;
use proxy::handle_proxy_generate;
use rpc::{HealthResult, RpcError, RpcRequest, RpcResponse};
use serde_json::Value;
use state::BackendState;
use std::collections::HashMap;
use std::fs;
use std::io::{self, BufRead, Write};
use transcode::handle_encode_transcode_video;
use uxfd_golden_harness::{load_rgba_jpeg, load_rgba_png, RgbaFrame};
use uxfd_rust_core::{MediaKind, SceneMediaReference, SceneSnapshot};

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    let mut state = BackendState::default();

    for line_result in stdin.lock().lines() {
        let line = match line_result {
            Ok(value) => value,
            Err(_) => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        let parsed = serde_json::from_str::<RpcRequest>(&line);
        let response = match parsed {
            Ok(request) => handle_request(request, &mut state),
            Err(error) => RpcResponse {
                id: 0,
                ok: false,
                result: None,
                error: Some(RpcError {
                    code: -32700,
                    message: format!("Invalid JSON: {error}"),
                }),
            },
        };

        let serialised = match serde_json::to_string(&response) {
            Ok(value) => value,
            Err(_) => continue,
        };

        if writeln!(stdout, "{serialised}").is_err() {
            break;
        }

        if stdout.flush().is_err() {
            break;
        }
    }
    for (_, mut session) in state.encode_sessions.drain() {
        let _ = session.stdin.flush();
        drop(session.stdin);
        let _ = session.child.kill();
        let _ = session.child.wait();
    }
}

fn handle_request(request: RpcRequest, state: &mut BackendState) -> RpcResponse {
    match request.method.as_str() {
        "health" => {
            let result = HealthResult {
                status: "ok",
                engine: "uxfd-rust-backend",
                version: env!("CARGO_PKG_VERSION"),
            };

            RpcResponse {
                id: request.id,
                ok: true,
                result: Some(serde_json::to_value(result).unwrap_or(Value::Null)),
                error: None,
            }
        }
        "echo" => RpcResponse {
            id: request.id,
            ok: true,
            result: Some(request.params),
            error: None,
        },
        "media.probe" => handle_media_probe(request.id, request.params),
        "audio.waveformSamples" => handle_audio_waveform_samples(request.id, request.params),
        "psd.parse" => handle_psd_parse(request.id, request.params, state),
        "psd.await_blob" => handle_psd_await_blob(request.id, state),
        "decode.start" => handle_decode_start(request.id, request.params, state),
        "decode.stop" => handle_decode_stop(request.id, request.params, state),
        "decode.requestFrame" => {
            handle_decode_request_frame(request.id, request.params, state, false)
        }
        "decode.requestFrameInline" => {
            handle_decode_request_frame(request.id, request.params, state, true)
        }
        "decode.releaseFrame" => handle_decode_release_frame(request.id, request.params, state),
        "encode.start" => handle_encode_start(request.id, request.params, state),
        "encode.writeFrame" => handle_encode_write_frame(request.id, request.params, state),
        "encode.writeNativeFrame" => {
            handle_encode_write_native_frame(request.id, request.params, state)
        }
        "encode.transcodeVideo" => handle_encode_transcode_video(request.id, request.params, state),
        "encode.finish" => handle_encode_finish(request.id, request.params, state),
        "encode.abort" => handle_encode_abort(request.id, request.params, state),
        "render.nativeSharedFrame" => {
            handle_native_render_shared_frame(request.id, request.params, state)
        }
        "render.releaseNativeSharedFrame" => {
            handle_release_native_render_shared_frame(request.id, request.params, state)
        }
        "proxy.generate" => handle_proxy_generate(request.id, request.params),
        _ => RpcResponse {
            id: request.id,
            ok: false,
            result: None,
            error: Some(RpcError {
                code: -32601,
                message: format!("Method not found: {}", request.method),
            }),
        },
    }
}

#[cfg(unix)]
pub(crate) fn collect_native_render_sources(
    snapshot: &SceneSnapshot,
    media_items: &[SceneMediaReference],
    shared_sources: &[NativeRenderSharedFrameSource],
) -> Result<HashMap<String, RgbaFrame>, String> {
    let mut sources = HashMap::with_capacity(shared_sources.len() + media_items.len());
    for media in media_items {
        let frame = match media.kind {
            MediaKind::SolidColour => build_solid_colour_source_frame(media)?,
            MediaKind::GeneratedGradient => build_generated_gradient_source_frame(media)?,
            MediaKind::GeneratedParticle => build_generated_particle_source_frame(
                media,
                source_frame_for_media(snapshot, &media.id),
            )?,
            MediaKind::GeneratedBarcode => build_generated_barcode_source_frame(media)?,
            MediaKind::GeneratedPuzzlePiece => build_generated_puzzle_piece_source_frame(media)?,
            MediaKind::GeneratedColourWheel => build_generated_colour_wheel_source_frame(media)?,
            MediaKind::GeneratedGourd => build_generated_gourd_source_frame(media)?,
            MediaKind::GeneratedGear => build_generated_gear_source_frame(media)?,
            MediaKind::GeneratedTrackBar => build_generated_track_bar_source_frame(media)?,
            MediaKind::GeneratedPieChart => build_generated_pie_chart_source_frame(media)?,
            MediaKind::GeneratedHistogram => build_generated_histogram_source_frame(media)?,
            MediaKind::GeneratedToneCurve => build_generated_tone_curve_source_frame(media)?,
            MediaKind::GeneratedGetColorDots => build_generated_getcolor_dots_source_frame(media)?,
            MediaKind::GeneratedHksyCheckerGrid => {
                build_generated_hksy_checker_grid_source_frame(media)?
            }
            MediaKind::GeneratedRegionFrame => build_generated_region_frame_source_frame(media)?,
            MediaKind::GeneratedSimpleTube => build_generated_simple_tube_source_frame(media)?,
            MediaKind::GeneratedSphereDots => build_generated_sphere_dots_source_frame(media)?,
            MediaKind::GeneratedSphericalField => {
                build_generated_spherical_field_source_frame(media)?
            }
            MediaKind::GeneratedSunburst => build_generated_sunburst_source_frame(media)?,
            MediaKind::GeneratedCircularArrow => {
                build_generated_circular_arrow_source_frame(media)?
            }
            MediaKind::GeneratedTriangleBracket => {
                build_generated_triangle_bracket_source_frame(media)?
            }
            MediaKind::GeneratedTartanCheck => build_generated_tartan_check_source_frame(media)?,
            MediaKind::GeneratedHoundstooth => build_generated_houndstooth_source_frame(media)?,
            MediaKind::GeneratedYagasuri => build_generated_yagasuri_source_frame(media)?,
            MediaKind::GeneratedPaperAirplane => {
                build_generated_paper_airplane_source_frame(media)?
            }
            MediaKind::GeneratedAsanohaPattern => {
                build_generated_asanoha_pattern_source_frame(media)?
            }
            MediaKind::GeneratedFocusLinesPlus => build_generated_focus_lines_plus_source_frame(
                media,
                source_frame_for_media(snapshot, &media.id),
            )?,
            MediaKind::GeneratedRandomLineEx => build_generated_random_line_ex_source_frame(media)?,
            MediaKind::GeneratedHologram => build_generated_hologram_source_frame(media)?,
            MediaKind::GeneratedProtractor => build_generated_protractor_source_frame(media)?,
            MediaKind::GeneratedShakingPolygon => build_generated_shaking_polygon_source_frame(
                media,
                source_frame_for_media(snapshot, &media.id),
            )?,
            MediaKind::Image => build_image_source_frame(media)?,
            MediaKind::Psd => build_psd_source_frame(media)?,
            MediaKind::GeneratedAudioWaveform | MediaKind::GeneratedAudioSphere => continue,
            MediaKind::Video => continue,
        };
        if sources.insert(media.id.clone(), frame).is_some() {
            return Err(format!(
                "Duplicate native render source mediaId '{}'",
                media.id
            ));
        }
    }
    for source in shared_sources {
        if sources.contains_key(&source.media_id) {
            return Err(format!(
                "Duplicate native render source mediaId '{}'",
                source.media_id
            ));
        }
        let frame = read_native_render_source_frame(source)?;
        sources.insert(source.media_id.clone(), frame);
    }

    Ok(sources)
}

fn source_frame_for_media(snapshot: &SceneSnapshot, media_id: &str) -> u64 {
    snapshot
        .clips
        .iter()
        .find(|clip| clip.media_id == media_id)
        .map(|clip| clip.source_frame)
        .unwrap_or(0)
}

fn build_solid_colour_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "SolidColour media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let [red, green, blue] = parse_hex_colour_source(&media.source)
        .map_err(|message| format!("Invalid SolidColour media '{}': {message}", media.id))?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "SolidColour media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "SolidColour media byte length overflows".to_string())?;
    let mut pixels = Vec::with_capacity(byte_len);
    for _ in 0..pixel_count {
        pixels.extend_from_slice(&[red, green, blue, 255]);
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("SolidColour media frame is invalid: {error:?}"))
}

fn build_generated_gradient_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
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

fn build_generated_particle_source_frame(
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

fn build_generated_barcode_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
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

fn build_generated_puzzle_piece_source_frame(
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

fn build_generated_colour_wheel_source_frame(
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

fn build_generated_gourd_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
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

fn build_generated_gear_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
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

fn build_generated_track_bar_source_frame(
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

fn build_generated_pie_chart_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedPieChart media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let pie_chart: GeneratedPieChartSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedPieChart media '{}': {error}", media.id))?;
    validate_generated_pie_chart_source(&pie_chart)
        .map_err(|message| format!("Invalid GeneratedPieChart media '{}': {message}", media.id))?;

    let mut values = pie_chart.values.clone();
    match pie_chart.sort_mode.as_str() {
        "descending" => values
            .sort_by(|left, right| right.partial_cmp(left).unwrap_or(std::cmp::Ordering::Equal)),
        "ascending" => values
            .sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal)),
        _ => {}
    }
    let total = if pie_chart.normalise_to_hundred {
        values.iter().sum::<f32>()
    } else {
        100.0
    };
    if !total.is_finite() || total <= 0.0 {
        return Err(format!(
            "Invalid GeneratedPieChart media '{}': values must produce a positive total",
            media.id
        ));
    }

    let colours = pie_chart
        .slice_colours
        .iter()
        .map(|colour| {
            parse_hex_colour_source(colour).map_err(|message| {
                format!("Invalid GeneratedPieChart media '{}': {message}", media.id)
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedPieChart media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedPieChart media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    let centre_x = (media.width as f32 - 1.0) * 0.5;
    let centre_y = (media.height as f32 - 1.0) * 0.5;
    let outer_radius = media.width.min(media.height) as f32 * 0.5 - 1.0;
    let stroke_width = pie_chart.stroke_width.min(outer_radius).max(1.0);
    let inner_radius = (outer_radius - stroke_width).max(0.0);
    let progress_radians =
        (pie_chart.progress_percent.clamp(0.0, 100.0) * 0.01) * std::f32::consts::TAU;

    for y in 0..media.height {
        for x in 0..media.width {
            let dx = x as f32 - centre_x;
            let dy = y as f32 - centre_y;
            let radius = (dx * dx + dy * dy).sqrt();
            if radius < inner_radius || radius > outer_radius {
                continue;
            }
            let mut angle = dy.atan2(dx) + std::f32::consts::FRAC_PI_2;
            if angle < 0.0 {
                angle += std::f32::consts::TAU;
            }
            if angle > progress_radians {
                continue;
            }

            let mut cumulative = 0.0_f32;
            let mut colour_index = values.len().saturating_sub(1);
            for (index, value) in values.iter().enumerate() {
                cumulative += (*value / total) * std::f32::consts::TAU;
                if angle <= cumulative {
                    colour_index = index;
                    break;
                }
            }
            let [red, green, blue] = colours[colour_index % colours.len()];
            let offset = ((y as usize * media.width as usize + x as usize) * 4) as usize;
            pixels[offset..offset + 4].copy_from_slice(&[red, green, blue, 255]);
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedPieChart media frame is invalid: {error:?}"))
}

fn build_generated_histogram_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedHistogram media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let histogram: GeneratedHistogramSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedHistogram media '{}': {error}", media.id))?;
    validate_generated_histogram_source(&histogram)
        .map_err(|message| format!("Invalid GeneratedHistogram media '{}': {message}", media.id))?;

    let background = parse_hex_colour_source(&histogram.background_colour)
        .map_err(|message| format!("Invalid GeneratedHistogram media '{}': {message}", media.id))?;
    let colours = histogram
        .channel_colours
        .iter()
        .map(|colour| {
            parse_hex_colour_source(colour).map_err(|message| {
                format!("Invalid GeneratedHistogram media '{}': {message}", media.id)
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedHistogram media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedHistogram media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    fill_rect_rgba(
        &mut pixels,
        media.width,
        media.height,
        0,
        0,
        media.width as i32,
        media.height as i32,
        [background[0], background[1], background[2], 255],
    );

    let enabled_channels = [
        histogram.show_luminance,
        histogram.show_red,
        histogram.show_green,
        histogram.show_blue,
    ];
    let enabled_count = enabled_channels
        .iter()
        .filter(|enabled| **enabled)
        .count()
        .max(1) as i32;
    let bin_count = histogram.bin_values.len() as i32;
    let bin_width = (media.width as f32 / bin_count as f32).max(1.0);
    let line_width = histogram.line_width.max(1.0).round() as i32;
    let height_scale = histogram.height_scale_percent.clamp(1.0, 1000.0) * 0.01;
    let channel_height_scales = [1.0_f32, 0.82_f32, 0.66_f32, 0.5_f32];

    for (bin_index, value) in histogram.bin_values.iter().enumerate() {
        let bin_left = (bin_index as f32 * bin_width).round() as i32;
        let bin_right = ((bin_index as f32 + 1.0) * bin_width).round() as i32;
        let channel_width = ((bin_right - bin_left).max(1) / enabled_count).max(1);
        let mut channel_slot = 0_i32;
        for channel_index in 0..4 {
            if !enabled_channels[channel_index] {
                continue;
            }
            let scaled_value =
                (value * height_scale * channel_height_scales[channel_index]).clamp(0.0, 1.0);
            let bar_height = (media.height as f32 * scaled_value).round() as i32;
            let left = bin_left + channel_slot * channel_width;
            let right = (left + channel_width.max(line_width)).min(bin_right.max(left + 1));
            let top = media.height as i32 - bar_height.max(1);
            let [red, green, blue] = colours[channel_index];
            fill_rect_rgba(
                &mut pixels,
                media.width,
                media.height,
                left,
                top,
                right,
                media.height as i32,
                [red, green, blue, 255],
            );
            channel_slot += 1;
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedHistogram media frame is invalid: {error:?}"))
}

fn build_generated_sunburst_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedSunburst media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let sunburst: GeneratedSunburstSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedSunburst media '{}': {error}", media.id))?;
    validate_generated_sunburst_source(&sunburst)
        .map_err(|message| format!("Invalid GeneratedSunburst media '{}': {message}", media.id))?;

    let ray_colour = parse_hex_colour_source(&sunburst.ray_colour)
        .map_err(|message| format!("Invalid GeneratedSunburst media '{}': {message}", media.id))?;
    let background_colour = parse_hex_colour_source(&sunburst.background_colour)
        .map_err(|message| format!("Invalid GeneratedSunburst media '{}': {message}", media.id))?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedSunburst media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedSunburst media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    fill_rect_rgba(
        &mut pixels,
        media.width,
        media.height,
        0,
        0,
        media.width as i32,
        media.height as i32,
        [
            background_colour[0],
            background_colour[1],
            background_colour[2],
            255,
        ],
    );

    let centre_x = media.width as f32 * sunburst.centre_x_percent * 0.01;
    let centre_y = media.height as f32 * sunburst.centre_y_percent * 0.01;
    let ray_count = sunburst.ray_count.max(1) as f32;
    let coverage = (sunburst.ray_coverage_percent * 0.01).clamp(0.0, 1.0);
    let rotation = sunburst.rotation_offset_degrees.to_radians() - std::f32::consts::FRAC_PI_2;
    let motif_radius = sunburst.motif_size as f32 * 0.5;

    for y in 0..media.height {
        for x in 0..media.width {
            let dx = x as f32 - centre_x;
            let dy = y as f32 - centre_y;
            let angle = (dy.atan2(dx) - rotation).rem_euclid(std::f32::consts::TAU);
            let phase = ((angle / std::f32::consts::TAU) * ray_count).fract();
            let in_ray = phase <= coverage;
            let in_motif = if sunburst.motif_shape == "rect" {
                dx.abs() <= motif_radius && dy.abs() <= motif_radius
            } else {
                (dx * dx + dy * dy).sqrt() <= motif_radius
            };
            if in_ray || in_motif {
                let offset = ((y as usize * media.width as usize + x as usize) * 4) as usize;
                pixels[offset..offset + 4].copy_from_slice(&[
                    ray_colour[0],
                    ray_colour[1],
                    ray_colour[2],
                    255,
                ]);
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedSunburst media frame is invalid: {error:?}"))
}

fn build_generated_circular_arrow_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedCircularArrow media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let arrow: GeneratedCircularArrowSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedCircularArrow media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_circular_arrow_source(&arrow).map_err(|message| {
        format!(
            "Invalid GeneratedCircularArrow media '{}': {message}",
            media.id
        )
    })?;

    let colour = parse_hex_colour_source(&arrow.arrow_colour).map_err(|message| {
        format!(
            "Invalid GeneratedCircularArrow media '{}': {message}",
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
        .ok_or_else(|| "GeneratedCircularArrow media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedCircularArrow media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    let centre_x = media.width as f32 * 0.5;
    let centre_y = media.height as f32 * 0.5;
    let radius = (arrow.radius as f32)
        .min(media.width.min(media.height) as f32 * 0.5 - 1.0)
        .max(1.0);
    let half_line = (arrow.line_width as f32 * 0.5).max(0.5);
    let span = arrow
        .angle_degrees
        .to_radians()
        .clamp(0.0, std::f32::consts::TAU);
    let centre_angle = arrow.centre_angle_degrees.to_radians() - std::f32::consts::FRAC_PI_2;
    let start_angle = centre_angle - span * 0.5;
    let end_angle = centre_angle + span * 0.5;
    let start_point = point_on_circle(centre_x, centre_y, radius, start_angle);
    let end_point = point_on_circle(centre_x, centre_y, radius, end_angle);
    let end_head = circular_arrow_head(end_point, end_angle, arrow.head_size as f32);
    let start_head = circular_arrow_head(
        start_point,
        start_angle + std::f32::consts::PI,
        arrow.head_size as f32,
    );
    let head_radius = arrow.head_size as f32 * 0.5;

    for y in 0..media.height {
        for x in 0..media.width {
            let sample_x = if arrow.flip_horizontal {
                media.width as f32 - 1.0 - x as f32
            } else {
                x as f32
            };
            let sample_y = if arrow.flip_vertical {
                media.height as f32 - 1.0 - y as f32
            } else {
                y as f32
            };
            let dx = sample_x + 0.5 - centre_x;
            let dy = sample_y + 0.5 - centre_y;
            let distance = (dx * dx + dy * dy).sqrt();
            let angle = dy.atan2(dx);
            let in_arc = span > 0.0
                && (distance - radius).abs() <= half_line
                && circular_arrow_angle_in_span(angle, start_angle, span);
            let in_end_head = if arrow.head_shape == "circle" {
                distance_to_point(sample_x + 0.5, sample_y + 0.5, end_point.0, end_point.1)
                    <= head_radius
            } else {
                point_in_triangle(sample_x + 0.5, sample_y + 0.5, end_head)
            };
            let in_start_head = arrow.show_tail_head
                && if arrow.head_shape == "circle" {
                    distance_to_point(sample_x + 0.5, sample_y + 0.5, start_point.0, start_point.1)
                        <= head_radius
                } else {
                    point_in_triangle(sample_x + 0.5, sample_y + 0.5, start_head)
                };
            if in_arc || in_end_head || in_start_head {
                let offset = ((y as usize * media.width as usize + x as usize) * 4) as usize;
                pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedCircularArrow media frame is invalid: {error:?}"))
}

fn build_generated_triangle_bracket_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedTriangleBracket media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let bracket: GeneratedTriangleBracketSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedTriangleBracket media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_triangle_bracket_source(&bracket).map_err(|message| {
        format!(
            "Invalid GeneratedTriangleBracket media '{}': {message}",
            media.id
        )
    })?;

    let colour = parse_hex_colour_source(&bracket.bracket_colour).map_err(|message| {
        format!(
            "Invalid GeneratedTriangleBracket media '{}': {message}",
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
        .ok_or_else(|| "GeneratedTriangleBracket media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedTriangleBracket media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];

    let half_height = bracket.bracket_width as f32 * 0.5;
    let half_angle = (bracket.angle_degrees * 0.5).to_radians();
    let angle_inset = if half_angle.tan().abs() <= f32::EPSILON {
        0.0
    } else {
        half_height / half_angle.tan()
    };
    let total_width = bracket.arm_length as f32 + angle_inset.max(0.0);
    let centre_x = media.width as f32 * 0.5 + bracket.offset_distance as f32;
    let centre_y = media.height as f32 * 0.5;
    let tip = (centre_x - total_width * 0.5, centre_y);
    let right_x = tip.0 + bracket.arm_length as f32;
    let top = (right_x, centre_y - half_height);
    let bottom = (right_x, centre_y + half_height);
    let stroke_width = (bracket.bracket_width as f32 * 0.08).max(2.0);

    for y in 0..media.height {
        for x in 0..media.width {
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;
            let top_distance = distance_to_segment(px, py, tip, top);
            let bottom_distance = distance_to_segment(px, py, tip, bottom);
            if top_distance <= stroke_width || bottom_distance <= stroke_width {
                let offset = ((y as usize * media.width as usize + x as usize) * 4) as usize;
                pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
            }
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedTriangleBracket media frame is invalid: {error:?}"))
}

fn build_generated_tartan_check_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedTartanCheck media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let tartan: GeneratedTartanCheckSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedTartanCheck media '{}': {error}", media.id))?;
    validate_generated_tartan_check_source(&tartan).map_err(|message| {
        format!(
            "Invalid GeneratedTartanCheck media '{}': {message}",
            media.id
        )
    })?;

    let base = parse_hex_colour_source(&tartan.base_colour).map_err(|message| {
        format!(
            "Invalid GeneratedTartanCheck media '{}': {message}",
            media.id
        )
    })?;
    let stripe_a = parse_hex_colour_source(&tartan.stripe_colour_a).map_err(|message| {
        format!(
            "Invalid GeneratedTartanCheck media '{}': {message}",
            media.id
        )
    })?;
    let stripe_b = parse_hex_colour_source(&tartan.stripe_colour_b).map_err(|message| {
        format!(
            "Invalid GeneratedTartanCheck media '{}': {message}",
            media.id
        )
    })?;
    let line = parse_hex_colour_source(&tartan.line_colour).map_err(|message| {
        format!(
            "Invalid GeneratedTartanCheck media '{}': {message}",
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
        .ok_or_else(|| "GeneratedTartanCheck media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedTartanCheck media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let tile = tartan.tile_size.max(10);
    let red_band = (tile / 4).max(2);
    let yellow_band = (tile / 5).max(2);
    let line_width = (tartan.blur_radius + 1).min(tile / 8).max(1);

    for y in 0..media.height {
        for x in 0..media.width {
            let tx = x % tile;
            let ty = y % tile;
            let mut colour = base;
            if tx < red_band || ty >= tile.saturating_sub(red_band) {
                colour = stripe_a;
            }
            if (tx >= tile / 2 && tx < tile / 2 + yellow_band)
                || (ty >= tile / 3 && ty < tile / 3 + yellow_band)
            {
                colour = blend_rgb8(colour, stripe_b, 0.75);
            }
            if tx < line_width
                || ty < line_width
                || (tx >= tile / 2 && tx < tile / 2 + line_width)
                || (ty >= tile / 2 && ty < tile / 2 + line_width)
            {
                colour = line;
            }
            let offset = ((y as usize * media.width as usize + x as usize) * 4) as usize;
            pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedTartanCheck media frame is invalid: {error:?}"))
}

fn blend_rgb8(left: [u8; 3], right: [u8; 3], right_weight: f32) -> [u8; 3] {
    let weight = right_weight.clamp(0.0, 1.0);
    let left_weight = 1.0 - weight;
    [
        (left[0] as f32 * left_weight + right[0] as f32 * weight).round() as u8,
        (left[1] as f32 * left_weight + right[1] as f32 * weight).round() as u8,
        (left[2] as f32 * left_weight + right[2] as f32 * weight).round() as u8,
    ]
}

fn build_generated_houndstooth_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedHoundstooth media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let houndstooth: GeneratedHoundstoothSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedHoundstooth media '{}': {error}", media.id))?;
    validate_generated_houndstooth_source(&houndstooth).map_err(|message| {
        format!(
            "Invalid GeneratedHoundstooth media '{}': {message}",
            media.id
        )
    })?;

    let foreground =
        parse_hex_colour_source(&houndstooth.foreground_colour).map_err(|message| {
            format!(
                "Invalid GeneratedHoundstooth media '{}': {message}",
                media.id
            )
        })?;
    let background =
        parse_hex_colour_source(&houndstooth.background_colour).map_err(|message| {
            format!(
                "Invalid GeneratedHoundstooth media '{}': {message}",
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
        .ok_or_else(|| "GeneratedHoundstooth media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedHoundstooth media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let tooth = houndstooth.pattern_size.max(10);
    let tile = tooth * 2;
    let half = tooth as f32;

    for y in 0..media.height {
        for x in 0..media.width {
            let lx = (x % tile) as f32;
            let ly = (y % tile) as f32;
            let upper_left = lx < half && ly < half;
            let lower_right = lx >= half && ly >= half;
            let notch_a = lx >= half && ly < half && ly < (lx - half) * 0.35;
            let notch_b = lx < half && ly >= half && (ly - half) > half - lx * 0.35;
            let use_foreground = upper_left || lower_right || notch_a || notch_b;
            let colour = if use_foreground {
                foreground
            } else {
                background
            };
            let offset = (y as usize * media.width as usize + x as usize) * 4;
            pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedHoundstooth media frame is invalid: {error:?}"))
}

fn build_generated_yagasuri_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedYagasuri media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let yagasuri: GeneratedYagasuriSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedYagasuri media '{}': {error}", media.id))?;
    validate_generated_yagasuri_source(&yagasuri)
        .map_err(|message| format!("Invalid GeneratedYagasuri media '{}': {message}", media.id))?;

    let foreground = parse_hex_colour_source(&yagasuri.foreground_colour)
        .map_err(|message| format!("Invalid GeneratedYagasuri media '{}': {message}", media.id))?;
    let background = parse_hex_colour_source(&yagasuri.background_colour)
        .map_err(|message| format!("Invalid GeneratedYagasuri media '{}': {message}", media.id))?;
    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedYagasuri media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedYagasuri media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let arrow_width = yagasuri.arrow_width.max(1) as f32;
    let arrow_height = yagasuri.arrow_height.max(1) as f32;
    let line_width = yagasuri.line_width as f32;
    let period = (arrow_width * 4.0 + line_width * 2.0).max(1.0);
    let row_height = arrow_height.max(1.0);

    for y in 0..media.height {
        let row = (y as f32 / row_height).floor() as u32;
        let row_y = (y as f32).rem_euclid(row_height);
        let row_shift = if yagasuri.staggered && row % 2 == 1 {
            arrow_width * 2.0 + line_width
        } else {
            0.0
        };
        let diagonal = row_y / row_height * arrow_width;
        for x in 0..media.width {
            let local_x = ((x as f32 - row_shift).rem_euclid(period) + period).rem_euclid(period);
            let left_start = (arrow_width - diagonal).max(0.0);
            let left_end = left_start + arrow_width;
            let right_start = arrow_width + line_width + diagonal;
            let right_end = right_start + arrow_width;
            let line_start = arrow_width * 2.0 + line_width;
            let line_end = line_start + line_width.max(1.0);
            let use_foreground = (local_x >= left_start && local_x <= left_end)
                || (local_x >= right_start && local_x <= right_end)
                || (line_width > 0.0 && local_x >= line_start && local_x <= line_end);
            let colour = if use_foreground {
                foreground
            } else {
                background
            };
            let offset = (y as usize * media.width as usize + x as usize) * 4;
            pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedYagasuri media frame is invalid: {error:?}"))
}

fn build_generated_paper_airplane_source_frame(
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

fn build_generated_asanoha_pattern_source_frame(
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

fn build_generated_focus_lines_plus_source_frame(
    media: &SceneMediaReference,
    source_frame: u64,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedFocusLinesPlus media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let focus_lines: GeneratedFocusLinesPlusSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedFocusLinesPlus media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_focus_lines_plus_source(&focus_lines).map_err(|message| {
        format!(
            "Invalid GeneratedFocusLinesPlus media '{}': {message}",
            media.id
        )
    })?;
    let line_colour = parse_hex_colour_source(&focus_lines.line_colour).map_err(|message| {
        format!(
            "Invalid GeneratedFocusLinesPlus media '{}': {message}",
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
        .ok_or_else(|| "GeneratedFocusLinesPlus media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedFocusLinesPlus media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let max_x = focus_lines
        .centre_x
        .max(media.width as f32 - focus_lines.centre_x);
    let max_y = focus_lines
        .centre_y
        .max(media.height as f32 - focus_lines.centre_y);
    let outer_radius = (max_x * max_x + max_y * max_y).sqrt() * 1.25;
    let rotation = focus_lines.rotation_degrees.to_radians();
    let frame_bucket = if focus_lines.keyframe_interval == 0 {
        0
    } else {
        source_frame / focus_lines.keyframe_interval
    };
    let seed =
        (focus_lines.seed as u64).wrapping_add(frame_bucket.wrapping_mul(0x517c_c1b7_2722_0a95));
    let centre_jitter_radius =
        focus_lines.centre_radius * focus_lines.centre_jitter_percent / 100.0;
    let jitter_angle = deterministic_unit(seed, 0, 21) * std::f32::consts::TAU;
    let jitter_distance = deterministic_unit(seed, 0, 22) * centre_jitter_radius;
    let centre_x = focus_lines.centre_x + jitter_angle.cos() * jitter_distance;
    let centre_y = focus_lines.centre_y + jitter_angle.sin() * jitter_distance;

    let mut cursor = 0.0_f32;
    let mut index = 1_u32;
    while cursor <= 100.0 && index < 512 {
        let gap = deterministic_unit(seed, index, 0) * focus_lines.gap;
        let ray_width = deterministic_unit(seed, index, 1) * focus_lines.ray_width;
        let start = cursor + gap;
        let end = (start + ray_width).min(100.0);
        if end > start {
            let start_angle = rotation + std::f32::consts::TAU * start / 100.0;
            let end_angle = rotation + std::f32::consts::TAU * end / 100.0;
            let mid_angle = (start_angle + end_angle) * 0.5;
            let inner = (
                centre_x + focus_lines.centre_radius * mid_angle.cos(),
                centre_y + focus_lines.centre_radius * mid_angle.sin(),
            );
            let outer_start = (
                centre_x + outer_radius * start_angle.cos(),
                centre_y + outer_radius * start_angle.sin(),
            );
            let outer_mid = (
                centre_x + outer_radius * mid_angle.cos(),
                centre_y + outer_radius * mid_angle.sin(),
            );
            let outer_end = (
                centre_x + outer_radius * end_angle.cos(),
                centre_y + outer_radius * end_angle.sin(),
            );
            fill_focus_lines_plus_ray(
                &mut pixels,
                media.width,
                media.height,
                [inner, outer_start, outer_mid, outer_end],
                line_colour,
            );
        }
        cursor = end;
        index += 1;
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedFocusLinesPlus media frame is invalid: {error:?}"))
}

fn fill_focus_lines_plus_ray(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    quad: [(f32, f32); 4],
    colour: [u8; 3],
) {
    let min_x = quad
        .iter()
        .map(|point| point.0)
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0) as u32;
    let max_x = quad
        .iter()
        .map(|point| point.0)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = quad
        .iter()
        .map(|point| point.1)
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0) as u32;
    let max_y = quad
        .iter()
        .map(|point| point.1)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(height.saturating_sub(1) as f32) as u32;

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let sample_x = x as f32 + 0.5;
            let sample_y = y as f32 + 0.5;
            let inside = point_in_triangle(sample_x, sample_y, [quad[0], quad[1], quad[2]])
                || point_in_triangle(sample_x, sample_y, [quad[0], quad[2], quad[3]]);
            if inside {
                let offset = (y as usize * width as usize + x as usize) * 4;
                pixels[offset..offset + 4].copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
            }
        }
    }
}

fn build_generated_random_line_ex_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedRandomLineEx media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let random_line: GeneratedRandomLineExSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedRandomLineEx media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_random_line_ex_source(&random_line).map_err(|message| {
        format!(
            "Invalid GeneratedRandomLineEx media '{}': {message}",
            media.id
        )
    })?;
    let line_colour = parse_hex_colour_source(&random_line.line_colour).map_err(|message| {
        format!(
            "Invalid GeneratedRandomLineEx media '{}': {message}",
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
        .ok_or_else(|| "GeneratedRandomLineEx media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedRandomLineEx media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let diagonal = ((media.width * media.width + media.height * media.height) as f32).sqrt();
    let seed = random_line.seed as u64;

    for index in 0..random_line.line_count {
        let centre_x = (deterministic_unit(seed, index, 0) - 0.5) * media.width as f32;
        let centre_y = (deterministic_unit(seed, index, 1) - 0.5) * media.height as f32;
        let angle = deterministic_unit(seed, index, 2) * std::f32::consts::PI;
        let width = random_line.line_width
            + deterministic_unit(seed, index, 3) * random_line.width_variance;
        let direction = (angle.cos(), angle.sin());
        let normal = (-direction.1, direction.0);
        let half_len = diagonal;
        let half_width = (width * 0.5).max(0.0);
        let quad = [
            (
                centre_x + direction.0 * half_len + normal.0 * half_width,
                centre_y + direction.1 * half_len + normal.1 * half_width,
            ),
            (
                centre_x + direction.0 * half_len - normal.0 * half_width,
                centre_y + direction.1 * half_len - normal.1 * half_width,
            ),
            (
                centre_x - direction.0 * half_len - normal.0 * half_width,
                centre_y - direction.1 * half_len - normal.1 * half_width,
            ),
            (
                centre_x - direction.0 * half_len + normal.0 * half_width,
                centre_y - direction.1 * half_len + normal.1 * half_width,
            ),
        ];
        fill_random_line_ex_quad(
            &mut pixels,
            media.width,
            media.height,
            quad,
            line_colour,
            &random_line,
            index,
        );
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedRandomLineEx media frame is invalid: {error:?}"))
}

fn fill_random_line_ex_quad(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    quad: [(f32, f32); 4],
    colour: [u8; 3],
    source: &GeneratedRandomLineExSource,
    line_index: u32,
) {
    let min_x = quad
        .iter()
        .map(|point| point.0)
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0) as u32;
    let max_x = quad
        .iter()
        .map(|point| point.0)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(width.saturating_sub(1) as f32) as u32;
    let min_y = quad
        .iter()
        .map(|point| point.1)
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0) as u32;
    let max_y = quad
        .iter()
        .map(|point| point.1)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(height.saturating_sub(1) as f32) as u32;
    let cell = source.noise_cell_size.max(1);

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let sample_x = x as f32 + 0.5;
            let sample_y = y as f32 + 0.5;
            let inside = point_in_triangle(sample_x, sample_y, [quad[0], quad[1], quad[2]])
                || point_in_triangle(sample_x, sample_y, [quad[0], quad[2], quad[3]]);
            if inside {
                let noise_index = (x / cell) ^ ((y / cell) << 8) ^ (line_index << 16);
                let noise =
                    (deterministic_unit(source.seed as u64, noise_index, 37) * 255.0) as u32;
                if noise >= source.threshold {
                    let offset = (y as usize * width as usize + x as usize) * 4;
                    pixels[offset..offset + 4]
                        .copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
                }
            }
        }
    }
}

fn build_generated_hologram_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
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

fn build_generated_protractor_source_frame(
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

fn draw_filled_circle_rgba(
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

fn build_generated_shaking_polygon_source_frame(
    media: &SceneMediaReference,
    source_frame: u64,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedShakingPolygon media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let polygon: GeneratedShakingPolygonSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedShakingPolygon media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_shaking_polygon_source(&polygon).map_err(|message| {
        format!(
            "Invalid GeneratedShakingPolygon media '{}': {message}",
            media.id
        )
    })?;
    let colour = parse_hex_colour_source(&polygon.colour).map_err(|message| {
        format!(
            "Invalid GeneratedShakingPolygon media '{}': {message}",
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
        .ok_or_else(|| "GeneratedShakingPolygon media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedShakingPolygon media byte length overflows".to_string())?;
    let mut pixels = vec![0_u8; byte_len];
    let centre = (media.width as f32 * 0.5, media.height as f32 * 0.5);
    let base_radius = if polygon.fixed_diameter > 0 {
        polygon.fixed_diameter as f32 * 0.5
    } else {
        media.width.min(media.height) as f32 * 0.36
    };
    let base_radius = base_radius.min(media.width.min(media.height) as f32 * 0.48);

    for repeat_index in 0..polygon.repeat_count {
        let rotation = if polygon.repeat_count <= 1 {
            0.0
        } else {
            repeat_index as f32 * std::f32::consts::TAU
                / (polygon.repeat_count * polygon.repeat_frequency) as f32
        };
        let points = shaking_polygon_points(&polygon, source_frame, centre, base_radius, rotation);
        if polygon.fill {
            fill_polygon_fan_rgba(
                &mut pixels,
                media.width,
                media.height,
                &points,
                centre,
                colour,
                96,
            );
        }
        draw_polygon_outline_rgba(
            &mut pixels,
            media.width,
            media.height,
            &points,
            colour,
            polygon.line_width as f32,
        );
        for point in points {
            draw_filled_circle_rgba(
                &mut pixels,
                media.width,
                media.height,
                point.0,
                point.1,
                (polygon.line_width as f32 * 0.55).max(1.0),
                colour,
                255,
            );
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedShakingPolygon media frame is invalid: {error:?}"))
}

fn shaking_polygon_points(
    polygon: &GeneratedShakingPolygonSource,
    source_frame: u64,
    centre: (f32, f32),
    base_radius: f32,
    rotation: f32,
) -> Vec<(f32, f32)> {
    let interval = polygon.jitter_interval.max(1) as u64;
    let phase = source_frame / interval;
    let t = (source_frame % interval) as f32 / interval as f32;
    let eased_t = if polygon.stepped {
        0.0
    } else {
        t * t * (3.0 - 2.0 * t)
    };
    let vertical_scale = if polygon.vertical_distortion_percent < 0.0 {
        1.0 + polygon.vertical_distortion_percent / 100.0
    } else {
        1.0
    };
    let horizontal_scale = if polygon.vertical_distortion_percent > 0.0 {
        1.0 - polygon.vertical_distortion_percent / 100.0
    } else {
        1.0
    };
    let seed = polygon.seed as u64;
    (0..polygon.vertex_count)
        .map(|index| {
            let base_angle = rotation
                + index as f32 * std::f32::consts::TAU / polygon.vertex_count as f32
                + if polygon.vertex_count == 4 {
                    std::f32::consts::FRAC_PI_4
                } else {
                    0.0
                };
            let jitter_x0 = jitter_value(seed, index, phase, 0, polygon.jitter_range);
            let jitter_y0 = jitter_value(seed, index, phase, 1, polygon.jitter_range);
            let jitter_x1 = jitter_value(seed, index, phase + 1, 0, polygon.jitter_range);
            let jitter_y1 = jitter_value(seed, index, phase + 1, 1, polygon.jitter_range);
            let jitter_x = jitter_x0 + (jitter_x1 - jitter_x0) * eased_t;
            let jitter_y = jitter_y0 + (jitter_y1 - jitter_y0) * eased_t;
            (
                centre.0 + base_angle.sin() * base_radius * horizontal_scale + jitter_x,
                centre.1 - base_angle.cos() * base_radius * vertical_scale + jitter_y,
            )
        })
        .collect()
}

fn jitter_value(seed: u64, vertex_index: u32, phase: u64, lane: u64, range: f32) -> f32 {
    (deterministic_unit(
        seed,
        vertex_index,
        phase.saturating_mul(13).saturating_add(lane),
    ) * 2.0
        - 1.0)
        * range
}

fn build_generated_tone_curve_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedToneCurve media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let tone_curve: GeneratedToneCurveSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedToneCurve media '{}': {error}", media.id))?;
    validate_generated_tone_curve_source(&tone_curve)
        .map_err(|message| format!("Invalid GeneratedToneCurve media '{}': {message}", media.id))?;
    let background = parse_hex_colour_source(&tone_curve.background_colour).map_err(|message| {
        format!(
            "Invalid GeneratedToneCurve media '{}': background_colour {message}",
            media.id
        )
    })?;
    let grid = parse_hex_colour_source(&tone_curve.grid_colour).map_err(|message| {
        format!(
            "Invalid GeneratedToneCurve media '{}': grid_colour {message}",
            media.id
        )
    })?;
    let curve = parse_hex_colour_source(&tone_curve.curve_colour).map_err(|message| {
        format!(
            "Invalid GeneratedToneCurve media '{}': curve_colour {message}",
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
        .ok_or_else(|| "GeneratedToneCurve media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedToneCurve media byte length overflows".to_string())?;
    let mut pixels = Vec::with_capacity(byte_len);
    for _ in 0..pixel_count {
        pixels.extend_from_slice(&[background[0], background[1], background[2], 255]);
    }

    let width = media.width as f32;
    let height = media.height as f32;
    let divisions = tone_curve.grid_divisions.max(1);
    for index in 0..=divisions {
        let x = index as f32 * (width - 1.0) / divisions as f32;
        let y = index as f32 * (height - 1.0) / divisions as f32;
        draw_line_segment_rgba(
            &mut pixels,
            media.width,
            media.height,
            (x, 0.0),
            (x, height - 1.0),
            grid,
            1.0,
        );
        draw_line_segment_rgba(
            &mut pixels,
            media.width,
            media.height,
            (0.0, y),
            (width - 1.0, y),
            grid,
            1.0,
        );
    }

    let points = tone_curve_curve_points(&tone_curve.curve_points, width, height);
    for pair in points.windows(2) {
        draw_line_segment_rgba(
            &mut pixels,
            media.width,
            media.height,
            pair[0],
            pair[1],
            curve,
            tone_curve.line_width as f32,
        );
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedToneCurve media frame is invalid: {error:?}"))
}

fn build_generated_hksy_checker_grid_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedHksyCheckerGrid media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let checker_grid: GeneratedHksyCheckerGridSource = serde_json::from_str(&media.source)
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
            checker_grid.line_width as f32,
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
                cell_size: checker_grid.cell_size,
                line_width: checker_grid.line_width,
                separate_interval: checker_grid.separate_interval.unwrap_or(5),
                separate_line_width: checker_grid.separate_line_width.unwrap_or(3),
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
            checker_grid.line_width as f32,
            checker_grid.round_caps.unwrap_or(true),
        );
        return RgbaFrame::from_rgba8(media.width, media.height, pixels).map_err(|error| {
            format!("GeneratedHksyCheckerGrid media frame is invalid: {error:?}")
        });
    }

    for y in 0..media.height {
        for x in 0..media.width {
            let colour = if checker_grid.checker_enabled {
                let tile_x = x / checker_grid.cell_size;
                let tile_y = y / checker_grid.cell_size;
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

    if checker_grid.grid_enabled && checker_grid.line_width > 0 {
        let line_width = checker_grid.line_width as f32;
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
            x = x.saturating_add(checker_grid.cell_size);
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
            y = y.saturating_add(checker_grid.cell_size);
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
    anchor_points: &[GeneratedHksyAnchorPoint],
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

fn build_generated_region_frame_source_frame(
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

fn build_generated_simple_tube_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedSimpleTube media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let simple_tube: GeneratedSimpleTubeSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid GeneratedSimpleTube media '{}': {error}", media.id))?;
    validate_generated_simple_tube_source(&simple_tube).map_err(|message| {
        format!(
            "Invalid GeneratedSimpleTube media '{}': {message}",
            media.id
        )
    })?;
    let colour = parse_hex_colour_source(&simple_tube.colour).map_err(|message| {
        format!(
            "Invalid GeneratedSimpleTube media '{}': colour {message}",
            media.id
        )
    })?;
    let secondary_colour =
        parse_hex_colour_source(&simple_tube.secondary_colour).map_err(|message| {
            format!(
                "Invalid GeneratedSimpleTube media '{}': secondary_colour {message}",
                media.id
            )
        })?;
    let fog_colour = parse_hex_colour_source(&simple_tube.fog_colour).map_err(|message| {
        format!(
            "Invalid GeneratedSimpleTube media '{}': fog_colour {message}",
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
        .ok_or_else(|| "GeneratedSimpleTube media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedSimpleTube media byte length overflows".to_string())?;
    let mut pixels = vec![0; byte_len];
    draw_simple_tube_rgba(
        &mut pixels,
        media.width,
        media.height,
        &simple_tube,
        colour,
        secondary_colour,
        fog_colour,
    );

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedSimpleTube media frame is invalid: {error:?}"))
}

fn draw_simple_tube_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    tube: &GeneratedSimpleTubeSource,
    colour: [u8; 3],
    secondary_colour: [u8; 3],
    fog_colour: [u8; 3],
) {
    let centre_x = width as f32 * 0.5;
    let centre_y = height as f32 * 0.5;
    let radius_x = (tube.radius - 10.0).max(1.0).min(width as f32 * 0.45);
    let radius_y = (radius_x * 0.32).max(1.0).min(height as f32 * 0.3);
    let depth = tube.depth.abs().min(height as f32 * 0.85);
    let stroke_width = tube.stroke_width.max(0.5);

    if tube.torus {
        draw_simple_tube_torus_rgba(
            pixels,
            width,
            height,
            centre_x,
            centre_y,
            radius_x,
            radius_y,
            tube,
            colour,
            secondary_colour,
            fog_colour,
            stroke_width,
        );
        return;
    }

    let ring_count = tube.rings.max(2);
    let segment_count = tube.segments.max(3);
    let top = centre_y - depth * 0.5;
    let step = if ring_count <= 1 {
        0.0
    } else {
        depth / (ring_count - 1) as f32
    };
    let twist_total = tube.twist_degrees.to_radians();
    let mut rings = Vec::new();

    for ring_index in 0..ring_count {
        let phase = ring_index as f32 / (ring_count - 1).max(1) as f32;
        let y = top + step * ring_index as f32;
        let twist = twist_total * phase;
        let perspective = 0.82 + 0.18 * (1.0 - (phase - 0.5).abs() * 2.0);
        let points = simple_tube_ellipse_points(
            centre_x,
            y,
            radius_x * perspective,
            radius_y * perspective,
            segment_count,
            twist,
            tube.random_amount,
            tube.seed + ring_index as i64,
        );
        let ring_colour = simple_tube_colour_for_ring(
            tube,
            ring_index,
            ring_count,
            colour,
            secondary_colour,
            fog_colour,
        );
        for pair in points.windows(2) {
            draw_line_segment_rgba(
                pixels,
                width,
                height,
                pair[0],
                pair[1],
                ring_colour,
                stroke_width,
            );
        }
        if let (Some(first), Some(last)) = (points.first(), points.last()) {
            draw_line_segment_rgba(
                pixels,
                width,
                height,
                *last,
                *first,
                ring_colour,
                stroke_width,
            );
        }
        rings.push(points);
    }

    for segment_index in 0..segment_count as usize {
        let depth_colour = simple_tube_colour_for_ring(
            tube,
            segment_index as u32,
            segment_count,
            colour,
            secondary_colour,
            fog_colour,
        );
        for pair in rings.windows(2) {
            draw_line_segment_rgba(
                pixels,
                width,
                height,
                pair[0][segment_index],
                pair[1][segment_index],
                depth_colour,
                stroke_width,
            );
        }
    }

    let centre_ring = simple_tube_ellipse_points(
        centre_x,
        centre_y,
        radius_x,
        radius_y,
        segment_count,
        twist_total * 0.5,
        tube.random_amount,
        tube.seed + 10_000,
    );
    let centre_colour = simple_tube_colour_for_ring(
        tube,
        ring_count / 2,
        ring_count,
        colour,
        secondary_colour,
        fog_colour,
    );
    for pair in centre_ring.windows(2) {
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            pair[0],
            pair[1],
            centre_colour,
            stroke_width,
        );
    }
    if let (Some(first), Some(last)) = (centre_ring.first(), centre_ring.last()) {
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            *last,
            *first,
            centre_colour,
            stroke_width,
        );
    }

    draw_line_segment_rgba(
        pixels,
        width,
        height,
        (centre_x, top),
        (centre_x, top + depth),
        secondary_colour,
        stroke_width,
    );
}

fn build_generated_sphere_dots_source_frame(
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

fn build_generated_spherical_field_source_frame(
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

fn draw_simple_tube_torus_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius_x: f32,
    radius_y: f32,
    tube: &GeneratedSimpleTubeSource,
    colour: [u8; 3],
    secondary_colour: [u8; 3],
    fog_colour: [u8; 3],
    stroke_width: f32,
) {
    let segment_count = tube.segments.max(3);
    let ring_count = tube.rings.max(2);
    let outer_radius_x = radius_x.min(width as f32 * 0.4);
    let outer_radius_y = radius_y.max(1.0).min(height as f32 * 0.22);
    let points = simple_tube_ellipse_points(
        centre_x,
        centre_y,
        outer_radius_x,
        outer_radius_y,
        segment_count,
        tube.twist_degrees.to_radians(),
        tube.random_amount,
        tube.seed,
    );
    let ring_colour = simple_tube_colour_for_ring(tube, 0, 1, colour, secondary_colour, fog_colour);
    for pair in points.windows(2) {
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            pair[0],
            pair[1],
            ring_colour,
            stroke_width,
        );
    }
    if let (Some(first), Some(last)) = (points.first(), points.last()) {
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            *last,
            *first,
            ring_colour,
            stroke_width,
        );
    }
    for ring_index in 0..ring_count {
        let phase = ring_index as f32 / ring_count as f32;
        let angle = phase * std::f32::consts::TAU;
        let x = centre_x + outer_radius_x * angle.cos();
        let y = centre_y + outer_radius_y * angle.sin();
        let spoke_colour = simple_tube_colour_for_ring(
            tube,
            ring_index,
            ring_count,
            colour,
            secondary_colour,
            fog_colour,
        );
        draw_line_segment_rgba(
            pixels,
            width,
            height,
            (centre_x, centre_y),
            (x, y),
            spoke_colour,
            stroke_width,
        );
    }
}

fn simple_tube_colour_for_ring(
    tube: &GeneratedSimpleTubeSource,
    index: u32,
    count: u32,
    colour: [u8; 3],
    secondary_colour: [u8; 3],
    fog_colour: [u8; 3],
) -> [u8; 3] {
    let pattern_colour = match tube.colour_pattern.as_str() {
        "ring" if index % 2 == 1 => secondary_colour,
        "depth" => {
            let amount = if count <= 1 {
                0.0
            } else {
                index as f32 / (count - 1) as f32
            };
            mix_rgb_u8(colour, secondary_colour, amount)
        }
        _ => colour,
    };
    mix_rgb_u8(
        pattern_colour,
        fog_colour,
        tube.fog_strength.clamp(0.0, 1.0),
    )
}

fn mix_rgb_u8(left: [u8; 3], right: [u8; 3], amount: f32) -> [u8; 3] {
    let amount = amount.clamp(0.0, 1.0);
    [
        (left[0] as f32 * (1.0 - amount) + right[0] as f32 * amount).round() as u8,
        (left[1] as f32 * (1.0 - amount) + right[1] as f32 * amount).round() as u8,
        (left[2] as f32 * (1.0 - amount) + right[2] as f32 * amount).round() as u8,
    ]
}

fn scale_rgb_u8(colour: [u8; 3], amount: f32) -> [u8; 3] {
    [
        (colour[0] as f32 * amount).round().clamp(0.0, 255.0) as u8,
        (colour[1] as f32 * amount).round().clamp(0.0, 255.0) as u8,
        (colour[2] as f32 * amount).round().clamp(0.0, 255.0) as u8,
    ]
}

fn simple_tube_ellipse_points(
    centre_x: f32,
    centre_y: f32,
    radius_x: f32,
    radius_y: f32,
    segment_count: u32,
    twist: f32,
    random_amount: f32,
    seed: i64,
) -> Vec<(f32, f32)> {
    (0..segment_count)
        .map(|index| {
            let angle = (index as f32 / segment_count as f32) * std::f32::consts::TAU + twist;
            let jitter = if random_amount.abs() <= f32::EPSILON {
                0.0
            } else {
                deterministic_signed_noise(seed, index as i64) * random_amount * 0.01
            };
            let scale = (1.0 + jitter).max(0.1);
            (
                centre_x + angle.cos() * radius_x * scale,
                centre_y + angle.sin() * radius_y * scale,
            )
        })
        .collect()
}

fn deterministic_signed_noise(seed: i64, index: i64) -> f32 {
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

fn build_generated_getcolor_dots_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "GeneratedGetColorDots media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let dots: GeneratedGetColorDotsSource =
        serde_json::from_str(&media.source).map_err(|error| {
            format!(
                "Invalid GeneratedGetColorDots media '{}': {error}",
                media.id
            )
        })?;
    validate_generated_getcolor_dots_source(&dots).map_err(|message| {
        format!(
            "Invalid GeneratedGetColorDots media '{}': {message}",
            media.id
        )
    })?;

    let foreground = parse_hex_colour_source(&dots.foreground_colour).map_err(|message| {
        format!(
            "Invalid GeneratedGetColorDots media '{}': foreground_colour {message}",
            media.id
        )
    })?;
    let secondary = parse_hex_colour_source(&dots.secondary_colour).map_err(|message| {
        format!(
            "Invalid GeneratedGetColorDots media '{}': secondary_colour {message}",
            media.id
        )
    })?;
    let background = parse_hex_colour_source(&dots.background_colour).map_err(|message| {
        format!(
            "Invalid GeneratedGetColorDots media '{}': background_colour {message}",
            media.id
        )
    })?;
    let sample_frame = if let Some(source_image) = dots.source_image.as_deref() {
        Some(load_getcolor_source_image_frame(
            source_image,
            dots.source_active_layer_ids.as_deref().unwrap_or(&[]),
            &media.id,
        )?)
    } else {
        None
    };
    let sample_strength = dots.sample_strength.unwrap_or(1.0).clamp(0.0, 1.0);
    let sample_hue_shift_degrees = dots
        .sample_hue_shift_degrees
        .unwrap_or(0.0)
        .clamp(-720.0, 720.0);

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "GeneratedGetColorDots media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "GeneratedGetColorDots media byte length overflows".to_string())?;
    let mut pixels = Vec::with_capacity(byte_len);
    for _ in 0..pixel_count {
        pixels.extend_from_slice(&[background[0], background[1], background[2], 255]);
    }

    if dots.dot_size <= 0.0 {
        return RgbaFrame::from_rgba8(media.width, media.height, pixels)
            .map_err(|error| format!("GeneratedGetColorDots media frame is invalid: {error:?}"));
    }

    let cell_width = media.width as f32 / dots.columns as f32;
    let cell_height = media.height as f32 / dots.rows as f32;
    let max_radius = (cell_width.min(cell_height) * 0.48).max(0.5);
    let base_radius = (dots.dot_size * 0.5).min(max_radius);
    let seed = dots.seed as u64;
    for row in 0..dots.rows {
        for column in 0..dots.columns {
            let index = row.saturating_mul(dots.columns).saturating_add(column);
            let u = if dots.columns > 1 {
                column as f32 / (dots.columns - 1) as f32
            } else {
                0.5
            };
            let v = if dots.rows > 1 {
                row as f32 / (dots.rows - 1) as f32
            } else {
                0.5
            };
            let random = deterministic_unit(seed, index, 11);
            let hue_wave =
                ((u + dots.hue_shift_degrees / 360.0) * std::f32::consts::TAU).sin() * 0.5 + 0.5;
            let luminance = ((u * 0.35) + ((1.0 - v) * 0.35) + (random * 0.2) + (hue_wave * 0.1))
                .clamp(0.0, 1.0);
            let radius_factor = (1.0 - dots.size_influence)
                + dots.size_influence * (0.35 + luminance * dots.luminance_influence);
            let radius = (base_radius * radius_factor).clamp(0.5, max_radius);
            let offset_x = if dots.alternate_rows && row % 2 == 1 {
                cell_width * 0.5
            } else {
                0.0
            };
            let centre_x = (column as f32 + 0.5) * cell_width + offset_x;
            if centre_x >= media.width as f32 {
                continue;
            }
            let centre_y = (row as f32 + 0.5) * cell_height;
            let colour = if luminance >= 0.55 {
                foreground
            } else {
                secondary
            };
            let (colour, alpha) = sample_getcolor_dot_colour(
                sample_frame.as_ref(),
                u,
                v,
                colour,
                255,
                sample_strength,
                sample_hue_shift_degrees,
            );
            draw_getcolor_dot_shape_rgba(
                &mut pixels,
                media.width,
                media.height,
                centre_x,
                centre_y,
                radius,
                dots.dot_shape.as_deref().unwrap_or("circle"),
                dots.stroke_width.unwrap_or(0.0),
                colour,
                background,
                alpha,
            );
        }
    }

    RgbaFrame::from_rgba8(media.width, media.height, pixels)
        .map_err(|error| format!("GeneratedGetColorDots media frame is invalid: {error:?}"))
}

fn load_getcolor_source_image_frame(
    source: &str,
    active_layer_ids: &[String],
    media_id: &str,
) -> Result<RgbaFrame, String> {
    let source_path = local_media_source_path(source, "GeneratedGetColorDots source_image")?;
    if is_psd_source(&source_path) {
        return load_getcolor_psd_source_frame(&source_path, active_layer_ids, media_id);
    }
    if is_jpeg_source(&source_path) {
        return load_rgba_jpeg(&source_path).map_err(|error| {
            format!(
                "Invalid GeneratedGetColorDots media '{media_id}': failed to load source_image JPEG: {error:?}"
            )
        });
    }

    load_rgba_png(&source_path).map_err(|error| {
        format!(
            "Invalid GeneratedGetColorDots media '{media_id}': failed to load source_image PNG: {error:?}"
        )
    })
}

fn load_getcolor_psd_source_frame(
    source_path: &str,
    active_layer_ids: &[String],
    media_id: &str,
) -> Result<RgbaFrame, String> {
    let bytes = fs::read(source_path).map_err(|error| {
        format!(
            "Invalid GeneratedGetColorDots media '{media_id}': failed to read source_image PSD: {error}"
        )
    })?;
    let psd = psd_fast::parse_psd_fast(&bytes).map_err(|error| {
        format!(
            "Invalid GeneratedGetColorDots media '{media_id}': failed to parse source_image PSD: {error}"
        )
    })?;
    psd_fast::composite_visible_psd_layers_with_active_layer_ids(&psd, active_layer_ids).map_err(
        |error| {
            format!(
                "Invalid GeneratedGetColorDots media '{media_id}': failed to composite source_image PSD: {error}"
            )
        },
    )
}

fn sample_getcolor_dot_colour(
    source: Option<&RgbaFrame>,
    u: f32,
    v: f32,
    fallback_colour: [u8; 3],
    fallback_alpha: u8,
    sample_strength: f32,
    sample_hue_shift_degrees: f32,
) -> ([u8; 3], u8) {
    let Some(source) = source else {
        return (fallback_colour, fallback_alpha);
    };
    if sample_strength <= 0.0 || source.width == 0 || source.height == 0 {
        return (fallback_colour, fallback_alpha);
    }

    let sample_x = ((source.width.saturating_sub(1)) as f32 * u.clamp(0.0, 1.0)).round() as u32;
    let sample_y = ((source.height.saturating_sub(1)) as f32 * v.clamp(0.0, 1.0)).round() as u32;
    let offset = ((sample_y as usize * source.width as usize) + sample_x as usize) * 4;
    if offset + 3 >= source.pixels.len() {
        return (fallback_colour, fallback_alpha);
    }

    let sampled = [
        source.pixels[offset],
        source.pixels[offset + 1],
        source.pixels[offset + 2],
    ];
    let sampled_alpha = source.pixels[offset + 3];
    let mix_channel = |fallback: u8, sampled: u8| -> u8 {
        ((fallback as f32 * (1.0 - sample_strength)) + (sampled as f32 * sample_strength))
            .round()
            .clamp(0.0, 255.0) as u8
    };

    let mixed_colour = [
        mix_channel(fallback_colour[0], sampled[0]),
        mix_channel(fallback_colour[1], sampled[1]),
        mix_channel(fallback_colour[2], sampled[2]),
    ];
    let colour = if sample_hue_shift_degrees.abs() > f32::EPSILON {
        shift_rgb_hue(mixed_colour, sample_hue_shift_degrees)
    } else {
        mixed_colour
    };

    (colour, mix_channel(fallback_alpha, sampled_alpha))
}

fn shift_rgb_hue(colour: [u8; 3], shift_degrees: f32) -> [u8; 3] {
    let (hue, saturation, value) = rgb8_to_hsv(colour);
    hsv_to_rgb8(hue + shift_degrees, saturation, value)
}

fn draw_getcolor_dot_shape_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius: f32,
    shape: &str,
    stroke_width: f32,
    colour: [u8; 3],
    background: [u8; 3],
    alpha: u8,
) {
    let stroke_width = stroke_width.clamp(0.0, radius);
    match shape {
        "square" => {
            draw_getcolor_square_dot_rgba(
                pixels, width, height, centre_x, centre_y, radius, colour, alpha,
            );
            if stroke_width > 0.0 && radius > stroke_width {
                draw_getcolor_square_dot_rgba(
                    pixels,
                    width,
                    height,
                    centre_x,
                    centre_y,
                    radius - stroke_width,
                    background,
                    alpha,
                );
            }
        }
        "diamond" => {
            draw_getcolor_diamond_dot_rgba(
                pixels, width, height, centre_x, centre_y, radius, colour, alpha,
            );
            if stroke_width > 0.0 && radius > stroke_width {
                draw_getcolor_diamond_dot_rgba(
                    pixels,
                    width,
                    height,
                    centre_x,
                    centre_y,
                    radius - stroke_width,
                    background,
                    alpha,
                );
            }
        }
        _ => {
            draw_filled_circle_rgba(
                pixels, width, height, centre_x, centre_y, radius, colour, alpha,
            );
            if stroke_width > 0.0 && radius > stroke_width {
                draw_filled_circle_rgba(
                    pixels,
                    width,
                    height,
                    centre_x,
                    centre_y,
                    radius - stroke_width,
                    background,
                    alpha,
                );
            }
        }
    }
}

fn draw_getcolor_square_dot_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius: f32,
    colour: [u8; 3],
    alpha: u8,
) {
    fill_rect_rgba(
        pixels,
        width,
        height,
        (centre_x - radius).floor() as i32,
        (centre_y - radius).floor() as i32,
        (centre_x + radius).ceil() as i32,
        (centre_y + radius).ceil() as i32,
        [colour[0], colour[1], colour[2], alpha],
    );
}

fn draw_getcolor_diamond_dot_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    centre_x: f32,
    centre_y: f32,
    radius: f32,
    colour: [u8; 3],
    alpha: u8,
) {
    let points = [
        (centre_x, centre_y - radius),
        (centre_x + radius, centre_y),
        (centre_x, centre_y + radius),
        (centre_x - radius, centre_y),
    ];
    fill_polygon_fan_rgba(
        pixels,
        width,
        height,
        &points,
        (centre_x, centre_y),
        colour,
        alpha,
    );
}

fn tone_curve_curve_points(points: &[f32], width: f32, height: f32) -> Vec<(f32, f32)> {
    let last_index = points.len().saturating_sub(1).max(1) as f32;
    points
        .iter()
        .enumerate()
        .map(|(index, value)| {
            let x = index as f32 * (width - 1.0) / last_index;
            let y = (1.0 - value.clamp(0.0, 1.0)) * (height - 1.0);
            (x, y)
        })
        .collect()
}

fn draw_polygon_outline_rgba(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    points: &[(f32, f32)],
    colour: [u8; 3],
    line_width: f32,
) {
    if points.len() < 2 {
        return;
    }
    for index in 0..points.len() {
        let start = points[index];
        let end = points[(index + 1) % points.len()];
        draw_line_segment_rgba(pixels, width, height, start, end, colour, line_width);
    }
}

fn fill_polygon_fan_rgba(
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

fn fill_disc_rgba(
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

fn draw_line_segment_rgba(
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

fn point_on_circle(centre_x: f32, centre_y: f32, radius: f32, angle: f32) -> (f32, f32) {
    (
        centre_x + angle.cos() * radius,
        centre_y + angle.sin() * radius,
    )
}

fn circular_arrow_angle_in_span(angle: f32, start_angle: f32, span: f32) -> bool {
    let phase = (angle - start_angle).rem_euclid(std::f32::consts::TAU);
    phase <= span
}

fn circular_arrow_head(tip: (f32, f32), tangent_angle: f32, head_size: f32) -> [(f32, f32); 3] {
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

fn point_in_triangle(x: f32, y: f32, triangle: [(f32, f32); 3]) -> bool {
    let area = triangle_edge(triangle[0], triangle[1], (x, y));
    let b = triangle_edge(triangle[1], triangle[2], (x, y));
    let c = triangle_edge(triangle[2], triangle[0], (x, y));
    (area >= 0.0 && b >= 0.0 && c >= 0.0) || (area <= 0.0 && b <= 0.0 && c <= 0.0)
}

fn triangle_edge(a: (f32, f32), b: (f32, f32), p: (f32, f32)) -> f32 {
    (p.0 - a.0) * (b.1 - a.1) - (p.1 - a.1) * (b.0 - a.0)
}

fn distance_to_point(x: f32, y: f32, point_x: f32, point_y: f32) -> f32 {
    let dx = x - point_x;
    let dy = y - point_y;
    (dx * dx + dy * dy).sqrt()
}

fn distance_to_segment(x: f32, y: f32, start: (f32, f32), end: (f32, f32)) -> f32 {
    let vx = end.0 - start.0;
    let vy = end.1 - start.1;
    let length_squared = vx * vx + vy * vy;
    if length_squared <= f32::EPSILON {
        return distance_to_point(x, y, start.0, start.1);
    }
    let t = (((x - start.0) * vx + (y - start.1) * vy) / length_squared).clamp(0.0, 1.0);
    let closest_x = start.0 + vx * t;
    let closest_y = start.1 + vy * t;
    distance_to_point(x, y, closest_x, closest_y)
}

fn fill_rect_rgba(
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

fn validate_generated_particle_source(source: &GeneratedParticleSource) -> Result<(), String> {
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

fn validate_generated_pie_chart_source(source: &GeneratedPieChartSource) -> Result<(), String> {
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

fn validate_generated_histogram_source(source: &GeneratedHistogramSource) -> Result<(), String> {
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

fn validate_generated_sunburst_source(source: &GeneratedSunburstSource) -> Result<(), String> {
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

fn validate_generated_circular_arrow_source(
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

fn validate_generated_triangle_bracket_source(
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

fn validate_generated_tartan_check_source(
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

fn validate_generated_houndstooth_source(
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

fn validate_generated_yagasuri_source(source: &GeneratedYagasuriSource) -> Result<(), String> {
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

fn validate_generated_paper_airplane_source(
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

fn validate_generated_asanoha_pattern_source(
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

fn validate_generated_focus_lines_plus_source(
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

fn validate_generated_random_line_ex_source(
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

fn validate_generated_hologram_source(source: &GeneratedHologramSource) -> Result<(), String> {
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

fn validate_generated_protractor_source(source: &GeneratedProtractorSource) -> Result<(), String> {
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

fn validate_generated_shaking_polygon_source(
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

fn validate_generated_tone_curve_source(source: &GeneratedToneCurveSource) -> Result<(), String> {
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

fn validate_generated_hksy_checker_grid_source(
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

fn validate_generated_region_frame_source(
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

fn validate_generated_simple_tube_source(source: &GeneratedSimpleTubeSource) -> Result<(), String> {
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

fn validate_generated_sphere_dots_source(source: &GeneratedSphereDotsSource) -> Result<(), String> {
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

fn validate_generated_spherical_field_source(
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

fn validate_generated_getcolor_dots_source(
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

fn rgb8_to_hsv(colour: [u8; 3]) -> (f32, f32, f32) {
    let red = colour[0] as f32 / 255.0;
    let green = colour[1] as f32 / 255.0;
    let blue = colour[2] as f32 / 255.0;
    let max = red.max(green).max(blue);
    let min = red.min(green).min(blue);
    let delta = max - min;
    let hue = if delta <= f32::EPSILON {
        0.0
    } else if (max - red).abs() <= f32::EPSILON {
        60.0 * ((green - blue) / delta).rem_euclid(6.0)
    } else if (max - green).abs() <= f32::EPSILON {
        60.0 * (((blue - red) / delta) + 2.0)
    } else {
        60.0 * (((red - green) / delta) + 4.0)
    };
    let saturation = if max <= f32::EPSILON {
        0.0
    } else {
        delta / max
    };
    (hue, saturation, max)
}

fn hsv_to_rgb8(hue_degrees: f32, saturation: f32, value: f32) -> [u8; 3] {
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

fn deterministic_unit(seed: u64, index: u32, lane: u64) -> f32 {
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

fn write_particle_pixel(
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

fn build_image_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "Image media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let frame = load_image_media_frame(media)?;
    if frame.width != media.width || frame.height != media.height {
        return Err(format!(
            "Image media '{}' dimensions {}x{} do not match decoded image {}x{}",
            media.id, media.width, media.height, frame.width, frame.height
        ));
    }

    Ok(frame)
}

fn build_psd_source_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "Psd media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let source_path = local_media_source_path(&media.source, "Psd")?;
    let bytes = fs::read(&source_path).map_err(|error| {
        format!(
            "Invalid Psd media '{}': failed to read source: {error}",
            media.id
        )
    })?;
    let psd = psd_fast::parse_psd_fast(&bytes).map_err(|error| {
        format!(
            "Invalid Psd media '{}': failed to parse PSD source: {error}",
            media.id
        )
    })?;
    if psd.width != media.width || psd.height != media.height {
        return Err(format!(
            "Psd media '{}' dimensions {}x{} do not match decoded PSD {}x{}",
            media.id, media.width, media.height, psd.width, psd.height
        ));
    }
    psd_fast::composite_visible_psd_layers_with_active_layer_ids(&psd, &media.active_layer_ids)
        .map_err(|error| {
            format!(
                "Invalid Psd media '{}': failed to composite PSD source: {error}",
                media.id
            )
        })
}

fn load_image_media_frame(media: &SceneMediaReference) -> Result<RgbaFrame, String> {
    let source_path = local_media_source_path(&media.source, "Image")?;
    if is_jpeg_source(&source_path) {
        return load_rgba_jpeg(&source_path).map_err(|error| {
            format!(
                "Invalid Image media '{}': failed to load JPEG source: {error:?}",
                media.id
            )
        });
    }

    load_rgba_png(&source_path).map_err(|error| {
        format!(
            "Invalid Image media '{}': failed to load PNG source: {error:?}",
            media.id
        )
    })
}

fn is_jpeg_source(source: &str) -> bool {
    let lower = source.to_ascii_lowercase();
    lower.ends_with(".jpg") || lower.ends_with(".jpeg")
}

fn is_psd_source(source: &str) -> bool {
    source.to_ascii_lowercase().ends_with(".psd")
}

pub(crate) fn local_media_source_path(source: &str, media_kind: &str) -> Result<String, String> {
    let without_query = strip_query_and_fragment(source);
    let Some(file_url_path) = without_query.strip_prefix("file://") else {
        if has_url_scheme(without_query) {
            return Err(format!(
                "Only local file paths or file URLs are supported for {media_kind} media, got '{source}'"
            ));
        }
        return Ok(without_query.to_string());
    };

    let local_path = if let Some(path) = file_url_path.strip_prefix("localhost/") {
        format!("/{path}")
    } else if file_url_path.starts_with('/') {
        file_url_path.to_string()
    } else {
        return Err(format!(
            "Only local file URLs are supported for {media_kind} media, got '{source}'"
        ));
    };

    percent_decode_utf8(&local_path).map_err(|error| {
        format!("Invalid percent-encoded Image media file URL '{source}': {error}")
    })
}

fn has_url_scheme(source: &str) -> bool {
    let Some(colon_index) = source.find(':') else {
        return false;
    };
    let scheme = &source[..colon_index];
    if scheme.len() == 1 && is_windows_drive_path(source) {
        return false;
    }
    let mut chars = scheme.chars();
    matches!(chars.next(), Some(first) if first.is_ascii_alphabetic())
        && chars.all(|value| value.is_ascii_alphanumeric() || matches!(value, '+' | '.' | '-'))
}

fn is_windows_drive_path(source: &str) -> bool {
    let bytes = source.as_bytes();
    bytes.len() >= 3
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
        && bytes[0].is_ascii_alphabetic()
}

fn strip_query_and_fragment(source: &str) -> &str {
    let query_index = source.find('?');
    let fragment_index = source.find('#');
    match (query_index, fragment_index) {
        (Some(query), Some(fragment)) => &source[..query.min(fragment)],
        (Some(query), None) => &source[..query],
        (None, Some(fragment)) => &source[..fragment],
        (None, None) => source,
    }
}

fn percent_decode_utf8(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("truncated percent escape".to_string());
            }
            let high =
                hex_value(bytes[index + 1]).ok_or_else(|| "invalid percent escape".to_string())?;
            let low =
                hex_value(bytes[index + 2]).ok_or_else(|| "invalid percent escape".to_string())?;
            decoded.push((high << 4) | low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }

    String::from_utf8(decoded).map_err(|error| error.to_string())
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{write::ZlibEncoder, Compression};
    use std::io::Write;

    fn write_test_rgba_png(name: &str, width: u32, height: u32, rgba: &[u8]) -> std::path::PathBuf {
        let expected_len = usize::try_from(width)
            .ok()
            .and_then(|width| {
                usize::try_from(height)
                    .ok()
                    .and_then(|height| width.checked_mul(height))
            })
            .and_then(|pixels| pixels.checked_mul(4))
            .expect("test PNG dimensions should fit usize");
        assert_eq!(rgba.len(), expected_len);

        let pid = std::process::id();
        let path = std::env::temp_dir().join(format!("{name}-{pid}.png"));
        let mut png = Vec::new();
        png.extend_from_slice(b"\x89PNG\r\n\x1a\n");

        let mut ihdr = Vec::new();
        ihdr.extend_from_slice(&width.to_be_bytes());
        ihdr.extend_from_slice(&height.to_be_bytes());
        ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
        write_png_chunk(&mut png, b"IHDR", &ihdr);

        let row_len = usize::try_from(width).expect("width should fit usize") * 4;
        let mut scanlines = Vec::with_capacity(
            (row_len + 1) * usize::try_from(height).expect("height should fit usize"),
        );
        for row in 0..usize::try_from(height).expect("height should fit usize") {
            scanlines.push(0);
            let start = row * row_len;
            scanlines.extend_from_slice(&rgba[start..start + row_len]);
        }
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder
            .write_all(&scanlines)
            .expect("test PNG scanlines should encode");
        let compressed = encoder
            .finish()
            .expect("test PNG zlib stream should finish");
        write_png_chunk(&mut png, b"IDAT", &compressed);
        write_png_chunk(&mut png, b"IEND", &[]);

        std::fs::write(&path, png).expect("test PNG should be written");
        path
    }

    fn write_png_chunk(png: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
        png.extend_from_slice(&(data.len() as u32).to_be_bytes());
        png.extend_from_slice(kind);
        png.extend_from_slice(data);
        let mut hasher = crc32fast::Hasher::new();
        hasher.update(kind);
        hasher.update(data);
        png.extend_from_slice(&hasher.finalize().to_be_bytes());
    }

    #[test]
    fn generated_barcode_source_frame_contains_background_and_bars() {
        let media = SceneMediaReference {
            id: "barcode-1".to_string(),
            kind: MediaKind::GeneratedBarcode,
            source: r##"{"generator":"barcode-t","data":"AviUtl","minimum_bar_width":2,"horizontal_margin":8,"vertical_margin":6,"foreground_colour":"#000000","background_colour":"#ffffff"}"##.to_string(),
            width: 96,
            height: 48,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_barcode_source_frame(&media)
            .expect("generated barcode frame should render");
        let has_black_bar = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 255]);
        let has_white_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 255, 255, 255]);

        assert!(has_black_bar);
        assert!(has_white_background);
    }

    #[test]
    fn generated_puzzle_piece_source_frame_contains_shape_and_transparency() {
        let media = SceneMediaReference {
            id: "puzzle-1".to_string(),
            kind: MediaKind::GeneratedPuzzlePiece,
            source: r##"{"generator":"puzzle-piece","size":48,"shape_variant":1,"connector_mode":"convex","fill_colour":"#ffffff"}"##.to_string(),
            width: 96,
            height: 96,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_puzzle_piece_source_frame(&media)
            .expect("generated puzzle piece frame should render");
        let has_white_shape = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 255, 255, 255]);
        let has_transparent_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 0]);

        assert!(has_white_shape);
        assert!(has_transparent_background);
    }

    #[test]
    fn generated_colour_wheel_source_frame_contains_hues_and_transparency() {
        let media = SceneMediaReference {
            id: "colour-wheel-1".to_string(),
            kind: MediaKind::GeneratedColourWheel,
            source: r##"{"generator":"colour-wheel","radius":48,"saturation":100,"brightness":100,"ring_width_percent":25,"segment_count":24}"##.to_string(),
            width: 96,
            height: 96,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_colour_wheel_source_frame(&media)
            .expect("generated colour wheel frame should render");
        let has_transparent_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 0]);
        let has_red = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba[0] > 220 && rgba[1] < 80 && rgba[2] < 80 && rgba[3] == 255);
        let has_blue = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba[2] > 220 && rgba[0] < 120 && rgba[1] < 120 && rgba[3] == 255);

        assert!(has_transparent_background);
        assert!(has_red);
        assert!(has_blue);
    }

    #[test]
    fn generated_gourd_source_frame_contains_shape_and_transparency() {
        let media = SceneMediaReference {
            id: "gourd-1".to_string(),
            kind: MediaKind::GeneratedGourd,
            source: r##"{"generator":"gourd-tm","body_radius":80,"body_width":250,"waist_radius":10,"squash_percent":40,"repeat_count":1,"fill_colour":"#ffffff"}"##.to_string(),
            width: 400,
            height: 400,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_gourd_source_frame(&media)
            .expect("generated gourd frame should render");
        let has_white_shape = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 255, 255, 255]);
        let has_transparent_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 0]);

        assert!(has_white_shape);
        assert!(has_transparent_background);
    }

    #[test]
    fn generated_gear_source_frame_contains_teeth_hole_and_transparency() {
        let media = SceneMediaReference {
            id: "gear-1".to_string(),
            kind: MediaKind::GeneratedGear,
            source: r##"{"generator":"gear-t","outer_radius":160,"inner_radius_percent":45,"tooth_count":20,"tooth_depth_percent":18,"tooth_skew_percent":0,"fill_colour":"#ffffff"}"##.to_string(),
            width: 320,
            height: 320,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame =
            build_generated_gear_source_frame(&media).expect("generated gear frame should render");
        let has_white_shape = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 255, 255, 255]);
        let has_transparent_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 0]);
        let centre_offset = ((160 * 320 + 160) * 4) as usize;
        let centre_is_hole = frame.pixels[centre_offset..centre_offset + 4] == [0, 0, 0, 0];

        assert!(has_white_shape);
        assert!(has_transparent_background);
        assert!(centre_is_hole);
    }

    #[test]
    fn generated_track_bar_source_frame_contains_bars_and_background() {
        let media = SceneMediaReference {
            id: "track-bar-1".to_string(),
            kind: MediaKind::GeneratedTrackBar,
            source: r##"{"generator":"custom-track-bar","track_values":[0,25,50,-50],"track_ranges":[[0,100],[0,100],[0,100],[-100,100]],"labels":["TrackA","TrackB","TrackC","TrackD"],"bar_colour":"#ffffff","background_opacity":0.05}"##.to_string(),
            width: 360,
            height: 120,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_track_bar_source_frame(&media)
            .expect("generated track bar frame should render");
        let has_solid_bar = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 255, 255, 255]);
        let has_low_alpha_background = frame.pixels.chunks_exact(4).any(|rgba| {
            rgba[0] == 255 && rgba[1] == 255 && rgba[2] == 255 && rgba[3] > 0 && rgba[3] < 32
        });
        let has_transparent_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 0]);

        assert!(has_solid_bar);
        assert!(has_low_alpha_background);
        assert!(has_transparent_background);
    }

    #[test]
    fn generated_pie_chart_source_frame_contains_slices_hole_and_transparency() {
        let media = SceneMediaReference {
            id: "pie-chart-1".to_string(),
            kind: MediaKind::GeneratedPieChart,
            source: r##"{"generator":"pie-sheet-graph","values":[10,20,30,40],"sort_mode":"descending","normalise_to_hundred":true,"label_mode":"percentage","progress_percent":100,"stroke_width":20,"slice_colours":["#389ba6","#f2e2c4","#f29422","#f27830","#f24b0f"]}"##.to_string(),
            width: 400,
            height: 400,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_pie_chart_source_frame(&media)
            .expect("generated pie chart frame should render");
        let has_first_colour = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0x38, 0x9b, 0xa6, 255]);
        let has_second_colour = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0xf2, 0xe2, 0xc4, 255]);
        let centre_offset = ((200 * 400 + 200) * 4) as usize;
        let centre_is_hole = frame.pixels[centre_offset..centre_offset + 4] == [0, 0, 0, 0];
        let has_transparent_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 0]);

        assert!(has_first_colour);
        assert!(has_second_colour);
        assert!(centre_is_hole);
        assert!(has_transparent_background);
    }

    #[test]
    fn generated_histogram_source_frame_contains_channel_bars_and_background() {
        let media = SceneMediaReference {
            id: "histogram-1".to_string(),
            kind: MediaKind::GeneratedHistogram,
            source: r##"{"generator":"simple-histogram","bin_values":[0.08,0.18,0.32,0.55,0.78,0.92,0.64,0.36],"height_scale_percent":100,"line_width":1,"show_luminance":true,"show_red":true,"show_green":true,"show_blue":true,"channel_colours":["#ffffff","#ff4b4b","#4bff6a","#4b8cff"],"background_colour":"#000000"}"##.to_string(),
            width: 256,
            height: 200,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_histogram_source_frame(&media)
            .expect("generated histogram frame should render");
        let has_luminance = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 255, 255, 255]);
        let has_red = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 75, 75, 255]);
        let has_green = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [75, 255, 106, 255]);
        let has_blue = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [75, 140, 255, 255]);
        let has_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 255]);

        assert!(has_luminance);
        assert!(has_red);
        assert!(has_green);
        assert!(has_blue);
        assert!(has_background);
    }

    #[test]
    fn generated_sunburst_source_frame_contains_rays_background_and_motif() {
        let media = SceneMediaReference {
            id: "sunburst-1".to_string(),
            kind: MediaKind::GeneratedSunburst,
            source: r##"{"generator":"sunrise","ray_count":10,"ray_coverage_percent":50,"rotation_offset_degrees":0,"centre_x_percent":50,"centre_y_percent":50,"motif_size":200,"motif_shape":"circle","ray_colour":"#ff0000","background_colour":"#ffff00"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_sunburst_source_frame(&media)
            .expect("generated sunburst frame should render");
        let has_ray = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 0, 0, 255]);
        let has_background = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [255, 255, 0, 255]);
        let centre_offset = ((225 * 800 + 400) * 4) as usize;
        let centre_is_motif = frame.pixels[centre_offset..centre_offset + 4] == [255, 0, 0, 255];

        assert!(has_ray);
        assert!(has_background);
        assert!(centre_is_motif);
    }

    #[test]
    fn generated_circular_arrow_source_frame_contains_arc_head_and_transparency() {
        let media = SceneMediaReference {
            id: "circular-arrow-1".to_string(),
            kind: MediaKind::GeneratedCircularArrow,
            source: r##"{"generator":"circular-arrow","radius":80,"line_width":16,"head_size":40,"angle_degrees":260,"centre_angle_degrees":0,"head_shape":"triangle","show_tail_head":false,"flip_vertical":false,"flip_horizontal":false,"arrow_colour":"#ffff00"}"##.to_string(),
            width: 200,
            height: 200,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_circular_arrow_source_frame(&media)
            .expect("generated circular arrow frame should render");
        let yellow_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 0, 255])
            .count();
        let transparent_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();

        assert!(yellow_count > 500);
        assert!(transparent_count > 10_000);
    }

    #[test]
    fn generated_triangle_bracket_source_frame_contains_arms_and_transparency() {
        let media = SceneMediaReference {
            id: "triangle-bracket-1".to_string(),
            kind: MediaKind::GeneratedTriangleBracket,
            source: r##"{"generator":"triangle-bracket","bracket_width":100,"angle_degrees":120,"arm_length":50,"offset_distance":0,"bracket_colour":"#ffffff"}"##.to_string(),
            width: 160,
            height: 100,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_triangle_bracket_source_frame(&media)
            .expect("generated triangle bracket frame should render");
        let white_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let transparent_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();

        assert!(white_count > 300);
        assert!(transparent_count > 10_000);
    }

    #[test]
    fn generated_tartan_check_source_frame_contains_all_pattern_colours() {
        let media = SceneMediaReference {
            id: "tartan-check-1".to_string(),
            kind: MediaKind::GeneratedTartanCheck,
            source: r##"{"generator":"tartan-check","tile_size":100,"blur_radius":1,"base_colour":"#143e10","stripe_colour_a":"#a81616","stripe_colour_b":"#c9c526","line_colour":"#000000"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_tartan_check_source_frame(&media)
            .expect("generated tartan check frame should render");
        let has_base = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0x14, 0x3e, 0x10, 255]);
        let has_stripe_a = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0xa8, 0x16, 0x16, 255]);
        let has_line = frame
            .pixels
            .chunks_exact(4)
            .any(|rgba| rgba == [0, 0, 0, 255]);
        let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

        assert!(has_base);
        assert!(has_stripe_a);
        assert!(has_line);
        assert!(fully_opaque);
    }

    #[test]
    fn generated_houndstooth_source_frame_contains_foreground_background_and_opacity() {
        let media = SceneMediaReference {
            id: "houndstooth-1".to_string(),
            kind: MediaKind::GeneratedHoundstooth,
            source: r##"{"generator":"houndstooth","pattern_size":50,"foreground_colour":"#000000","background_colour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_houndstooth_source_frame(&media)
            .expect("generated houndstooth frame should render");
        let foreground_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [0, 0, 0, 255])
            .count();
        let background_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

        assert!(foreground_count > 100_000);
        assert!(background_count > 100_000);
        assert!(fully_opaque);
    }

    #[test]
    fn generated_yagasuri_source_frame_contains_arrow_pattern_and_opacity() {
        let media = SceneMediaReference {
            id: "yagasuri-1".to_string(),
            kind: MediaKind::GeneratedYagasuri,
            source: r##"{"generator":"yagasuri","arrow_width":15,"arrow_height":65,"line_width":2,"staggered":true,"foreground_colour":"#000000","background_colour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_yagasuri_source_frame(&media)
            .expect("generated yagasuri frame should render");
        let foreground_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [0, 0, 0, 255])
            .count();
        let background_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

        assert!(foreground_count > 80_000);
        assert!(background_count > 120_000);
        assert!(fully_opaque);
    }

    #[test]
    fn generated_paper_airplane_source_frame_contains_wings_shadow_and_transparency() {
        let media = SceneMediaReference {
            id: "paper-airplane-1".to_string(),
            kind: MediaKind::GeneratedPaperAirplane,
            source: r##"{"generator":"paper-airplane","body_length":200,"wing_width":80,"fold_height":50,"gap":50,"follow_motion_direction":false,"axis_mode":0,"fill_colour":"#ffffff"}"##.to_string(),
            width: 320,
            height: 240,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_paper_airplane_source_frame(&media)
            .expect("generated paper airplane frame should render");
        let white_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let shadow_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [184, 184, 184, 255])
            .count();
        let transparent_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();

        assert!(white_count > 5_000);
        assert!(shadow_count > 500);
        assert!(transparent_count > 40_000);
    }

    #[test]
    fn generated_asanoha_pattern_source_frame_contains_foreground_background_and_opacity() {
        let media = SceneMediaReference {
            id: "asanoha-pattern-1".to_string(),
            kind: MediaKind::GeneratedAsanohaPattern,
            source: r##"{"generator":"asanoha-pattern","pattern_size":50,"line_width":2,"foreground_colour":"#000000","background_colour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_asanoha_pattern_source_frame(&media)
            .expect("generated asanoha pattern frame should render");
        let foreground_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [0, 0, 0, 255])
            .count();
        let background_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

        assert!(foreground_count > 5_000);
        assert!(background_count > 100_000);
        assert!(fully_opaque);
    }

    #[test]
    fn generated_focus_lines_plus_source_frame_contains_rays_and_centre_hole() {
        let media = SceneMediaReference {
            id: "focus-lines-plus-1".to_string(),
            kind: MediaKind::GeneratedFocusLinesPlus,
            source: r##"{"generator":"focus-lines-plus","ray_width":1,"gap":5,"centre_radius":100,"rotation_degrees":0,"centre_x":400,"centre_y":225,"centre_jitter_percent":20,"seed":0,"keyframe_interval":0,"line_colour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_focus_lines_plus_source_frame(&media, 0)
            .expect("generated focus lines plus frame should render");
        let white_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let transparent_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();
        let centre_offset = (225_usize * 800 + 400) * 4;
        let centre_is_transparent = frame.pixels[centre_offset + 3] == 0;

        assert!(white_count > 5_000);
        assert!(transparent_count > 150_000);
        assert!(centre_is_transparent);
    }

    #[test]
    fn generated_random_line_ex_source_frame_contains_noisy_lines_and_transparency() {
        let media = SceneMediaReference {
            id: "random-line-ex-1".to_string(),
            kind: MediaKind::GeneratedRandomLineEx,
            source: r##"{"generator":"random-line-ex","line_count":3,"line_width":6,"threshold":128,"noise_cell_size":12,"width_variance":0,"seed":0,"line_colour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_random_line_ex_source_frame(&media)
            .expect("generated random line EX frame should render");
        let white_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let transparent_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();

        assert!(white_count > 1_000);
        assert!(transparent_count > 250_000);
    }

    #[test]
    fn generated_hologram_source_frame_contains_prism_stripes_and_opacity() {
        let media = SceneMediaReference {
            id: "hologram-1".to_string(),
            kind: MediaKind::GeneratedHologram,
            source: r##"{"generator":"hologram","tile_size":80,"rotation_degrees":0,"gradient_angle_degrees":-60,"colour_mode":1,"tint_colour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_hologram_source_frame(&media)
            .expect("generated hologram frame should render");
        let opaque_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 255)
            .count();
        let bright_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[0] > 210 && rgba[1] > 210 && rgba[2] > 210 && rgba[3] == 255)
            .count();
        let shadow_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[0] < 80 && rgba[1] < 85 && rgba[2] < 95 && rgba[3] == 255)
            .count();
        let coloured_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| {
                rgba[3] == 255
                    && ((rgba[0] as i16 - rgba[1] as i16).abs() > 30
                        || (rgba[1] as i16 - rgba[2] as i16).abs() > 30)
            })
            .count();

        assert_eq!(opaque_count, 800 * 450);
        assert!(bright_count > 15_000);
        assert!(shadow_count > 10_000);
        assert!(coloured_count > 40_000);
    }

    #[test]
    fn generated_protractor_source_frame_contains_ticks_angle_line_and_transparency() {
        let media = SceneMediaReference {
            id: "protractor-1".to_string(),
            kind: MediaKind::GeneratedProtractor,
            source: r##"{"generator":"protractor","radius":180,"measured_angle_degrees":90,"tick_step_degrees":10,"major_tick_step_degrees":30,"decimal_places":1,"line_colour":"#ffffff","text_colour":"#ffffff","shadow_colour":"#000000"}"##.to_string(),
            width: 420,
            height: 240,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_protractor_source_frame(&media)
            .expect("generated protractor frame should render");
        let white_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let shadow_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [0, 0, 0, 255])
            .count();
        let transparent_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();
        let centre_offset = (216_usize * 420 + 210) * 4;
        let ninety_degree_line_offset = (80_usize * 420 + 210) * 4;

        assert!(white_count > 2_000);
        assert!(shadow_count > 100);
        assert!(transparent_count > 90_000);
        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            &[255, 255, 255, 255]
        );
        assert_eq!(
            &frame.pixels[ninety_degree_line_offset..ninety_degree_line_offset + 4],
            &[255, 255, 255, 255]
        );
    }

    #[test]
    fn generated_shaking_polygon_source_frame_contains_jittered_outline_and_transparency() {
        let media = SceneMediaReference {
            id: "shaking-polygon-1".to_string(),
            kind: MediaKind::GeneratedShakingPolygon,
            source: r##"{"generator":"shaking-polygon","line_width":20,"vertex_count":3,"fixed_diameter":260,"vertical_distortion_percent":0,"repeat_count":1,"repeat_frequency":1,"fill":false,"jitter_range":20,"jitter_interval":10,"stepped":false,"colour":"#ffffff","seed":0}"##.to_string(),
            width: 360,
            height: 360,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame_a = build_generated_shaking_polygon_source_frame(&media, 0)
            .expect("generated shaking polygon frame should render");
        let frame_b = build_generated_shaking_polygon_source_frame(&media, 60)
            .expect("generated shaking polygon frame should render at a later frame");
        let white_count = frame_a
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let transparent_count = frame_a
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();
        let changed_bytes = frame_a
            .pixels
            .iter()
            .zip(frame_b.pixels.iter())
            .filter(|(left, right)| left != right)
            .count();

        assert!(white_count > 8_000);
        assert!(transparent_count > 90_000);
        assert!(changed_bytes > 2_000);
    }

    #[test]
    fn generated_tone_curve_source_frame_contains_grid_and_curve() {
        let media = SceneMediaReference {
            id: "tone-curve-1".to_string(),
            kind: MediaKind::GeneratedToneCurve,
            source: r##"{"generator":"simple-tone-curve","grid_divisions":4,"line_width":3,"curve_points":[0,0.16,0.42,0.7,1],"curve_colour":"#ffffff","grid_colour":"#333333","background_colour":"#000000"}"##.to_string(),
            width: 360,
            height: 360,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_tone_curve_source_frame(&media)
            .expect("generated tone curve frame should render");
        let white_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let grid_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [51, 51, 51, 255])
            .count();
        let background_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [0, 0, 0, 255])
            .count();

        assert!(white_count > 1_000);
        assert!(grid_count > 2_000);
        assert!(background_count > 100_000);
    }

    #[test]
    fn generated_hksy_checker_grid_source_frame_contains_checker_cells_and_grid() {
        let media = SceneMediaReference {
            id: "hksy-checker-grid-1".to_string(),
            kind: MediaKind::GeneratedHksyCheckerGrid,
            source: r##"{"generator":"hksy-checker-grid","cell_size":50,"line_width":2,"checker_enabled":true,"grid_enabled":true,"foreground_colour":"#ffffff","secondary_colour":"#333333","background_colour":"#000000"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_hksy_checker_grid_source_frame(&media)
            .expect("generated hksy checker grid frame should render");
        let foreground_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let grid_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [51, 51, 51, 255])
            .count();
        let background_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [0, 0, 0, 255])
            .count();
        let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

        assert!(foreground_count > 120_000);
        assert!(grid_count > 15_000);
        assert!(background_count > 120_000);
        assert!(fully_opaque);
    }

    #[test]
    fn generated_hksy_checker_grid_source_frame_uses_palette_colours_for_checker_tiles() {
        let media = SceneMediaReference {
            id: "hksy-multi-colour-checker-1".to_string(),
            kind: MediaKind::GeneratedHksyCheckerGrid,
            source: r##"{"generator":"hksy-checker-grid","cell_size":20,"line_width":0,"checker_enabled":true,"grid_enabled":false,"foreground_colour":"#ff5c8a","secondary_colour":"#36c2ff","background_colour":"#111111","palette_colours":["#ff5c8a","#36c2ff","#ffd166","#70e000"]}"##.to_string(),
            width: 120,
            height: 80,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_hksy_checker_grid_source_frame(&media)
            .expect("generated hksy multi-colour checker frame should render");
        let pink_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 92, 138, 255])
            .count();
        let blue_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [54, 194, 255, 255])
            .count();
        let yellow_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 209, 102, 255])
            .count();
        let green_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [112, 224, 0, 255])
            .count();

        assert!(pink_count > 0);
        assert!(blue_count > 0);
        assert!(yellow_count > 0);
        assert!(green_count > 0);
    }

    #[test]
    fn generated_hksy_checker_grid_source_frame_renders_diamond_pattern_with_transparency() {
        let media = SceneMediaReference {
            id: "hksy-diamond-1".to_string(),
            kind: MediaKind::GeneratedHksyCheckerGrid,
            source: r##"{"generator":"hksy-checker-grid","pattern":"diamond","cell_size":64,"line_width":96,"checker_enabled":false,"grid_enabled":false,"foreground_colour":"#ffffff","secondary_colour":"#ffffff","background_colour":"#000000"}"##.to_string(),
            width: 480,
            height: 360,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_hksy_checker_grid_source_frame(&media)
            .expect("generated hksy diamond frame should render");
        let white_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let transparent_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();
        let centre_offset =
            ((media.height as usize / 2) * media.width as usize + (media.width as usize / 2)) * 4;
        let centre_pixel = &frame.pixels[centre_offset..centre_offset + 4];

        assert!(white_count > 20_000);
        assert!(transparent_count > 40_000);
        assert_eq!(centre_pixel, [0, 0, 0, 0]);
    }

    #[test]
    fn generated_hksy_checker_grid_source_frame_renders_measured_grid_lines() {
        let media = SceneMediaReference {
            id: "hksy-measured-grid-1".to_string(),
            kind: MediaKind::GeneratedHksyCheckerGrid,
            source: r##"{"generator":"hksy-checker-grid","pattern":"measured-grid","cell_size":32,"line_width":1,"checker_enabled":false,"grid_enabled":true,"foreground_colour":"#ffffff","secondary_colour":"#bbeeff","background_colour":"#10131a","separate_interval":5,"separate_line_width":3}"##.to_string(),
            width: 320,
            height: 240,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_hksy_checker_grid_source_frame(&media)
            .expect("generated hksy measured grid frame should render");
        let base_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [16, 19, 26, 255])
            .count();
        let line_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [187, 238, 255, 255])
            .count();
        let separate_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();

        assert!(base_count > 60_000);
        assert!(line_count > 1_000);
        assert!(separate_count > 1_000);
    }

    #[test]
    fn generated_hksy_checker_grid_source_frame_renders_anchor_line_pattern() {
        let media = SceneMediaReference {
            id: "hksy-anchor-line-1".to_string(),
            kind: MediaKind::GeneratedHksyCheckerGrid,
            source: r##"{"generator":"hksy-checker-grid","pattern":"anchor-line","cell_size":64,"line_width":20,"checker_enabled":false,"grid_enabled":false,"foreground_colour":"#ffffff","secondary_colour":"#ffffff","background_colour":"#000000","anchor_points":[{"x":-88,"y":50},{"x":0,"y":-100},{"x":88,"y":50}],"round_caps":true,"max_join_distance":50}"##.to_string(),
            width: 480,
            height: 360,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_hksy_checker_grid_source_frame(&media)
            .expect("generated hksy anchor line frame should render");
        let white_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let transparent_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| rgba[3] == 0)
            .count();
        let apex_offset = ((80_usize * media.width as usize) + 240_usize) * 4;
        let apex_pixel = &frame.pixels[apex_offset..apex_offset + 4];

        assert!(white_count > 6_000);
        assert!(transparent_count > 140_000);
        assert_eq!(apex_pixel, [255, 255, 255, 255]);
    }

    #[test]
    fn generated_getcolor_dots_source_frame_contains_dot_field_and_background() {
        let media = SceneMediaReference {
            id: "getcolor-dot-field-1".to_string(),
            kind: MediaKind::GeneratedGetColorDots,
            source: r##"{"generator":"getcolor-v2r-dot-field","columns":32,"rows":18,"dot_size":14,"size_influence":0.65,"luminance_influence":0.7,"hue_shift_degrees":0,"alternate_rows":true,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_getcolor_dots_source_frame(&media)
            .expect("generated GetColor dot field frame should render");
        let foreground_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [255, 255, 255, 255])
            .count();
        let secondary_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [54, 194, 255, 255])
            .count();
        let background_count = frame
            .pixels
            .chunks_exact(4)
            .filter(|rgba| *rgba == [0, 0, 0, 255])
            .count();
        let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

        assert!(foreground_count > 10_000);
        assert!(secondary_count > 10_000);
        assert!(background_count > 180_000);
        assert!(fully_opaque);
    }

    #[test]
    fn generated_getcolor_dots_source_frame_renders_diamond_dot_shape() {
        let media = SceneMediaReference {
            id: "getcolor-diamond-dot-field-1".to_string(),
            kind: MediaKind::GeneratedGetColorDots,
            source: r##"{"generator":"getcolor-v2r-dot-field","columns":1,"rows":1,"dot_size":40,"size_influence":0,"luminance_influence":0,"hue_shift_degrees":0,"alternate_rows":false,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93,"dot_shape":"diamond","stroke_width":0}"##.to_string(),
            width: 100,
            height: 100,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_getcolor_dots_source_frame(&media)
            .expect("generated GetColor diamond dot frame should render");
        let centre_offset = ((50_usize * media.width as usize) + 50_usize) * 4;
        let circle_only_corner_offset = ((63_usize * media.width as usize) + 63_usize) * 4;

        assert_ne!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [0, 0, 0, 255]
        );
        assert_eq!(
            &frame.pixels[circle_only_corner_offset..circle_only_corner_offset + 4],
            [0, 0, 0, 255]
        );
    }

    #[test]
    fn generated_getcolor_dots_source_frame_renders_outlined_square_dot_shape() {
        let media = SceneMediaReference {
            id: "getcolor-outlined-square-dot-field-1".to_string(),
            kind: MediaKind::GeneratedGetColorDots,
            source: r##"{"generator":"getcolor-v2r-dot-field","columns":1,"rows":1,"dot_size":40,"size_influence":0,"luminance_influence":0,"hue_shift_degrees":0,"alternate_rows":false,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93,"dot_shape":"square","stroke_width":8}"##.to_string(),
            width: 100,
            height: 100,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_getcolor_dots_source_frame(&media)
            .expect("generated GetColor outlined square dot frame should render");
        let centre_offset = ((50_usize * media.width as usize) + 50_usize) * 4;
        let edge_offset = ((35_usize * media.width as usize) + 50_usize) * 4;

        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [0, 0, 0, 255]
        );
        assert_ne!(&frame.pixels[edge_offset..edge_offset + 4], [0, 0, 0, 255]);
    }

    #[test]
    fn generated_getcolor_dots_source_frame_samples_source_image_colour_and_alpha() {
        let source_path = write_test_rgba_png(
            "uxfd-getcolor-sampled-source",
            2,
            1,
            &[255, 0, 0, 255, 0, 64, 255, 128],
        );
        let source = format!(
            r##"{{"generator":"getcolor-v2r-dot-field","columns":2,"rows":1,"dot_size":36,"size_influence":0,"luminance_influence":0,"hue_shift_degrees":0,"alternate_rows":false,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93,"dot_shape":"circle","stroke_width":0,"source_image":"{}","sample_strength":1}}"##,
            source_path.to_string_lossy()
        );
        let media = SceneMediaReference {
            id: "getcolor-sampled-dot-field-1".to_string(),
            kind: MediaKind::GeneratedGetColorDots,
            source,
            width: 120,
            height: 60,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_getcolor_dots_source_frame(&media)
            .expect("generated GetColor sampled dot frame should render");
        let left_centre_offset = ((30_usize * media.width as usize) + 30_usize) * 4;
        let right_centre_offset = ((30_usize * media.width as usize) + 90_usize) * 4;

        assert_eq!(
            &frame.pixels[left_centre_offset..left_centre_offset + 4],
            [255, 0, 0, 255]
        );
        assert_eq!(
            &frame.pixels[right_centre_offset..right_centre_offset + 4],
            [0, 64, 255, 128]
        );

        let _ = std::fs::remove_file(source_path);
    }

    #[test]
    fn generated_getcolor_dots_source_frame_applies_sample_hue_shift() {
        let source_path = write_test_rgba_png(
            "uxfd-getcolor-sampled-hue-shift-source",
            1,
            1,
            &[255, 0, 0, 255],
        );
        let source = format!(
            r##"{{"generator":"getcolor-v2r-dot-field","columns":1,"rows":1,"dot_size":36,"size_influence":0,"luminance_influence":0,"hue_shift_degrees":0,"alternate_rows":false,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93,"dot_shape":"circle","stroke_width":0,"source_image":"{}","sample_strength":1,"sample_hue_shift_degrees":120}}"##,
            source_path.to_string_lossy()
        );
        let media = SceneMediaReference {
            id: "getcolor-sampled-hue-shift-dot-field-1".to_string(),
            kind: MediaKind::GeneratedGetColorDots,
            source,
            width: 60,
            height: 60,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_getcolor_dots_source_frame(&media)
            .expect("generated GetColor sampled hue shift frame should render");
        let centre_offset = ((30_usize * media.width as usize) + 30_usize) * 4;

        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [0, 255, 0, 255]
        );

        let _ = std::fs::remove_file(source_path);
    }

    #[test]
    fn generated_getcolor_dots_source_accepts_psd_source_with_active_layer_ids() {
        let source = GeneratedGetColorDotsSource {
            generator: "getcolor-v2r-dot-field".to_string(),
            columns: 2,
            rows: 1,
            dot_size: 36.0,
            dot_shape: Some("circle".to_string()),
            stroke_width: Some(0.0),
            size_influence: 0.0,
            luminance_influence: 0.0,
            hue_shift_degrees: 0.0,
            alternate_rows: false,
            foreground_colour: "#ffffff".to_string(),
            secondary_colour: "#36c2ff".to_string(),
            background_colour: "#000000".to_string(),
            source_image: Some("file:///tmp/standing-source.psd".to_string()),
            source_active_layer_ids: Some(vec![
                "eye-open".to_string(),
                "mouth-open".to_string(),
                "root".to_string(),
            ]),
            sample_strength: Some(0.75),
            sample_hue_shift_degrees: None,
            seed: 93,
        };

        validate_generated_getcolor_dots_source(&source)
            .expect("GetColor PSD sample source should validate");
    }

    #[test]
    fn generated_region_frame_source_frame_renders_border_and_background() {
        let media = SceneMediaReference {
            id: "region-frame-1".to_string(),
            kind: MediaKind::GeneratedRegionFrame,
            source: r##"{"generator":"region-frame-93","line_width":10,"shape":"rectangle","extra_width":0,"extra_height":0,"background_opacity":0.2,"frame_colour":"#ffffff","background_colour":"#ccccff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_region_frame_source_frame(&media)
            .expect("generated region frame should render");
        let top_border_offset = ((4_usize * media.width as usize) + 400_usize) * 4;
        let centre_offset = ((225_usize * media.width as usize) + 400_usize) * 4;

        assert_eq!(
            &frame.pixels[top_border_offset..top_border_offset + 4],
            [255, 255, 255, 255]
        );
        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [204, 204, 255, 51]
        );
    }

    #[test]
    fn generated_region_frame_source_frame_renders_ellipse_variant_with_transparent_corners() {
        let media = SceneMediaReference {
            id: "ellipse-region-frame-1".to_string(),
            kind: MediaKind::GeneratedRegionFrame,
            source: r##"{"generator":"region-frame-93","line_width":10,"shape":"ellipse","extra_width":0,"extra_height":0,"background_opacity":0.2,"frame_colour":"#ffffff","background_colour":"#ccccff"}"##.to_string(),
            width: 200,
            height: 120,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_region_frame_source_frame(&media)
            .expect("generated ellipse region frame should render");
        let corner_offset = 0_usize;
        let top_border_offset = ((1_usize * media.width as usize) + 100_usize) * 4;
        let centre_offset = ((60_usize * media.width as usize) + 100_usize) * 4;

        assert_eq!(
            &frame.pixels[corner_offset..corner_offset + 4],
            [0, 0, 0, 0]
        );
        assert_eq!(
            &frame.pixels[top_border_offset..top_border_offset + 4],
            [255, 255, 255, 255]
        );
        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [204, 204, 255, 51]
        );
    }

    #[test]
    fn generated_region_frame_source_frame_renders_cut_corner_variant() {
        let media = SceneMediaReference {
            id: "cut-region-frame-1".to_string(),
            kind: MediaKind::GeneratedRegionFrame,
            source: r##"{"generator":"region-frame-93","line_width":8,"shape":"cut_corner","corner_cut":24,"extra_width":0,"extra_height":0,"background_opacity":0.2,"frame_colour":"#ffffff","background_colour":"#ccccff"}"##.to_string(),
            width: 200,
            height: 120,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_region_frame_source_frame(&media)
            .expect("generated cut-corner region frame should render");
        let corner_offset = 0_usize;
        let top_border_offset = ((1_usize * media.width as usize) + 100_usize) * 4;
        let centre_offset = ((60_usize * media.width as usize) + 100_usize) * 4;

        assert_eq!(
            &frame.pixels[corner_offset..corner_offset + 4],
            [0, 0, 0, 0]
        );
        assert_eq!(
            &frame.pixels[top_border_offset..top_border_offset + 4],
            [255, 255, 255, 255]
        );
        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [204, 204, 255, 51]
        );
    }

    #[test]
    fn generated_simple_tube_source_frame_renders_tube_lines() {
        let media = SceneMediaReference {
            id: "simple-tube-1".to_string(),
            kind: MediaKind::GeneratedSimpleTube,
            source: r##"{"generator":"simple-tube-93","radius":150,"depth":280,"segments":16,"rings":10,"twist_degrees":0,"random_amount":0,"stroke_width":3,"colour":"#0e769f","secondary_colour":"#ffffff","seed":93,"torus":false}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_simple_tube_source_frame(&media)
            .expect("generated SimpleTube frame should render");
        let centre_line_offset = ((225_usize * media.width as usize) + 400_usize) * 4;
        let edge_line_offset = ((225_usize * media.width as usize) + 260_usize) * 4;
        let empty_corner_offset = 0_usize;

        assert_eq!(
            &frame.pixels[centre_line_offset..centre_line_offset + 4],
            [255, 255, 255, 255]
        );
        assert_eq!(
            &frame.pixels[edge_line_offset..edge_line_offset + 4],
            [14, 118, 159, 255]
        );
        assert_eq!(
            &frame.pixels[empty_corner_offset..empty_corner_offset + 4],
            [0, 0, 0, 0]
        );
    }

    #[test]
    fn generated_simple_tube_source_frame_renders_torus_with_fogged_ring_pattern() {
        let media = SceneMediaReference {
            id: "simple-tube-torus-1".to_string(),
            kind: MediaKind::GeneratedSimpleTube,
            source: r##"{"generator":"simple-tube-93","radius":170,"depth":260,"segments":24,"rings":16,"twist_degrees":120,"random_amount":0,"stroke_width":3,"colour":"#0e769f","secondary_colour":"#f9f9f9","colour_pattern":"ring","fog_strength":0.35,"fog_colour":"#ffffff","seed":93,"torus":true}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_simple_tube_source_frame(&media)
            .expect("generated SimpleTube torus frame should render");
        let centre_offset = ((225_usize * media.width as usize) + 400_usize) * 4;
        let right_ring_offset = ((225_usize * media.width as usize) + 553_usize) * 4;
        let empty_corner_offset = 0_usize;

        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [251, 251, 251, 255]
        );
        assert_ne!(
            &frame.pixels[right_ring_offset..right_ring_offset + 4],
            [14, 118, 159, 255]
        );
        assert_eq!(
            &frame.pixels[empty_corner_offset..empty_corner_offset + 4],
            [0, 0, 0, 0]
        );
    }

    #[test]
    fn generated_sphere_dots_source_frame_renders_equator_points() {
        let media = SceneMediaReference {
            id: "sphere-dots-1".to_string(),
            kind: MediaKind::GeneratedSphereDots,
            source: r##"{"generator":"sphere-drawpixel-93","radius":170,"columns":16,"rows":11,"rotation_degrees":0,"offset_degrees":0,"luminance_influence":0,"point_size":6,"latitude_line_width":2,"colour":"#ffffff","secondary_colour":"#36c2ff","seed":93,"plane_mode":false}"##.to_string(),
            width: 480,
            height: 480,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_sphere_dots_source_frame(&media)
            .expect("generated Sphere(DrawPixel) frame should render");
        let right_equator_offset = ((240_usize * media.width as usize) + 410_usize) * 4;
        let centre_offset = ((240_usize * media.width as usize) + 240_usize) * 4;
        let empty_corner_offset = 0_usize;

        assert_eq!(
            &frame.pixels[right_equator_offset..right_equator_offset + 4],
            [255, 255, 255, 255]
        );
        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [54, 194, 255, 255]
        );
        assert_eq!(
            &frame.pixels[empty_corner_offset..empty_corner_offset + 4],
            [0, 0, 0, 0]
        );
    }

    #[test]
    fn generated_spherical_field_source_frame_renders_force_ring() {
        let media = SceneMediaReference {
            id: "spherical-field-1".to_string(),
            kind: MediaKind::GeneratedSphericalField,
            source: r##"{"generator":"spherical-field-93","radius":160,"strength":100,"colour_amount":100,"alpha_amount":0,"line_width":3,"ring_count":4,"vector_count":16,"field_colour":"#ff3b30","secondary_colour":"#36c2ff","background_opacity":0.08,"container":false,"seed":93}"##.to_string(),
            width: 480,
            height: 480,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_generated_spherical_field_source_frame(&media)
            .expect("generated SphericalField frame should render");
        let right_ring_offset = ((240_usize * media.width as usize) + 400_usize) * 4;
        let centre_offset = ((240_usize * media.width as usize) + 240_usize) * 4;
        let empty_corner_offset = 0_usize;

        assert_eq!(
            &frame.pixels[right_ring_offset..right_ring_offset + 4],
            [255, 59, 48, 255]
        );
        assert_eq!(
            &frame.pixels[centre_offset..centre_offset + 4],
            [54, 194, 255, 255]
        );
        assert_eq!(
            &frame.pixels[empty_corner_offset..empty_corner_offset + 4],
            [0, 0, 0, 0]
        );
    }
}
