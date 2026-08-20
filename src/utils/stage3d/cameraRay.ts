/**
 * PerspectiveCamera（three.js の THREE.PerspectiveCamera 相当）における
 * スクリーン座標 → ワールド空間レイの変換。
 * TransformControls のギズモ操作や hitTest.ts でのピッキングの入力として使う。
 */
import { add, cross, dot, normalize, scale, sub, type Vec3 } from './vec3';

export interface CanvasSize {
  width: number;
  height: number;
}

export interface ScreenPoint {
  /** キャンバス左上を原点とするピクセル座標（Y は下向き） */
  x: number;
  y: number;
}

export interface CameraRayParams {
  eye: Vec3;
  look: Vec3;
  /** ワールド空間の上方向。既定値は (0,1,0)。 */
  up?: Vec3;
  fovYDeg: number;
}

export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

/** カメラのローカル正規直交基底（forward, right, up）を求める。 */
export const cameraAxes = (eye: Vec3, look: Vec3, worldUp: Vec3): { forward: Vec3; right: Vec3; up: Vec3 } => {
  const forward = normalize(sub(look, eye));
  let right = normalize(cross(forward, worldUp));
  if (right.x === 0 && right.y === 0 && right.z === 0) {
    // forward が worldUp と平行な縮退ケース（真上/真下を見ている）
    right = { x: 1, y: 0, z: 0 };
  }
  const up = normalize(cross(right, forward));
  return { forward, right, up };
};

/**
 * スクリーン座標 (px, py) からワールド空間のレイを求める。
 * px/py はキャンバス左上原点・ピクセル単位、canvas 中央が視線方向（NDC 原点）になる。
 */
export const screenPointToRay = (
  point: ScreenPoint,
  canvas: CanvasSize,
  params: CameraRayParams
): Ray => {
  const { eye, look, fovYDeg } = params;
  const worldUp = params.up ?? { x: 0, y: 1, z: 0 };
  const { forward, right, up } = cameraAxes(eye, look, worldUp);

  const aspect = canvas.width / canvas.height;
  const ndcX = canvas.width > 0 ? (point.x / canvas.width) * 2 - 1 : 0;
  const ndcY = canvas.height > 0 ? 1 - (point.y / canvas.height) * 2 : 0;

  const tanHalfFovY = Math.tan((fovYDeg * Math.PI) / 180 / 2);
  const tanHalfFovX = tanHalfFovY * aspect;

  const direction = normalize(
    add(forward, add(scale(right, ndcX * tanHalfFovX), scale(up, ndcY * tanHalfFovY)))
  );

  return { origin: { ...eye }, direction };
};

/**
 * screenPointToRay の逆変換。ワールド座標をスクリーン座標へ射影する
 * (OxidiseStageViewport のギズモ軸ピッキング/オブジェクト選択のスクリーン距離判定に使う)。
 * カメラの後方（camZ <= 0）にある点は null を返す。
 */
export const worldToScreen = (
  worldPoint: Vec3,
  canvas: CanvasSize,
  params: CameraRayParams
): ScreenPoint | null => {
  const { eye, look, fovYDeg } = params;
  const worldUp = params.up ?? { x: 0, y: 1, z: 0 };
  const { forward, right, up } = cameraAxes(eye, look, worldUp);

  const rel = sub(worldPoint, eye);
  const camZ = dot(rel, forward);
  if (camZ <= 1e-6) return null;

  const camX = dot(rel, right);
  const camY = dot(rel, up);

  const aspect = canvas.width / canvas.height;
  const tanHalfFovY = Math.tan((fovYDeg * Math.PI) / 180 / 2);
  const tanHalfFovX = tanHalfFovY * aspect;

  const ndcX = camX / camZ / tanHalfFovX;
  const ndcY = camY / camZ / tanHalfFovY;

  return {
    x: ((ndcX + 1) / 2) * canvas.width,
    y: (1 - (ndcY + 1) / 2) * canvas.height
  };
};
