import { describe, expect, it } from 'vitest';
import { begin, drag, end, type Axis } from './translateGizmo';
import { normalize, sub, type Vec3 } from './vec3';
import type { Ray } from './cameraRay';

/** カメラ視点 eye から、ワールド上の target 点を厳密に狙うレイを作る（テスト用ヘルパー）。 */
const rayThrough = (eye: Vec3, target: Vec3): Ray => ({
  origin: eye,
  direction: normalize(sub(target, eye))
});

const eye: Vec3 = { x: 6, y: 5, z: 10 };
const start: Vec3 = { x: 0, y: 0, z: 0 };

describe('translateGizmo axis drag', () => {
  const cases: { axis: Axis; target0: Vec3; target1: Vec3 }[] = [
    { axis: 'x', target0: { x: 2, y: 0, z: 0 }, target1: { x: 5, y: 0, z: 0 } },
    { axis: 'y', target0: { x: 0, y: 3, z: 0 }, target1: { x: 0, y: -1, z: 0 } },
    { axis: 'z', target0: { x: 0, y: 0, z: 4 }, target1: { x: 0, y: 0, z: -2 } }
  ];

  for (const { axis, target0, target1 } of cases) {
    it(`dragging along the ${axis} axis moves only the ${axis} coordinate`, () => {
      const session = begin({ kind: 'axis', axis }, rayThrough(eye, target0), start);
      const result = drag(session, rayThrough(eye, target1));

      const changedKey = axis;
      const otherKeys = (['x', 'y', 'z'] as const).filter((k) => k !== changedKey);
      expect(result[changedKey]).toBeCloseTo(target1[changedKey], 4);
      for (const k of otherKeys) {
        expect(result[k]).toBeCloseTo(start[k], 6);
      }
    });
  }
});

describe('translateGizmo plane (XZ) drag', () => {
  it('moves both X and Z while leaving Y fixed', () => {
    const target0: Vec3 = { x: 1, y: 0, z: 1 };
    const target1: Vec3 = { x: 4, y: 0, z: -2 };
    const session = begin({ kind: 'plane', plane: 'xz' }, rayThrough(eye, target0), start);
    const result = drag(session, rayThrough(eye, target1));
    expect(result.x).toBeCloseTo(target1.x, 4);
    expect(result.z).toBeCloseTo(target1.z, 4);
    expect(result.y).toBeCloseTo(start.y, 6);
  });

  it('end() finalizes the drag with the same result as the last drag() call', () => {
    const target0: Vec3 = { x: 1, y: 0, z: 1 };
    const target1: Vec3 = { x: 4, y: 0, z: -2 };
    const session = begin({ kind: 'plane', plane: 'xz' }, rayThrough(eye, target0), start);
    const dragged = drag(session, rayThrough(eye, target1));
    const finished = end(session, rayThrough(eye, target1));
    expect(finished).toEqual(dragged);
  });
});

describe('translateGizmo degenerate input safety', () => {
  it('a ray parallel to the drag axis does not produce NaN/Infinity (clamps to no movement)', () => {
    // レイの方向が x 軸と平行 → 軸との最近接点が定義できない縮退ケース
    const parallelRay: Ray = { origin: { x: -5, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
    const session = begin({ kind: 'axis', axis: 'x' }, parallelRay, start);
    const result = drag(session, parallelRay);
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    expect(Number.isFinite(result.z)).toBe(true);
  });

  it('a ray parallel to the XZ plane (no vertical component) does not produce NaN/Infinity', () => {
    const parallelRay: Ray = { origin: { x: 0, y: 5, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
    const session = begin({ kind: 'plane', plane: 'xz' }, parallelRay, start);
    const result = drag(session, parallelRay);
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    expect(Number.isFinite(result.z)).toBe(true);
  });
});
