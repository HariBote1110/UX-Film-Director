import { describe, expect, it } from 'vitest';
import { hitTestBillboards, hitVolumeDepth, type OrientedBoxBillboard } from './hitTest';

describe('hitVolumeDepth', () => {
  it('is proportional to the smaller of width/height, clamped to [0.05, 0.35] (ported from ThreeStageViewport.tsx)', () => {
    expect(hitVolumeDepth(1, 1)).toBeCloseTo(0.08, 10);
    expect(hitVolumeDepth(10, 10)).toBeCloseTo(0.35, 10); // 上限クランプ
    expect(hitVolumeDepth(0.1, 10)).toBeCloseTo(0.05, 10); // 下限クランプ
    expect(hitVolumeDepth(2, 1)).toBeCloseTo(0.08, 10); // min(width,height) を使う
  });
});

describe('hitTestBillboards', () => {
  const makeBox = (overrides: Partial<OrientedBoxBillboard> = {}): OrientedBoxBillboard => ({
    id: 'a',
    centre: { x: 0, y: 0, z: 0 },
    yawRadians: 0,
    width: 2,
    height: 2,
    depth: 0.2,
    ...overrides
  });

  it('hits a billboard when the ray points straight at it (frontal hit)', () => {
    const ray = { origin: { x: 0, y: 0, z: 10 }, direction: { x: 0, y: 0, z: -1 } };
    const result = hitTestBillboards(ray, [makeBox()]);
    expect(result).not.toBeNull();
    expect(result?.id).toBe('a');
    expect(result?.distance).toBeCloseTo(10 - 0.1, 6); // depth/2 手前の面に当たる
  });

  it('misses when the ray passes outside the billboard bounds', () => {
    const ray = { origin: { x: 5, y: 0, z: 10 }, direction: { x: 0, y: 0, z: -1 } };
    const result = hitTestBillboards(ray, [makeBox()]);
    expect(result).toBeNull();
  });

  it('hits obliquely through the depth volume even when width/height alone would miss the flat plane', () => {
    // 板ポリ面(z=0)ぎりぎりを斜めに通過するが、奥行きボリューム内を通るレイ
    const ray = {
      origin: { x: -0.5, y: 0, z: 5 },
      direction: { x: 0.09, y: 0, z: -1 }
    };
    const normalizedDir = (() => {
      const len = Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z);
      return { x: ray.direction.x / len, y: ray.direction.y / len, z: ray.direction.z / len };
    })();
    const result = hitTestBillboards({ origin: ray.origin, direction: normalizedDir }, [makeBox()]);
    expect(result).not.toBeNull();
  });

  it('selects the nearest of two overlapping billboards', () => {
    const ray = { origin: { x: 0, y: 0, z: 10 }, direction: { x: 0, y: 0, z: -1 } };
    const near = makeBox({ id: 'near', centre: { x: 0, y: 0, z: 2 } });
    const far = makeBox({ id: 'far', centre: { x: 0, y: 0, z: -3 } });
    const result = hitTestBillboards(ray, [far, near]);
    expect(result?.id).toBe('near');
  });

  it('hits a yaw-rotated box using its local axes rather than world axes', () => {
    // 90度回転した板は元々 X 方向に width=2, depth=0.2 だったのが Z 方向に width、X 方向に depth になる
    const rotated = makeBox({ yawRadians: Math.PI / 2, width: 2, height: 2, depth: 0.2 });
    // ワールド X 方向から見て、幅方向(回転後は薄い depth 方向)を通るレイは当たらないはず
    const missingRay = { origin: { x: 10, y: 0, z: 0.9 }, direction: { x: -1, y: 0, z: 0 } };
    expect(hitTestBillboards(missingRay, [rotated])).toBeNull();
    // 回転後の厚み方向(元の depth=0.2 が X 方向)にはヒットする
    const hittingRay = { origin: { x: 10, y: 0, z: 0 }, direction: { x: -1, y: 0, z: 0 } };
    expect(hitTestBillboards(hittingRay, [rotated])?.id).toBe('a');
  });
});
