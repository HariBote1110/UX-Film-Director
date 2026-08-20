/**
 * OxidiseStageViewport が Viewport.tsx から受け取る BillboardTextureEntry[] を、
 * oxidise-wasm の StageRenderer#syncBillboard / #removeBillboard 呼び出し計画へ
 * 変換する純粋関数。
 *
 * StageRenderer#syncBillboard は毎回 rgba バイト列を引数に取るため、呼び出し
 * 自体は sourceKey が変わっていない要素にも毎フレーム必要（world 座標などが
 * 変わりうるため）。source-key 再利用の意味論（GPU 側のテクスチャ再アップロード
 * を避けられるかどうか）は StageRenderer 内部（TextureRegistry）の責務であり、
 * この関数はそれを呼び出し側から観測できるように `kind` として分類するだけ。
 */

export interface BillboardSyncEntry {
  id: string;
  sourceKey: string;
  rgba: Uint8Array;
  widthPx: number;
  heightPx: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  yawRadians: number;
  worldWidth: number;
  worldHeight: number;
  opacity: number;
}

export type BillboardSyncKind = 'added' | 'updated' | 'reused';

export interface BillboardSyncOp {
  entry: BillboardSyncEntry;
  kind: BillboardSyncKind;
}

export interface BillboardSyncPlan {
  /** 呼び出し順は entries の順序を保つ。全件について syncBillboard を呼ぶ。 */
  syncs: BillboardSyncOp[];
  /** 直前まで存在し、今回の entries に含まれなくなった id（removeBillboard 対象）。 */
  removes: string[];
}

/**
 * @param previousSourceKeys 直前フレームまでに同期済みの id → sourceKey。
 * @param entries 今回同期すべき全ビルボード。
 */
export const computeBillboardSyncPlan = (
  previousSourceKeys: ReadonlyMap<string, string>,
  entries: BillboardSyncEntry[]
): BillboardSyncPlan => {
  const activeIds = new Set(entries.map((entry) => entry.id));

  const removes: string[] = [];
  previousSourceKeys.forEach((_sourceKey, id) => {
    if (!activeIds.has(id)) removes.push(id);
  });

  const syncs: BillboardSyncOp[] = entries.map((entry) => {
    const previousSourceKey = previousSourceKeys.get(entry.id);
    const kind: BillboardSyncKind =
      previousSourceKey === undefined
        ? 'added'
        : previousSourceKey === entry.sourceKey
          ? 'reused'
          : 'updated';
    return { entry, kind };
  });

  return { syncs, removes };
};

/** computeBillboardSyncPlan の結果を、次回呼び出し用の id → sourceKey マップへ畳み込む。 */
export const nextBillboardSourceKeys = (
  entries: BillboardSyncEntry[]
): Map<string, string> => new Map(entries.map((entry) => [entry.id, entry.sourceKey]));
