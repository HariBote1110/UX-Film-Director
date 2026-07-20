/**
 * オブジェクトの「時間帯（在圏）可視性」判定の唯一の実装。
 *
 * 実機バグA（ゴースト選択枠）の根本原因: `getObjectWorldCorners`
 * （sceneHitTest.ts）に startTime/duration の時間帯チェックが無く、
 * かつ同じ判定ロジックが `sceneHitTest.ts` の `isVisible` と
 * `rustSceneSnapshot.ts` の `collectVisibleObjects` の2箇所に重複していた
 * （overlay 側はどちらにも依らず素通し）。ここに唯一の実装として集約し、
 * 各所はこれへ委譲する。
 *
 * 判定内容:
 * - 時間帯: `startTime <= time < startTime + duration`（終端は排他的）。
 * - レイヤー可視性: `layers` が渡された場合のみ、対象レイヤーの
 *   `visible === false` を追加でチェックする（ロックは可視性に影響しない）。
 */
import type { LayerState, TimelineObject } from '../types';

export const isObjectVisibleAtTime = (
  object: TimelineObject,
  time: number,
  layers?: LayerState[]
): boolean => {
  if (layers && layers[object.layer]?.visible === false) return false;
  return time >= object.startTime && time < object.startTime + object.duration;
};
