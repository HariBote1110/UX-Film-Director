use crate::generated::*;
#[cfg(unix)]
use crate::native_shared::read_native_render_source_frame;
use crate::params::NativeRenderSharedFrameSource;
use crate::psd_fast;
use std::collections::HashMap;
use std::fs;
use uxfd_golden_harness::{load_rgba_jpeg, load_rgba_png, RgbaFrame};
use uxfd_rust_core::{MediaKind, SceneMediaReference, SceneSnapshot};

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
            MediaKind::GeneratedContourTrace => build_generated_contour_trace_source_frame(media)?,
            MediaKind::GeneratedDisplacementPoly => {
                build_generated_displacement_poly_source_frame(media)?
            }
            MediaKind::GeneratedPlainEffectorLine => {
                build_generated_plain_effector_line_source_frame(media)?
            }
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

pub(crate) fn is_jpeg_source(source: &str) -> bool {
    let lower = source.to_ascii_lowercase();
    lower.ends_with(".jpg") || lower.ends_with(".jpeg")
}

pub(crate) fn is_psd_source(source: &str) -> bool {
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
