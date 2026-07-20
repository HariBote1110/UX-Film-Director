use crate::generated::*;
#[cfg(unix)]
use crate::native_shared::read_native_render_source_frame;
use crate::params::NativeRenderSharedFrameSource;
use crate::psd_fast;
use crate::state::{SourceFrameCache, SourceFrameCacheKey};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::fs;
use std::hash::{Hash, Hasher};
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

/// Phase 3a（native-wgpu-renderer の per-clip GPU テクスチャキャッシュ）向け:
/// media_id ごとの「内容が変化したかどうか」を示す論理世代（revision）を、
/// ピクセルを一切ハッシュせずに安価な識別情報だけから算出する。
///
/// - `Image`/`Psd`: 既存の `SourceFrameCache` と同じ識別キー（パス＋mtime＋
///   サイズ＋アクティブレイヤー）をハッシュする。ファイル内容が変わらない限り
///   同じ値が返る。
/// - シェアードメモリ経由の動画フレーム: デコーダが新しいフレームを書くたびに
///   進む `FrameDescriptor::generation` をそのまま使う（動画フレームが進めば
///   必ず変化し、同じフレームの再提示では変化しない）。
/// - それ以外の生成コンテンツ（SolidColour・図形・テキスト等）: 出力を決定する
///   `SceneMediaReference` の各フィールドをハッシュする。`GeneratedParticle`
///   等、`clip.source_frame`（再生位置）に応じて絵柄が変わる一部の生成源は
///   その値も併せてハッシュへ混ぜ、毎フレーム変化させる（従来どおり常に
///   再アップロードされる）。
/// - `GeneratedAudioWaveform`/`GeneratedAudioSphere`/`Video`（PCM 波形の
///   ラスタライズ結果や、通常の動画パス経由の CPU デコード結果）は revision
///   を算出しない（呼び出し側の renderer は revision 不在の media_id を常に
///   ミス扱いにするため、既存の「毎フレーム再生成」挙動のまま）。
#[cfg(unix)]
pub(crate) fn collect_native_render_source_content_revisions(
    snapshot: &SceneSnapshot,
    media_items: &[SceneMediaReference],
    shared_sources: &[NativeRenderSharedFrameSource],
) -> HashMap<String, u64> {
    let mut revisions = HashMap::with_capacity(media_items.len() + shared_sources.len());
    for media in media_items {
        let revision = match media.kind {
            MediaKind::Image | MediaKind::Psd => image_or_psd_content_revision(media),
            MediaKind::GeneratedAudioWaveform | MediaKind::GeneratedAudioSphere | MediaKind::Video => {
                None
            }
            MediaKind::GeneratedParticle
            | MediaKind::GeneratedFocusLinesPlus
            | MediaKind::GeneratedShakingPolygon
            | MediaKind::GeneratedShatteredSphere => Some(media_content_revision(
                media,
                Some(source_frame_for_media(snapshot, &media.id)),
            )),
            _ => Some(media_content_revision(media, None)),
        };
        if let Some(revision) = revision {
            revisions.insert(media.id.clone(), revision);
        }
    }
    for source in shared_sources {
        revisions.insert(source.media_id.clone(), source.frame.descriptor.generation);
    }
    revisions
}

/// `Image`/`Psd` media の内容世代。ソースファイルの mtime/サイズが変わらない
/// 限り安定する（`SourceFrameCache` の識別キーそのものをハッシュするだけで、
/// ファイル I/O は `fs::metadata` の 1 回の stat のみ）。パス解決やメタデータ
/// 取得に失敗した場合は `None`（=常にミス扱い）を返し、安全側に倒す。
#[cfg(unix)]
fn image_or_psd_content_revision(media: &SceneMediaReference) -> Option<u64> {
    let source_path = local_media_source_path(&media.source, "media").ok()?;
    let active_layer_ids: &[String] = if media.kind == MediaKind::Psd {
        &media.active_layer_ids
    } else {
        &[]
    };
    let cache_key =
        build_source_frame_cache_key(&source_path, active_layer_ids, media.width, media.height)
            .ok()?;
    let mut hasher = DefaultHasher::new();
    cache_key.hash(&mut hasher);
    Some(hasher.finish())
}

/// 生成コンテンツ（Image/Psd 以外）の内容世代。`media` の各フィールド
/// （ピクセルではなくパラメータ）と、時間依存の生成源のみ渡される
/// `time_seed`（`clip.source_frame`）をハッシュする。
#[cfg(unix)]
fn media_content_revision(media: &SceneMediaReference, time_seed: Option<u64>) -> u64 {
    let mut hasher = DefaultHasher::new();
    media.id.hash(&mut hasher);
    format!("{:?}", media.kind).hash(&mut hasher);
    media.source.hash(&mut hasher);
    media.width.hash(&mut hasher);
    media.height.hash(&mut hasher);
    media.active_layer_ids.hash(&mut hasher);
    format!("{:?}", media.source_rate).hash(&mut hasher);
    if let Some(seed) = time_seed {
        seed.hash(&mut hasher);
    }
    hasher.finish()
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

/// Phase 3a: `collect_native_render_source_content_revisions` の identity 契約
/// （native-wgpu-renderer 側の per-clip GPU テクスチャキャッシュのキー）を固定する。
#[cfg(all(test, unix))]
mod content_revision_tests {
    use super::*;
    use std::fs::File;
    use std::time::{Duration, SystemTime};
    use uxfd_golden_harness::save_rgba_png;
    use uxfd_sidecar_protocol::{ColourMetadata, FrameDescriptor, FrameFormat, SharedFrame};

    fn unique_temp_path(name: &str) -> std::path::PathBuf {
        let mut path = std::env::temp_dir();
        let unique = format!(
            "uxfd-content-revision-test-{}-{}-{name}",
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

    fn solid_colour_media(id: &str, width: u32) -> SceneMediaReference {
        SceneMediaReference {
            id: id.to_string(),
            kind: MediaKind::SolidColour,
            source: "#ff0000".to_string(),
            width,
            height: 4,
            source_rate: None,
            active_layer_ids: Vec::new(),
        }
    }

    fn empty_snapshot() -> SceneSnapshot {
        SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: Vec::new(),
        }
    }

    #[test]
    fn image_content_revision_is_stable_until_the_file_is_modified() {
        let path = unique_temp_path("image-revision.png");
        write_solid_png(&path, [255, 0, 0, 255]);
        let media = image_media("image-1", &path);
        let snapshot = empty_snapshot();

        let first = collect_native_render_source_content_revisions(&snapshot, &[media.clone()], &[]);
        let second = collect_native_render_source_content_revisions(&snapshot, &[media.clone()], &[]);
        assert_eq!(
            first.get("image-1"),
            second.get("image-1"),
            "unchanged file must yield the same content revision across calls"
        );
        assert!(first.get("image-1").is_some());

        // Bump the mtime forward (same as the SourceFrameCache invalidation
        // test) so the identity key changes even on coarse-mtime filesystems.
        let file = File::options()
            .write(true)
            .open(&path)
            .expect("open test PNG for mtime bump");
        file.set_modified(SystemTime::now() + Duration::from_secs(5))
            .expect("set mtime for revision test");
        drop(file);

        let third = collect_native_render_source_content_revisions(&snapshot, &[media], &[]);
        assert_ne!(
            first.get("image-1"),
            third.get("image-1"),
            "a modified file must change the content revision"
        );

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn generated_media_content_revision_is_stable_and_changes_with_parameters() {
        let snapshot = empty_snapshot();
        let media_a = solid_colour_media("solid-1", 4);
        let media_b = solid_colour_media("solid-1", 4);
        let media_wider = solid_colour_media("solid-1", 8);

        let first = collect_native_render_source_content_revisions(&snapshot, &[media_a], &[]);
        let second = collect_native_render_source_content_revisions(&snapshot, &[media_b], &[]);
        assert_eq!(
            first.get("solid-1"),
            second.get("solid-1"),
            "identical media parameters must yield the same revision without hashing pixels"
        );

        let third = collect_native_render_source_content_revisions(&snapshot, &[media_wider], &[]);
        assert_ne!(
            first.get("solid-1"),
            third.get("solid-1"),
            "changed media parameters (width) must change the content revision"
        );
    }

    #[test]
    fn shared_video_source_content_revision_tracks_frame_descriptor_generation() {
        let snapshot = empty_snapshot();
        let descriptor = FrameDescriptor {
            memory_id: "mem-1".to_string(),
            slot_index: 0,
            generation: 5,
            byte_offset: 0,
            byte_len: 16,
            width: 2,
            height: 2,
            stride_bytes: 8,
            format: FrameFormat::Rgba8Srgb,
            colour: ColourMetadata::rec709_srgb(),
        };
        let source = NativeRenderSharedFrameSource {
            media_id: "video-1".to_string(),
            slot_count: 2,
            frame: SharedFrame {
                descriptor: descriptor.clone(),
                pts_frame: 10,
            },
        };

        let revisions = collect_native_render_source_content_revisions(&snapshot, &[], &[source]);
        assert_eq!(
            revisions.get("video-1"),
            Some(&5u64),
            "shared video source revision must be exactly the frame descriptor generation, \
             so a paused/re-presented frame (unchanged generation) hits the GPU texture cache"
        );

        let mut advanced_descriptor = descriptor;
        advanced_descriptor.generation = 6;
        let advanced_source = NativeRenderSharedFrameSource {
            media_id: "video-1".to_string(),
            slot_count: 2,
            frame: SharedFrame {
                descriptor: advanced_descriptor,
                pts_frame: 11,
            },
        };
        let advanced_revisions =
            collect_native_render_source_content_revisions(&snapshot, &[], &[advanced_source]);
        assert_eq!(
            advanced_revisions.get("video-1"),
            Some(&6u64),
            "a new decoded frame (generation advanced) must change the revision so the \
             GPU texture is re-uploaded"
        );
    }

    #[test]
    fn excluded_media_kinds_have_no_content_revision() {
        let snapshot = empty_snapshot();
        let waveform_media = SceneMediaReference {
            id: "waveform-1".to_string(),
            kind: MediaKind::GeneratedAudioWaveform,
            source: String::new(),
            width: 4,
            height: 4,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };
        let video_media = SceneMediaReference {
            id: "video-media-1".to_string(),
            kind: MediaKind::Video,
            source: "/tmp/does-not-matter.mov".to_string(),
            width: 4,
            height: 4,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let revisions = collect_native_render_source_content_revisions(
            &snapshot,
            &[waveform_media, video_media],
            &[],
        );

        assert!(
            revisions.get("waveform-1").is_none(),
            "audio waveform rasterisation has no stable content revision; renderer must \
             always miss and re-upload it"
        );
        assert!(
            revisions.get("video-media-1").is_none(),
            "the ordinary Video media kind is not driven by revision (only the shared \
             frame descriptor path is); renderer must always miss and re-upload it"
        );
    }
}
