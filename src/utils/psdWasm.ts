/**
 * WASM + ag-psd ハイブリッド PSD パーサー。
 *
 * アーキテクチャ（最終版）:
 *   Phase 1 — メインスレッド: WASM `PsdLayout` でメタデータのみ解析 (~5 ms)
 *             → レイヤー名・位置・グループ構造を即座に取得
 *   Phase 2 — 単一 Worker: ag-psd で全レイヤーを展開 (~310 ms、メインスレッドをブロックしない)
 *             → OffscreenCanvas でピクセルデータを取り出し転送
 *
 * フォールバック（SharedArrayBuffer / crossOriginIsolated 非対応環境）:
 *   WASM PsdParser でシングルスレッド展開。
 *
 * ── なぜ WASM 並列展開をやめたか ────────────────────────────────────────────────
 * 8 Worker で並列 WASM 展開を試みたが、ブラウザの V8 は TypedArray ループの JIT を
 * WASM より優秀に最適化するため、WASM は Node.js 比で ~14 倍遅かった。
 * さらに ag-psd はシーケンシャルアクセスでキャッシュ効率が高く、
 * ランダムアクセス並列アプローチでは根本的に不利と判明。
 * → Worker で ag-psd を実行し「メインスレッドのブロッキング解消」のみを目的とした。
 */

import init, { PsdLayout, PsdParser } from '../wasm/psd/psd_wasm.js';

// ── WASM 初期化 ───────────────────────────────────────────────────────────────

let wasmReady: Promise<void> | null = null;

function ensureWasm(): Promise<void> {
  if (!wasmReady) wasmReady = init().then(() => undefined);
  return wasmReady;
}

// ── 公開型 ────────────────────────────────────────────────────────────────────

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
  /** レイヤー順の RGBA Uint8Array。グループは空配列。 */
  pixels: Uint8Array[];
};

// ── ag-psd Worker（Phase 2） ───────────────────────────────────────────────────

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
      worker.onerror = (err) => reject(new Error(`ag-psd Worker init failed: ${err.message}`));
      worker.postMessage({ type: 'init' });
    });
  }
  return agPsdWorkerReady.then(() => agPsdWorker!);
}

/**
 * ag-psd Worker に PSD を送って全レイヤーの RGBA を取得する。
 * WASM のフラットレイヤーリストと同じ pre-order DFS 順でピクセルが返る。
 */
async function parseWithAgPsdWorker(psdBuffer: ArrayBuffer): Promise<Uint8Array[]> {
  const worker = await getAgPsdWorker();

  return new Promise<Uint8Array[]>((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      worker.removeEventListener('message', handler);
      if (e.data?.type === 'result') {
        const pixelBuffers: (ArrayBuffer | null)[] = e.data.pixelBuffers;
        resolve(
          pixelBuffers.map((buf) =>
            buf ? new Uint8Array(buf) : new Uint8Array(0),
          ),
        );
      } else if (e.data?.type === 'error') {
        reject(new Error(e.data.message));
      }
    };
    worker.addEventListener('message', handler);
    // ArrayBuffer を Worker に転送（ゼロコピー。呼び出し元は以後アクセス不可）
    worker.postMessage({ type: 'parse', psdBuffer }, [psdBuffer]);
  });
}

// ── シングルスレッド fallback ──────────────────────────────────────────────────

async function parseSingleThreaded(data: ArrayBuffer): Promise<ParsedWasmPsd> {
  await ensureWasm();
  const t0 = performance.now();
  const psdU8 = new Uint8Array(data);
  const parser = new PsdParser(psdU8);

  try {
    const meta = parser.metadata() as WasmPsdMeta;
    const pixels: Uint8Array[] = [];
    for (let i = 0; i < meta.layers.length; i++) {
      const l = meta.layers[i];
      pixels.push(!l.isGroup && l.pixelByteLen > 0 ? parser.get_layer_rgba(i) : new Uint8Array(0));
    }
    console.log(`[WASM single-thread] total=${(performance.now() - t0).toFixed(1)}ms`);
    return { meta, pixels };
  } finally {
    parser.free();
  }
}

// ── メインパス（Phase 1 WASM + Phase 2 ag-psd Worker） ───────────────────────

async function parseHybrid(data: ArrayBuffer): Promise<ParsedWasmPsd> {
  await ensureWasm();
  const t0 = performance.now();

  // Phase 1: WASM でメタデータのみ高速解析（グループ構造・名前・位置）
  const psdU8 = new Uint8Array(data);
  const layout = new PsdLayout(psdU8);
  let meta: WasmPsdMeta;
  try {
    meta = layout.metadata() as WasmPsdMeta;
  } finally {
    layout.free();
  }
  const tPhase1 = performance.now();

  // Phase 2: ag-psd Worker でピクセル展開（メインスレッド非ブロック）
  // data の所有権を Worker に転送するため、ここで slice してコピーを渡す。
  // （Worker は ArrayBuffer を transfer するので元の data は無効になる）
  const psdCopy = data.slice(0);
  const pixels = await parseWithAgPsdWorker(psdCopy);
  const tPhase2 = performance.now();

  // WASM レイヤー数と ag-psd レイヤー数が一致しない場合は不整合として後続で空配列を使う
  if (pixels.length !== meta.layers.length) {
    console.warn(
      `[psdWasm] レイヤー数不一致: WASM=${meta.layers.length}, ag-psd=${pixels.length}`,
    );
  }

  console.log(
    `[psdWasm hybrid] phase1(WASM meta)=${(tPhase1 - t0).toFixed(1)}ms  phase2(ag-psd Worker)=${(tPhase2 - tPhase1).toFixed(1)}ms  total=${(tPhase2 - t0).toFixed(1)}ms`,
  );

  return { meta, pixels };
}

// ── 公開 API ──────────────────────────────────────────────────────────────────

/**
 * PSD ファイルを解析する。
 * crossOriginIsolated 環境では ag-psd Worker を使い、そうでなければ WASM fallback。
 */
export async function parsePsdWithWasm(data: ArrayBuffer): Promise<ParsedWasmPsd> {
  // ag-psd Worker は SAB 不要。crossOriginIsolated に関わらず利用可能。
  try {
    return await parseHybrid(data);
  } catch (e) {
    console.warn('[psdWasm] Hybrid parse failed, falling back to single-thread WASM:', e);
    return parseSingleThreaded(data);
  }
}
