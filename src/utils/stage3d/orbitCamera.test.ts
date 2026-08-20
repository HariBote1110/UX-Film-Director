import { describe, expect, it } from 'vitest';
import {
  createOrbitCamera,
  getEyeLook,
  pan,
  rotate,
  setState,
  sphericalFromEyeTarget,
  update,
  zoom,
} from './orbitCamera';
import { length, sub } from './vec3';

const baseConfig = {
  enableDamping: true,
  dampingFactor: 0.08,
  minDistance: 1,
  maxDistance: 100,
  minPolarAngle: 0.001,
  maxPolarAngle: Math.PI - 0.001
};

describe('orbitCamera', () => {
  it('rotate(dx,dy) without damping updates spherical angles immediately', () => {
    const s0 = createOrbitCamera(
      { target: { x: 0, y: 0, z: 0 }, radius: 10, theta: 0, phi: Math.PI / 2 },
      { ...baseConfig, enableDamping: false }
    );
    const s1 = rotate(s0, 0.5, 0.1);
    // 減衰なしなので即座に spherical に反映される
    expect(s1.state.theta).toBeCloseTo(0.5, 10);
    expect(s1.state.phi).toBeCloseTo(Math.PI / 2 + 0.1, 10);
  });

  it('pan moves the target within the camera plane (perpendicular to the view direction)', () => {
    const s0 = createOrbitCamera(
      { target: { x: 0, y: 0, z: 0 }, radius: 10, theta: 0, phi: Math.PI / 2 },
      { ...baseConfig, enableDamping: false }
    );
    const s1 = pan(s0, 1, 0);
    const { eye: eye0, look: look0 } = getEyeLook(s0);
    const { look: look1 } = getEyeLook(s1);
    const moved = sub(look1, look0);
    expect(length(moved)).toBeGreaterThan(0);
    const forward = sub(look0, eye0);
    const forwardLen = length(forward);
    const dotWithForward = (moved.x * forward.x + moved.y * forward.y + moved.z * forward.z) / forwardLen;
    // 移動量はカメラの視線方向とほぼ直交する（カメラ平面内の移動）
    expect(Math.abs(dotWithForward)).toBeLessThan(1e-9);
  });

  it('zoom clamps the distance to [minDistance, maxDistance]', () => {
    const s0 = createOrbitCamera(
      { target: { x: 0, y: 0, z: 0 }, radius: 10, theta: 0, phi: Math.PI / 2 },
      { ...baseConfig, enableDamping: false, minDistance: 5, maxDistance: 20 }
    );
    const zoomedOut = zoom(s0, 100);
    expect(zoomedOut.state.radius).toBeLessThanOrEqual(20);
    const zoomedIn = zoom(s0, -100);
    expect(zoomedIn.state.radius).toBeGreaterThanOrEqual(5);
  });

  it('damping causes repeated update() calls to converge monotonically toward the target angle without oscillation', () => {
    let s = createOrbitCamera(
      { target: { x: 0, y: 0, z: 0 }, radius: 10, theta: 0, phi: Math.PI / 2 },
      baseConfig
    );
    s = rotate(s, 1.0, 0);
    const targetTheta = 1.0;
    let prevDistance = Math.abs(targetTheta - s.state.theta);
    expect(prevDistance).toBeGreaterThan(0);

    for (let i = 0; i < 200; i++) {
      s = update(s, 16.6667);
      const distance = Math.abs(targetTheta - s.state.theta);
      // 単調減少（オーバーシュートで符号が反転しない）
      expect(distance).toBeLessThanOrEqual(prevDistance + 1e-9);
      prevDistance = distance;
    }
    expect(prevDistance).toBeLessThan(1e-4);
  });

  it('damping velocity decays to (near) zero after many update() ticks, i.e. reaches rest', () => {
    let s = createOrbitCamera(
      { target: { x: 0, y: 0, z: 0 }, radius: 10, theta: 0, phi: Math.PI / 2 },
      baseConfig
    );
    s = rotate(s, 0.3, 0.2);
    for (let i = 0; i < 500; i++) {
      s = update(s, 16.6667);
    }
    expect(s.velocity.theta).toBeCloseTo(0, 6);
    expect(s.velocity.phi).toBeCloseTo(0, 6);
  });

  it('getEyeLook returns an eye positioned radius away from the target along the spherical direction', () => {
    const s0 = createOrbitCamera(
      { target: { x: 1, y: 2, z: 3 }, radius: 5, theta: 0, phi: Math.PI / 2 },
      { ...baseConfig, enableDamping: false }
    );
    const { eye, look } = getEyeLook(s0);
    expect(look).toEqual({ x: 1, y: 2, z: 3 });
    const dist = length(sub(eye, look));
    expect(dist).toBeCloseTo(5, 10);
  });

  it('polar angle is clamped within [minPolarAngle, maxPolarAngle]', () => {
    const s0 = createOrbitCamera(
      { target: { x: 0, y: 0, z: 0 }, radius: 10, theta: 0, phi: Math.PI / 2 },
      { ...baseConfig, enableDamping: false, minPolarAngle: 0.2, maxPolarAngle: 2.8 }
    );
    const s1 = rotate(s0, 0, 10);
    expect(s1.state.phi).toBeLessThanOrEqual(2.8);
    const s2 = rotate(s0, 0, -10);
    expect(s2.state.phi).toBeGreaterThanOrEqual(0.2);
  });
});

describe('sphericalFromEyeTarget / setState', () => {
  it('round-trips with getEyeLook for an arbitrary eye/target pair', () => {
    const eye = { x: 4, y: 7, z: -2 };
    const target = { x: 1, y: 1, z: 1 };
    const spherical = sphericalFromEyeTarget(eye, target);
    const model = setState(
      createOrbitCamera(spherical, { ...baseConfig, minDistance: 0, maxDistance: 1e6 }),
      spherical
    );
    const { eye: recoveredEye, look: recoveredLook } = getEyeLook(model);
    expect(recoveredEye.x).toBeCloseTo(eye.x, 6);
    expect(recoveredEye.y).toBeCloseTo(eye.y, 6);
    expect(recoveredEye.z).toBeCloseTo(eye.z, 6);
    expect(recoveredLook).toEqual(target);
  });

  it('setState preserves velocity (damping in-flight is not reset)', () => {
    let s = createOrbitCamera(
      { target: { x: 0, y: 0, z: 0 }, radius: 10, theta: 0, phi: Math.PI / 2 },
      baseConfig
    );
    s = rotate(s, 0.5, 0.1);
    const rebased = setState(s, sphericalFromEyeTarget({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }));
    expect(rebased.velocity).toEqual(s.velocity);
  });

  it('falls back to a small non-degenerate radius when eye and target coincide', () => {
    const spherical = sphericalFromEyeTarget({ x: 2, y: 2, z: 2 }, { x: 2, y: 2, z: 2 });
    expect(spherical.radius).toBeGreaterThan(0);
    expect(Number.isFinite(spherical.theta)).toBe(true);
    expect(Number.isFinite(spherical.phi)).toBe(true);
  });
});
