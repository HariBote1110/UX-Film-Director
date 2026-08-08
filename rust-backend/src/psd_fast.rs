/// Minimal PSD pixel extractor.
///
/// The `psd` crate's `rgba()` allocates a *full-canvas* buffer for every layer
/// (psd_width × psd_height × 4 bytes) and transforms pixel indices to canvas
/// space.  For a 1920×1080 document with 172 layers that is ~1.4 GB of
/// allocations — explaining the 6–14 s benchmark result.
///
/// This module parses the PSD binary format directly, decompresses only the
/// pixels actually belonging to each layer (no canvas-size allocation), and
/// returns layer-sized RGBA `Vec<u8>` buffers.
///
/// Supported:
///   - PSD (version 1)  and PSB (version 2, large document)
///   - 8-bit and 16-bit depth
///   - RGB colour mode
///   - Compression: 0 = raw, 1 = PackBits (RLE), 2/3 = ZIP (via flate2)
///
/// Not supported (returns empty pixels):
///   - CMYK, Lab, Grayscale, Bitmap colour modes
///   - 32-bit float depth
use std::io::{Cursor, Read, Seek, SeekFrom};
use uxfd_golden_harness::RgbaFrame;

// ── I/O helpers ──────────────────────────────────────────────────────────────

type R<T> = Result<T, String>;

macro_rules! read_be {
    ($c:expr, $t:ty) => {{
        let mut b = [0u8; std::mem::size_of::<$t>()];
        $c.read_exact(&mut b).map_err(|e| e.to_string())?;
        Ok(<$t>::from_be_bytes(b))
    }};
}

fn read_u8(c: &mut Cursor<&[u8]>) -> R<u8> {
    let mut b = [0u8; 1];
    c.read_exact(&mut b).map_err(|e| e.to_string())?;
    Ok(b[0])
}
fn read_u16(c: &mut Cursor<&[u8]>) -> R<u16> {
    read_be!(c, u16)
}
fn read_i16(c: &mut Cursor<&[u8]>) -> R<i16> {
    read_be!(c, i16)
}
fn read_u32(c: &mut Cursor<&[u8]>) -> R<u32> {
    read_be!(c, u32)
}
fn read_i32(c: &mut Cursor<&[u8]>) -> R<i32> {
    read_be!(c, i32)
}
fn read_u64(c: &mut Cursor<&[u8]>) -> R<u64> {
    read_be!(c, u64)
}

fn skip(c: &mut Cursor<&[u8]>, n: u64) -> R<()> {
    c.seek(SeekFrom::Current(n as i64))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn read_vec(c: &mut Cursor<&[u8]>, n: usize) -> R<Vec<u8>> {
    let mut v = vec![0u8; n];
    c.read_exact(&mut v).map_err(|e| e.to_string())?;
    Ok(v)
}

fn read_tag(c: &mut Cursor<&[u8]>) -> R<[u8; 4]> {
    let mut t = [0u8; 4];
    c.read_exact(&mut t).map_err(|e| e.to_string())?;
    Ok(t)
}

// ── PackBits (RLE) decompressor ───────────────────────────────────────────────

fn decompress_packbits(src: &[u8], expected_bytes: usize) -> Vec<u8> {
    let mut dst = Vec::with_capacity(expected_bytes);
    let mut i = 0usize;

    while i < src.len() && dst.len() < expected_bytes {
        let header = src[i] as i8;
        i += 1;
        if header >= 0 {
            // (header + 1) literal bytes follow
            let n = header as usize + 1;
            let end = (i + n).min(src.len());
            dst.extend_from_slice(&src[i..end]);
            i = i + n;
        } else if header != -128i8 {
            // (1 - header) copies of the next byte
            let n = (1i32 - header as i32) as usize;
            if i < src.len() {
                let byte = src[i];
                i += 1;
                dst.resize(dst.len() + n, byte);
            }
        }
        // -128 is a no-op
    }

    dst
}

// ── Channel → RGBA interleaver ────────────────────────────────────────────────

/// Interleave separated R/G/B/A channel planes into a packed RGBA Vec<u8>.
///
/// `channel_data` is `(channel_id, plane_bytes)` where channel IDs follow the
/// PSD convention: −1 = alpha, 0 = R, 1 = G, 2 = B.
fn interleave_rgba(channel_data: &[(i16, Vec<u8>)], pixel_count: usize) -> Vec<u8> {
    let mut rgba = vec![255u8; pixel_count * 4]; // default: fully opaque black

    for (channel_id, pixels) in channel_data {
        let component = match channel_id {
            -1 => 3, // alpha
            0 => 0,  // red (or L for grayscale)
            1 => 1,  // green
            2 => 2,  // blue
            _ => continue,
        };

        for (i, &px) in pixels.iter().take(pixel_count).enumerate() {
            rgba[i * 4 + component] = px;
        }
    }

    rgba
}

// ── Additional-layer-info block parser ───────────────────────────────────────

/// Parse a single additional layer info block.
///
/// Returns `(key, data_range_start, data_range_len)` so the caller can seek
/// to the data and/or skip it.
///
/// PSB uses 8-byte lengths for a specific set of keys.
fn read_ali_block_header(c: &mut Cursor<&[u8]>, is_psb: bool) -> R<([u8; 4], u64)> {
    let sig = read_tag(c)?;
    if &sig != b"8BIM" && &sig != b"8B64" {
        return Err(format!("Unexpected ALI sig: {:?}", sig));
    }
    let key = read_tag(c)?;

    // PSB uses 8-byte length for these keys; everything else uses 4-byte.
    const PSB_LONG_KEYS: &[&[u8; 4]] = &[
        b"LMsk", b"Lr16", b"Lr32", b"layr", b"Mt16", b"Mt32", b"Mtrn", b"Alph", b"FMsk", b"lnkD",
        b"lnk2", b"lnk3", b"lnkE", b"vmsk", b"vogk", b"vsms",
    ];
    let use_long = is_psb && PSB_LONG_KEYS.iter().any(|k| **k == key);
    let block_len = if use_long {
        read_u64(c)?
    } else {
        read_u32(c)? as u64
    };

    Ok((key, block_len))
}

// ── Layer record ──────────────────────────────────────────────────────────────

struct ChannelInfo {
    channel_id: i16,
    /// Byte length of this channel's entry in the channel image data section
    /// (includes the 2-byte compression-type prefix).
    data_len: u64,
}

struct LayerRecord {
    top: i32,
    left: i32,
    bottom: i32,
    right: i32,
    visible: bool,
    name: String,
    channels: Vec<ChannelInfo>,
    /// 0 = regular, 1 = open group, 2 = closed group, 3 = section-end divider
    layer_type: u32,
}

fn parse_layer_record(c: &mut Cursor<&[u8]>, is_psb: bool) -> R<LayerRecord> {
    let top = read_i32(c)?;
    let left = read_i32(c)?;
    let bottom = read_i32(c)?;
    let right = read_i32(c)?;

    let num_ch = read_u16(c)? as usize;
    let mut channels = Vec::with_capacity(num_ch);
    for _ in 0..num_ch {
        let ch_id = read_i16(c)?;
        let data_len = if is_psb {
            read_u64(c)?
        } else {
            read_u32(c)? as u64
        };
        channels.push(ChannelInfo {
            channel_id: ch_id,
            data_len,
        });
    }

    // Blend mode (8BIM + 4-char key + opacity + clipping + flags + pad = 12 bytes)
    skip(c, 4)?; // "8BIM"
    skip(c, 4)?; // blend mode key
    skip(c, 1)?; // opacity
    skip(c, 1)?; // clipping
    let flags = read_u8(c)?;
    skip(c, 1)?; // filler
    let visible = (flags & 2) == 0; // bit 1 set → hidden

    // Extra data section
    let extra_len = read_u32(c)? as u64;
    let extra_end = c.position() + extra_len;

    // ── within extra data ────────────────────────────────────────────────────
    // Layer mask data (length-prefixed)
    let mask_len = read_u32(c)? as u64;
    skip(c, mask_len)?;

    // Layer blending ranges (length-prefixed)
    let blend_len = read_u32(c)? as u64;
    skip(c, blend_len)?;

    // Pascal string name (1-byte length + bytes, padded to 4-byte boundary
    // counting the length byte itself)
    let name_len = read_u8(c)? as usize;
    let name_raw = read_vec(c, name_len)?;
    let used = name_len + 1; // +1 for the length byte
    let pad = (4 - (used & 3)) & 3;
    skip(c, pad as u64)?;

    // Raw Pascal-string name — caller can run restoreLayerNameEncoding on it.
    // We store it as latin-1 / raw bytes cast to char so Shift-JIS is preserved.
    let raw_name = name_raw.iter().map(|&b| b as char).collect::<String>();

    // Additional layer info blocks
    let mut layer_type = 0u32;
    let mut unicode_name: Option<String> = None;

    while c.position() + 12 <= extra_end {
        let _pos_before = c.position();
        let (key, block_len) = match read_ali_block_header(c, is_psb) {
            Ok(v) => v,
            Err(_) => break,
        };
        let data_start = c.position();

        match &key {
            b"lsct" | b"lsdk" => {
                if block_len >= 4 {
                    layer_type = read_u32(c)?;
                }
            }
            b"luni" => {
                // Unicode layer name: 4-byte char count, then UTF-16 BE code units
                if block_len >= 4 {
                    let char_count = read_u32(c)? as usize;
                    let needed = char_count * 2;
                    if block_len >= 4 + needed as u64 {
                        let mut units = Vec::with_capacity(char_count);
                        for _ in 0..char_count {
                            units.push(read_u16(c)?);
                        }
                        unicode_name = String::from_utf16(&units).ok();
                    }
                }
            }
            _ => {}
        }

        // Seek to end of block regardless of how much we read
        c.seek(SeekFrom::Start(data_start + block_len))
            .map_err(|e| e.to_string())?;
    }

    // Jump to end of extra data (handles any unrecognised trailing blocks)
    c.seek(SeekFrom::Start(extra_end))
        .map_err(|e| e.to_string())?;

    let name = unicode_name.unwrap_or(raw_name);

    Ok(LayerRecord {
        top,
        left,
        bottom,
        right,
        visible,
        name,
        channels,
        layer_type,
    })
}

// ── Channel image data decoder ────────────────────────────────────────────────

/// Decode all channels for one layer and interleave them into RGBA.
///
/// Returns `None` if the layer is empty or decompression fails.
fn decode_layer_rgba(
    c: &mut Cursor<&[u8]>,
    channels: &[ChannelInfo],
    width: u32,
    height: u32,
    depth: u16,
    is_psb: bool,
) -> Option<Vec<u8>> {
    let pixel_count = width as usize * height as usize;
    if pixel_count == 0 {
        // Skip all channel data even for empty layers
        for ch in channels {
            let _ = skip(c, ch.data_len);
        }
        return None;
    }

    let bytes_per_sample: usize = match depth {
        8 => 1,
        16 => 2,
        _ => 1, // fallback
    };

    let mut channel_data: Vec<(i16, Vec<u8>)> = Vec::with_capacity(channels.len());

    for ch in channels {
        let comp = match read_u16(c) {
            Ok(v) => v,
            Err(_) => return None,
        };
        let payload_len = ch.data_len.saturating_sub(2);

        let plane = match comp {
            // ── Raw ──
            0 => {
                let raw = match read_vec(c, pixel_count * bytes_per_sample) {
                    Ok(v) => v,
                    Err(_) => return None,
                };
                if depth == 8 {
                    raw
                } else {
                    // 16-bit: keep high byte
                    raw.chunks_exact(2).map(|b| b[0]).collect()
                }
            }

            // ── PackBits RLE ──
            1 => {
                let row_count = height as usize;
                let mut row_lens: Vec<usize> = Vec::with_capacity(row_count);
                for _ in 0..row_count {
                    let rl = if is_psb {
                        match read_u32(c) {
                            Ok(v) => v as usize,
                            Err(_) => return None,
                        }
                    } else {
                        match read_u16(c) {
                            Ok(v) => v as usize,
                            Err(_) => return None,
                        }
                    };
                    row_lens.push(rl);
                }

                let total: usize = row_lens.iter().sum();
                let compressed = match read_vec(c, total) {
                    Ok(v) => v,
                    Err(_) => return None,
                };

                let row_pixels = width as usize * bytes_per_sample;
                let mut raw: Vec<u8> = Vec::with_capacity(pixel_count * bytes_per_sample);
                let mut offset = 0usize;
                for &rlen in &row_lens {
                    let end = (offset + rlen).min(compressed.len());
                    let row = decompress_packbits(&compressed[offset..end], row_pixels);
                    raw.extend_from_slice(&row);
                    offset += rlen;
                }

                if depth == 8 {
                    raw
                } else {
                    raw.chunks_exact(2).map(|b| b[0]).collect()
                }
            }

            // ── ZIP (with/without prediction) ──
            2 | 3 => {
                let compressed = match read_vec(c, payload_len as usize) {
                    Ok(v) => v,
                    Err(_) => return None,
                };

                // Decompress with raw deflate (no zlib header in PSD ZIP blocks).
                use std::io::Read as _;
                let mut dec = flate2::read::DeflateDecoder::new(std::io::Cursor::new(&compressed));
                let mut raw: Vec<u8> = Vec::with_capacity(pixel_count * bytes_per_sample);
                let _ = dec.read_to_end(&mut raw);

                // For "ZIP with prediction" (type 3), undo horizontal delta.
                if comp == 3 {
                    let stride = width as usize * bytes_per_sample;
                    for row in 0..height as usize {
                        let base = row * stride;
                        if depth == 8 {
                            for col in 1..width as usize {
                                raw[base + col] = raw[base + col].wrapping_add(raw[base + col - 1]);
                            }
                        } else if depth == 16 {
                            // Delta is on pairs of bytes (big-endian u16)
                            for col in 1..width as usize {
                                let prev = u16::from_be_bytes([
                                    raw[base + (col - 1) * 2],
                                    raw[base + (col - 1) * 2 + 1],
                                ]);
                                let cur = u16::from_be_bytes([
                                    raw[base + col * 2],
                                    raw[base + col * 2 + 1],
                                ]);
                                let val = cur.wrapping_add(prev).to_be_bytes();
                                raw[base + col * 2] = val[0];
                                raw[base + col * 2 + 1] = val[1];
                            }
                        }
                    }
                }

                if depth == 8 {
                    raw
                } else {
                    raw.chunks_exact(2).map(|b| b[0]).collect()
                }
            }

            // ── Unknown ──
            _ => {
                let _ = skip(c, payload_len);
                return None;
            }
        };

        channel_data.push((ch.channel_id, plane));
    }

    Some(interleave_rgba(&channel_data, pixel_count))
}

// ── Public API ────────────────────────────────────────────────────────────────

/// A parsed PSD layer, including decompressed RGBA pixel data.
///
/// Layers are flattened pre-order (group node first, then its children,
/// siblings bottom-to-top) so that indices and group ids reproduce the
/// ag-psd walk used by the UI (`src/utils/psdAgPsdWorker.ts`).  The first
/// entry is therefore the bottom-most element of the layer stack.
pub struct PsdFastLayer {
    pub stable_id: String,
    pub name: String,
    pub top: i32,
    pub left: i32,
    pub width: u32,
    pub height: u32,
    pub visible: bool,
    /// Group ID of the *parent* group, if any.  Group IDs are assigned
    /// pre-order during flattening (same numbering as the ag-psd UI walk).
    pub parent_group_id: Option<u32>,
    /// If this layer is a group, its own group ID (assigned sequentially).
    pub is_group: bool,
    pub own_group_id: Option<u32>,
    /// RGBA pixel data (`width × height × 4` bytes).  `None` for groups,
    /// section-end dividers, invisible-but-empty layers, or decode failures.
    pub rgba: Option<Vec<u8>>,
}

pub struct PsdFastResult {
    pub width: u32,
    pub height: u32,
    pub layers: Vec<PsdFastLayer>,
}

pub fn composite_visible_psd_layers(psd: &PsdFastResult) -> Result<RgbaFrame, String> {
    composite_visible_psd_layers_with_filter(psd, None)
}

pub fn composite_visible_psd_layers_with_active_layer_ids(
    psd: &PsdFastResult,
    active_layer_ids: &[String],
) -> Result<RgbaFrame, String> {
    if active_layer_ids.is_empty() {
        return composite_visible_psd_layers(psd);
    }
    composite_visible_psd_layers_with_filter(psd, Some(active_layer_ids))
}

/// `psd.renderComposite` RPC の合成レイヤー選択ロジック。`active_layer_ids`
/// が `None`（RPCパラメータ省略）または空集合のときは visible な全リーフ
/// レイヤーを合成し、指定時はそのレイヤー集合のみを合成する。3Dステージの
/// PSDビルボードは PixiJS extract 撤去により合成手段を失っており、この
/// 関数はビルボードテクスチャ用の「PSDファイル→合成RGBA」経路の中核選択肢。
pub fn select_psd_composite_frame(
    psd: &PsdFastResult,
    active_layer_ids: Option<&[String]>,
) -> Result<RgbaFrame, String> {
    match active_layer_ids {
        Some(ids) if !ids.is_empty() => {
            composite_visible_psd_layers_with_active_layer_ids(psd, ids)
        }
        _ => composite_visible_psd_layers(psd),
    }
}

fn composite_visible_psd_layers_with_filter(
    psd: &PsdFastResult,
    active_layer_ids: Option<&[String]>,
) -> Result<RgbaFrame, String> {
    let canvas_len = usize::try_from(psd.width)
        .ok()
        .and_then(|width| {
            usize::try_from(psd.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| "PSD composite canvas byte length overflows".to_string())?;
    let mut canvas = vec![0u8; canvas_len];

    // own_group_id → group layer（祖先の可視性/active 判定に使う）。
    let groups: std::collections::HashMap<u32, &PsdFastLayer> = psd
        .layers
        .iter()
        .filter_map(|layer| layer.own_group_id.map(|id| (id, layer)))
        .collect();

    // parent_group_id チェーンを辿り、全ての祖先グループが述語を満たすか。
    let ancestors_all = |mut parent: Option<u32>, predicate: &dyn Fn(&PsdFastLayer) -> bool| {
        let mut remaining = psd.layers.len();
        while let Some(group_id) = parent {
            let Some(group) = groups.get(&group_id) else {
                break; // 参照先不明のグループは判定不能なので無視する
            };
            if !predicate(group) {
                return false;
            }
            parent = group.parent_group_id;
            remaining = remaining.saturating_sub(1);
            if remaining == 0 {
                break; // 循環防御
            }
        }
        true
    };

    // psd.layers は pre-order フラット列（先頭が最背面）。前から順に
    // source-over で塗ることで下→上の重なりを再現する。
    for layer in psd.layers.iter() {
        if layer.is_group {
            continue;
        }
        let included = match active_layer_ids {
            // activeLayerIds は UI の選択状態そのもの（radio 差分レイヤーは
            // ファイル上 hidden でも選択され得る）。ファイルの可視フラグでは
            // なく、リーフ自身と祖先グループの active 状態だけで判定する。
            Some(active_layer_ids) => {
                let is_active =
                    |candidate: &PsdFastLayer| active_layer_ids.contains(&candidate.stable_id);
                is_active(layer) && ancestors_all(layer.parent_group_id, &is_active)
            }
            // 無指定時は Photoshop と同様、リーフ自身と祖先グループの
            // 可視フラグを継承する。
            None => layer.visible && ancestors_all(layer.parent_group_id, &|g| g.visible),
        };
        if !included {
            continue;
        }
        let Some(rgba) = layer.rgba.as_ref() else {
            continue;
        };
        let layer_len = usize::try_from(layer.width)
            .ok()
            .and_then(|width| {
                usize::try_from(layer.height)
                    .ok()
                    .and_then(|height| width.checked_mul(height))
            })
            .and_then(|pixels| pixels.checked_mul(4))
            .ok_or_else(|| format!("PSD layer '{}' byte length overflows", layer.name))?;
        if rgba.len() != layer_len {
            return Err(format!(
                "PSD layer '{}' RGBA byte length mismatch: expected={}, actual={}",
                layer.name,
                layer_len,
                rgba.len()
            ));
        }

        composite_layer_source_over(&mut canvas, psd.width, psd.height, layer, rgba);
    }

    RgbaFrame::from_rgba8(psd.width, psd.height, canvas)
        .map_err(|error| format!("PSD composite frame is invalid: {error:?}"))
}

fn stable_layer_id(layer_index: usize, is_group: bool, own_group_id: Option<u32>) -> String {
    if is_group {
        format!("psd-group-{}", own_group_id.unwrap_or(layer_index as u32))
    } else {
        format!("psd-layer-{layer_index}")
    }
}

fn composite_layer_source_over(
    canvas: &mut [u8],
    canvas_width: u32,
    canvas_height: u32,
    layer: &PsdFastLayer,
    rgba: &[u8],
) {
    let canvas_width_i32 = i32::try_from(canvas_width).unwrap_or(i32::MAX);
    let canvas_height_i32 = i32::try_from(canvas_height).unwrap_or(i32::MAX);
    let canvas_width_usize = usize::try_from(canvas_width).unwrap_or(0);
    let layer_width_usize = usize::try_from(layer.width).unwrap_or(0);

    for y in 0..layer.height {
        let canvas_y = layer.top + i32::try_from(y).unwrap_or(i32::MAX);
        if canvas_y < 0 || canvas_y >= canvas_height_i32 {
            continue;
        }
        for x in 0..layer.width {
            let canvas_x = layer.left + i32::try_from(x).unwrap_or(i32::MAX);
            if canvas_x < 0 || canvas_x >= canvas_width_i32 {
                continue;
            }

            let src_index = ((usize::try_from(y).unwrap_or(0) * layer_width_usize)
                + usize::try_from(x).unwrap_or(0))
                * 4;
            let dst_index = ((usize::try_from(canvas_y).unwrap_or(0) * canvas_width_usize)
                + usize::try_from(canvas_x).unwrap_or(0))
                * 4;
            source_over_pixel(
                &mut canvas[dst_index..dst_index + 4],
                &rgba[src_index..src_index + 4],
            );
        }
    }
}

fn source_over_pixel(dst: &mut [u8], src: &[u8]) {
    let src_alpha = f32::from(src[3]) / 255.0;
    if src_alpha <= 0.0 {
        return;
    }
    let dst_alpha = f32::from(dst[3]) / 255.0;
    let out_alpha = src_alpha + dst_alpha * (1.0 - src_alpha);
    if out_alpha <= 0.0 {
        dst.copy_from_slice(&[0, 0, 0, 0]);
        return;
    }

    for channel in 0..3 {
        let src_channel = f32::from(src[channel]) / 255.0;
        let dst_channel = f32::from(dst[channel]) / 255.0;
        let out_channel =
            (src_channel * src_alpha + dst_channel * dst_alpha * (1.0 - src_alpha)) / out_alpha;
        dst[channel] = (out_channel * 255.0).round().clamp(0.0, 255.0) as u8;
    }
    dst[3] = (out_alpha * 255.0).round().clamp(0.0, 255.0) as u8;
}

/// Parse a PSD/PSB file from raw bytes and return per-layer RGBA pixel data.
pub fn parse_psd_fast(bytes: &[u8]) -> Result<PsdFastResult, String> {
    let mut c = Cursor::new(bytes);

    // ── File header ──────────────────────────────────────────────────────────
    let sig = read_tag(&mut c)?;
    if &sig != b"8BPS" {
        return Err("Not a PSD file (bad signature)".into());
    }
    let version = read_u16(&mut c)?;
    if version != 1 && version != 2 {
        return Err(format!("Unsupported PSD version: {version}"));
    }
    let is_psb = version == 2;
    skip(&mut c, 6)?; // reserved
    let _num_channels = read_u16(&mut c)?;
    let doc_height = read_u32(&mut c)?;
    let doc_width = read_u32(&mut c)?;
    let depth = read_u16(&mut c)?;
    let _color_mode = read_u16(&mut c)?;

    // ── Skip colour mode data ─────────────────────────────────────────────────
    let cml = read_u32(&mut c)? as u64;
    skip(&mut c, cml)?;

    // ── Skip image resources ──────────────────────────────────────────────────
    let irl = read_u32(&mut c)? as u64;
    skip(&mut c, irl)?;

    // ── Layer and mask info ───────────────────────────────────────────────────
    let lam_len = if is_psb {
        read_u64(&mut c)?
    } else {
        read_u32(&mut c)? as u64
    };
    if lam_len == 0 {
        return Ok(PsdFastResult {
            width: doc_width,
            height: doc_height,
            layers: vec![],
        });
    }

    // ── Layer info ────────────────────────────────────────────────────────────
    let li_len = if is_psb {
        read_u64(&mut c)?
    } else {
        read_u32(&mut c)? as u64
    };
    if li_len == 0 {
        return Ok(PsdFastResult {
            width: doc_width,
            height: doc_height,
            layers: vec![],
        });
    }

    // Layer count (negative = merged image has alpha)
    let raw_count = read_i16(&mut c)?;
    let layer_count = raw_count.unsigned_abs() as usize;

    // ── Phase 1: parse all layer records (metadata only, no pixels yet) ───────
    let mut records: Vec<LayerRecord> = Vec::with_capacity(layer_count);
    for _ in 0..layer_count {
        records.push(parse_layer_record(&mut c, is_psb)?);
    }

    // ── Phase 2: decode channel image data ────────────────────────────────────
    // Channel image data follows the layer records in the same (file) order.
    let mut pixel_data: Vec<Option<Vec<u8>>> = Vec::with_capacity(layer_count);
    for rec in &records {
        match rec.layer_type {
            0 => {
                // Leaf layer: decode pixels
                let w = (rec.right - rec.left).max(0) as u32;
                let h = (rec.bottom - rec.top).max(0) as u32;
                let rgba = decode_layer_rgba(&mut c, &rec.channels, w, h, depth, is_psb);
                pixel_data.push(rgba);
            }
            _ => {
                // Group or section-end: skip all channel data
                for ch in &rec.channels {
                    skip(&mut c, ch.data_len)?;
                }
                pixel_data.push(None);
            }
        }
    }

    // ── Phase 3: rebuild the group tree from file order ──────────────────────
    // PSD stores layer records bottom-to-top.  A group is encoded as:
    //   [bounding section divider (type 3)]  ← below the group's content
    //   [child layers …]
    //   [group header (type 1/2)]            ← the visible group entry
    // So, scanning in file order, a type-3 divider OPENS a group's content and
    // the header CLOSES it.
    enum TreeNode {
        Leaf { record_idx: usize },
        Group { record_idx: usize, children: Vec<TreeNode> },
    }

    let mut stack: Vec<Vec<TreeNode>> = vec![Vec::new()];
    for (i, rec) in records.iter().enumerate() {
        match rec.layer_type {
            3 => stack.push(Vec::new()),
            1 | 2 => {
                // Malformed files may miss the matching divider; degrade to an
                // empty group instead of corrupting the root level.
                let children = if stack.len() > 1 {
                    stack.pop().unwrap_or_default()
                } else {
                    Vec::new()
                };
                stack
                    .last_mut()
                    .expect("root accumulator always present")
                    .push(TreeNode::Group {
                        record_idx: i,
                        children,
                    });
            }
            _ => stack
                .last_mut()
                .expect("root accumulator always present")
                .push(TreeNode::Leaf { record_idx: i }),
        }
    }
    // Unmatched dividers: merge orphaned accumulators back into the root.
    while stack.len() > 1 {
        let orphan = stack.pop().unwrap_or_default();
        stack
            .last_mut()
            .expect("root accumulator always present")
            .extend(orphan);
    }
    let roots = stack.pop().unwrap_or_default();

    // ── Phase 4: flatten in pre-order, matching the ag-psd UI walk ───────────
    // The UI (src/utils/psdAgPsdWorker.ts walkLayers) flattens the layer tree
    // pre-order: group node first, then its children, siblings in file order
    // (bottom-to-top).  layerIndex is the flattened index (dividers excluded)
    // and ownGroupId is assigned pre-order.  stable ids MUST reproduce that
    // numbering, otherwise activeLayerIds from the UI never match.
    fn flatten(
        nodes: Vec<TreeNode>,
        parent_group_id: Option<u32>,
        records: &[LayerRecord],
        pixel_data: &mut [Option<Vec<u8>>],
        group_id_counter: &mut u32,
        layers: &mut Vec<PsdFastLayer>,
    ) {
        for node in nodes {
            match node {
                TreeNode::Leaf { record_idx } => {
                    let rec = &records[record_idx];
                    let flat_idx = layers.len();
                    layers.push(PsdFastLayer {
                        stable_id: stable_layer_id(flat_idx, false, None),
                        name: rec.name.clone(),
                        top: rec.top,
                        left: rec.left,
                        width: (rec.right - rec.left).max(0) as u32,
                        height: (rec.bottom - rec.top).max(0) as u32,
                        visible: rec.visible,
                        parent_group_id,
                        is_group: false,
                        own_group_id: None,
                        rgba: pixel_data[record_idx].take(),
                    });
                }
                TreeNode::Group {
                    record_idx,
                    children,
                } => {
                    let rec = &records[record_idx];
                    let own_group_id = *group_id_counter;
                    *group_id_counter += 1;
                    let flat_idx = layers.len();
                    layers.push(PsdFastLayer {
                        stable_id: stable_layer_id(flat_idx, true, Some(own_group_id)),
                        name: rec.name.clone(),
                        top: rec.top,
                        left: rec.left,
                        width: (rec.right - rec.left).max(0) as u32,
                        height: (rec.bottom - rec.top).max(0) as u32,
                        visible: rec.visible,
                        parent_group_id,
                        is_group: true,
                        own_group_id: Some(own_group_id),
                        rgba: None,
                    });
                    flatten(
                        children,
                        Some(own_group_id),
                        records,
                        pixel_data,
                        group_id_counter,
                        layers,
                    );
                }
            }
        }
    }

    let mut layers: Vec<PsdFastLayer> = Vec::with_capacity(layer_count);
    let mut group_id_counter = 0u32;
    flatten(
        roots,
        None,
        &records,
        &mut pixel_data,
        &mut group_id_counter,
        &mut layers,
    );

    Ok(PsdFastResult {
        width: doc_width,
        height: doc_height,
        layers,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── メタデータ専用パースの契約 ────────────────────────────────────────────
    // `parse_psd_meta_only` は `parse_psd_fast` と同じレイヤーツリー
    // （id・名前・座標・可視性・親子構造・並び順）を返すが、チャンネル画像
    // データの伸長は一切行わない（全レイヤーの `rgba` が常に `None`）。
    // 手書きの最小 PSD バイト列（グループ1つ＋子リーフ1つ）で両関数を実PSD
    // バイトに対して実行し、メタデータが完全一致すること・ピクセルの有無が
    // 意図通りに異なることを確認する。

    fn push_u16_be(bytes: &mut Vec<u8>, value: u16) {
        bytes.extend_from_slice(&value.to_be_bytes());
    }
    fn push_i16_be(bytes: &mut Vec<u8>, value: i16) {
        bytes.extend_from_slice(&value.to_be_bytes());
    }
    fn push_u32_be(bytes: &mut Vec<u8>, value: u32) {
        bytes.extend_from_slice(&value.to_be_bytes());
    }
    fn push_i32_be(bytes: &mut Vec<u8>, value: i32) {
        bytes.extend_from_slice(&value.to_be_bytes());
    }

    struct FixtureLayer {
        top: i32,
        left: i32,
        bottom: i32,
        right: i32,
        visible: bool,
        name: &'static str,
        /// (channel_id, raw pixel plane). Written with compression type 0 (raw).
        channels: Vec<(i16, Vec<u8>)>,
        /// `lsct` additional-layer-info value: 1/2 = group header (open/closed),
        /// 3 = bounding section divider. `None` = ordinary leaf layer.
        lsct: Option<u32>,
    }

    fn build_layer_record_and_data(layer: &FixtureLayer) -> (Vec<u8>, Vec<u8>) {
        let mut record = Vec::new();
        push_i32_be(&mut record, layer.top);
        push_i32_be(&mut record, layer.left);
        push_i32_be(&mut record, layer.bottom);
        push_i32_be(&mut record, layer.right);
        push_u16_be(&mut record, layer.channels.len() as u16);

        let mut channel_data = Vec::new();
        for (channel_id, plane) in &layer.channels {
            let channel_len = 2 + plane.len() as u32; // +2 for the raw compression-type prefix
            push_i16_be(&mut record, *channel_id);
            push_u32_be(&mut record, channel_len);
            push_u16_be(&mut channel_data, 0); // compression = raw
            channel_data.extend_from_slice(plane);
        }

        record.extend_from_slice(b"8BIM");
        record.extend_from_slice(b"norm");
        record.push(255); // opacity
        record.push(0); // clipping
        record.push(if layer.visible { 0 } else { 2 }); // flags: bit1 set = hidden
        record.push(0); // filler

        let mut extra = Vec::new();
        push_u32_be(&mut extra, 0); // layer mask data length
        push_u32_be(&mut extra, 0); // layer blending ranges length
        let name_bytes = layer.name.as_bytes();
        extra.push(name_bytes.len() as u8);
        extra.extend_from_slice(name_bytes);
        let used = 1 + name_bytes.len();
        let pad = (4 - (used & 3)) & 3;
        extra.resize(extra.len() + pad, 0);
        if let Some(lsct_value) = layer.lsct {
            extra.extend_from_slice(b"8BIM");
            extra.extend_from_slice(b"lsct");
            push_u32_be(&mut extra, 4);
            push_u32_be(&mut extra, lsct_value);
        }

        push_u32_be(&mut record, extra.len() as u32);
        record.extend_from_slice(&extra);

        (record, channel_data)
    }

    /// One group ("Group 1") containing one leaf ("Child Leaf", 2×2 RGBA),
    /// stored in file order (bottom→top): divider, child, group header —
    /// matching `build_layer_tree`'s expectations documented above `flatten`.
    fn group_and_leaf_psd_bytes() -> Vec<u8> {
        let plane = |v: u8| vec![v; 4]; // 2×2 = 4 pixels
        let divider = FixtureLayer {
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            visible: true,
            name: "</Layer group>",
            channels: vec![],
            lsct: Some(3),
        };
        let child = FixtureLayer {
            top: 1,
            left: 1,
            bottom: 3,
            right: 3,
            visible: true,
            name: "Child Leaf",
            channels: vec![
                (0i16, plane(10)),
                (1i16, plane(20)),
                (2i16, plane(30)),
                (-1i16, plane(255)),
            ],
            lsct: None,
        };
        let group_header = FixtureLayer {
            top: 1,
            left: 1,
            bottom: 3,
            right: 3,
            visible: true,
            name: "Group 1",
            channels: vec![],
            lsct: Some(2), // closed group
        };

        let mut layer_records_bytes = Vec::new();
        let mut channel_data_bytes = Vec::new();
        for layer in [&divider, &child, &group_header] {
            let (record, cdata) = build_layer_record_and_data(layer);
            layer_records_bytes.extend_from_slice(&record);
            channel_data_bytes.extend_from_slice(&cdata);
        }

        let layer_info_len = 2 + layer_records_bytes.len() + channel_data_bytes.len();
        let layer_and_mask_len = 4 + layer_info_len;

        let mut psd = Vec::new();
        psd.extend_from_slice(b"8BPS");
        push_u16_be(&mut psd, 1);
        psd.extend_from_slice(&[0; 6]);
        push_u16_be(&mut psd, 4);
        push_u32_be(&mut psd, 4); // doc height
        push_u32_be(&mut psd, 4); // doc width
        push_u16_be(&mut psd, 8);
        push_u16_be(&mut psd, 3);
        push_u32_be(&mut psd, 0); // colour mode data length
        push_u32_be(&mut psd, 0); // image resources length
        push_u32_be(&mut psd, layer_and_mask_len as u32);
        push_u32_be(&mut psd, layer_info_len as u32);
        push_i16_be(&mut psd, 3); // layer count
        psd.extend_from_slice(&layer_records_bytes);
        psd.extend_from_slice(&channel_data_bytes);
        psd
    }

    /// Every field except `rgba` — the one field meta-only is allowed to differ on.
    fn layer_metadata_key(
        layer: &PsdFastLayer,
    ) -> (&str, &str, i32, i32, u32, u32, bool, Option<u32>, bool, Option<u32>) {
        (
            &layer.stable_id,
            &layer.name,
            layer.top,
            layer.left,
            layer.width,
            layer.height,
            layer.visible,
            layer.parent_group_id,
            layer.is_group,
            layer.own_group_id,
        )
    }

    #[test]
    fn parse_psd_meta_only_matches_full_parse_metadata_without_decoding_pixels() {
        let bytes = group_and_leaf_psd_bytes();

        let full = parse_psd_fast(&bytes).expect("full parse succeeds");
        let meta = parse_psd_meta_only(&bytes).expect("meta-only parse succeeds");

        assert_eq!(full.width, meta.width);
        assert_eq!(full.height, meta.height);
        assert_eq!(full.layers.len(), meta.layers.len());
        assert_eq!(full.layers.len(), 2, "divider must not become an output entry");

        let full_keys: Vec<_> = full.layers.iter().map(layer_metadata_key).collect();
        let meta_keys: Vec<_> = meta.layers.iter().map(layer_metadata_key).collect();
        assert_eq!(full_keys, meta_keys, "metadata must be identical between the two parsers");

        // The full parse actually decoded the child leaf's pixels...
        let full_leaf = full.layers.iter().find(|l| !l.is_group).expect("full leaf");
        assert_eq!(full_leaf.rgba.as_ref().map(|d| d.len()), Some(4 * 4));

        // ...while the metadata-only parse never touched channel image data.
        for layer in &meta.layers {
            assert!(layer.rgba.is_none(), "meta-only parse must not decode any pixels");
        }
    }

    // ── 契約メモ ──────────────────────────────────────────────────────────────
    // `PsdFastResult::layers` は ag-psd worker（src/utils/psdAgPsdWorker.ts の
    // walkLayers）と同じ「pre-order DFS のフラット列」でなければならない:
    //   - グループノードが先、その子が後（ファイル上は逆順で格納されている）
    //   - 兄弟はファイル格納順（＝下→上の重なり順）
    //   - layerIndex は section divider を除いたフラット index
    //   - ownGroupId は pre-order で 0 から採番
    // この採番が UI 側 buildStablePsdLayerNodeId と一致することで、
    // activeLayerIds（psd-layer-N / psd-group-N）が合成側と噛み合う。

    fn leaf(
        stable_id: &str,
        name: &str,
        parent_group_id: Option<u32>,
        visible: bool,
        rgba: Vec<u8>,
        (left, top, width, height): (i32, i32, u32, u32),
    ) -> PsdFastLayer {
        PsdFastLayer {
            stable_id: stable_id.to_string(),
            name: name.to_string(),
            top,
            left,
            width,
            height,
            visible,
            parent_group_id,
            is_group: false,
            own_group_id: None,
            rgba: Some(rgba),
        }
    }

    fn group(
        own_group_id: u32,
        name: &str,
        parent_group_id: Option<u32>,
        visible: bool,
    ) -> PsdFastLayer {
        PsdFastLayer {
            stable_id: format!("psd-group-{own_group_id}"),
            name: name.to_string(),
            top: 0,
            left: 0,
            width: 0,
            height: 0,
            visible,
            parent_group_id,
            is_group: true,
            own_group_id: Some(own_group_id),
            rgba: None,
        }
    }

    // ── 合成順序: layers はフラット列で「先頭が最背面」。前から順に塗る ──────

    #[test]
    fn composite_visible_psd_layers_draws_leaf_layers_from_bottom_to_top() {
        let psd = PsdFastResult {
            width: 3,
            height: 2,
            layers: vec![
                // フラット列の先頭 = 最背面（PSD ファイル格納順は下→上）。
                leaf(
                    "psd-layer-0",
                    "back",
                    None,
                    true,
                    vec![
                        0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
                        255, 0, 0, 255, 255,
                    ],
                    (0, 0, 3, 2),
                ),
                group(1, "group", None, true),
                leaf(
                    "psd-layer-2",
                    "hidden",
                    None,
                    false,
                    vec![0, 255, 0, 255],
                    (0, 0, 1, 1),
                ),
                leaf(
                    "psd-layer-3",
                    "front",
                    None,
                    true,
                    vec![255, 0, 0, 128, 255, 0, 0, 128, 255, 0, 0, 128, 255, 0, 0, 128],
                    (1, 0, 2, 2),
                ),
            ],
        };

        let frame = composite_visible_psd_layers(&psd).expect("composited PSD frame");

        assert_eq!(frame.width, 3);
        assert_eq!(frame.height, 2);
        // front(半透明の赤) が back(青) の上に乗る。
        assert_eq!(
            frame.pixels,
            vec![
                0, 0, 255, 255, 128, 0, 127, 255, 128, 0, 127, 255, 0, 0, 255, 255, 128, 0, 127,
                255, 128, 0, 127, 255,
            ]
        );
    }

    #[test]
    fn composite_visible_psd_layers_skips_leaves_inside_hidden_groups() {
        let psd = PsdFastResult {
            width: 1,
            height: 1,
            layers: vec![
                leaf(
                    "psd-layer-0",
                    "base",
                    None,
                    true,
                    vec![0, 0, 255, 255],
                    (0, 0, 1, 1),
                ),
                group(0, "hidden group", None, false),
                // グループ自体が非表示なら、可視フラグ付きの子リーフも描かない。
                leaf(
                    "psd-layer-2",
                    "child of hidden group",
                    Some(0),
                    true,
                    vec![255, 0, 0, 255],
                    (0, 0, 1, 1),
                ),
            ],
        };

        let frame = composite_visible_psd_layers(&psd).expect("composited PSD frame");

        assert_eq!(frame.pixels, vec![0, 0, 255, 255]);
    }

    // ── activeLayerIds 指定時: UI の選択集合が唯一の真実 ─────────────────────

    #[test]
    fn composite_visible_psd_layers_with_active_ids_draws_only_selected_leaf_layers() {
        let psd = PsdFastResult {
            width: 1,
            height: 1,
            layers: vec![
                leaf(
                    "psd-layer-0",
                    "back",
                    None,
                    true,
                    vec![0, 0, 255, 255],
                    (0, 0, 1, 1),
                ),
                leaf(
                    "psd-layer-1",
                    "front",
                    None,
                    true,
                    vec![255, 0, 0, 255],
                    (0, 0, 1, 1),
                ),
            ],
        };

        let frame =
            composite_visible_psd_layers_with_active_layer_ids(&psd, &["psd-layer-0".to_string()])
                .expect("composited PSD frame");

        assert_eq!(frame.pixels, vec![0, 0, 255, 255]);
    }

    #[test]
    fn composite_with_active_ids_draws_default_hidden_leaf_when_selected() {
        // ラジオグループの差分レイヤーはファイル上 hidden で保存されることが
        // 多い。UI で選択（activeLayerIds に列挙）されたら描画しなければ
        // ならない — ファイルの hidden フラグで選択を打ち消してはいけない。
        let psd = PsdFastResult {
            width: 1,
            height: 1,
            layers: vec![leaf(
                "psd-layer-0",
                "wink",
                None,
                false,
                vec![255, 0, 0, 255],
                (0, 0, 1, 1),
            )],
        };

        let frame =
            composite_visible_psd_layers_with_active_layer_ids(&psd, &["psd-layer-0".to_string()])
                .expect("composited PSD frame");

        assert_eq!(frame.pixels, vec![255, 0, 0, 255]);
    }

    #[test]
    fn composite_with_active_ids_skips_leaf_when_ancestor_group_is_inactive() {
        let psd = PsdFastResult {
            width: 1,
            height: 1,
            layers: vec![
                leaf(
                    "psd-layer-0",
                    "base",
                    None,
                    true,
                    vec![0, 0, 255, 255],
                    (0, 0, 1, 1),
                ),
                group(3, "deactivated group", None, true),
                leaf(
                    "psd-layer-2",
                    "child",
                    Some(3),
                    true,
                    vec![255, 0, 0, 255],
                    (0, 0, 1, 1),
                ),
            ],
        };

        // 祖先グループ psd-group-3 が activeLayerIds に無い → 子は描かない。
        let frame = composite_visible_psd_layers_with_active_layer_ids(
            &psd,
            &["psd-layer-0".to_string(), "psd-layer-2".to_string()],
        )
        .expect("composited PSD frame");
        assert_eq!(frame.pixels, vec![0, 0, 255, 255]);

        // 祖先グループも active なら子を描く。
        let frame = composite_visible_psd_layers_with_active_layer_ids(
            &psd,
            &[
                "psd-layer-0".to_string(),
                "psd-group-3".to_string(),
                "psd-layer-2".to_string(),
            ],
        )
        .expect("composited PSD frame");
        assert_eq!(frame.pixels, vec![255, 0, 0, 255]);
    }

    fn two_layer_psd_fixture() -> PsdFastResult {
        PsdFastResult {
            width: 1,
            height: 1,
            layers: vec![
                leaf(
                    "psd-layer-0",
                    "back",
                    None,
                    true,
                    vec![0, 0, 255, 255],
                    (0, 0, 1, 1),
                ),
                leaf(
                    "psd-layer-1",
                    "front",
                    None,
                    true,
                    vec![255, 0, 0, 255],
                    (0, 0, 1, 1),
                ),
            ],
        }
    }

    #[test]
    fn select_psd_composite_frame_composites_all_visible_layers_when_active_ids_is_none() {
        let psd = two_layer_psd_fixture();

        let frame = select_psd_composite_frame(&psd, None).expect("composited PSD frame");

        // 上に乗る front(赤, alpha 255) が back(青) を完全に覆う。
        assert_eq!(frame.pixels, vec![255, 0, 0, 255]);
    }

    #[test]
    fn select_psd_composite_frame_composites_all_visible_layers_when_active_ids_is_empty() {
        let psd = two_layer_psd_fixture();

        let frame = select_psd_composite_frame(&psd, Some(&[])).expect("composited PSD frame");

        assert_eq!(frame.pixels, vec![255, 0, 0, 255]);
    }

    #[test]
    fn select_psd_composite_frame_composites_only_the_requested_active_layers() {
        let psd = two_layer_psd_fixture();

        let frame = select_psd_composite_frame(&psd, Some(&["psd-layer-0".to_string()]))
            .expect("composited PSD frame");

        assert_eq!(frame.pixels, vec![0, 0, 255, 255]);
    }

    // ── パーサ: フラット化順序と stable id の ag-psd 互換性 ──────────────────

    /// テスト用の最小 PSD バイナリを生成する。
    /// `records` はファイル格納順（下→上）。kind: 0=リーフ, 1=グループヘッダ,
    /// 3=bounding section divider。リーフはチャネル 0 本（全画素が不透明白に
    /// フォールバックする）で表現する。
    fn build_test_psd(
        doc_width: u32,
        doc_height: u32,
        records: &[(u8, &str, (i32, i32, i32, i32), bool)],
    ) -> Vec<u8> {
        let mut record_bytes: Vec<u8> = Vec::new();
        for (kind, name, (top, left, bottom, right), hidden) in records {
            record_bytes.extend(top.to_be_bytes());
            record_bytes.extend(left.to_be_bytes());
            record_bytes.extend(bottom.to_be_bytes());
            record_bytes.extend(right.to_be_bytes());
            record_bytes.extend(0u16.to_be_bytes()); // channel count = 0
            record_bytes.extend(b"8BIM");
            record_bytes.extend(b"norm");
            record_bytes.push(255); // opacity
            record_bytes.push(0); // clipping
            record_bytes.push(if *hidden { 2 } else { 0 }); // flags
            record_bytes.push(0); // filler

            let mut extra: Vec<u8> = Vec::new();
            extra.extend(0u32.to_be_bytes()); // layer mask data
            extra.extend(0u32.to_be_bytes()); // blending ranges
            let name_bytes = name.as_bytes();
            extra.push(u8::try_from(name_bytes.len()).expect("test name fits in pascal string"));
            extra.extend(name_bytes);
            let used = name_bytes.len() + 1;
            extra.extend(std::iter::repeat(0u8).take((4 - (used & 3)) & 3));
            if *kind != 0 {
                extra.extend(b"8BIM");
                extra.extend(b"lsct");
                extra.extend(4u32.to_be_bytes());
                extra.extend(u32::from(*kind).to_be_bytes());
            }
            record_bytes.extend(u32::try_from(extra.len()).unwrap().to_be_bytes());
            record_bytes.extend(extra);
        }

        let layer_info_len = 2 + record_bytes.len(); // i16 count + records
        let lam_len = 4 + layer_info_len; // u32 layer-info length + layer info

        let mut bytes: Vec<u8> = Vec::new();
        bytes.extend(b"8BPS");
        bytes.extend(1u16.to_be_bytes()); // version
        bytes.extend([0u8; 6]); // reserved
        bytes.extend(3u16.to_be_bytes()); // channels
        bytes.extend(doc_height.to_be_bytes());
        bytes.extend(doc_width.to_be_bytes());
        bytes.extend(8u16.to_be_bytes()); // depth
        bytes.extend(3u16.to_be_bytes()); // colour mode = RGB
        bytes.extend(0u32.to_be_bytes()); // colour mode data
        bytes.extend(0u32.to_be_bytes()); // image resources
        bytes.extend(u32::try_from(lam_len).unwrap().to_be_bytes());
        bytes.extend(u32::try_from(layer_info_len).unwrap().to_be_bytes());
        bytes.extend(
            i16::try_from(records.len())
                .expect("test layer count fits in i16")
                .to_be_bytes(),
        );
        bytes.extend(record_bytes);
        bytes
    }

    #[test]
    fn parse_psd_fast_flattens_groups_in_ag_psd_pre_order() {
        // ファイル格納順（下→上）: bottom リーフ, divider, グループの子,
        // グループヘッダ（hidden）。Photoshop パネル表現では
        // root = [bottom, G[child]]（bottom が最背面）。
        let bytes = build_test_psd(
            2,
            2,
            &[
                (0, "bottom", (0, 0, 1, 1), false),
                (3, "</Layer group>", (0, 0, 0, 0), false),
                (0, "child", (0, 0, 1, 1), false),
                (1, "G", (0, 0, 0, 0), true),
            ],
        );

        let psd = parse_psd_fast(&bytes).expect("parsed test PSD");

        assert_eq!(psd.layers.len(), 3, "divider はフラット列に含めない");

        // [0] 最背面のリーフ。
        assert_eq!(psd.layers[0].name, "bottom");
        assert_eq!(psd.layers[0].stable_id, "psd-layer-0");
        assert!(!psd.layers[0].is_group);
        assert_eq!(psd.layers[0].parent_group_id, None);
        assert!(psd.layers[0].visible);

        // [1] グループが子より先（pre-order）。ownGroupId は pre-order 採番。
        assert_eq!(psd.layers[1].name, "G");
        assert_eq!(psd.layers[1].stable_id, "psd-group-0");
        assert!(psd.layers[1].is_group);
        assert_eq!(psd.layers[1].own_group_id, Some(0));
        assert_eq!(psd.layers[1].parent_group_id, None);
        assert!(!psd.layers[1].visible, "グループヘッダの hidden フラグを反映する");

        // [2] グループの子。layerIndex はフラット index。
        assert_eq!(psd.layers[2].name, "child");
        assert_eq!(psd.layers[2].stable_id, "psd-layer-2");
        assert_eq!(psd.layers[2].parent_group_id, Some(0));
        assert!(psd.layers[2].visible);
    }

    #[test]
    fn parse_psd_fast_nests_sibling_groups_like_ag_psd() {
        // root = [A[a1], B[B1[b1], b2]]（A が最背面）。ファイル格納順は
        // 下→上なので divider→子→ヘッダ の並びが 2 系統続く。
        let bytes = build_test_psd(
            2,
            2,
            &[
                (3, "</Layer group>", (0, 0, 0, 0), false),
                (0, "a1", (0, 0, 1, 1), false),
                (1, "A", (0, 0, 0, 0), false),
                (3, "</Layer group>", (0, 0, 0, 0), false),
                (3, "</Layer group>", (0, 0, 0, 0), false),
                (0, "b1", (0, 0, 1, 1), false),
                (1, "B1", (0, 0, 0, 0), false),
                (0, "b2", (0, 0, 1, 1), false),
                (1, "B", (0, 0, 0, 0), false),
            ],
        );

        let psd = parse_psd_fast(&bytes).expect("parsed test PSD");

        let summary: Vec<(String, String, Option<u32>)> = psd
            .layers
            .iter()
            .map(|l| (l.name.clone(), l.stable_id.clone(), l.parent_group_id))
            .collect();

        assert_eq!(
            summary,
            vec![
                ("A".to_string(), "psd-group-0".to_string(), None),
                ("a1".to_string(), "psd-layer-1".to_string(), Some(0)),
                ("B".to_string(), "psd-group-1".to_string(), None),
                ("B1".to_string(), "psd-group-2".to_string(), Some(1)),
                ("b1".to_string(), "psd-layer-4".to_string(), Some(2)),
                ("b2".to_string(), "psd-layer-5".to_string(), Some(1)),
            ]
        );
    }

    /// 実素材による回帰テスト。素材が存在しない環境では skip する。
    /// 期待値は ag-psd（UI 側パーサ）の pre-order フラット化結果と一致する
    /// こと（node で実測済みの値をハードコード）。
    #[test]
    fn parse_psd_fast_matches_ag_psd_layer_ids_for_real_asset() {
        let path = "/Users/yuki/GitHub/UX-Film-Director/葵ちゃん.psd";
        let Ok(bytes) = std::fs::read(path) else {
            eprintln!("skip: {path} not found");
            return;
        };

        let psd = parse_psd_fast(&bytes).expect("parsed real PSD");

        assert_eq!(psd.layers.len(), 171);

        // ag-psd 実測: [0] psd-group-0 "!髪", [1] psd-group-1 "*髪 ショート"
        // (hidden, parent=0), [2] psd-layer-2 "!髪　色" (parent=1),
        // [4] psd-group-2 "*髪 ロング" (parent=0), [5] psd-layer-5 "!髪 色"。
        assert_eq!(psd.layers[0].stable_id, "psd-group-0");
        assert_eq!(psd.layers[0].name, "!髪");
        assert!(psd.layers[0].visible);

        assert_eq!(psd.layers[1].stable_id, "psd-group-1");
        assert_eq!(psd.layers[1].name, "*髪 ショート");
        assert!(!psd.layers[1].visible);
        assert_eq!(psd.layers[1].parent_group_id, Some(0));

        assert_eq!(psd.layers[2].stable_id, "psd-layer-2");
        assert_eq!(psd.layers[2].name, "!髪\u{3000}色");
        assert_eq!(psd.layers[2].parent_group_id, Some(1));

        assert_eq!(psd.layers[4].stable_id, "psd-group-2");
        assert_eq!(psd.layers[4].name, "*髪 ロング");
        assert_eq!(psd.layers[4].parent_group_id, Some(0));

        assert_eq!(psd.layers[5].stable_id, "psd-layer-5");
        assert_eq!(psd.layers[5].name, "!髪 色");
        assert_eq!(psd.layers[5].parent_group_id, Some(2));
    }
}
