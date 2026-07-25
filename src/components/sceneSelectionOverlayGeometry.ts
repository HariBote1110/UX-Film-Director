import { getObjectWorldCorners, worldPointToCssPoint, type SceneHitTestViewport } from '../utils/sceneHitTest';
import type { TimelineObject } from '../types';

/**
 * 選択枠オーバーレイのジオメトリ計算を純関数として切り出したモジュール。
 * `SceneSelectionOverlay.tsx` の render 内ロジックを移植し、
 * 時間追従の命令的パッチ（`sceneSelectionOverlayPatch.ts`）との契約点となる。
 *
 * 計算は純粋で、副作用なし。DOM 要素へのアタッチメント・属性更新は
 * `applySceneSelectionOverlayGeometry` が担当。
 */

export const SCENE_SELECTION_RESIZE_HANDLE_SIZE = 10;

export type SceneSelectionHandleCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface SceneSelectionOverlayHandleGeometry {
  corner: SceneSelectionHandleCorner;
  x: number;
  y: number;
}

export interface SceneSelectionOverlayObjectGeometry {
  objectId: string;
  visible: boolean;
  points: string;
  handles: SceneSelectionOverlayHandleGeometry[];
}

interface ComputeParams {
  selectedIds: string[];
  objects: TimelineObject[];
  time: number;
  viewport: SceneHitTestViewport;
}

/**
 * 選択中オブジェクトのジオメトリ（points 文字列・ハンドル座標）を計算する。
 *
 * @param params - 入力パラメータ
 * @returns 各選択オブジェクトのジオメトリエントリ配列。
 *   `objects` 配列の順を保持し、selected でない要素は除外される。
 */
export function computeSceneSelectionOverlayGeometry(params: ComputeParams): SceneSelectionOverlayObjectGeometry[] {
  const { selectedIds, objects, time, viewport } = params;

  return objects
    .filter((obj) => selectedIds.includes(obj.id))
    .map((obj) => {
      const corners = getObjectWorldCorners(obj, time, objects);

      if (!corners) {
        return {
          objectId: obj.id,
          visible: false,
          points: '',
          handles: [],
        };
      }

      const toCss = (p: { x: number; y: number }) => worldPointToCssPoint(p, viewport);
      const tl = toCss(corners.topLeft);
      const tr = toCss(corners.topRight);
      const bl = toCss(corners.bottomLeft);
      const br = toCss(corners.bottomRight);

      // points は tl → tr → br → bl の順
      const points = `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;

      // handles は top-left, top-right, bottom-left, bottom-right の順
      // 各コーナー座標から RESIZE_HANDLE_SIZE/2 (=5) を引く
      const handleOffset = SCENE_SELECTION_RESIZE_HANDLE_SIZE / 2;
      const handles: SceneSelectionOverlayHandleGeometry[] = [
        { corner: 'top-left', x: tl.x - handleOffset, y: tl.y - handleOffset },
        { corner: 'top-right', x: tr.x - handleOffset, y: tr.y - handleOffset },
        { corner: 'bottom-left', x: bl.x - handleOffset, y: bl.y - handleOffset },
        { corner: 'bottom-right', x: br.x - handleOffset, y: br.y - handleOffset },
      ];

      return {
        objectId: obj.id,
        visible: true,
        points,
        handles,
      };
    });
}
