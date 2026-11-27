/**
 * ThreeStageViewport.tsx で使われていた three/examples/jsm/controls/TransformControls の
 * translate モード（world space, objectChange コールバック）を、レンダラー非依存の
 * 純粋なドラッグ状態機械として再実装したもの。
 *
 * サポートする拘束: X/Y/Z 軸ドラッグ（軸直線とレイの最近接点）、XZ 平面ドラッグ
 * （レイと平面の交点）。TransformControls は他の軸・平面の組も持つが、
 * 3D ステージのビルボード配置用途では XYZ 軸 + XZ 平面で十分なため、これに限定する。
 */
import { add, dot, sub, type Vec3 } from './vec3';
import type { Ray } from './cameraRay';

export type Axis = 'x' | 'y' | 'z';

export type GizmoConstraint = { kind: 'axis'; axis: Axis } | { kind: 'plane'; plane: 'xz' };

export interface GizmoDragSession {
  constraint: GizmoConstraint;
  /** ドラッグ開始時点のオブジェクトのワールド座標 */
  objectStartPosition: Vec3;
  /** 開始時にレイが軸/平面上でつかんだ点（以降のドラッグの基準点） */
  anchorPoint: Vec3;
}

const EPS = 1e-9;

const axisDirection = (axis: Axis): Vec3 => {
  switch (axis) {
    case 'x':
      return { x: 1, y: 0, z: 0 };
    case 'y':
      return { x: 0, y: 1, z: 0 };
    case 'z':
      return { x: 0, y: 0, z: 1 };
  }
};

/**
 * 直線（linePoint を通り lineDir 方向、単位ベクトル）とレイの最近接点（直線側の点）を求める。
 * 直線とレイがほぼ平行（最近接点が一意に定まらない縮退ケース）では
 * NaN/Infinity を避けるため linePoint（＝移動なし）にクランプする。
 */
const closestPointOnLineToRay = (linePoint: Vec3, lineDir: Vec3, ray: Ray): Vec3 => {
  const d1 = lineDir;
  const d2 = ray.direction;
  const r = sub(linePoint, ray.origin);

  const a = dot(d1, d1);
  const b = dot(d1, d2);
  const c = dot(d2, d2);
  const d = dot(d1, r);
  const e = dot(d2, r);

  const denom = a * c - b * b;
  if (Math.abs(denom) < EPS) {
    // 軸とレイがほぼ平行 → 最近接点が定まらないため移動なしにクランプ
    return { ...linePoint };
  }
  const s = (b * e - c * d) / denom;
  return add(linePoint, { x: d1.x * s, y: d1.y * s, z: d1.z * s });
};

/**
 * 平面（planePoint を通り normal 法線）とレイの交点を求める。
 * レイが平面とほぼ平行（交点が定まらない縮退ケース）では
 * NaN/Infinity を避けるため planePoint（＝移動なし）にクランプする。
 */
const rayPlaneIntersection = (planePoint: Vec3, normal: Vec3, ray: Ray): Vec3 => {
  const denom = dot(ray.direction, normal);
  if (Math.abs(denom) < EPS) {
    return { ...planePoint };
  }
  const t = dot(sub(planePoint, ray.origin), normal) / denom;
  return add(ray.origin, { x: ray.direction.x * t, y: ray.direction.y * t, z: ray.direction.z * t });
};

/** 拘束（軸 or 平面）に対して、referencePoint 基準でレイが指す点を求める。 */
const projectRay = (constraint: GizmoConstraint, ray: Ray, referencePoint: Vec3): Vec3 => {
  if (constraint.kind === 'axis') {
    return closestPointOnLineToRay(referencePoint, axisDirection(constraint.axis), ray);
  }
  // plane: 'xz' → 法線は Y 軸
  return rayPlaneIntersection(referencePoint, { x: 0, y: 1, z: 0 }, ray);
};

/** ドラッグ開始。掴んだ瞬間のレイと拘束から anchorPoint を確定する。 */
export const begin = (constraint: GizmoConstraint, ray: Ray, objectPosition: Vec3): GizmoDragSession => ({
  constraint,
  objectStartPosition: { ...objectPosition },
  anchorPoint: projectRay(constraint, ray, objectPosition)
});

/** ドラッグ中。現在のレイに対応する新しいオブジェクト位置を返す（objectChange 相当）。 */
export const drag = (session: GizmoDragSession, ray: Ray): Vec3 => {
  const point = projectRay(session.constraint, ray, session.objectStartPosition);
  const delta = sub(point, session.anchorPoint);
  return add(session.objectStartPosition, delta);
};

/** ドラッグ終了。最終的なレイに対する位置を確定して返す。 */
export const end = (session: GizmoDragSession, ray: Ray): Vec3 => drag(session, ray);
