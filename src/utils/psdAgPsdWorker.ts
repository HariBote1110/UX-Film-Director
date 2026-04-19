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

/** Worker から返す 1 レイヤーのピクセルデータ。
 *  ImageBitmap: OffscreenCanvas.transferToImageBitmap() の結果（GPU 直接転送、高速）。
 *  null: グループ・空レイヤー。
 */
export type AgPsdPixel = ImageBitmap | null;

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

type WalkResult = { meta: AgPsdLayerMeta; bitmap: ImageBitmap | null };

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

    // transferToImageBitmap(): GPU 側のテクスチャを直接 ImageBitmap に変換。
    // getImageData() と異なり CPU ↔ GPU コピーが発生しないため非常に高速。
    let bitmap: ImageBitmap | null = null;
    if (!isGroup && canvas && w > 0 && h > 0) {
      bitmap = canvas.transferToImageBitmap();
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
        pixelByteLen: bitmap ? w * h * 4 : 0,
      },
      bitmap,
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

      // skipCompositing: true で合成済み全体画像をスキップ（レイヤーピクセルは取得する）
      // これにより readPsd のコストが大幅に削減される（~846ms → ~310ms）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const psd = readPsd(msg.psdBuffer, { skipCompositing: true } as any);
      const tRead = performance.now();

      const results: WalkResult[] = [];
      walkLayers(psd.children ?? [], null, results, { n: 0 });

      const tWalk = performance.now();
      console.log(
        `[ag-psd Worker] readPsd=${(tRead - t0).toFixed(1)}ms  walk=${(tWalk - tRead).toFixed(1)}ms  layers=${results.length}`,
      );

      const layers  = results.map((r) => r.meta);
      const bitmaps = results.map((r) => r.bitmap);
      const transferables = bitmaps.filter((b): b is ImageBitmap => b !== null);

      (self as unknown as Worker).postMessage(
        {
          type: 'result',
          docWidth:  psd.width,
          docHeight: psd.height,
          layers,
          bitmaps,
        },
        transferables,
      );
    } catch (e) {
      self.postMessage({ type: 'error', message: String(e) });
    }
  }
};
