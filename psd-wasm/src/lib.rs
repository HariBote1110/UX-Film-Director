mod psd_fast;

use wasm_bindgen::prelude::*;
use serde::Serialize;

// ── Serialisable types ────────────────────────────────────────────────────────

/// Per-layer task descriptor sent from the main thread to Workers.
/// Workers use this to call `decompress_layer_raw()` without re-parsing metadata.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerDecompressTask {
    pub idx: usize,
    pub offset: u64,
    pub channel_ids: Vec<i32>,
    /// Each channel's compressed byte count (u32 is safe: no single channel exceeds 4 GB).
    pub channel_lens: Vec<u32>,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmLayerMeta {
    pub name: String,
    pub top: i32,
    pub left: i32,
    pub width: u32,
    pub height: u32,
    pub visible: bool,
    pub is_group: bool,
    pub own_group_id: Option<u32>,
    pub parent_group_id: Option<u32>,
    /// Total RGBA byte count for this layer (0 for groups / empty layers).
    pub pixel_byte_len: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmPsdLayout {
    pub width: u32,
    pub height: u32,
    pub depth: u16,
    pub is_psb: bool,
    pub layers: Vec<WasmLayerMeta>,
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/// Returns the WASM linear memory so JS can create zero-copy TypedArray views.
#[wasm_bindgen]
pub fn wasm_memory() -> JsValue {
    wasm_bindgen::memory()
}

// ── Phase 1: layout parser (fast, no pixel decompression) ────────────────────

/// Holds the parsed PSD layout (metadata + channel data offsets).
/// Workers call `decompress_layer()` to decompress individual layers.
#[wasm_bindgen]
pub struct PsdLayout {
    inner: psd_fast::PsdLayout,
}

#[wasm_bindgen]
impl PsdLayout {
    /// Parse a PSD file's metadata without decompressing any pixels.
    /// Very fast (~10-20 ms) because it only reads layer records.
    #[wasm_bindgen(constructor)]
    pub fn new(data: &[u8]) -> Result<PsdLayout, JsError> {
        psd_fast::parse_psd_layout(data)
            .map(|inner| PsdLayout { inner })
            .map_err(|e| JsError::new(&e))
    }

    /// Returns document dimensions + layer metadata as a plain JS object.
    pub fn metadata(&self) -> Result<JsValue, JsError> {
        let layers: Vec<WasmLayerMeta> = self
            .inner
            .layers
            .iter()
            .map(|l| {
                let w = (l.right - l.left).max(0) as u32;
                let h = (l.bottom - l.top).max(0) as u32;
                let pixel_byte_len = if l.layer_type == 0 { w * h * 4 } else { 0 };
                WasmLayerMeta {
                    name: l.name.clone(),
                    top: l.top,
                    left: l.left,
                    width: w,
                    height: h,
                    visible: l.visible,
                    is_group: l.layer_type == 1 || l.layer_type == 2,
                    own_group_id: l.own_group_id,
                    parent_group_id: l.parent_group_id,
                    pixel_byte_len,
                }
            })
            .collect();

        serde_wasm_bindgen::to_value(&WasmPsdLayout {
            width: self.inner.width,
            height: self.inner.height,
            depth: self.inner.depth,
            is_psb: self.inner.is_psb,
            layers,
        })
        .map_err(|e| JsError::new(&e.to_string()))
    }

    /// Decompress one layer by index and return its RGBA data as a `Vec<u8>`.
    ///
    /// This is called by Worker threads to decompress their assigned subset of
    /// layers from the shared PSD bytes.
    pub fn decompress_layer(&self, data: &[u8], layer_index: usize) -> Vec<u8> {
        let layer = match self.inner.layers.get(layer_index) {
            Some(l) => l,
            None => return Vec::new(),
        };
        psd_fast::decode_layout_layer_rgba(data, layer, self.inner.depth, self.inner.is_psb)
            .unwrap_or_default()
    }

    pub fn layer_count(&self) -> usize {
        self.inner.layers.len()
    }

    /// Returns a JSON array of `LayerDecompressTask` for every leaf layer.
    /// Workers parse this once and call `decompress_layer_raw()` directly,
    /// avoiding the cost of creating a full `PsdLayout` in each Worker.
    pub fn leaf_tasks_json(&self) -> String {
        let tasks: Vec<LayerDecompressTask> = self
            .inner
            .layers
            .iter()
            .enumerate()
            .filter(|(_, l)| l.layer_type == 0)
            .map(|(idx, l)| {
                let w = (l.right - l.left).max(0) as u32;
                let h = (l.bottom - l.top).max(0) as u32;
                LayerDecompressTask {
                    idx,
                    offset: l.channel_data_offset,
                    channel_ids: l.channels.iter().map(|ch| ch.channel_id as i32).collect(),
                    channel_lens: l.channels.iter().map(|ch| ch.data_len as u32).collect(),
                    width: w,
                    height: h,
                }
            })
            .collect();
        serde_json::to_string(&tasks).unwrap_or_else(|_| "[]".to_string())
    }
}

// ── Phase 2: full single-threaded parser (fallback) ──────────────────────────

/// Full PSD parser: reads bytes, decompresses all layers, holds RGBA in WASM memory.
/// Used as fallback when SharedArrayBuffer / workers are not available.
#[wasm_bindgen]
pub struct PsdParser {
    result: psd_fast::PsdFastResult,
}

#[wasm_bindgen]
impl PsdParser {
    #[wasm_bindgen(constructor)]
    pub fn new(data: &[u8]) -> Result<PsdParser, JsError> {
        psd_fast::parse_psd_fast(data)
            .map(|result| PsdParser { result })
            .map_err(|e| JsError::new(&e))
    }

    /// Metadata + raw WASM memory pointers for zero-copy ImageData creation.
    pub fn metadata(&self) -> Result<JsValue, JsError> {
        let layers: Vec<WasmLayerMeta> = self
            .result
            .layers
            .iter()
            .map(|l| {
                let pixel_byte_len = l.rgba.as_ref().map(|v| v.len() as u32).unwrap_or(0);
                WasmLayerMeta {
                    name: l.name.clone(),
                    top: l.top,
                    left: l.left,
                    width: l.width,
                    height: l.height,
                    visible: l.visible,
                    is_group: l.is_group,
                    own_group_id: l.own_group_id,
                    parent_group_id: l.parent_group_id,
                    pixel_byte_len,
                }
            })
            .collect();

        serde_wasm_bindgen::to_value(&WasmPsdLayout {
            width: self.result.width,
            height: self.result.height,
            depth: 8,
            is_psb: false,
            layers,
        })
        .map_err(|e| JsError::new(&e.to_string()))
    }

    /// Return RGBA data for layer `index` as a copied `Vec<u8>`.
    pub fn get_layer_rgba(&self, index: usize) -> Vec<u8> {
        self.result
            .layers
            .get(index)
            .and_then(|l| l.rgba.clone())
            .unwrap_or_default()
    }

    pub fn layer_count(&self) -> usize {
        self.result.layers.len()
    }
}

// ── Standalone decompressor (used by Workers with pre-computed offsets) ───────

/// Decompress a single PSD layer without constructing a `PsdLayout`.
///
/// Workers receive `LayerDecompressTask` JSON from the main thread and call this
/// function directly, eliminating the ~50–85 ms `PsdLayout::new()` overhead per Worker.
///
/// `channel_ids`  — signed channel identifiers (0=R, 1=G, 2=B, –1=A, etc.)
/// `channel_lens` — compressed byte count for each channel (same order as ids)
#[wasm_bindgen]
pub fn decompress_layer_raw(
    data: &[u8],
    offset: u64,
    channel_ids: &[i32],
    channel_lens: &[u32],
    width: u32,
    height: u32,
    depth: u16,
    is_psb: bool,
) -> Vec<u8> {
    let channels: Vec<psd_fast::ChannelInfo> = channel_ids
        .iter()
        .zip(channel_lens.iter())
        .map(|(&id, &len)| psd_fast::ChannelInfo {
            channel_id: id as i16,
            data_len: len as u64,
        })
        .collect();
    psd_fast::decode_layer_rgba_at(data, offset, &channels, width, height, depth, is_psb)
        .unwrap_or_default()
}
