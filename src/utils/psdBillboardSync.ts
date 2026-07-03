import type { PsdObject, TimelineObject } from '../types';

/**
 * 3D ステージにワールド配置された PSD オブジェクトのみを抽出する。
 * 旧 Pixi 実装（撤去コミット 933b34cf 以前の Viewport.tsx）と同じ判定
 * （`worldPlacement.enabled === true`）。
 */
export const selectWorldPlacedPsdBillboards = (objects: TimelineObject[]): PsdObject[] =>
  objects.filter(
    (object): object is PsdObject => object.type === 'psd' && object.worldPlacement?.enabled === true
  );

/**
 * PSD オブジェクトの `activeLayerIds`（Record<string, boolean>）から、
 * 有効なレイヤー ID のみを決定的な順序（辞書順）で取り出す。
 * rustSceneSnapshot.ts の `activeLayerIdsForPsd`（エフェクト serialise 部、
 * 変更禁止）と同じ意味論を、ビルボード合成専用に独立して再実装したもの。
 */
export const activeLayerIdsForPsdBillboard = (object: PsdObject): string[] =>
  Object.entries(object.activeLayerIds ?? {})
    .filter(([, active]) => active)
    .map(([layerId]) => layerId)
    .sort((left, right) => left.localeCompare(right));

/**
 * PSD ビルボードの合成結果をキャッシュするためのキー。ファイルパスと
 * アクティブレイヤー集合が変わらない限り再合成 RPC を呼ばない。
 */
export const psdBillboardCacheKey = (object: PsdObject): string => {
  const filePath = object.filePath ?? '';
  const activeLayerIds = activeLayerIdsForPsdBillboard(object).join(',');
  return `${filePath}::${activeLayerIds}`;
};

export interface PsdRenderCompositeIpcResult {
  success: boolean;
  error?: string;
  width?: number;
  height?: number;
  pixelData?: ArrayBuffer;
}

export interface PsdRenderCompositeIpc {
  invoke: (
    channel: 'render-psd-composite',
    payload: { filePath: string; activeLayerIds?: string[] }
  ) => Promise<PsdRenderCompositeIpcResult>;
}

/**
 * RGBA バイト列を canvas へ描画する処理。DOM 依存（`document.createElement`
 * / `ImageData`）はここに閉じ込め、テストではスタブに差し替えられるように
 * している（textBoxMeasurement.ts と同じ DI パターン）。
 */
export type DrawRgbaToCanvas = (
  pixelData: ArrayBuffer,
  width: number,
  height: number
) => HTMLCanvasElement | null;

const defaultDrawRgbaToCanvas: DrawRgbaToCanvas = (pixelData, width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const clamped = new Uint8ClampedArray(pixelData);
  const imageData = new ImageData(clamped, width, height);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

/**
 * rust-backend の `psd.renderComposite` を electron IPC 経由で呼び、
 * 合成 RGBA を 2D canvas に描画して返す。3D ステージのビルボードは
 * Three.js の `CanvasTexture` にそのまま渡せる形にするのがゴール。
 */
export const fetchPsdCompositeCanvas = async (
  ipc: PsdRenderCompositeIpc,
  object: PsdObject,
  drawRgbaToCanvas: DrawRgbaToCanvas = defaultDrawRgbaToCanvas
): Promise<HTMLCanvasElement | null> => {
  const filePath = object.filePath;
  if (!filePath) return null;

  const activeLayerIds = activeLayerIdsForPsdBillboard(object);
  const result = await ipc.invoke('render-psd-composite', {
    filePath,
    ...(activeLayerIds.length > 0 ? { activeLayerIds } : {}),
  });

  if (!result.success || !result.pixelData || !result.width || !result.height) {
    return null;
  }

  return drawRgbaToCanvas(result.pixelData, result.width, result.height);
};
