/**
 * Web Worker — PSD layer decompressor.
 *
 * Message protocol:
 *   IN:  { type: 'init' }
 *   IN:  { type: 'decompress_raw', psdShared: SharedArrayBuffer,
 *           tasks: LayerDecompressTask[], depth: number, isPsb: boolean }
 *   OUT: { type: 'result', results: { idx, rgba: Uint8Array }[] }
 *   OUT: { type: 'error', message: string }
 *
 * Workers receive pre-computed LayerDecompressTask descriptors (channel offsets
 * and channel byte-lengths) from the main thread.  This eliminates the
 * PsdLayout::new() metadata re-parse (~50–85 ms) that previously ran in every Worker.
 */

import init, { decompress_layer_raw } from '../wasm/psd/psd_wasm.js';

type LayerDecompressTask = {
  idx: number;
  offset: number;
  channelIds: number[];
  channelLens: number[];
  width: number;
  height: number;
};

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
    | { type: 'decompress_raw'; psdShared: SharedArrayBuffer; tasks: LayerDecompressTask[]; depth: number; isPsb: boolean };

  if (msg.type === 'init') {
    try {
      await ensureWasm();
      self.postMessage({ type: 'ready' });
    } catch (e) {
      self.postMessage({ type: 'error', message: String(e) });
    }
    return;
  }

  if (msg.type === 'decompress_raw') {
    try {
      await ensureWasm();

      const t0 = performance.now();
      const psdBytes = new Uint8Array(msg.psdShared);
      const results: Array<{ idx: number; rgba: Uint8Array }> = [];

      for (const task of msg.tasks) {
        const ids  = new Int32Array(task.channelIds);
        const lens = new Uint32Array(task.channelLens);
        const rgba = decompress_layer_raw(
          psdBytes,
          BigInt(task.offset),
          ids,
          lens,
          task.width,
          task.height,
          msg.depth,
          msg.isPsb,
        );
        if (rgba.length > 0) results.push({ idx: task.idx, rgba });
      }

      console.log(
        `[Worker] decompress=${(performance.now() - t0).toFixed(1)}ms  layers=${msg.tasks.length}`
      );

      // Transfer the RGBA buffers to the main thread (zero-copy move).
      const transferables = results.map((r) => r.rgba.buffer as ArrayBuffer);
      (self as unknown as Worker).postMessage({ type: 'result', results }, transferables);
    } catch (e) {
      self.postMessage({ type: 'error', message: String(e) });
    }
  }
};
