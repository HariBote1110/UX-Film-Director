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

export interface PsdCompositeRgba {
  data: Uint8Array;
  width: number;
  height: number;
}

/**
 * rust-backend の `psd.renderComposite` を electron IPC 経由で呼び、
 * 合成済み RGBA8 をコピーせずに返す。Canvas2D を経由させず、Three.js
 * 境界でこのバイト列を DataTexture へ直接アップロードする。
 */
export const fetchPsdCompositeRgba = async (
  ipc: PsdRenderCompositeIpc,
  object: PsdObject
): Promise<PsdCompositeRgba | null> => {
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

  const data = new Uint8Array(result.pixelData);
  if (data.byteLength !== result.width * result.height * 4) {
    return null;
  }

  return {
    data,
    width: result.width,
    height: result.height,
  };
};
