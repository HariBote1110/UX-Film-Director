import type { SceneSelectionOverlayObjectGeometry, SceneSelectionHandleCorner } from './sceneSelectionOverlayGeometry';

/**
 * 選択枠オーバーレイの命令的パッチ（SVG 属性の直接更新）。
 * React 再レンダーではなく `useStore.subscribe` + この関数で
 * 時間追従を実装するための実装パターン。
 *
 * DOM に依存しない構造的型（`setAttribute` と `style.display` だけを要求）。
 * テストではフェイク要素で、実装では `SVGElement` で使用される。
 */

export interface SceneSelectionOverlayPatchElement {
  setAttribute(name: string, value: string): void;
}

export interface SceneSelectionOverlayPatchGroupElement extends SceneSelectionOverlayPatchElement {
  style: { display: string };
}

export interface SceneSelectionOverlayPatchTargets {
  group: SceneSelectionOverlayPatchGroupElement;
  polygon: SceneSelectionOverlayPatchElement;
  handles: Record<SceneSelectionHandleCorner, SceneSelectionOverlayPatchElement>;
}

/**
 * ジオメトリ entries を targets Map へ適用する。
 *
 * @param targets - objectId -> パッチ対象要素群のマップ
 * @param entries - 計算済みのジオメトリエントリ配列（`computeSceneSelectionOverlayGeometry` の結果）
 *
 * 意味論:
 * - visible entry: group.style.display='' に設定し、polygon.points と各 handle x/y を更新
 * - invisible entry: group.style.display='none' に設定し、polygon/handle は一切触らない
 * - targets にあるが entries に無い entry: group.style.display='none'（選択解除時に隠す）
 * - entries にあるが targets に無い entry: 何もしない（throwしない）
 */
export function applySceneSelectionOverlayGeometry(
  targets: Map<string, SceneSelectionOverlayPatchTargets>,
  entries: SceneSelectionOverlayObjectGeometry[]
): void {
  // entries を objectId でマップ化して、高速査定を実現
  const entryMap = new Map(entries.map((e) => [e.objectId, e]));

  // targets に存在する各 objectId に対して apply
  for (const [objectId, patchTargets] of targets) {
    const entry = entryMap.get(objectId);

    if (!entry) {
      // targets にあるが entries に無い → 隠す（選択解除の過渡状態）
      patchTargets.group.style.display = 'none';
      continue;
    }

    if (entry.visible) {
      // visible entry: display を空にし、polygon・handles を更新
      patchTargets.group.style.display = '';
      patchTargets.polygon.setAttribute('points', entry.points);

      // handles を top-left, top-right, bottom-left, bottom-right の順で更新
      const handleCornerOrder: SceneSelectionHandleCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
      for (const handle of entry.handles) {
        const elem = patchTargets.handles[handle.corner];
        elem.setAttribute('x', String(handle.x));
        elem.setAttribute('y', String(handle.y));
      }
    } else {
      // invisible entry: display を 'none' にし、polygon/handle は一切触らない
      patchTargets.group.style.display = 'none';
    }
  }
}
