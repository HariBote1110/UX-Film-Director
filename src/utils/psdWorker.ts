/**
 * Web Worker — PSD layer decompressor.
 *
 * Receives a slice of layer indices and the shared PSD bytes, decompresses
 * the assigned layers using the WASM module, and posts RGBA results back.
 *
 * Message protocol:
 *   IN:  { type: 'init', wasmUrl: string }
 *   IN:  { type: 'decompress', psdShared: SharedArrayBuffer, layerIndices: number[] }
 *   OUT: { type: 'result', results: { idx, rgba: Uint8Array }[] }
 *   OUT: { type: 'error', message: string }
 */

import init, { PsdLayout } from '../wasm/psd/psd_wasm.js';

let wasmReady = false;
let initPromise: Promise<void> | null = null;

async function ensureWasm(): Promise<void> {
  if (wasmReady) return;
  if (!initPromise) {
    initPromise = init().then(() => { wasmReady = true; });
  }
  return initPromise;
}

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data as
    | { type: 'init' }
    | { type: 'decompress'; psdShared: SharedArrayBuffer; layerIndices: number[] };

  if (msg.type === 'init') {
    try {
      await ensureWasm();
      self.postMessage({ type: 'ready' });
    } catch (e) {
      self.postMessage({ type: 'error', message: String(e) });
    }
    return;
  }

  if (msg.type === 'decompress') {
    try {
      await ensureWasm();

      const psdBytes = new Uint8Array(msg.psdShared);
      // Phase 1: parse metadata only (fast — no pixel decompression).
      const layout = new PsdLayout(psdBytes);

      const results: Array<{ idx: number; rgba: Uint8Array }> = [];
      for (const idx of msg.layerIndices) {
        // Phase 2: decompress only the assigned layer from shared bytes.
        const rgba = layout.decompress_layer(psdBytes, idx);
        if (rgba.length > 0) {
          results.push({ idx, rgba });
        }
      }

      layout.free();

      // Transfer the RGBA buffers to the main thread (zero-copy move).
      const transferables = results.map((r) => r.rgba.buffer as ArrayBuffer);
      (self as unknown as Worker).postMessage({ type: 'result', results }, transferables);
    } catch (e) {
      self.postMessage({ type: 'error', message: String(e) });
    }
  }
};
