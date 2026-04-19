/**
 * Web Worker — ag-psd を使った PSD レイヤー展開。
 *
 * メインスレッドのブロッキングを避けるため、ag-psd の readPsd() を
 * Worker 内で実行する。OffscreenCanvas で Canvas を初期化し、
 * 各レイヤーの RGBA 生データを ArrayBuffer として転送する。
 *
 * Message protocol:
 *   IN:  { type: 'init' }
 *   IN:  { type: 'parse', psdBuffer: ArrayBuffer }
 *   OUT: { type: 'ready' }
 *   OUT: { type: 'result', layerCount: number, pixelBuffers: (ArrayBuffer | null)[] }
 *   OUT: { type: 'error', message: string }
 */

import { readPsd, initializeCanvas, type Layer } from 'ag-psd';

// ag-psd に Worker 内の Canvas 実装を渡す（型は HTMLCanvasElement を要求するが実行時は OffscreenCanvas で動作する）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(initializeCanvas as any)(
  (w: number, h: number) => new OffscreenCanvas(w, h),
  (w: number, h: number, data?: Uint8ClampedArray) =>
    data
      ? new ImageData(new Uint8ClampedArray(data.buffer as ArrayBuffer), w, h)
      : new ImageData(w, h),
);

/** ag-psd のネストツリーを PSD ファイル順（pre-order DFS）でフラット化する。 */
function* walkLayers(children: Layer[]): Generator<Layer> {
  for (const layer of children) {
    yield layer;
    if (layer.children) yield* walkLayers(layer.children);
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

      // skipCompositing は型定義に無いが実行時に動作する ag-psd オプション
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const psd = readPsd(msg.psdBuffer, { skipCompositing: true } as any);

      const tRead = performance.now();
      console.log(`[ag-psd Worker] readPsd=${(tRead - t0).toFixed(1)}ms`);

      const flat = [...walkLayers(psd.children ?? [])];

      // 各レイヤーの RGBA データを取り出す（グループは null）
      const pixelBuffers: (ArrayBuffer | null)[] = flat.map((layer) => {
        if (!layer.canvas) return null;
        const canvas = layer.canvas as unknown as OffscreenCanvas;
        if (canvas.width === 0 || canvas.height === 0) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return imageData.data.buffer;
      });

      console.log(
        `[ag-psd Worker] pixelExtract=${(performance.now() - tRead).toFixed(1)}ms  total=${(performance.now() - t0).toFixed(1)}ms  layers=${flat.length}`,
      );

      // 非 null の ArrayBuffer のみ転送（ゼロコピー）
      const transferables = pixelBuffers.filter((b): b is ArrayBuffer => b !== null);
      (self as unknown as Worker).postMessage(
        { type: 'result', layerCount: flat.length, pixelBuffers },
        transferables,
      );
    } catch (e) {
      self.postMessage({ type: 'error', message: String(e) });
    }
  }
};
