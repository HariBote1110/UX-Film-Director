/**
 * Web Worker — PSD layer decompressor (pure JS implementation).
 *
 * Receives pre-computed LayerDecompressTask descriptors from the main thread
 * and decompresses assigned layers using psdDecompress.ts (JS PackBits + ZIP).
 * No WASM is loaded in Workers — V8 JIT handles TypedArray loops faster than WASM.
 *
 * Message protocol:
 *   IN:  { type: 'init' }
 *   IN:  { type: 'decompress_raw', psdShared: SharedArrayBuffer,
 *           tasks: LayerTask[], depth: number, isPsb: boolean }
 *   OUT: { type: 'ready' }
 *   OUT: { type: 'result', results: { idx, rgba: Uint8Array }[] }
 *   OUT: { type: 'error', message: string }
 */

import { decompressLayerJs, type LayerTask } from './psdDecompress.js';

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data as
    | { type: 'init' }
    | { type: 'decompress_raw'; psdShared: SharedArrayBuffer; tasks: LayerTask[]; depth: number; isPsb: boolean };

  if (msg.type === 'init') {
    self.postMessage({ type: 'ready' });
    return;
  }

  if (msg.type === 'decompress_raw') {
    try {
      const t0 = performance.now();
      const psdBytes = new Uint8Array(msg.psdShared);
      const results: Array<{ idx: number; rgba: Uint8Array }> = [];

      for (const task of msg.tasks) {
        const rgba = await decompressLayerJs(psdBytes, task, msg.depth, msg.isPsb);
        if (rgba.length > 0) results.push({ idx: task.idx, rgba });
      }

      console.log(
        `[Worker] decompress=${(performance.now() - t0).toFixed(1)}ms  layers=${msg.tasks.length}`
      );

      const transferables = results.map((r) => r.rgba.buffer as ArrayBuffer);
      (self as unknown as Worker).postMessage({ type: 'result', results }, transferables);
    } catch (e) {
      self.postMessage({ type: 'error', message: String(e) });
    }
  }
};
