/**
 * シーン変形に関する Pixi 非依存の純粋関数群。
 *
 * PixiJS 排除計画（`markdown/Pixi_Removal_Plan.md`）Phase 3 に基づき、
 * `pixiRenderHelper.ts` から移設した。ヒットテスト（`sceneHitTest.ts`）や
 * `visionTrackingKeyframes.ts` など、Pixi を import せずにシーン変形を
 * 計算したいモジュールはここから import すること。
 */
import type { GroupControlObject, ObjectFilter, TimelineObject } from '../types';
import { evaluateObjectPositionAtTime } from './keyframes';
import { getEnabledObjectFiltersInOrder } from './filterStack';

export interface GroupTransformResult {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
}

/**
 * `obj` に適用される group_control（自分より上のレイヤーにあり、時間範囲内かつ
 * targetLayerCount の範囲内のもの）の変形を積算して返す。
 */
export const getGroupTransforms = (
  obj: TimelineObject,
  time: number,
  allObjects: TimelineObject[]
): GroupTransformResult => {
  let x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1, alpha = 1;
  const groups = allObjects.filter(o =>
    o.type === 'group_control'
    && o.layer < obj.layer
    && time >= o.startTime
    && time < o.startTime + o.duration
  ) as GroupControlObject[];
  groups.forEach(group => {
    if (group.targetLayerCount === 0 || (obj.layer <= group.layer + group.targetLayerCount)) {
      const position = evaluateObjectPositionAtTime(group, time);
      const gx = position.x;
      const gy = position.y;
      x += gx; y += gy; rotation += group.rotation || 0;
      scaleX *= (group.scaleX ?? 1); scaleY *= (group.scaleY ?? 1); alpha *= (group.opacity ?? 1);
    }
  });
  return { x, y, rotation, scaleX, scaleY, alpha };
};

const isVibrationFilter = (filter: ObjectFilter): filter is Extract<ObjectFilter, { type: 'vibration' }> => {
  return filter.type === 'vibration';
};

/** 振動フィルタによる位置オフセットを返す（複数フィルタは加算合成）。 */
export const getVibrationOffset = (obj: TimelineObject, time: number): { x: number; y: number } => {
  const vibrationFilters = getEnabledObjectFiltersInOrder(obj).filter(isVibrationFilter);
  if (vibrationFilters.length === 0) return { x: 0, y: 0 };

  return vibrationFilters.reduce((acc, filter, index) => {
    const { strength, speed } = filter.params;
    if (strength === 0) return acc;
    const phase = index * 1.618;
    const t = time * speed + phase;
    return {
      x: acc.x + (Math.sin(t * 12.9898) * strength + Math.cos(t * 78.233) * strength * 0.5),
      y: acc.y + (Math.cos(t * 12.9898) * strength + Math.sin(t * 78.233) * strength * 0.5)
    };
  }, { x: 0, y: 0 });
};
