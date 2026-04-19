/**
 * ag-psd Worker ベースの PSD パーサー。
 *
 * ag-psd を Web Worker 内で実行し、メインスレッドのブロッキングを解消する。
 * メタデータとピクセルデータの両方を Worker から取得するため、
 * 順序不一致は原理的に発生しない。
 *
 * フォールバック: Worker 起動失敗時は ag-psd をメインスレッドで実行。
 */

import { type AgPsdLayerMeta } from './psdAgPsdWorker.js';

// ── 公開型 ────────────────────────────────────────────────────────────────────

export type WasmLayerMeta = AgPsdLayerMeta;

export type WasmPsdMeta = {
  width: number;
  height: number;
  depth: number;
  isPsb: boolean;
  layers: WasmLayerMeta[];
};

export type ParsedWasmPsd = {
  meta: WasmPsdMeta;
  /** レイヤー順の RGBA Uint8Array。グループは空配列。 */
  pixels: Uint8Array[];
};

// ── ag-psd Worker ─────────────────────────────────────────────────────────────

let agPsdWorker: Worker | null = null;
let agPsdWorkerReady: Promise<void> | null = null;

function getAgPsdWorker(): Promise<Worker> {
  if (!agPsdWorkerReady) {
    agPsdWorkerReady = new Promise<void>((resolve, reject) => {
      const worker = new Worker(
        new URL('./psdAgPsdWorker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.onmessage = (e) => {
        if (e.data?.type === 'ready') { agPsdWorker = worker; resolve(); }
      };
      worker.onerror = (err) => reject(new Error(`ag-psd Worker init: ${err.message}`));
      worker.postMessage({ type: 'init' });
    });
  }
  return agPsdWorkerReady.then(() => agPsdWorker!);
}

async function parseWithWorker(data: ArrayBuffer): Promise<ParsedWasmPsd> {
  const worker = await getAgPsdWorker();
  const t0 = performance.now();

  return new Promise<ParsedWasmPsd>((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      worker.removeEventListener('message', handler);

      if (e.data?.type === 'result') {
        const { docWidth, docHeight, layers, pixelBuffers } = e.data as {
          docWidth: number;
          docHeight: number;
          layers: WasmLayerMeta[];
          pixelBuffers: (ArrayBuffer | null)[];
        };

        const pixels = pixelBuffers.map((buf) =>
          buf ? new Uint8Array(buf) : new Uint8Array(0),
        );

        console.log(
          `[psdWasm Worker] total=${(performance.now() - t0).toFixed(1)}ms  layers=${layers.length}`,
        );

        resolve({
          meta: { width: docWidth, height: docHeight, depth: 8, isPsb: false, layers },
          pixels,
        });
      } else if (e.data?.type === 'error') {
        reject(new Error(e.data.message));
      }
    };

    worker.addEventListener('message', handler);
    // ArrayBuffer を Worker に転送（ゼロコピー）
    worker.postMessage({ type: 'parse', psdBuffer: data }, [data]);
  });
}

// ── フォールバック: メインスレッド ag-psd ────────────────────────────────────

async function parseMainThread(data: ArrayBuffer): Promise<ParsedWasmPsd> {
  const { readPsd, initializeCanvas } = await import('ag-psd');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (initializeCanvas as any)(
    (w: number, h: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      return canvas;
    },
    (w: number, h: number, d?: Uint8ClampedArray) =>
      d ? new ImageData(new Uint8ClampedArray(d.buffer as ArrayBuffer), w, h) : new ImageData(w, h),
  );

  const t0 = performance.now();
  const psd = readPsd(data);

  type LayerMeta = WasmLayerMeta;
  type WalkResult = { meta: LayerMeta; rgba: Uint8Array | null };

  function walk(
    layers: import('ag-psd').Layer[],
    parentGroupId: number | null,
    results: WalkResult[],
    counter: { n: number },
  ): void {
    for (const layer of layers) {
      const isGroup = Array.isArray(layer.children);
      const ownGroupId = isGroup ? counter.n++ : null;
      const canvas = layer.canvas as HTMLCanvasElement | undefined;
      const w = canvas?.width  ?? Math.max(0, (layer.right  ?? 0) - (layer.left ?? 0));
      const h = canvas?.height ?? Math.max(0, (layer.bottom ?? 0) - (layer.top  ?? 0));
      let rgba: Uint8Array | null = null;
      if (!isGroup && canvas && w > 0 && h > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) rgba = new Uint8Array(ctx.getImageData(0, 0, w, h).data.buffer);
      }
      results.push({
        meta: {
          name: layer.name ?? '', top: layer.top ?? 0, left: layer.left ?? 0,
          width: w, height: h, visible: layer.hidden !== true,
          isGroup, ownGroupId, parentGroupId,
          pixelByteLen: rgba ? rgba.byteLength : 0,
        },
        rgba,
      });
      if (isGroup && layer.children) walk(layer.children, ownGroupId, results, counter);
    }
  }

  const results: WalkResult[] = [];
  walk(psd.children ?? [], null, results, { n: 0 });
  console.log(`[psdWasm main-thread fallback] total=${(performance.now() - t0).toFixed(1)}ms`);

  return {
    meta: { width: psd.width, height: psd.height, depth: 8, isPsb: false, layers: results.map(r => r.meta) },
    pixels: results.map(r => r.rgba ?? new Uint8Array(0)),
  };
}

// ── 公開 API ──────────────────────────────────────────────────────────────────

export async function parsePsdWithWasm(data: ArrayBuffer): Promise<ParsedWasmPsd> {
  try {
    return await parseWithWorker(data);
  } catch (e) {
    console.warn('[psdWasm] Worker parse failed, falling back to main thread:', e);
    return parseMainThread(data);
  }
}
