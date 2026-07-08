use crate::generated::*;
#[cfg(unix)]
use crate::native_shared::read_native_render_source_frame;
use crate::params::NativeRenderSharedFrameSource;
use crate::psd_fast;
use crate::state::{SourceFrameCache, SourceFrameCacheKey};
use std::collections::HashMap;
use std::fs;
use std::sync::Arc;
use uxfd_golden_harness::{load_rgba_jpeg, load_rgba_png, RgbaFrame};
use uxfd_rust_core::{MediaKind, SceneMediaReference, SceneSnapshot};

#[cfg(unix)]
pub(crate) fn collect_native_render_sources(
    snapshot: &SceneSnapshot,
    media_items: &[SceneMediaReference],
    shared_sources: &[NativeRenderSharedFrameSource],
    source_frame_cache: &mut SourceFrameCache,
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
            MediaKind::GeneratedShatteredSphere => build_generated_shattered_sphere_source_frame(
                media,
                source_frame_for_media(snapshot, &media.id),
            )?,
            MediaKind::GeneratedShape => build_generated_shape_source_frame(media)?,
            MediaKind::Image => build_image_source_frame(media, source_frame_cache)?,
            MediaKind::Psd => build_psd_source_frame(media, source_frame_cache)?,
            MediaKind::Text => build_generated_text_source_frame(media)?,
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

fn build_image_source_frame(
    media: &SceneMediaReference,
    source_frame_cache: &mut SourceFrameCache,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "Image media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let source_path = local_media_source_path(&media.source, "Image")?;
    let cache_key = build_source_frame_cache_key(&source_path, &[], media.width, media.height)?;
    let frame = if let Some(cached) = source_frame_cache.get(&cache_key) {
        cached
    } else {
        let decoded = Arc::new(load_image_media_frame(media, &source_path)?);
        source_frame_cache.insert(cache_key, Arc::clone(&decoded));
        decoded
    };
    if frame.width != media.width || frame.height != media.height {
        return Err(format!(
            "Image media '{}' dimensions {}x{} do not match decoded image {}x{}",
            media.id, media.width, media.height, frame.width, frame.height
        ));
    }

    Ok((*frame).clone())
}

fn build_psd_source_frame(
    media: &SceneMediaReference,
    source_frame_cache: &mut SourceFrameCache,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "Psd media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }
    let source_path = local_media_source_path(&media.source, "Psd")?;
    let cache_key = build_source_frame_cache_key(
        &source_path,
        &media.active_layer_ids,
        media.width,
        media.height,
    )?;
    let frame = if let Some(cached) = source_frame_cache.get(&cache_key) {
        cached
    } else {
        let decoded = Arc::new(decode_psd_source_frame(media, &source_path)?);
        source_frame_cache.insert(cache_key, Arc::clone(&decoded));
        decoded
    };
    if frame.width != media.width || frame.height != media.height {
        return Err(format!(
            "Psd media '{}' dimensions {}x{} do not match decoded PSD {}x{}",
            media.id, media.width, media.height, frame.width, frame.height
        ));
    }

    Ok((*frame).clone())
}

fn decode_psd_source_frame(
    media: &SceneMediaReference,
    source_path: &str,
) -> Result<RgbaFrame, String> {
    let bytes = fs::read(source_path).map_err(|error| {
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

/// Builds a cache key from the source file's current mtime and size (plus
/// active layer selection and expected dimensions), so that any change to
/// the underlying file or request invalidates the cached decode.
fn build_source_frame_cache_key(
    source_path: &str,
    active_layer_ids: &[String],
    expected_width: u32,
    expected_height: u32,
) -> Result<SourceFrameCacheKey, String> {
    let metadata = fs::metadata(source_path).map_err(|error| {
        format!("Failed to read metadata for source '{source_path}': {error}")
    })?;
    let modified = metadata
        .modified()
        .map_err(|error| format!("Failed to read mtime for source '{source_path}': {error}"))?;
    let mtime_nanos = modified
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos() as i128)
        .unwrap_or_else(|error| -(error.duration().as_nanos() as i128));

    Ok(SourceFrameCacheKey {
        path: source_path.to_string(),
        mtime_nanos,
        file_len: metadata.len(),
        active_layer_ids: active_layer_ids.to_vec(),
        expected_width,
        expected_height,
    })
}

fn load_image_media_frame(
    media: &SceneMediaReference,
    source_path: &str,
) -> Result<RgbaFrame, String> {
    if is_jpeg_source(source_path) {
        return load_rgba_jpeg(source_path).map_err(|error| {
            format!(
                "Invalid Image media '{}': failed to load JPEG source: {error:?}",
                media.id
            )
        });
    }

    load_rgba_png(source_path).map_err(|error| {
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

#[cfg(test)]
mod source_frame_cache_tests {
    use super::*;
    use std::fs::File;
    use std::time::{Duration, SystemTime};
    use uxfd_golden_harness::save_rgba_png;

    fn unique_temp_path(name: &str) -> std::path::PathBuf {
        let mut path = std::env::temp_dir();
        let unique = format!(
            "uxfd-source-frame-cache-test-{}-{}-{name}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .expect("system time after epoch")
                .as_nanos()
        );
        path.push(unique);
        path
    }

    fn write_solid_png(path: &std::path::Path, rgba: [u8; 4]) {
        let pixels = rgba.repeat(4); // 2x2 image
        let frame = RgbaFrame::from_rgba8(2, 2, pixels).expect("valid solid RgbaFrame");
        save_rgba_png(path, &frame).expect("write test PNG fixture");
    }

    fn image_media(id: &str, path: &std::path::Path) -> SceneMediaReference {
        SceneMediaReference {
            id: id.to_string(),
            kind: MediaKind::Image,
            source: path.to_string_lossy().to_string(),
            width: 2,
            height: 2,
            source_rate: None,
            active_layer_ids: Vec::new(),
        }
    }

    #[test]
    fn image_source_frame_is_served_from_cache_on_repeated_reads() {
        let path = unique_temp_path("image-hit.png");
        write_solid_png(&path, [255, 0, 0, 255]);
        let media = image_media("image-1", &path);
        let mut cache = SourceFrameCache::default();

        let first = build_image_source_frame(&media, &mut cache).expect("first decode succeeds");
        assert_eq!(cache.len(), 1);
        assert_eq!(first.pixels[0..4], [255, 0, 0, 255]);

        // Overwrite the file with different bytes but do not touch mtime/size
        // observably from this call's perspective: since the cache key only
        // depends on mtime+size (not content hashing), an unchanged path
        // with unchanged metadata should still hit the cache and return the
        // previously decoded (red) pixels rather than re-reading the file.
        let second = build_image_source_frame(&media, &mut cache).expect("second decode succeeds");
        assert_eq!(cache.len(), 1, "second read should reuse the cached entry");
        assert_eq!(second.pixels, first.pixels);

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn image_source_frame_cache_is_invalidated_when_file_is_modified() {
        let path = unique_temp_path("image-invalidate.png");
        write_solid_png(&path, [255, 0, 0, 255]);
        let media = image_media("image-2", &path);
        let mut cache = SourceFrameCache::default();

        let first = build_image_source_frame(&media, &mut cache).expect("first decode succeeds");
        assert_eq!(first.pixels[0..4], [255, 0, 0, 255]);
        assert_eq!(cache.len(), 1);

        // Rewrite with different content (blue) and force the mtime forward
        // so the cache key changes even on filesystems with coarse mtime
        // resolution.
        write_solid_png(&path, [0, 0, 255, 255]);
        let file = File::options()
            .write(true)
            .open(&path)
            .expect("open test PNG for mtime bump");
        let bumped = SystemTime::now() + Duration::from_secs(5);
        file.set_modified(bumped)
            .expect("set mtime for invalidation test");
        drop(file);

        let second = build_image_source_frame(&media, &mut cache).expect("second decode succeeds");
        assert_eq!(
            second.pixels[0..4],
            [0, 0, 255, 255],
            "cache must be invalidated and the new content decoded"
        );
        assert_eq!(
            cache.len(),
            2,
            "old and new file states occupy distinct cache entries"
        );

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn build_source_frame_cache_key_changes_with_mtime_only() {
        let path = unique_temp_path("key-mtime.png");
        write_solid_png(&path, [10, 20, 30, 255]);

        let key_before = build_source_frame_cache_key(
            path.to_string_lossy().as_ref(),
            &[],
            2,
            2,
        )
        .expect("key builds");

        let file = File::options()
            .write(true)
            .open(&path)
            .expect("open test PNG for mtime bump");
        let bumped = SystemTime::now() + Duration::from_secs(10);
        file.set_modified(bumped)
            .expect("set mtime for key test");
        drop(file);

        let key_after = build_source_frame_cache_key(
            path.to_string_lossy().as_ref(),
            &[],
            2,
            2,
        )
        .expect("key builds again");

        assert_ne!(key_before.mtime_nanos, key_after.mtime_nanos);
        assert_eq!(key_before.file_len, key_after.file_len);
        assert_ne!(key_before, key_after);

        let _ = fs::remove_file(&path);
    }

    /// Builds a minimal single-leaf-layer PSD binary for cache tests. Mirrors
    /// the layout produced by `psd_fast`'s own test fixture builder, kept as
    /// a local, self-contained copy so this module does not need to reach
    /// into `psd_fast`'s private test helpers.
    fn build_minimal_psd_bytes(width: u32, height: u32, layer_name: &str) -> Vec<u8> {
        let mut record_bytes: Vec<u8> = Vec::new();
        record_bytes.extend(0i32.to_be_bytes()); // top
        record_bytes.extend(0i32.to_be_bytes()); // left
        record_bytes.extend((height as i32).to_be_bytes()); // bottom
        record_bytes.extend((width as i32).to_be_bytes()); // right
        record_bytes.extend(0u16.to_be_bytes()); // channel count = 0
        record_bytes.extend(b"8BIM");
        record_bytes.extend(b"norm");
        record_bytes.push(255); // opacity
        record_bytes.push(0); // clipping
        record_bytes.push(0); // flags (visible)
        record_bytes.push(0); // filler

        let mut extra: Vec<u8> = Vec::new();
        extra.extend(0u32.to_be_bytes()); // layer mask data
        extra.extend(0u32.to_be_bytes()); // blending ranges
        let name_bytes = layer_name.as_bytes();
        extra.push(u8::try_from(name_bytes.len()).expect("test name fits in pascal string"));
        extra.extend(name_bytes);
        let used = name_bytes.len() + 1;
        extra.extend(std::iter::repeat_n(0u8, (4 - (used & 3)) & 3));
        record_bytes.extend(u32::try_from(extra.len()).unwrap().to_be_bytes());
        record_bytes.extend(extra);

        let layer_info_len = 2 + record_bytes.len();
        let lam_len = 4 + layer_info_len;

        let mut bytes: Vec<u8> = Vec::new();
        bytes.extend(b"8BPS");
        bytes.extend(1u16.to_be_bytes()); // version
        bytes.extend([0u8; 6]); // reserved
        bytes.extend(3u16.to_be_bytes()); // channels
        bytes.extend(height.to_be_bytes());
        bytes.extend(width.to_be_bytes());
        bytes.extend(8u16.to_be_bytes()); // depth
        bytes.extend(3u16.to_be_bytes()); // colour mode = RGB
        bytes.extend(0u32.to_be_bytes()); // colour mode data
        bytes.extend(0u32.to_be_bytes()); // image resources
        bytes.extend(u32::try_from(lam_len).unwrap().to_be_bytes());
        bytes.extend(u32::try_from(layer_info_len).unwrap().to_be_bytes());
        bytes.extend(1i16.to_be_bytes()); // layer count = 1
        bytes.extend(record_bytes);
        bytes
    }

    fn psd_media(id: &str, path: &std::path::Path, active_layer_ids: Vec<String>) -> SceneMediaReference {
        SceneMediaReference {
            id: id.to_string(),
            kind: MediaKind::Psd,
            source: path.to_string_lossy().to_string(),
            width: 1,
            height: 1,
            source_rate: None,
            active_layer_ids,
        }
    }

    #[test]
    fn psd_source_frame_cache_is_invalidated_by_active_layer_ids_change() {
        let path = unique_temp_path("psd-active-layers.psd");
        fs::write(&path, build_minimal_psd_bytes(1, 1, "only-layer"))
            .expect("write test PSD fixture");
        let mut cache = SourceFrameCache::default();

        let media_all = psd_media("psd-1", &path, Vec::new());
        build_psd_source_frame(&media_all, &mut cache).expect("decode with no active filter");
        assert_eq!(cache.len(), 1);

        // Re-decoding with the exact same (empty) selection should hit the
        // existing cache entry rather than growing the cache.
        build_psd_source_frame(&media_all, &mut cache).expect("second decode reuses cache");
        assert_eq!(cache.len(), 1);

        let media_filtered = psd_media("psd-1", &path, vec!["psd-layer-0".to_string()]);
        build_psd_source_frame(&media_filtered, &mut cache)
            .expect("decode with explicit active layer filter");
        assert_eq!(
            cache.len(),
            2,
            "different active_layer_ids must produce a distinct cache entry"
        );

        let _ = fs::remove_file(&path);
    }
}
