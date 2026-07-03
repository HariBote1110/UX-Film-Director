/**
 * PixiJS のシーングラフに依存しない、シーンモデル直参照のヒットテスト。
 *
 * PixiJS 排除計画（`markdown/Pixi_Removal_Plan.md`）Phase 3 の一部。
 * 「viewport CSS 座標 + 現在時刻 + TimelineObject[] → ヒットしたオブジェクト ID
 * （前面優先）」を計算する純粋関数群。オブジェクトの変形計算は
 * `sceneTransforms.ts`（`getGroupTransforms` / `getVibrationOffset`）と
 * 同じ式を用いる（`Viewport.tsx` のコンテナ変形と等価）。
 *
 * 座標系:
 * - 入力の cssX / cssY は preview 要素（`Viewport.tsx` の `containerRef`）を
 *   基準にした CSS pt（devicePixelRatio 適用前）。要素サイズは
 *   `projectWidth * displayScale` × `projectHeight * displayScale` になっており、
 *   preview は常にこの要素いっぱいに contain-fit されているため、
 *   letterbox（要素内部の余白）は存在しない。
 * - `displayScale` で割ることで「ワールドコンテナ（`world`）の親空間」の
 *   座標が得られる。
 * - `world` は `pivot=(w/2,h/2)`、`position=(w/2+centreOffsetX,h/2+centreOffsetY)`、
 *   `scale=zoom`、`rotation=rotationDeg` を持つため、親空間座標から
 *   `world.pivot` を基準にした逆変換（逆回転・逆スケール）を行うと、
 *   オブジェクトの `x`/`y` と同じ「ワールド座標（カメラ変換前のシーン座標）」が得られる。
 * - 各オブジェクトはワールド座標系内で `x, y, rotation, scaleX, scaleY`
 *   （+ `getGroupTransforms` の積算 + `getVibrationOffset`）による変形を持ち、
 *   ローカル矩形は常に左上原点 `(0,0)-(width,height)`（pivot/anchor 補正なし）。
 */
import type { LayerState, TimelineObject } from '../types';
import { getGroupTransforms, getVibrationOffset } from './sceneTransforms';
import { evaluateObjectPositionAtTime } from './keyframes';

export interface SceneCamera {
  centreOffsetX: number;
  centreOffsetY: number;
  zoom: number;
  rotationDeg: number;
}

export interface SceneHitTestViewport {
  projectWidth: number;
  projectHeight: number;
  /** `computePreviewDisplayScale` の結果（CSS px 単位のプロジェクト座標倍率）。 */
  displayScale: number;
  camera: SceneCamera;
}

export interface SceneHitTestParams {
  cssX: number;
  cssY: number;
  time: number;
  objects: TimelineObject[];
  viewport: SceneHitTestViewport;
  layers?: LayerState[];
}

interface Vec2 {
  x: number;
  y: number;
}

const rotateVec = (v: Vec2, rad: number): Vec2 => {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
  };
};

/** 種別ごとに `width`/`height` を持つオブジェクトのみを対象とする（group_control 等は除外）。 */
const getObjectSize = (obj: TimelineObject): { width: number; height: number } | null => {
  const width = (obj as { width?: unknown }).width;
  const height = (obj as { height?: unknown }).height;
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
};

/** CSS 座標（preview 要素基準）を、ワールド座標（カメラ変換前のシーン座標）へ変換する。 */
export const cssPointToWorldPoint = (
  cssX: number,
  cssY: number,
  viewport: SceneHitTestViewport
): Vec2 => {
  const displayScale = Math.max(1e-6, viewport.displayScale);
  const parentX = cssX / displayScale;
  const parentY = cssY / displayScale;

  const { projectWidth, projectHeight, camera } = viewport;
  const pivotX = projectWidth / 2;
  const pivotY = projectHeight / 2;
  const positionX = pivotX + camera.centreOffsetX;
  const positionY = pivotY + camera.centreOffsetY;
  const zoom = Math.max(0.05, camera.zoom);
  const rotationRad = (camera.rotationDeg * Math.PI) / 180;

  // world.position + R(rotation) * (scale * (worldPoint - world.pivot)) = parentPoint
  // を worldPoint について解く。
  const delta = { x: parentX - positionX, y: parentY - positionY };
  const unrotated = rotateVec(delta, -rotationRad);
  const unscaled = { x: unrotated.x / zoom, y: unrotated.y / zoom };

  return {
    x: unscaled.x + pivotX,
    y: unscaled.y + pivotY,
  };
};

/** ワールド座標（カメラ変換前のシーン座標）を、CSS 座標（preview 要素基準）へ変換する。`cssPointToWorldPoint` の逆変換。 */
export const worldPointToCssPoint = (
  worldPoint: Vec2,
  viewport: SceneHitTestViewport
): Vec2 => {
  const { projectWidth, projectHeight, camera } = viewport;
  const pivotX = projectWidth / 2;
  const pivotY = projectHeight / 2;
  const positionX = pivotX + camera.centreOffsetX;
  const positionY = pivotY + camera.centreOffsetY;
  const zoom = Math.max(0.05, camera.zoom);
  const rotationRad = (camera.rotationDeg * Math.PI) / 180;

  const unscaled = { x: worldPoint.x - pivotX, y: worldPoint.y - pivotY };
  const scaled = { x: unscaled.x * zoom, y: unscaled.y * zoom };
  const rotated = rotateVec(scaled, rotationRad);

  const parentX = positionX + rotated.x;
  const parentY = positionY + rotated.y;

  const displayScale = Math.max(1e-6, viewport.displayScale);
  return {
    x: parentX * displayScale,
    y: parentY * displayScale,
  };
};

export interface ObjectWorldCorners {
  topLeft: Vec2;
  topRight: Vec2;
  bottomLeft: Vec2;
  bottomRight: Vec2;
}

/** 対象オブジェクトの変形済み矩形（回転・スケール・groupTransforms・vibration 適用後）の四隅をワールド座標で返す。 */
export const getObjectWorldCorners = (
  obj: TimelineObject,
  time: number,
  allObjects: TimelineObject[]
): ObjectWorldCorners | null => {
  const size = getObjectSize(obj);
  if (!size) return null;

  const base = evaluateObjectPositionAtTime(obj, time);
  const groupEffects = getGroupTransforms(obj, time, allObjects);
  const vib = getVibrationOffset(obj, time);

  const containerX = base.x + groupEffects.x + vib.x;
  const containerY = base.y + groupEffects.y + vib.y;
  const rotationRad = ((obj.rotation || 0) + groupEffects.rotation) * (Math.PI / 180);
  const scaleX = (obj.scaleX ?? 1) * groupEffects.scaleX;
  const scaleY = (obj.scaleY ?? 1) * groupEffects.scaleY;

  const localCorners: Record<keyof ObjectWorldCorners, Vec2> = {
    topLeft: { x: 0, y: 0 },
    topRight: { x: size.width, y: 0 },
    bottomLeft: { x: 0, y: size.height },
    bottomRight: { x: size.width, y: size.height },
  };

  const toWorld = (local: Vec2): Vec2 => {
    const scaled = { x: local.x * scaleX, y: local.y * scaleY };
    const rotated = rotateVec(scaled, rotationRad);
    return { x: containerX + rotated.x, y: containerY + rotated.y };
  };

  return {
    topLeft: toWorld(localCorners.topLeft),
    topRight: toWorld(localCorners.topRight),
    bottomLeft: toWorld(localCorners.bottomLeft),
    bottomRight: toWorld(localCorners.bottomRight),
  };
};

/** ワールド座標を、対象オブジェクトのローカル座標（変形前・左上原点）へ変換する。 */
const worldPointToObjectLocalPoint = (
  worldPoint: Vec2,
  obj: TimelineObject,
  time: number,
  allObjects: TimelineObject[]
): Vec2 => {
  const base = evaluateObjectPositionAtTime(obj, time);
  const groupEffects = getGroupTransforms(obj, time, allObjects);
  const vib = getVibrationOffset(obj, time);

  const containerX = base.x + groupEffects.x + vib.x;
  const containerY = base.y + groupEffects.y + vib.y;
  const rotationRad = ((obj.rotation || 0) + groupEffects.rotation) * (Math.PI / 180);
  const scaleX = (obj.scaleX ?? 1) * groupEffects.scaleX;
  const scaleY = (obj.scaleY ?? 1) * groupEffects.scaleY;

  const delta = { x: worldPoint.x - containerX, y: worldPoint.y - containerY };
  const unrotated = rotateVec(delta, -rotationRad);

  return {
    x: unrotated.x / (scaleX === 0 ? 1e-6 : scaleX),
    y: unrotated.y / (scaleY === 0 ? 1e-6 : scaleY),
  };
};

const isVisible = (obj: TimelineObject, time: number, layers: LayerState[] | undefined): boolean => {
  if (layers && layers[obj.layer]?.visible === false) return false;
  return time >= obj.startTime && time < obj.startTime + obj.duration;
};

/**
 * viewport CSS 座標 + 現在時刻 + TimelineObject[] から、ヒットしたオブジェクト ID を返す。
 * 重なりがある場合は `layer` の値が大きい方（前面）を優先する。ヒットが無ければ null。
 */
export const hitTestSceneObjects = (params: SceneHitTestParams): string | null => {
  const { cssX, cssY, time, objects, viewport, layers } = params;
  const worldPoint = cssPointToWorldPoint(cssX, cssY, viewport);

  let bestId: string | null = null;
  let bestLayer = Number.NEGATIVE_INFINITY;

  for (const obj of objects) {
    const size = getObjectSize(obj);
    if (!size) continue;
    if (!isVisible(obj, time, layers)) continue;

    const local = worldPointToObjectLocalPoint(worldPoint, obj, time, objects);
    const withinX = local.x >= 0 && local.x <= size.width;
    const withinY = local.y >= 0 && local.y <= size.height;
    if (!withinX || !withinY) continue;

    if (obj.layer > bestLayer) {
      bestLayer = obj.layer;
      bestId = obj.id;
    }
  }

  return bestId;
};
