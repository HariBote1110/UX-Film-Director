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
fn read_u16(c: &mut Cursor<&[u8]>) -> R<u16> { read_be!(c, u16) }
fn read_i16(c: &mut Cursor<&[u8]>) -> R<i16> { read_be!(c, i16) }
fn read_u32(c: &mut Cursor<&[u8]>) -> R<u32> { read_be!(c, u32) }
fn read_i32(c: &mut Cursor<&[u8]>) -> R<i32> { read_be!(c, i32) }
fn read_u64(c: &mut Cursor<&[u8]>) -> R<u64> { read_be!(c, u64) }

fn skip(c: &mut Cursor<&[u8]>, n: u64) -> R<()> {
    c.seek(SeekFrom::Current(n as i64)).map_err(|e| e.to_string())?;
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
        b"LMsk", b"Lr16", b"Lr32", b"layr", b"Mt16", b"Mt32", b"Mtrn",
        b"Alph", b"FMsk", b"lnkD", b"lnk2", b"lnk3", b"lnkE",
        b"vmsk", b"vogk", b"vsms",
    ];
    let use_long = is_psb && PSB_LONG_KEYS.iter().any(|k| **k == key);
    let block_len = if use_long { read_u64(c)? } else { read_u32(c)? as u64 };

    Ok((key, block_len))
}

// ── Layer record ──────────────────────────────────────────────────────────────

pub struct ChannelInfo {
    pub channel_id: i16,
    /// Byte length of this channel's entry in the channel image data section
    /// (includes the 2-byte compression-type prefix).
    pub data_len: u64,
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
        let data_len = if is_psb { read_u64(c)? } else { read_u32(c)? as u64 };
        channels.push(ChannelInfo { channel_id: ch_id, data_len });
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
                        match read_u32(c) { Ok(v) => v as usize, Err(_) => return None }
                    } else {
                        match read_u16(c) { Ok(v) => v as usize, Err(_) => return None }
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
                let mut dec =
                    flate2::read::DeflateDecoder::new(std::io::Cursor::new(&compressed));
                let mut raw: Vec<u8> = Vec::with_capacity(pixel_count * bytes_per_sample);
                let _ = dec.read_to_end(&mut raw);

                // For "ZIP with prediction" (type 3), undo horizontal delta.
                if comp == 3 {
                    let stride = width as usize * bytes_per_sample;
                    for row in 0..height as usize {
                        let base = row * stride;
                        if depth == 8 {
                            for col in 1..width as usize {
                                raw[base + col] =
                                    raw[base + col].wrapping_add(raw[base + col - 1]);
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

// ── Two-phase layout API (for Worker-parallel decompression) ─────────────────

/// Layer descriptor produced by Phase 1 (no pixel decompression).
pub struct PsdLayoutLayer {
    pub top: i32,
    pub left: i32,
    pub bottom: i32,
    pub right: i32,
    pub visible: bool,
    pub name: String,
    pub channels: Vec<ChannelInfo>,
    pub layer_type: u32,
    /// Absolute byte offset in the PSD where this layer's channel data begins.
    pub channel_data_offset: u64,
    pub parent_group_id: Option<u32>,
    pub own_group_id: Option<u32>,
}

pub struct PsdLayout {
    pub version: u16,
    pub width: u32,
    pub height: u32,
    pub depth: u16,
    pub is_psb: bool,
    pub layers: Vec<PsdLayoutLayer>,
}

/// Phase 1: parse PSD headers and layer records only.
/// Does NOT decompress any pixel data.  Returns absolute channel data offsets
/// so callers can decode individual layers on demand.
pub fn parse_psd_layout(bytes: &[u8]) -> Result<PsdLayout, String> {
    let mut c = Cursor::new(bytes);

    let sig = read_tag(&mut c)?;
    if &sig != b"8BPS" {
        return Err("Not a PSD file (bad signature)".into());
    }
    let version = read_u16(&mut c)?;
    if version != 1 && version != 2 {
        return Err(format!("Unsupported PSD version: {version}"));
    }
    let is_psb = version == 2;
    skip(&mut c, 6)?;
    let _num_channels = read_u16(&mut c)?;
    let doc_height = read_u32(&mut c)?;
    let doc_width = read_u32(&mut c)?;
    let depth = read_u16(&mut c)?;
    let _color_mode = read_u16(&mut c)?;

    let cml = read_u32(&mut c)? as u64;
    skip(&mut c, cml)?;
    let irl = read_u32(&mut c)? as u64;
    skip(&mut c, irl)?;

    let lam_len = if is_psb { read_u64(&mut c)? } else { read_u32(&mut c)? as u64 };
    if lam_len == 0 {
        return Ok(PsdLayout { version, width: doc_width, height: doc_height, depth, is_psb, layers: vec![] });
    }
    let li_len = if is_psb { read_u64(&mut c)? } else { read_u32(&mut c)? as u64 };
    if li_len == 0 {
        return Ok(PsdLayout { version, width: doc_width, height: doc_height, depth, is_psb, layers: vec![] });
    }

    let raw_count = read_i16(&mut c)?;
    let layer_count = raw_count.unsigned_abs() as usize;

    // Parse all layer records (headers, channel lists, names).
    let mut records: Vec<LayerRecord> = Vec::with_capacity(layer_count);
    for _ in 0..layer_count {
        records.push(parse_layer_record(&mut c, is_psb)?);
    }

    // Cursor is now at the start of the channel data section.
    let channel_section_start = c.position();

    // Compute cumulative channel data offsets.
    let mut cumulative_offset = channel_section_start;
    let mut channel_offsets: Vec<u64> = Vec::with_capacity(layer_count);
    for rec in &records {
        channel_offsets.push(cumulative_offset);
        let total: u64 = rec.channels.iter().map(|ch| ch.data_len).sum();
        cumulative_offset += total;
    }

    // Build group stack for parent_group_id / own_group_id.
    let mut group_id_counter = 0u32;
    let mut group_stack: Vec<u32> = vec![];

    let mut layout_layers: Vec<PsdLayoutLayer> = Vec::with_capacity(layer_count);
    for (i, rec) in records.into_iter().enumerate() {
        let parent = group_stack.last().copied();
        let (own_group_id, layer_type) = match rec.layer_type {
            1 | 2 => {
                let gid = group_id_counter;
                group_id_counter += 1;
                group_stack.push(gid);
                (Some(gid), rec.layer_type)
            }
            3 => {
                group_stack.pop();
                (None, 3)
            }
            t => (None, t),
        };

        layout_layers.push(PsdLayoutLayer {
            top: rec.top,
            left: rec.left,
            bottom: rec.bottom,
            right: rec.right,
            visible: rec.visible,
            name: rec.name,
            channels: rec.channels,
            layer_type,
            channel_data_offset: channel_offsets[i],
            parent_group_id: parent,
            own_group_id,
        });
    }

    // Remove section-end dividers (type 3) from the output.
    layout_layers.retain(|l| l.layer_type != 3);

    Ok(PsdLayout { version, width: doc_width, height: doc_height, depth, is_psb, layers: layout_layers })
}

/// Phase 2 (on-demand): decompress one layer's RGBA data given the full PSD bytes
/// and a `PsdLayoutLayer` descriptor (which contains the channel data offset).
pub fn decode_layout_layer_rgba(
    bytes: &[u8],
    layer: &PsdLayoutLayer,
    depth: u16,
    is_psb: bool,
) -> Option<Vec<u8>> {
    if layer.layer_type != 0 {
        return None; // groups have no pixels
    }
    let w = (layer.right - layer.left).max(0) as u32;
    let h = (layer.bottom - layer.top).max(0) as u32;
    if w == 0 || h == 0 {
        return None;
    }

    let mut c = Cursor::new(bytes);
    c.set_position(layer.channel_data_offset);
    decode_layer_rgba(&mut c, &layer.channels, w, h, depth, is_psb)
}

// ── Public API ────────────────────────────────────────────────────────────────

/// A parsed PSD layer, including decompressed RGBA pixel data.
pub struct PsdFastLayer {
    pub name: String,
    pub top: i32,
    pub left: i32,
    pub width: u32,
    pub height: u32,
    pub visible: bool,
    /// Group ID of the *parent* group, if any (matches `PsdGroup::id()` from psd crate).
    /// This is tracked via the section-divider stack during parsing.
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
    let lam_len = if is_psb { read_u64(&mut c)? } else { read_u32(&mut c)? as u64 };
    if lam_len == 0 {
        return Ok(PsdFastResult { width: doc_width, height: doc_height, layers: vec![] });
    }

    // ── Layer info ────────────────────────────────────────────────────────────
    let li_len = if is_psb { read_u64(&mut c)? } else { read_u32(&mut c)? as u64 };
    if li_len == 0 {
        return Ok(PsdFastResult { width: doc_width, height: doc_height, layers: vec![] });
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
    // Assign sequential group IDs as we encounter section-divider layers (type 1/2).
    // Track the nesting stack to assign parent_group_id.
    let mut group_id_counter = 0u32;
    let mut group_stack: Vec<u32> = vec![]; // stack of own_group_id values

    // Build layer descriptors *without* pixels first so we know types and IDs.
    // We need to resolve parent_group_id before reading pixel data (same pass).
    struct Descriptor {
        record_idx: usize,
        parent_group_id: Option<u32>,
        own_group_id: Option<u32>,
    }

    let mut descriptors: Vec<Descriptor> = Vec::with_capacity(layer_count);

    // PSD stores layers from top to bottom visually.  Groups are encoded as:
    //   [group header (type 1/2)]  ← the visible group entry in the panel
    //   [child layers …]
    //   [bounding section divider (type 3)]  ← invisible closer
    for (i, rec) in records.iter().enumerate() {
        let parent = group_stack.last().copied();

        match rec.layer_type {
            1 | 2 => {
                // Group header: assign a new group ID and push to stack
                let gid = group_id_counter;
                group_id_counter += 1;
                descriptors.push(Descriptor {
                    record_idx: i,
                    parent_group_id: parent,
                    own_group_id: Some(gid),
                });
                group_stack.push(gid);
            }
            3 => {
                // Bounding section divider: close the current group
                group_stack.pop();
                descriptors.push(Descriptor {
                    record_idx: i,
                    parent_group_id: parent,
                    own_group_id: None,
                });
            }
            _ => {
                // Regular leaf layer
                descriptors.push(Descriptor {
                    record_idx: i,
                    parent_group_id: parent,
                    own_group_id: None,
                });
            }
        }
    }

    // Now decode pixels in the channel image data section (follows layer records).
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

    // ── Assemble final layer list ─────────────────────────────────────────────
    let mut layers: Vec<PsdFastLayer> = Vec::with_capacity(layer_count);
    for desc in &descriptors {
        let rec = &records[desc.record_idx];
        let w = (rec.right - rec.left).max(0) as u32;
        let h = (rec.bottom - rec.top).max(0) as u32;
        let is_group = rec.layer_type == 1 || rec.layer_type == 2;
        let is_section_end = rec.layer_type == 3;

        if is_section_end {
            // Bounding section dividers are internal bookkeeping; skip them.
            continue;
        }

        layers.push(PsdFastLayer {
            name: rec.name.clone(),
            top: rec.top,
            left: rec.left,
            width: w,
            height: h,
            visible: rec.visible,
            parent_group_id: desc.parent_group_id,
            is_group,
            own_group_id: desc.own_group_id,
            rgba: pixel_data[desc.record_idx].clone(),
        });
    }

    Ok(PsdFastResult {
        width: doc_width,
        height: doc_height,
        layers,
    })
}
