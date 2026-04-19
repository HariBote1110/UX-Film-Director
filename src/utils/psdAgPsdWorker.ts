/**
 * Web Worker — ag-psd を使った PSD 解析。
 *
 * メタデータとピクセルデータの両方を ag-psd から取得し返す。
 * WASM のレイヤーリストと照合しないことで順序不一致を根絶する。
 *
 * Message protocol:
 *   IN:  { type: 'init' }
 *   IN:  { type: 'parse', psdBuffer: ArrayBuffer }
 *   OUT: { type: 'ready' }
 *   OUT: { type: 'result',
 *           docWidth: number, docHeight: number,
 *           layers: AgPsdLayerMeta[],
 *           pixelBuffers: (ArrayBuffer | null)[] }
 *   OUT: { type: 'error', message: string }
 */

import { readPsd, initializeCanvas, type Layer } from 'ag-psd';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(initializeCanvas as any)(
  (w: number, h: number) => new OffscreenCanvas(w, h),
  (w: number, h: number, data?: Uint8ClampedArray) =>
    data
      ? new ImageData(new Uint8ClampedArray(data.buffer as ArrayBuffer), w, h)
      : new ImageData(w, h),
);

export type AgPsdLayerMeta = {
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

type WalkResult = { meta: AgPsdLayerMeta; rgba: ArrayBuffer | null };

/**
 * ag-psd のネストツリーを pre-order DFS でフラット化し、
 * 各レイヤーのメタデータとピクセルデータを同じ順番で返す。
 * ownGroupId / parentGroupId は WASM と同じ方式で採番する。
 */
function walkLayers(
  layers: Layer[],
  parentGroupId: number | null,
  results: WalkResult[],
  counter: { n: number },
): void {
  for (const layer of layers) {
    const isGroup = Array.isArray(layer.children);
    const ownGroupId = isGroup ? counter.n++ : null;

    const canvas = layer.canvas as unknown as OffscreenCanvas | undefined;
    const w = canvas?.width  ?? Math.max(0, (layer.right  ?? 0) - (layer.left ?? 0));
    const h = canvas?.height ?? Math.max(0, (layer.bottom ?? 0) - (layer.top  ?? 0));

    let rgba: ArrayBuffer | null = null;
    if (!isGroup && canvas && w > 0 && h > 0) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        rgba = ctx.getImageData(0, 0, w, h).data.buffer;
      }
    }

    results.push({
      meta: {
        name: layer.name ?? '',
        top:  layer.top  ?? 0,
        left: layer.left ?? 0,
        width: w,
        height: h,
        visible: layer.hidden !== true,
        isGroup,
        ownGroupId,
        parentGroupId,
        pixelByteLen: rgba ? rgba.byteLength : 0,
      },
      rgba,
    });

    if (isGroup && layer.children) {
      walkLayers(layer.children, ownGroupId, results, counter);
    }
  }
}

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data as
    | { type: 'init' }
    | { type: 'parse'; psdBuffer: ArrayBuffer };

  if (msg.type === 'init') {
    self.postMessage({ type: 'ready' });
    return;
  }

  if (msg.type === 'parse') {
    try {
      const t0 = performance.now();

      // レイヤーピクセルを読む（skipCompositing は合成済み画像のみスキップ）
      const psd = readPsd(msg.psdBuffer);
      const tRead = performance.now();

      const results: WalkResult[] = [];
      walkLayers(psd.children ?? [], null, results, { n: 0 });

      const tWalk = performance.now();
      console.log(
        `[ag-psd Worker] readPsd=${(tRead - t0).toFixed(1)}ms  walk=${(tWalk - tRead).toFixed(1)}ms  layers=${results.length}`,
      );

      const layers      = results.map((r) => r.meta);
      const pixelBuffers = results.map((r) => r.rgba);
      const transferables = pixelBuffers.filter((b): b is ArrayBuffer => b !== null);

      (self as unknown as Worker).postMessage(
        {
          type: 'result',
          docWidth:  psd.width,
          docHeight: psd.height,
          layers,
          pixelBuffers,
        },
        transferables,
      );
    } catch (e) {
      self.postMessage({ type: 'error', message: String(e) });
    }
  }
};
