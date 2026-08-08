/// Minimal PSD pixel extractor.
///
/// RESEARCH COPY (disposable): forked from
/// `rust-backend/src/psd_fast.rs` at commit 9680117d911da05722d599cb518be264afc8317a
/// for the standalone native single-thread benchmark in
/// `vm_tuning_research/tools/psd-native-bench/`. The composite/RgbaFrame
/// helpers (`composite_visible_psd_layers*`, `select_psd_composite_frame`,
/// `composite_layer_source_over`, `source_over_pixel`) were removed because
/// they depend on the crate-internal `uxfd-golden-harness` crate and are not
/// exercised by this benchmark (parse + per-layer decompress + RGBA
/// interleave only, matching the ag-psd skipComposite/skipThumbnail
/// comparison target). Do not edit `rust-backend/src/psd_fast.rs` from here;
/// this file is a one-way snapshot for measurement purposes only.
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
use std::time::Instant;

use rayon::prelude::*;

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

fn stable_layer_id(layer_index: usize, is_group: bool, own_group_id: Option<u32>) -> String {
    if is_group {
        format!("psd-group-{}", own_group_id.unwrap_or(layer_index as u32))
    } else {
        format!("psd-layer-{layer_index}")
    }
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

    // ── Phase 3+4: rebuild the group tree and flatten pre-order ──────────────
    let roots = build_layer_tree(&records);
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

// ── Group-tree reconstruction (shared by serial and parallel entry points) ──

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

fn build_layer_tree(records: &[LayerRecord]) -> Vec<TreeNode> {
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
    stack.pop().unwrap_or_default()
}

// Flatten in pre-order, matching the ag-psd UI walk.  The UI
// (src/utils/psdAgPsdWorker.ts walkLayers) flattens the layer tree
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

// ── Phase-timed / thread-pool-parallel entry point (experiment 2) ───────────
//
// Adds a per-phase timing split and an optional rayon thread pool for the
// per-layer decode phase, on top of the same parsing/decoding/tree-building
// logic used by `parse_psd_fast` above. `parse_psd_fast` itself is left
// untouched so it remains a faithful "original serial path" for A/B
// comparison against the thread-pool path run with `num_threads = Some(1)`.

/// Per-phase wall-clock timing (milliseconds) for one `parse_psd_fast_instrumented` run.
pub struct PhaseTimings {
    /// Phase 1: parsing all layer records (metadata only — coordinates,
    /// visibility, group structure, channel lengths). No pixel bytes touched.
    pub parse_records_ms: f64,
    /// Phase 2: per-layer channel decompression (PackBits/ZIP/raw) + RGBA
    /// interleave. Includes the cheap byte-range precompute pass.
    pub decode_layers_ms: f64,
    /// Phase 3+4: group-tree reconstruction from file order + pre-order
    /// flattening into the public `PsdFastLayer` list.
    pub tree_build_ms: f64,
}

/// Byte range (into the original `bytes` slice) holding one leaf layer's
/// channel image data, plus the pixel dimensions needed to decode it.
struct LeafRange {
    start: usize,
    end: usize,
    w: u32,
    h: u32,
}

/// Walk the channel-image-data section computing each leaf layer's byte
/// range without decompressing anything (cheap: cursor arithmetic only,
/// using the already-known per-channel `data_len`). This lets the decode
/// step run independently per layer — serially or on a thread pool — since
/// each layer's input slice and output `Vec<u8>` are now known up front.
fn compute_leaf_ranges(
    c: &mut Cursor<&[u8]>,
    records: &[LayerRecord],
) -> R<Vec<Option<LeafRange>>> {
    let mut ranges = Vec::with_capacity(records.len());
    for rec in records {
        match rec.layer_type {
            0 => {
                let w = (rec.right - rec.left).max(0) as u32;
                let h = (rec.bottom - rec.top).max(0) as u32;
                let start = c.position() as usize;
                let total_len: u64 = rec.channels.iter().map(|ch| ch.data_len).sum();
                skip(c, total_len)?;
                let end = c.position() as usize;
                if w == 0 || h == 0 {
                    ranges.push(None);
                } else {
                    ranges.push(Some(LeafRange { start, end, w, h }));
                }
            }
            _ => {
                for ch in &rec.channels {
                    skip(c, ch.data_len)?;
                }
                ranges.push(None);
            }
        }
    }
    Ok(ranges)
}

/// Decode one leaf layer from its precomputed byte range. Sub-slicing
/// `bytes` gives each call an independent `Cursor`, which is what makes the
/// per-layer decode safe to run across threads with no shared mutable state.
fn decode_from_range(
    bytes: &[u8],
    range: &LeafRange,
    channels: &[ChannelInfo],
    depth: u16,
    is_psb: bool,
) -> Option<Vec<u8>> {
    let mut sub = Cursor::new(&bytes[range.start..range.end]);
    decode_layer_rgba(&mut sub, channels, range.w, range.h, depth, is_psb)
}

/// Parse a PSD/PSB file with a per-phase timing breakdown, optionally
/// decoding layers on a rayon thread pool.
///
/// `num_threads`:
///   - `None`    → decode layers serially on the calling thread, but still
///                 routed through the byte-range-precompute pipeline shared
///                 with the parallel path (so `Some(1)` and `None` isolate
///                 thread-pool overhead from each other, not from an
///                 unrelated code path).
///   - `Some(n)` → build a rayon thread pool with `n` threads and decode
///                 layers with `par_iter`. `n = 1` is legal and deliberately
///                 still goes through the pool (see
///                 `notes/parallel-layer-decode-scaling.md`, step 4).
/// `visible_only`: when `true`, only leaf layers whose own `visible` bit is
/// set (`rec.visible`, i.e. ag-psd's `layer.hidden !== true` — matches the
/// production `defaultVisible` definition in `psdAgPsdWorker.ts`, own-layer
/// bit only, no ancestor-group visibility folded in) are decoded; all other
/// leaves get `rgba = None` without ever touching their channel bytes
/// (research code for `notes/lazy-visible-only-decode.md`). Metadata parsing
/// and tree building are unaffected — every layer (visible or not, leaf or
/// group) still appears in the returned `layers` list with correct
/// dimensions/visibility/tree position, only `rgba` is withheld for hidden
/// leaves.
pub fn parse_psd_fast_instrumented(
    bytes: &[u8],
    num_threads: Option<usize>,
    visible_only: bool,
) -> Result<(PsdFastResult, PhaseTimings), String> {
    let mut c = Cursor::new(bytes);

    // ── File header (identical to parse_psd_fast) ────────────────────────────
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

    let cml = read_u32(&mut c)? as u64;
    skip(&mut c, cml)?;

    let irl = read_u32(&mut c)? as u64;
    skip(&mut c, irl)?;

    let lam_len = if is_psb {
        read_u64(&mut c)?
    } else {
        read_u32(&mut c)? as u64
    };
    if lam_len == 0 {
        let result = PsdFastResult {
            width: doc_width,
            height: doc_height,
            layers: vec![],
        };
        return Ok((
            result,
            PhaseTimings {
                parse_records_ms: 0.0,
                decode_layers_ms: 0.0,
                tree_build_ms: 0.0,
            },
        ));
    }

    let li_len = if is_psb {
        read_u64(&mut c)?
    } else {
        read_u32(&mut c)? as u64
    };
    if li_len == 0 {
        let result = PsdFastResult {
            width: doc_width,
            height: doc_height,
            layers: vec![],
        };
        return Ok((
            result,
            PhaseTimings {
                parse_records_ms: 0.0,
                decode_layers_ms: 0.0,
                tree_build_ms: 0.0,
            },
        ));
    }

    let raw_count = read_i16(&mut c)?;
    let layer_count = raw_count.unsigned_abs() as usize;

    // ── Phase 1: parse all layer records ──────────────────────────────────────
    let t_parse = Instant::now();
    let mut records: Vec<LayerRecord> = Vec::with_capacity(layer_count);
    for _ in 0..layer_count {
        records.push(parse_layer_record(&mut c, is_psb)?);
    }
    let parse_records_ms = t_parse.elapsed().as_secs_f64() * 1000.0;

    // ── Phase 2: byte-range precompute + per-layer decode (serial or pooled) ──
    let t_decode = Instant::now();
    let ranges = compute_leaf_ranges(&mut c, &records)?;
    // Lazy (visible-only) mode: a hidden leaf's range is dropped to `None`
    // *before* the decode step below ever sees it, so `decode_from_range` is
    // never called for hidden layers — their channel bytes are skipped
    // (already accounted for by `compute_leaf_ranges`'s cursor walk) but
    // never decompressed/interleaved. Group/section-end/zero-size entries
    // are already `None` from `compute_leaf_ranges` regardless of this flag.
    let ranges: Vec<Option<LeafRange>> = if visible_only {
        ranges
            .into_iter()
            .zip(records.iter())
            .map(|(r, rec)| if rec.visible { r } else { None })
            .collect()
    } else {
        ranges
    };
    let pixel_data: Vec<Option<Vec<u8>>> = match num_threads {
        None => records
            .iter()
            .zip(ranges.iter())
            .map(|(rec, range)| match range {
                Some(r) => decode_from_range(bytes, r, &rec.channels, depth, is_psb),
                None => None,
            })
            .collect(),
        Some(n) => {
            let pool = rayon::ThreadPoolBuilder::new()
                .num_threads(n)
                .build()
                .map_err(|e| e.to_string())?;
            pool.install(|| {
                records
                    .par_iter()
                    .zip(ranges.par_iter())
                    .map(|(rec, range)| match range {
                        Some(r) => decode_from_range(bytes, r, &rec.channels, depth, is_psb),
                        None => None,
                    })
                    .collect()
            })
        }
    };
    let decode_layers_ms = t_decode.elapsed().as_secs_f64() * 1000.0;

    // ── Phase 3+4: tree reconstruction + pre-order flatten ────────────────────
    let t_tree = Instant::now();
    let roots = build_layer_tree(&records);
    let mut layers: Vec<PsdFastLayer> = Vec::with_capacity(layer_count);
    let mut group_id_counter = 0u32;
    let mut pixel_data = pixel_data;
    flatten(
        roots,
        None,
        &records,
        &mut pixel_data,
        &mut group_id_counter,
        &mut layers,
    );
    let tree_build_ms = t_tree.elapsed().as_secs_f64() * 1000.0;

    Ok((
        PsdFastResult {
            width: doc_width,
            height: doc_height,
            layers,
        },
        PhaseTimings {
            parse_records_ms,
            decode_layers_ms,
            tree_build_ms,
        },
    ))
}
