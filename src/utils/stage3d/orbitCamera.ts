/**
 * ThreeStageViewport.tsx で使われていた three/examples/jsm/controls/OrbitControls の
 * 実使用サブセット（target, enableDamping, dampingFactor, start/end イベントに相当する
 * 挙動）を、レンダラー非依存の純粋な状態機械として再実装したもの。
 *
 * three.js の座標系（Y-up, 右手系）に合わせた球面座標を採用する:
 *   x = radius * sin(phi) * sin(theta)
 *   y = radius * cos(phi)
 *   z = radius * sin(phi) * cos(theta)
 * （three.js Vector3.setFromSpherical と同じ規約）
 */
import { add, cross, length, normalize, scale, sub, type Vec3 } from './vec3';

export interface OrbitCameraSpherical {
  target: Vec3;
  radius: number;
  /** 方位角（Y 軸まわり）, ラジアン */
  theta: number;
  /** 極角（+Y 軸からの角度）, ラジアン */
  phi: number;
}

interface OrbitVelocity {
  theta: number;
  phi: number;
  panX: number;
  panY: number;
}

export interface OrbitCameraConfig {
  enableDamping: boolean;
  /** OrbitControls.dampingFactor と同じ意味（1フレーム=16.6667msあたりの減衰率） */
  dampingFactor: number;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
}

export interface OrbitCameraModel {
  state: OrbitCameraSpherical;
  velocity: OrbitVelocity;
  config: OrbitCameraConfig;
}

/** OrbitControls.update() が想定する基準フレーム間隔（60fps） */
const REFERENCE_FRAME_MS = 1000 / 60;

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

const clampState = (state: OrbitCameraSpherical, config: OrbitCameraConfig): OrbitCameraSpherical => ({
  ...state,
  radius: clamp(state.radius, config.minDistance, config.maxDistance),
  phi: clamp(state.phi, config.minPolarAngle, config.maxPolarAngle)
});

export const createOrbitCamera = (
  state: OrbitCameraSpherical,
  config: OrbitCameraConfig
): OrbitCameraModel => ({
  state: clampState(state, config),
  velocity: { theta: 0, phi: 0, panX: 0, panY: 0 },
  config
});

/**
 * カメラの視線方向から right / up の正規直交基底を求める。
 * phi が両極（真上/真下）に近いときは right が縮退しうるが、
 * minPolarAngle/maxPolarAngle によるクランプで実用上は避けられる。
 */
const cameraBasis = (state: OrbitCameraSpherical): { forward: Vec3; right: Vec3; up: Vec3 } => {
  const offset = sphericalOffset(state);
  const forward = normalize(scale(offset, -1));
  const worldUp: Vec3 = { x: 0, y: 1, z: 0 };
  let right = normalize(cross(forward, worldUp));
  if (right.x === 0 && right.y === 0 && right.z === 0) {
    // forward がほぼ worldUp と平行（真上/真下視点）の縮退ケース
    right = { x: 1, y: 0, z: 0 };
  }
  const up = normalize(cross(right, forward));
  return { forward, right, up };
};

/**
 * ポインタ移動量 (dx, dy) を回転入力として与える。
 * enableDamping が有効なときは velocity に積み、update() で徐々に反映する。
 * 無効なときは OrbitControls 同様に即座に spherical へ反映する。
 */
export const rotate = (model: OrbitCameraModel, dx: number, dy: number): OrbitCameraModel => {
  if (model.config.enableDamping) {
    return {
      ...model,
      velocity: {
        ...model.velocity,
        theta: model.velocity.theta + dx,
        phi: model.velocity.phi + dy
      }
    };
  }
  const state = clampState(
    { ...model.state, theta: model.state.theta + dx, phi: model.state.phi + dy },
    model.config
  );
  return { ...model, state };
};

/** カメラ平面（視線に直交する面）内で target を移動する。dx=right方向, dy=up方向。 */
export const pan = (model: OrbitCameraModel, dx: number, dy: number): OrbitCameraModel => {
  if (model.config.enableDamping) {
    return {
      ...model,
      velocity: {
        ...model.velocity,
        panX: model.velocity.panX + dx,
        panY: model.velocity.panY + dy
      }
    };
  }
  const { right, up } = cameraBasis(model.state);
  const offset = add(scale(right, dx), scale(up, dy));
  const state = clampState({ ...model.state, target: add(model.state.target, offset) }, model.config);
  return { ...model, state };
};

/**
 * ホイール等のズーム入力。delta > 0 で距離を広げる（ズームアウト）方向。
 * OrbitControls と同様に minDistance/maxDistance へ即座にクランプする（ダンピング対象外）。
 */
export const zoom = (model: OrbitCameraModel, delta: number): OrbitCameraModel => {
  const factor = Math.exp(delta * 0.001);
  const state = clampState({ ...model.state, radius: model.state.radius * factor }, model.config);
  return { ...model, state };
};

/**
 * ダンピングの積み残し（velocity）を時間経過ぶんだけ状態に適用する。
 * dampingFactor は 60fps 基準の値として扱い、実際の dt に応じて指数減衰させることで
 * フレームレートに依存せず単調収束（オーバーシュートなし）にする。
 */
export const update = (model: OrbitCameraModel, dtMs: number): OrbitCameraModel => {
  if (!model.config.enableDamping) return model;
  const { velocity } = model;
  if (
    velocity.theta === 0 &&
    velocity.phi === 0 &&
    velocity.panX === 0 &&
    velocity.panY === 0
  ) {
    return model;
  }

  const frames = Math.max(0, dtMs) / REFERENCE_FRAME_MS;
  // 1フレームあたり dampingFactor 分だけ velocity を消費し、残りは (1-dampingFactor) 減衰する。
  // dt が REFERENCE_FRAME_MS でない場合も、経過フレーム数ぶん指数的に減衰させることで
  // 単調に 0 へ収束させる（三角関数的な振動要因がないため overshoot しない）。
  const remainingFactor = Math.pow(1 - model.config.dampingFactor, frames);
  const appliedFactor = 1 - remainingFactor;

  const { right, up } = cameraBasis(model.state);
  const panOffset = add(scale(right, velocity.panX * appliedFactor), scale(up, velocity.panY * appliedFactor));

  const state = clampState(
    {
      ...model.state,
      theta: model.state.theta + velocity.theta * appliedFactor,
      phi: model.state.phi + velocity.phi * appliedFactor,
      target: add(model.state.target, panOffset)
    },
    model.config
  );

  const nextVelocity: OrbitVelocity = {
    theta: velocity.theta * remainingFactor,
    phi: velocity.phi * remainingFactor,
    panX: velocity.panX * remainingFactor,
    panY: velocity.panY * remainingFactor
  };

  return { ...model, state, velocity: nextVelocity };
};

/** target から見た球面座標オフセット（three.js Vector3.setFromSpherical と同じ規約）。 */
const sphericalOffset = (state: OrbitCameraSpherical): Vec3 => {
  const { radius, theta, phi } = state;
  const sinPhiRadius = radius * Math.sin(phi);
  return {
    x: sinPhiRadius * Math.sin(theta),
    y: radius * Math.cos(phi),
    z: sinPhiRadius * Math.cos(theta)
  };
};

/** レンダラーの setCamera 等に渡す eye/look ベクトルを算出する。 */
export const getEyeLook = (model: OrbitCameraModel): { eye: Vec3; look: Vec3 } => {
  const { target } = model.state;
  return { eye: add(target, sphericalOffset(model.state)), look: { ...target } };
};

/**
 * eye/target のカルテシアン座標から球面座標を逆算する（getEyeLook の逆変換）。
 * OrbitControls.update() が毎回 offset = camera.position - target から spherical を
 * 再構成するのと同じ規約（Y-up, three.js Vector3.setFromSpherical 相当）。
 * eye と target がほぼ一致する縮退ケースでは、退化を避けるため微小な radius/正面向きの
 * phi にフォールバックする。
 */
export const sphericalFromEyeTarget = (eye: Vec3, target: Vec3): OrbitCameraSpherical => {
  const offset = sub(eye, target);
  const radius = length(offset);
  if (radius < 1e-9) {
    return { target: { ...target }, radius: 1e-3, theta: 0, phi: Math.PI / 2 };
  }
  const phi = Math.acos(clamp(offset.y / radius, -1, 1));
  const theta = Math.atan2(offset.x, offset.z);
  return { target: { ...target }, radius, theta, phi };
};

/**
 * モデルの spherical state を外部から丸ごと差し替える（ダンピングの積み残し
 * velocity はそのまま維持する — OrbitControls.update() が毎回 camera.position から
 * spherical を再構成しつつ sphericalDelta の累積は温存するのと同じ挙動）。
 */
export const setState = (model: OrbitCameraModel, state: OrbitCameraSpherical): OrbitCameraModel => ({
  ...model,
  state: clampState(state, model.config)
});
