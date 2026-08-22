import { useStore } from '../store/useStore';
import type { PsdLayerNode, PsdObject } from '../types';

/**
 * R5-6: CI 用 PSD インポート e2e ゲート（`scripts/run-psd-import-e2e-parity.mjs`
 * が駆動する）の読み取り側フック。実際のインポート操作（PSD 追加ボタン →
 * ファイル選択）は通常の UI 操作としてスクリプト側が CDP 経由で行い、
 * このハーネスはインポート後の `useStore` の状態を機械比較しやすい形へ
 * シリアライズするだけに徹する（タイミング計測は行わない — それは
 * `scripts/run-psd-import-e2e.mjs`（研究用）の役目）。
 */

type SerialisedPsdNode = {
  name: string;
  isGroup: boolean;
  isRadio: boolean;
  children: SerialisedPsdNode[];
};

const serialiseNode = (node: PsdLayerNode): SerialisedPsdNode => ({
  name: node.name,
  isGroup: node.isGroup,
  isRadio: node.isRadio,
  children: node.children.map(serialiseNode),
});

const countNodes = (nodes: SerialisedPsdNode[]): number =>
  nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);

/**
 * `initVisibility`（`src/utils/psdParser.ts`、`parsePsdMetaViaRust` 内）と
 * 同一のアルゴリズムをここで再計算し、実際の `activeLayerIds` と完全一致
 * するかどうかを見る。ロジックを別実装で近似するのではなく、production
 * のアルゴリズムをそのまま複製して独立に再実行することで、実装バグの
 * 見落としなく「デフォルトの表示状態が正しいか」を機械検証できる
 * （`src/remoteDeck/remoteDeckPsdLayers.e2e.test.ts` はこのロジック自体の
 * 単体挙動を別途カバーしている）。
 */
const computeExpectedActiveLayerIds = (rootLayer: PsdLayerNode): Record<string, boolean> => {
  const activeLayerIds: Record<string, boolean> = {};

  const initVisibility = (node: PsdLayerNode) => {
    if (node.isGroup) {
      if (node.isRadio) {
        node.children.forEach(initVisibility);
        const activeChild = node.children.find((child) => activeLayerIds[child.id]);
        if (!activeChild && node.children.length > 0) {
          activeLayerIds[node.children[0].id] = true;
        }
        activeLayerIds[node.id] = true;
      } else {
        if (node.defaultVisible) activeLayerIds[node.id] = true;
        node.children.forEach(initVisibility);
      }
    } else if (node.defaultVisible) {
      activeLayerIds[node.id] = true;
    }
  };

  rootLayer.children.forEach(initVisibility);
  activeLayerIds[rootLayer.id] = true;
  return activeLayerIds;
};

/** Reports keys where `actual` and `expected` disagree on truthiness. */
const diffActiveLayerIds = (
  expected: Record<string, boolean>,
  actual: Record<string, boolean>,
): string[] => {
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  const diffs: string[] = [];
  for (const key of keys) {
    const expectedValue = expected[key] === true;
    const actualValue = actual[key] === true;
    if (expectedValue !== actualValue) {
      diffs.push(`${key}: expected=${expectedValue} actual=${actualValue}`);
    }
  }
  return diffs;
};

export type PsdImportParitySnapshot = {
  ok: boolean;
  reason?: string;
  psdObjectCount: number;
  docWidth?: number;
  docHeight?: number;
  nodeCount?: number;
  tree?: SerialisedPsdNode[];
  activeLayerIdDiffs?: string[];
  rootActive?: boolean;
};

const snapshot = (): PsdImportParitySnapshot => {
  const state = useStore.getState();
  const psdObjects = state.objects.filter(
    (object): object is PsdObject => object.type === 'psd',
  );
  const psdObjectCount = psdObjects.length;

  if (psdObjectCount === 0) {
    return { ok: false, reason: 'noPsdObject', psdObjectCount };
  }

  // 最後にインポートされたものを見る（e2e は1枚だけ追加する想定）。
  const psdObject = psdObjects[psdObjects.length - 1];
  const rootLayer = psdObject.rootLayer;
  const activeLayerIds = psdObject.activeLayerIds;

  if (!rootLayer || !activeLayerIds) {
    return { ok: false, reason: 'missingLayerTree', psdObjectCount };
  }

  const tree = rootLayer.children.map(serialiseNode);
  const nodeCount = countNodes(tree);
  const expectedActiveLayerIds = computeExpectedActiveLayerIds(rootLayer);
  const activeLayerIdDiffs = diffActiveLayerIds(expectedActiveLayerIds, activeLayerIds);
  const rootActive = activeLayerIds[rootLayer.id] === true;

  return {
    ok: activeLayerIdDiffs.length === 0 && rootActive,
    psdObjectCount,
    docWidth: psdObject.width,
    docHeight: psdObject.height,
    nodeCount,
    tree,
    activeLayerIdDiffs,
    rootActive,
  };
};

declare global {
  interface Window {
    __UXFD_PSD_IMPORT_PARITY_E2E__?: {
      snapshot: () => PsdImportParitySnapshot;
    };
  }
}

export const installPsdImportParityHarness = () => {
  window.__UXFD_PSD_IMPORT_PARITY_E2E__ = { snapshot };
};
