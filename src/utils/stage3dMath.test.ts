import { describe, expect, it } from 'vitest';
import { billboardYawRadians } from './stage3dMath';

describe('billboardYawRadians', () => {
  it('faces the camera on the XZ plane when rotationYDeg is zero', () => {
    const yaw = billboardYawRadians(5, 0, 0, 0, 0);
    expect(yaw).toBeCloseTo(Math.PI / 2, 5);
  });

  it('adds rotationYDeg in degrees', () => {
    const yaw = billboardYawRadians(0, 5, 0, 0, 90);
    expect(yaw).toBeCloseTo(Math.PI / 2, 5);
  });
});
