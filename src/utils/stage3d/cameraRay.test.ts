import { describe, expect, it } from 'vitest';
import { screenPointToRay, worldToScreen } from './cameraRay';
import { add, length, normalize, scale, sub } from './vec3';

describe('screenPointToRay', () => {
  const eye = { x: 0, y: 0, z: 10 };
  const look = { x: 0, y: 0, z: 0 };
  const canvasWidth = 800;
  const canvasHeight = 600;
  const fovYDeg = 45;

  it('produces a ray pointing along the view direction at the centre pixel', () => {
    const ray = screenPointToRay(
      { x: canvasWidth / 2, y: canvasHeight / 2 },
      { width: canvasWidth, height: canvasHeight },
      { eye, look, fovYDeg }
    );
    const forward = normalize(sub(look, eye));
    expect(ray.direction.x).toBeCloseTo(forward.x, 6);
    expect(ray.direction.y).toBeCloseTo(forward.y, 6);
    expect(ray.direction.z).toBeCloseTo(forward.z, 6);
    expect(ray.origin).toEqual(eye);
    expect(length(ray.direction)).toBeCloseTo(1, 6);
  });

  it('diverges symmetrically for opposite corner pixels', () => {
    const topLeft = screenPointToRay(
      { x: 0, y: 0 },
      { width: canvasWidth, height: canvasHeight },
      { eye, look, fovYDeg }
    );
    const bottomRight = screenPointToRay(
      { x: canvasWidth, y: canvasHeight },
      { width: canvasWidth, height: canvasHeight },
      { eye, look, fovYDeg }
    );
    // 中心軸(視線方向)に対して対称: x, y 成分は符号が反転し絶対値が一致する
    expect(topLeft.direction.x).toBeCloseTo(-bottomRight.direction.x, 6);
    expect(topLeft.direction.y).toBeCloseTo(-bottomRight.direction.y, 6);
    expect(topLeft.direction.x).toBeLessThan(0);
    expect(topLeft.direction.y).toBeGreaterThan(0);
    expect(bottomRight.direction.x).toBeGreaterThan(0);
    expect(bottomRight.direction.y).toBeLessThan(0);
  });

  it('widens the horizontal spread proportionally to aspect ratio (wider canvas => larger |x| at the same edge)', () => {
    const narrow = screenPointToRay(
      { x: 800, y: 300 },
      { width: 800, height: 600 },
      { eye, look, fovYDeg }
    );
    const wide = screenPointToRay(
      { x: 1600, y: 300 },
      { width: 1600, height: 600 },
      { eye, look, fovYDeg }
    );
    // 同じ横方向オフセット比率(1.0 = 右端)でも、アスペクト比が大きいほうが x 成分が大きい
    expect(Math.abs(wide.direction.x)).toBeGreaterThan(Math.abs(narrow.direction.x));
  });

  it('returns a unit-length direction for arbitrary camera orientation', () => {
    const ray = screenPointToRay(
      { x: 123, y: 45 },
      { width: 640, height: 480 },
      { eye: { x: 3, y: 4, z: 5 }, look: { x: -1, y: 2, z: -3 }, fovYDeg: 60 }
    );
    expect(length(ray.direction)).toBeCloseTo(1, 6);
  });
});

describe('worldToScreen', () => {
  const eye = { x: 0, y: 0, z: 10 };
  const look = { x: 0, y: 0, z: 0 };
  const canvas = { width: 800, height: 600 };
  const fovYDeg = 45;

  it('round-trips with screenPointToRay for arbitrary screen points', () => {
    const points = [
      { x: 400, y: 300 },
      { x: 0, y: 0 },
      { x: 800, y: 600 },
      { x: 123, y: 45 },
      { x: 640, y: 480 },
    ];
    for (const point of points) {
      const ray = screenPointToRay(point, canvas, { eye, look, fovYDeg });
      const worldPoint = add(ray.origin, scale(normalize(ray.direction), 5));
      const projected = worldToScreen(worldPoint, canvas, { eye, look, fovYDeg });
      expect(projected).not.toBeNull();
      expect(projected!.x).toBeCloseTo(point.x, 3);
      expect(projected!.y).toBeCloseTo(point.y, 3);
    }
  });

  it('returns null for points behind the camera', () => {
    const behind = worldToScreen({ x: 0, y: 0, z: 20 }, canvas, { eye, look, fovYDeg });
    expect(behind).toBeNull();
  });

  it('maps the look target to the centre of the canvas', () => {
    const projected = worldToScreen(look, canvas, { eye, look, fovYDeg });
    expect(projected).not.toBeNull();
    expect(projected!.x).toBeCloseTo(canvas.width / 2, 6);
    expect(projected!.y).toBeCloseTo(canvas.height / 2, 6);
  });
});
