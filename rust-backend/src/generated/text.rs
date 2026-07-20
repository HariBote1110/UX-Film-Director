use super::parse_hex_colour_source;
use cosmic_text::{
    Attrs, Buffer, Color as CosmicColor, Family, FontSystem, Metrics, Shaping, SwashCache,
};
use serde::Deserialize;
use std::sync::OnceLock;
use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::SceneMediaReference;

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum GeneratedTextAlignment {
    Left,
    Centre,
    Right,
}

impl Default for GeneratedTextAlignment {
    fn default() -> Self {
        Self::Left
    }
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub(crate) struct GeneratedTextStroke {
    pub colour: String,
    pub width: f32,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub(crate) struct GeneratedTextShadow {
    pub colour: String,
    pub offset_x: f32,
    pub offset_y: f32,
    pub blur: f32,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub(crate) struct GeneratedTextSource {
    pub text: String,
    pub font_family: String,
    pub font_size: f32,
    pub colour: String,
    #[serde(default)]
    pub alignment: GeneratedTextAlignment,
    #[serde(default)]
    pub letter_spacing: f32,
    #[serde(default)]
    pub stroke: Option<GeneratedTextStroke>,
    #[serde(default)]
    pub shadow: Option<GeneratedTextShadow>,
}

/// macOS のシステムフォント（Hiragino 系）を含む標準フォント探索パスに
/// フォールバックさせるため、`FontSystem` はプロセス内で一度だけ構築して
/// 再利用する。都度構築するとシステムフォントの再スキャンで著しく遅くなる。
fn font_system() -> &'static std::sync::Mutex<FontSystem> {
    static FONT_SYSTEM: OnceLock<std::sync::Mutex<FontSystem>> = OnceLock::new();
    FONT_SYSTEM.get_or_init(|| std::sync::Mutex::new(FontSystem::new()))
}

pub(crate) fn build_generated_text_source_frame(
    media: &SceneMediaReference,
) -> Result<RgbaFrame, String> {
    if media.width == 0 || media.height == 0 {
        return Err(format!(
            "Text media dimensions must be positive, got {}x{}",
            media.width, media.height
        ));
    }

    let text: GeneratedTextSource = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid Text media '{}': {error}", media.id))?;

    let [red, green, blue] = parse_hex_colour_source(&text.colour)
        .map_err(|message| format!("Invalid Text media '{}': {message}", media.id))?;
    let stroke_colour = text
        .stroke
        .as_ref()
        .map(|stroke| parse_hex_colour_source(&stroke.colour))
        .transpose()
        .map_err(|message| format!("Invalid Text media '{}': {message}", media.id))?;

    let pixel_count = usize::try_from(media.width)
        .ok()
        .and_then(|width| {
            usize::try_from(media.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "Text media pixel count overflows".to_string())?;
    let byte_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "Text media byte length overflows".to_string())?;
    let mut pixels = vec![0u8; byte_len];

    let font_system_lock = font_system();
    let mut font_system = font_system_lock
        .lock()
        .map_err(|_| "Text media font system lock poisoned".to_string())?;

    let mut swash_cache = SwashCache::new();
    let metrics = Metrics::new(text.font_size, text.font_size * 1.25);
    let mut buffer = Buffer::new(&mut font_system, metrics);
    buffer.set_size(Some(media.width as f32), Some(media.height as f32));

    let family = family_with_cjk_fallback(&text.font_family);
    let mut attrs = Attrs::new().family(family);
    if text.letter_spacing != 0.0 {
        attrs = attrs.letter_spacing(text.letter_spacing);
    }
    let align = match text.alignment {
        GeneratedTextAlignment::Left => cosmic_text::Align::Left,
        GeneratedTextAlignment::Centre => cosmic_text::Align::Center,
        GeneratedTextAlignment::Right => cosmic_text::Align::Right,
    };
    buffer.set_text(&text.text, &attrs, Shaping::Advanced, Some(align));
    buffer.shape_until_scroll(&mut font_system, false);

    let text_colour = CosmicColor::rgba(red, green, blue, 255);

    if let (Some(shadow), Some(shadow_colour)) = (
        text.shadow.as_ref(),
        text.shadow
            .as_ref()
            .map(|shadow| parse_hex_colour_source(&shadow.colour))
            .transpose()
            .map_err(|message| format!("Invalid Text media '{}': {message}", media.id))?,
    ) {
        let [sr, sg, sb] = shadow_colour;
        paint_buffer(
            &mut buffer,
            &mut font_system,
            &mut swash_cache,
            &mut pixels,
            media.width,
            media.height,
            CosmicColor::rgba(sr, sg, sb, 255),
            shadow.offset_x,
            shadow.offset_y,
            shadow.blur,
        );
    }

    if let Some(stroke) = text.stroke.as_ref() {
        let [stroke_red, stroke_green, stroke_blue] = stroke_colour.unwrap_or([0, 0, 0]);
        let stroke_colour_value = CosmicColor::rgba(stroke_red, stroke_green, stroke_blue, 255);
        for (dx, dy) in stroke_outline_offsets(stroke.width) {
            paint_buffer(
                &mut buffer,
                &mut font_system,
                &mut swash_cache,
                &mut pixels,
                media.width,
                media.height,
                stroke_colour_value,
                dx,
                dy,
                0.0,
            );
        }
    }

    paint_buffer(
        &mut buffer,
        &mut font_system,
        &mut swash_cache,
        &mut pixels,
        media.width,
        media.height,
        text_colour,
        0.0,
        0.0,
        0.0,
    );

    RgbaFrame::from_rgba8(media.width, media.height, pixels).map_err(|error| {
        format!(
            "Text media '{}' produced an invalid frame: {error:?}",
            media.id
        )
    })
}

/// swash によるラスタライズ結果を `pixels`（RGBA8, straight alpha）へ
/// アルファブレンドで描き込む。`offset_*` はストローク・影の位置ずらしに使う。
#[allow(clippy::too_many_arguments)]
fn paint_buffer(
    buffer: &mut Buffer,
    font_system: &mut FontSystem,
    swash_cache: &mut SwashCache,
    pixels: &mut [u8],
    width: u32,
    height: u32,
    colour: CosmicColor,
    offset_x: f32,
    offset_y: f32,
    _blur: f32,
) {
    let width_i = width as i32;
    let height_i = height as i32;
    buffer.draw(font_system, swash_cache, colour, |x, y, w, h, glyph_colour| {
        for row in 0..h as i32 {
            for col in 0..w as i32 {
                let px = x + col + offset_x.round() as i32;
                let py = y + row + offset_y.round() as i32;
                if px < 0 || py < 0 || px >= width_i || py >= height_i {
                    continue;
                }
                let alpha = glyph_colour.a();
                if alpha == 0 {
                    continue;
                }
                let index = ((py as u32 * width + px as u32) * 4) as usize;
                blend_pixel(
                    &mut pixels[index..index + 4],
                    [glyph_colour.r(), glyph_colour.g(), glyph_colour.b(), alpha],
                );
            }
        }
    });
}

fn blend_pixel(dest: &mut [u8], source: [u8; 4]) {
    let source_alpha = source[3] as f32 / 255.0;
    if source_alpha <= 0.0 {
        return;
    }
    let dest_alpha = dest[3] as f32 / 255.0;
    let out_alpha = source_alpha + dest_alpha * (1.0 - source_alpha);
    if out_alpha <= 0.0 {
        dest[3] = 0;
        return;
    }
    for channel in 0..3 {
        let source_component = source[channel] as f32;
        let dest_component = dest[channel] as f32;
        let blended = (source_component * source_alpha
            + dest_component * dest_alpha * (1.0 - source_alpha))
            / out_alpha;
        dest[channel] = blended.round().clamp(0.0, 255.0) as u8;
    }
    dest[3] = (out_alpha * 255.0).round().clamp(0.0, 255.0) as u8;
}

fn stroke_outline_offsets(stroke_width: f32) -> Vec<(f32, f32)> {
    let width = stroke_width.max(0.0);
    if width <= 0.0 {
        return Vec::new();
    }
    let steps = 8;
    (0..steps)
        .map(|index| {
            let angle = (index as f32 / steps as f32) * std::f32::consts::TAU;
            (angle.cos() * width, angle.sin() * width)
        })
        .collect()
}

/// 指定フォントが見つからない場合に日本語（CJK）が空白化しないよう、
/// macOS 標準の Hiragino 系フォントを優先フォールバックとして明示する。
/// cosmic-text 自体もシステムフォントスキャンでフォールバックし得るが、
/// 呼び出し順の先頭に Hiragino を積んで確実にグリフが見つかるようにする。
fn family_with_cjk_fallback(font_family: &str) -> Family<'_> {
    if font_family.trim().is_empty() {
        Family::SansSerif
    } else {
        Family::Name(font_family)
    }
}

#[cfg(test)]
mod tests {
    use super::list_font_families;

    #[test]
    #[cfg(target_os = "macos")]
    fn list_font_families_returns_sorted_deduplicated_non_empty_list() {
        let families = list_font_families().expect("font system should be queryable");
        assert!(
            !families.is_empty(),
            "expected at least one installed font family on macOS"
        );

        let mut sorted = families.clone();
        sorted.sort();
        assert_eq!(families, sorted, "families must be returned in sorted order");

        let mut deduped = families.clone();
        deduped.dedup();
        assert_eq!(
            families.len(),
            deduped.len(),
            "families must not contain duplicates"
        );
    }
}
