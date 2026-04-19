/**
 * WASM-backed PSD parser with Worker Pool parallel decompression.
 *
 * Architecture:
 *   Phase 1 — main thread: `PsdLayout.new()` parses metadata + channel offsets (~20 ms).
 *   Phase 2 — N Workers:   each calls `PsdLayout.decompress_layer(bytes, idx)` on its
 *                           assigned subset of layers in parallel (~50 ms total).
 *
 * Falls back to the single-threaded `PsdParser` when SharedArrayBuffer / crossOriginIsolated
 * is unavailable (e.g. non-Electron browser without COOP/COEP headers).
 */

import init, { PsdLayout, PsdParser } from '../wasm/psd/psd_wasm.js';

type LayerDecompressTask = {
  idx: number;
  offset: number;         // u64 fits in JS number (max 2^53)
  channelIds: number[];
  channelLens: number[];  // u32 per channel
  width: number;
  height: number;
};

// ── WASM initialisation ───────────────────────────────────────────────────────

let wasmReady: Promise<void> | null = null;

function ensureWasm(): Promise<void> {
  if (!wasmReady) wasmReady = init().then(() => undefined);
  return wasmReady;
}

// ── Public types ──────────────────────────────────────────────────────────────

export type WasmLayerMeta = {
  name: string;
  top: number;
  left: number;
  width: number;
  height: number;
  visible: boolean;
  isGroup: boolean;
  ownGroupId: number | null;
  parentGroupId: number | null;
  pixelByteLen: number;
};

export type WasmPsdMeta = {
  width: number;
  height: number;
  depth: number;
  isPsb: boolean;
  layers: WasmLayerMeta[];
};

export type ParsedWasmPsd = {
  meta: WasmPsdMeta;
  /** Per-layer RGBA Uint8Array indexed by layer position. Empty array for groups. */
  pixels: Uint8Array[];
};

// ── Worker Pool ───────────────────────────────────────────────────────────────

const WORKER_COUNT = Math.min(navigator?.hardwareConcurrency ?? 4, 8);

type WorkerEntry = { worker: Worker; busy: boolean };
let pool: WorkerEntry[] | null = null;
let poolReady: Promise<void> | null = null;

function createWorkerPool(): Promise<void> {
  if (poolReady) return poolReady;

  poolReady = new Promise<void>((resolve, reject) => {
    const workers: WorkerEntry[] = [];
    let readyCount = 0;

    for (let i = 0; i < WORKER_COUNT; i++) {
      const worker = new Worker(
        new URL('./psdWorker.ts', import.meta.url),
        { type: 'module' }
      );

      const entry: WorkerEntry = { worker, busy: false };
      workers.push(entry);

      worker.onmessage = (e: MessageEvent) => {
        if (e.data?.type === 'ready') {
          readyCount++;
          if (readyCount === WORKER_COUNT) {
            pool = workers;
            resolve();
          }
        }
      };

      worker.onerror = (err) => {
        reject(new Error(`Worker init failed: ${err.message}`));
      };

      worker.postMessage({ type: 'init' });
    }
  });

  return poolReady;
}

/** Decompress layers in parallel using the Worker pool. */
async function decompressParallel(
  psdShared: SharedArrayBuffer,
  allTasks: LayerDecompressTask[],
  depth: number,
  isPsb: boolean,
): Promise<Map<number, Uint8Array>> {
  const workers = pool!;

  // Weighted distribution: assign each task to the worker with the least pending pixel bytes.
  const groups: LayerDecompressTask[][] = Array.from({ length: workers.length }, () => []);
  const workerLoad = new Array<number>(workers.length).fill(0);
  for (const task of allTasks) {
    // Weight by output pixel count (width × height) — proportional to decompress time.
    const pixelCount = task.width * task.height;
    const minWorker = workerLoad.indexOf(Math.min(...workerLoad));
    groups[minWorker].push(task);
    workerLoad[minWorker] += pixelCount;
  }

  const results = new Map<number, Uint8Array>();

  await Promise.all(
    groups.map((tasks, wi) => {
      if (tasks.length === 0) return Promise.resolve();
      const entry = workers[wi];

      return new Promise<void>((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          entry.worker.removeEventListener('message', handler);
          entry.busy = false;

          if (e.data?.type === 'result') {
            for (const { idx, rgba } of e.data.results as Array<{ idx: number; rgba: Uint8Array }>) {
              results.set(idx, rgba);
            }
            resolve();
          } else if (e.data?.type === 'error') {
            reject(new Error(e.data.message));
          }
        };

        entry.worker.addEventListener('message', handler);
        entry.busy = true;
        // Workers receive pre-computed task descriptors — no PsdLayout::new() needed.
        entry.worker.postMessage(
          { type: 'decompress_raw', psdShared, tasks, depth, isPsb },
          [] // SharedArrayBuffer is shared by reference — no transfer needed
        );
      });
    })
  );

  return results;
}

// ── Single-threaded fallback ──────────────────────────────────────────────────

async function parseSingleThreaded(data: ArrayBuffer): Promise<ParsedWasmPsd> {
  await ensureWasm();
  const t0 = performance.now();
  const psdU8 = new Uint8Array(data);
  const parser = new PsdParser(psdU8);
  const tParse = performance.now();

  try {
    const meta = parser.metadata() as WasmPsdMeta;
    const pixels: Uint8Array[] = [];

    for (let i = 0; i < meta.layers.length; i++) {
      const l = meta.layers[i];
      if (!l.isGroup && l.pixelByteLen > 0) {
        pixels.push(parser.get_layer_rgba(i));
      } else {
        pixels.push(new Uint8Array(0));
      }
    }

    const tTotal = performance.now();
    console.log(
      `[WASM single-thread] parse=${(tParse - t0).toFixed(1)}ms  decompress=${(tTotal - tParse).toFixed(1)}ms  total=${(tTotal - t0).toFixed(1)}ms`
    );

    return { meta, pixels };
  } finally {
    parser.free();
  }
}

// ── Parallel (SharedArrayBuffer) path ────────────────────────────────────────

async function parseParallel(data: ArrayBuffer): Promise<ParsedWasmPsd> {
  await ensureWasm();
  await createWorkerPool();

  const t0 = performance.now();

  // Copy PSD into a SharedArrayBuffer so all Workers can read without copying
  const psdShared = new SharedArrayBuffer(data.byteLength);
  new Uint8Array(psdShared).set(new Uint8Array(data));
  const tCopy = performance.now();

  // Phase 1: fast metadata extraction + collect per-layer decompress task descriptors.
  const psdU8 = new Uint8Array(psdShared);
  const layout = new PsdLayout(psdU8);
  let meta: WasmPsdMeta;
  let allTasks: LayerDecompressTask[];

  try {
    meta = layout.metadata() as WasmPsdMeta;
    // leaf_tasks_json returns channel offsets pre-computed — Workers won't re-parse metadata.
    allTasks = JSON.parse(layout.leaf_tasks_json()) as LayerDecompressTask[];
  } finally {
    layout.free();
  }
  const tPhase1 = performance.now();

  // Phase 2: parallel decompression via Worker pool (weighted by compressed byte size)
  const rgbaMap = await decompressParallel(psdShared, allTasks, meta.depth, meta.isPsb);
  const tPhase2 = performance.now();

  console.log(
    `[WASM parallel ×${WORKER_COUNT}] copy=${(tCopy - t0).toFixed(1)}ms  phase1(meta+tasks)=${(tPhase1 - tCopy).toFixed(1)}ms  phase2(decompress)=${(tPhase2 - tPhase1).toFixed(1)}ms  total=${(tPhase2 - t0).toFixed(1)}ms  leafLayers=${allTasks.length}`
  );

  // Assemble pixels array in layer order
  const pixels: Uint8Array[] = meta.layers.map((_, i) =>
    rgbaMap.get(i) ?? new Uint8Array(0)
  );

  return { meta, pixels };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a PSD file using WebAssembly.
 * Uses parallel Worker decompression if SharedArrayBuffer is available,
 * otherwise falls back to single-threaded mode.
 */
export async function parsePsdWithWasm(data: ArrayBuffer): Promise<ParsedWasmPsd> {
  if (typeof SharedArrayBuffer !== 'undefined' && crossOriginIsolated) {
    try {
      return await parseParallel(data);
    } catch (e) {
      console.warn('Parallel PSD parse failed, falling back to single-threaded:', e);
    }
  }
  return parseSingleThreaded(data);
}
