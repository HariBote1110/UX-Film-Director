/**
 * `useSceneInteraction` の状態遷移から分離した純粋ロジック。
 *
 * PixiJS 排除計画（`markdown/Pixi_Removal_Plan.md`）Phase 3 の一部。
 * `usePixiInteraction.ts` と同じ契約（修飾キーによる選択方式の分岐、
 * ドラッグ差分の適用、モーションパスの正規化）を Pixi 非依存の形で持つ。
 */
import type { PathPoint, TimelineObject } from '../types';

export type PointerSelectionIntent = 'toggle' | 'range' | 'single';

export interface PointerModifierKeys {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

/** metaKey/ctrlKey は toggle、shiftKey は range、それ以外は single（usePixiInteraction と同順序）。 */
export const resolvePointerSelectionIntent = (keys: PointerModifierKeys): PointerSelectionIntent => {
  if (keys.metaKey || keys.ctrlKey) return 'toggle';
  if (keys.shiftKey) return 'range';
  return 'single';
};

export interface Vec2 {
  x: number;
  y: number;
}

export interface DragUpdate {
  x: number;
  y: number;
  endX?: number;
  endY?: number;
}

/**
 * ワールド座標系での移動差分 `delta` を、ドラッグ開始時点のオブジェクト状態 `initial` に適用する。
 * `enableAnimation` が有効なら endX/endY も同じ差分で追従させる。
 */
export const computeDragUpdate = (initial: TimelineObject, delta: Vec2): DragUpdate => {
  const result: DragUpdate = {
    x: Math.round(initial.x + delta.x),
    y: Math.round(initial.y + delta.y),
  };
  if (initial.enableAnimation) {
    result.endX = Math.round(initial.endX + delta.x);
    result.endY = Math.round(initial.endY + delta.y);
  }
  return result;
};

/** モーションパス記録サンプルを time 0..1 に正規化する（2点未満は空配列）。 */
export const normaliseRecordedMotionPath = (samples: PathPoint[]): PathPoint[] => {
  if (samples.length < 2) return [];
  return samples.map((p, i) => ({
    time: i / (samples.length - 1),
    x: p.x,
    y: p.y,
  }));
};
