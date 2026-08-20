import { describe, expect, it } from 'vitest';
import { add, cross, dot, length, normalize, scale, sub } from './vec3';

describe('vec3', () => {
  it('adds component-wise', () => {
    expect(add({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })).toEqual({ x: 5, y: 7, z: 9 });
  });

  it('subtracts component-wise', () => {
    expect(sub({ x: 4, y: 5, z: 6 }, { x: 1, y: 2, z: 3 })).toEqual({ x: 3, y: 3, z: 3 });
  });

  it('scales by a scalar', () => {
    expect(scale({ x: 1, y: -2, z: 3 }, 2)).toEqual({ x: 2, y: -4, z: 6 });
  });

  it('computes the dot product', () => {
    expect(dot({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })).toBe(32);
  });

  it('computes the cross product', () => {
    expect(cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('computes the length', () => {
    expect(length({ x: 3, y: 4, z: 0 })).toBeCloseTo(5, 10);
  });

  it('normalizes to a unit vector', () => {
    const n = normalize({ x: 3, y: 4, z: 0 });
    expect(length(n)).toBeCloseTo(1, 10);
    expect(n.x).toBeCloseTo(0.6, 10);
    expect(n.y).toBeCloseTo(0.8, 10);
    expect(n.z).toBeCloseTo(0, 10);
  });

  it('normalizing a zero-length vector safely returns zero instead of NaN', () => {
    const n = normalize({ x: 0, y: 0, z: 0 });
    expect(n).toEqual({ x: 0, y: 0, z: 0 });
    expect(Number.isNaN(n.x)).toBe(false);
  });
});
