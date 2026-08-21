use super::parse_hex_colour_source;
use cosmic_text::{
    Attrs, Buffer, Color as CosmicColor, Family, FontSystem, Metrics, Shaping, SwashCache,
};
use std::collections::BTreeSet;
use std::sync::OnceLock;
use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::{SceneMediaReference, TextAlignment, TextObjectFields};

/// `TextObjectFields.textAlignment` は `Option<TextAlignment>` (未指定を許容する編集モデル)
/// だが、ラスタライズ時は必ず具体値が要る。TS 側の `serialiseTextSource` はもう
/// `?? 'left'` のフォールバックをしないため、ここで行う。
fn effective_text_alignment(alignment: Option<TextAlignment>) -> TextAlignment {
    alignment.unwrap_or(TextAlignment::Left)
}

/// `TextObjectFields.letterSpacing` は未指定を許容する編集モデルだが、
/// ラスタライズ時は 0.0 を既定値として扱う。フォールバック処理は
/// TS 側からここへ移した。
fn effective_letter_spacing(letter_spacing: Option<f32>) -> f32 {
    letter_spacing.unwrap_or(0.0)
}

/// macOS のシステムフォント（Hiragino 系）を含む標準フォント探索パスに
/// フォールバックさせるため、`FontSystem` はプロセス内で一度だけ構築して
/// 再利用する。都度構築するとシステムフォントの再スキャンで著しく遅くなる。
fn font_system() -> &'static std::sync::Mutex<FontSystem> {
    static FONT_SYSTEM: OnceLock<std::sync::Mutex<FontSystem>> = OnceLock::new();
    FONT_SYSTEM.get_or_init(|| std::sync::Mutex::new(FontSystem::new()))
}

/// インストール済みフォントファミリー名を重複排除・ソート済みで返す。
///
/// ラスタライズに使うのと同じ共有 `FontSystem`（＝同じ `fontdb::Database`）
/// を参照するため、ここで返したファミリー名は必ず
/// `build_generated_text_source_frame` 側で解決できる。
pub(crate) fn list_font_families() -> Result<Vec<String>, String> {
    let font_system_lock = font_system();
    let font_system = font_system_lock
        .lock()
        .map_err(|_| "Font system lock poisoned".to_string())?;

    let mut families: BTreeSet<String> = BTreeSet::new();
    for face in font_system.db().faces() {
        for (name, _language) in &face.families {
            families.insert(name.clone());
        }
    }

    Ok(families.into_iter().collect())
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

    let text: TextObjectFields = serde_json::from_str(&media.source)
        .map_err(|error| format!("Invalid Text media '{}': {error}", media.id))?;

    let [red, green, blue] = parse_hex_colour_source(&text.fill)
        .map_err(|message| format!("Invalid Text media '{}': {message}", media.id))?;
    let stroke_colour = text
        .text_stroke
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
    let letter_spacing = effective_letter_spacing(text.letter_spacing);
    if letter_spacing != 0.0 {
        attrs = attrs.letter_spacing(letter_spacing);
    }
    let align = match effective_text_alignment(text.text_alignment) {
        TextAlignment::Left => cosmic_text::Align::Left,
        TextAlignment::Centre => cosmic_text::Align::Center,
        TextAlignment::Right => cosmic_text::Align::Right,
    };
    buffer.set_text(&text.text, &attrs, Shaping::Advanced, Some(align));
    buffer.shape_until_scroll(&mut font_system, false);

    let text_colour = CosmicColor::rgba(red, green, blue, 255);

    if let (Some(shadow), Some(shadow_colour)) = (
        text.text_shadow.as_ref(),
        text.text_shadow
            .as_ref()
            .map(|shadow| parse_hex_colour_source(&shadow.colour))
            .transpose()
            .map_err(|message| format!("Invalid Text media '{}': {message}", media.id))?,
    ) {
        let [sr, sg, sb] = shadow_colour;
        paint_shadow(
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

    if let Some(stroke) = text.text_stroke.as_ref() {
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
/// ぼかしは持たない（本体・ストロークの描画に使う。影のぼかしは
/// `paint_shadow` を参照）。
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

/// 影を描く。`blur <= 0` のときは従来どおり `paint_buffer` でシャープに描く
/// （回帰させないための分岐）。`blur > 0` のときは、影のグリフをいったん
/// ローカルなアルファバッファへラスタライズし、分離可能ボックスブラー
/// 3パス（水平＋垂直を1セットとして3セット）でガウシアンぼかしを近似
/// してから `pixels` へ合成する。色・アルファの合成規則（`blend_pixel`）
/// 自体は変えない。
///
/// パフォーマンス: プレーン全体ではなく、影のバウンディングボックス＋
/// ブラーの広がり分だけをアルファバッファとして確保・処理する
/// （テキストは通常プレーンの一部にしか広がらないため）。
#[allow(clippy::too_many_arguments)]
fn paint_shadow(
    buffer: &mut Buffer,
    font_system: &mut FontSystem,
    swash_cache: &mut SwashCache,
    pixels: &mut [u8],
    width: u32,
    height: u32,
    colour: CosmicColor,
    offset_x: f32,
    offset_y: f32,
    blur: f32,
) {
    if blur <= 0.0 {
        paint_buffer(
            buffer,
            font_system,
            swash_cache,
            pixels,
            width,
            height,
            colour,
            offset_x,
            offset_y,
        );
        return;
    }

    // バッファ寸法（プレーンの width/height）でクランプする。上限の根拠は
    // clamp_box_blur_radius のドキュメントを参照。通常の blur 値（この上限
    // に掛からない範囲）では半径を一切変えないため、見た目は変わらない。
    let radius = clamp_box_blur_radius(box_blur_radius_for(blur), width as usize, height as usize);
    if radius <= 0 {
        // 計算上ブラー半径が0になるほど小さい blur 値は、視覚的な差が
        // 出ないためシャープ描画にフォールバックする。
        paint_buffer(
            buffer,
            font_system,
            swash_cache,
            pixels,
            width,
            height,
            colour,
            offset_x,
            offset_y,
        );
        return;
    }

    let width_i = width as i32;
    let height_i = height as i32;
    let offset_x_i = offset_x.round() as i32;
    let offset_y_i = offset_y.round() as i32;

    // 1パス目: 影グリフの（オフセット適用後の）バウンディングボックスを求める。
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;
    buffer.draw(font_system, swash_cache, colour, |x, y, w, h, glyph_colour| {
        if glyph_colour.a() == 0 || w == 0 || h == 0 {
            return;
        }
        let gx0 = x + offset_x_i;
        let gy0 = y + offset_y_i;
        let gx1 = gx0 + w as i32 - 1;
        let gy1 = gy0 + h as i32 - 1;
        min_x = min_x.min(gx0);
        min_y = min_y.min(gy0);
        max_x = max_x.max(gx1);
        max_y = max_y.max(gy1);
    });
    if min_x > max_x || min_y > max_y {
        // 描くべきグリフが無かった（空文字列など）。
        return;
    }

    // 3パスのボックスブラーを直列適用すると、各パスが半径分ずつ広がりを
    // 足し合わせるため、最終的な広がりは概ね 3 * radius になる。
    // ローカルバッファはその広がりを打ち切らずに保持できるよう
    // 3 * radius の余白を確保する。
    let padding = radius.saturating_mul(3);
    let padded_min_x = (min_x - padding).max(0);
    let padded_min_y = (min_y - padding).max(0);
    let padded_max_x = (max_x + padding).min(width_i - 1);
    let padded_max_y = (max_y + padding).min(height_i - 1);
    if padded_min_x > padded_max_x || padded_min_y > padded_max_y {
        return;
    }

    let local_width = (padded_max_x - padded_min_x + 1) as usize;
    let local_height = (padded_max_y - padded_min_y + 1) as usize;
    let mut alpha_buffer = vec![0u8; local_width * local_height];

    // 2パス目: 影グリフのアルファをローカルバッファへ描き込む。
    buffer.draw(font_system, swash_cache, colour, |x, y, w, h, glyph_colour| {
        let glyph_alpha = glyph_colour.a();
        if glyph_alpha == 0 {
            return;
        }
        for row in 0..h as i32 {
            for col in 0..w as i32 {
                let px = x + col + offset_x_i;
                let py = y + row + offset_y_i;
                if px < padded_min_x || py < padded_min_y || px > padded_max_x || py > padded_max_y
                {
                    continue;
                }
                let local_x = (px - padded_min_x) as usize;
                let local_y = (py - padded_min_y) as usize;
                let index = local_y * local_width + local_x;
                // グリフ同士が重なるケース（通常は起きないが）で暗くならないよう最大値を採る。
                alpha_buffer[index] = alpha_buffer[index].max(glyph_alpha);
            }
        }
    });

    box_blur_three_pass(&mut alpha_buffer, local_width, local_height, radius);

    let shadow_rgb = [colour.r(), colour.g(), colour.b()];
    for local_y in 0..local_height {
        for local_x in 0..local_width {
            let alpha = alpha_buffer[local_y * local_width + local_x];
            if alpha == 0 {
                continue;
            }
            let px = padded_min_x + local_x as i32;
            let py = padded_min_y + local_y as i32;
            // ここでプレーン境界の外は既にバッファ生成時に切り捨てているが、
            // ぼかしによって影が本来より外側へ広がる分、境界での見切れが
            // 目立ちやすくなる可能性がある。これは別の既知の課題
            // （テキストのバウンディングボックスに stroke/shadow の広がりが
            // 加算されていないこと）であり、本修正では対応しない。
            let index = ((py as u32 * width + px as u32) * 4) as usize;
            blend_pixel(
                &mut pixels[index..index + 4],
                [shadow_rgb[0], shadow_rgb[1], shadow_rgb[2], alpha],
            );
        }
    }
}

/// CSS の `text-shadow` / `box-shadow` の慣習に合わせ、`blur` パラメータを
/// ガウシアンの標準偏差 σ = blur / 2 とみなす。
///
/// 3パスのボックスブラーで単一の標準偏差 σ のガウシアンを近似する場合、
/// 各パスのボックス幅 w は、W. M. Kutskir（"Fastest Gaussian Blur (in
/// linear time)"）で示された定番の近似式
///   w = floor(σ * 3 * sqrt(2π) / 4 + 0.5)
/// で求められる（3つの同じ幅のボックス畳み込みの分散の和が、目的の
/// ガウシアン分散 σ² に一致するよう導出されたもの）。ボックス幅から
/// 片側半径は radius = floor(w / 2) とする。
fn box_blur_radius_for(blur: f32) -> i32 {
    // NaN / 無限大は後段の算術（floor、i32キャストなど）を通すと未定義の
    // 挙動にはならないものの（Rust の float→int キャストは飽和するため）、
    // 意図がわかりにくい巨大値やゼロが暗黙に生じてしまう。ここで明示的に
    // ガードし、ぼかし無しへフォールバックさせる。
    if !blur.is_finite() || blur <= 0.0 {
        return 0;
    }
    let sigma = blur / 2.0;
    let ideal_width = (sigma * 3.0 * (2.0 * std::f32::consts::PI).sqrt() / 4.0 + 0.5).floor();
    ((ideal_width / 2.0).floor() as i32).max(0)
}

/// ボックスブラー半径をバッファ寸法でクランプする。
///
/// ローカルなアルファバッファ（`width` x `height`）より大きい半径でぼかして
/// も、結果は「バッファ全体に均一に拡散しきった状態」以上には変わらない。
/// 3パスのボックスブラーを直列適用すると、各パスが半径分ずつ広がりを
/// 足し合わせるため最終的な広がりは概ね `3 * radius` になる。したがって
/// `radius` が `max(width, height)` を超えると、3パス後の広がりはバッファの
/// 一辺の長さを優に超え、それ以上半径を大きくしても視覚的な結果は変わらない
/// （バッファ全体が一様に薄まるだけ）。上限を `max(width, height)` に取れば、
/// 通常の（この上限に掛からない）blur 値では半径を一切変えずに、
/// ループ回数とオーバーフローの両方をバッファ寸法で有界化できる。
///
/// `radius` が 0 以下（ぼかし無し／不正値のフォールバック）の場合はそのまま
/// 返す。呼び出し側の「0以下ならスキップ」という判断をここで変えないため。
fn clamp_box_blur_radius(radius: i32, width: usize, height: usize) -> i32 {
    if radius <= 0 {
        return radius;
    }
    let max_dimension = width.max(height).min(i32::MAX as usize) as i32;
    radius.min(max_dimension)
}

/// 分離可能ボックスブラーを「水平1回＋垂直1回」を1セットとして3セット
/// 適用し、ガウシアンぼかしを近似する。
///
/// `radius` はここでもバッファ寸法でクランプする。呼び出し元（現状は
/// `paint_shadow` のみ）が既にクランプ済みであっても、二重クランプは
/// no-op で無害なので、将来呼び出し元が増えたときの安全網として残す。
fn box_blur_three_pass(buffer: &mut [u8], width: usize, height: usize, radius: i32) {
    let radius = clamp_box_blur_radius(radius, width, height);
    if radius <= 0 || width == 0 || height == 0 {
        return;
    }
    for _ in 0..3 {
        box_blur_horizontal(buffer, width, height, radius);
        box_blur_vertical(buffer, width, height, radius);
    }
}

fn box_blur_horizontal(buffer: &mut [u8], width: usize, height: usize, radius: i32) {
    // radius は呼び出し元（box_blur_three_pass）でバッファ寸法にクランプ
    // 済みである前提だが、念のため window はオーバーフローしない i64 で
    // 計算する。
    let window: i64 = 2 * radius as i64 + 1;
    let mut row_buffer = vec![0u8; width];
    for y in 0..height {
        let row_start = y * width;
        let row = &buffer[row_start..row_start + width];

        let mut sum: i64 = 0;
        for x in 0..=radius {
            if (x as usize) < width {
                sum += row[x as usize] as i64;
            }
        }

        for x in 0..width {
            row_buffer[x] = box_blur_average(sum, window);

            let leaving_x = x as i32 - radius;
            let entering_x = x as i32 + radius + 1;
            if leaving_x >= 0 && (leaving_x as usize) < width {
                sum -= row[leaving_x as usize] as i64;
            }
            if entering_x >= 0 && (entering_x as usize) < width {
                sum += row[entering_x as usize] as i64;
            }
        }

        buffer[row_start..row_start + width].copy_from_slice(&row_buffer);
    }
}

fn box_blur_vertical(buffer: &mut [u8], width: usize, height: usize, radius: i32) {
    // window の算出根拠は box_blur_horizontal を参照。
    let window: i64 = 2 * radius as i64 + 1;
    let mut column_buffer = vec![0u8; height];
    for x in 0..width {
        let mut sum: i64 = 0;
        for y in 0..=radius {
            if (y as usize) < height {
                sum += buffer[(y as usize) * width + x] as i64;
            }
        }

        for y in 0..height {
            column_buffer[y] = box_blur_average(sum, window);

            let leaving_y = y as i32 - radius;
            let entering_y = y as i32 + radius + 1;
            if leaving_y >= 0 && (leaving_y as usize) < height {
                sum -= buffer[(leaving_y as usize) * width + x] as i64;
            }
            if entering_y >= 0 && (entering_y as usize) < height {
                sum += buffer[(entering_y as usize) * width + x] as i64;
            }
        }

        for y in 0..height {
            buffer[y * width + x] = column_buffer[y];
        }
    }
}

/// ウィンドウ内の合計値から四捨五入で平均を求める。
fn box_blur_average(sum: i64, window: i64) -> u8 {
    ((sum + window / 2) / window).clamp(0, 255) as u8
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
    use super::{box_blur_radius_for, clamp_box_blur_radius, list_font_families};

    /// クランプは、通常の（クランプ境界にかからない）blur 値に対しては
    /// 半径を一切変えない no-op であるべき。これはクランプ導入前後で
    /// `paint_shadow` の見た目が変わらないことを担保する契約。
    #[test]
    fn clamp_box_blur_radius_is_noop_for_typical_blur_and_dimensions() {
        let width = 400usize;
        let height = 150usize;
        let radius = box_blur_radius_for(8.0);
        assert!(radius > 0, "expected a positive radius for blur=8.0");
        assert_eq!(
            clamp_box_blur_radius(radius, width, height),
            radius,
            "clamp should be a no-op for a radius well within the buffer dimensions"
        );
    }

    #[test]
    fn clamp_box_blur_radius_caps_at_the_larger_buffer_dimension() {
        assert_eq!(clamp_box_blur_radius(1_000_000, 400, 150), 400);
        assert_eq!(clamp_box_blur_radius(1_000_000, 150, 400), 400);
    }

    #[test]
    fn clamp_box_blur_radius_leaves_non_positive_radius_untouched() {
        assert_eq!(clamp_box_blur_radius(0, 400, 150), 0);
        assert_eq!(clamp_box_blur_radius(-5, 400, 150), -5);
    }

    /// `blur` が NaN / 無限大でも `box_blur_radius_for` は 0（ぼかし無し
    /// フォールバック）を返し、後段の算術（floor、i32 キャストなど）へ
    /// 非有限値を持ち込まない。JSON 経由では NaN を直接表現できないため
    /// （`generated_frame_tests.rs` 側のブラックボックステストではこの
    /// 経路を通せない）、ここで直接ホワイトボックスに検証する。
    #[test]
    fn box_blur_radius_for_non_finite_blur_returns_zero() {
        assert_eq!(box_blur_radius_for(f32::NAN), 0);
        assert_eq!(box_blur_radius_for(f32::INFINITY), 0);
        assert_eq!(box_blur_radius_for(f32::NEG_INFINITY), 0);
    }

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
