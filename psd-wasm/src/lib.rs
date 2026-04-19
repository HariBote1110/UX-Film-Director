mod psd_fast;

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

// ── Serialisable types ────────────────────────────────────────────────────────

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
