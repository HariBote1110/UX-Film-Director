import { describe, expect, it } from 'vitest';
import { buildAxisArrowMesh, buildGridFloorMesh, buildTranslateGizmoMesh, translateGeometry } from './stageMeshes';

const assertValidGeometry = (geometry: { vertices: Float32Array; colours: Uint8Array; indices: Uint32Array }) => {
  const vertexCount = geometry.vertices.length / 3;
  expect(Number.isInteger(vertexCount)).toBe(true);
  expect(geometry.colours.length).toBe(vertexCount * 4);
  for (const index of geometry.indices) {
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(vertexCount);
  }
  expect(geometry.indices.length % 3).toBe(0);
  for (const v of geometry.vertices) {
    expect(Number.isFinite(v)).toBe(true);
  }
};

describe('buildGridFloorMesh', () => {
  it('produces a valid triangle-list geometry sized for (divisions+1)*2 lines', () => {
    const geometry = buildGridFloorMesh({ size: 40, divisions: 40 });
    assertValidGeometry(geometry);
    // 1本の線 = 8頂点(直方体) x 41*2本
    expect(geometry.vertices.length / 3).toBe(8 * 41 * 2);
  });

  it('defaults match the old THREE.GridHelper(40, 40) footprint', () => {
    const geometry = buildGridFloorMesh();
    const xs = Array.from(geometry.vertices.filter((_, i) => i % 3 === 0));
    expect(Math.max(...xs)).toBeLessThanOrEqual(20 + 0.02);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-20 - 0.02);
  });
});

describe('buildAxisArrowMesh', () => {
  it.each(['x', 'y', 'z'] as const)('produces a valid geometry pointing along +%s', (axis) => {
    const geometry = buildAxisArrowMesh(axis, { length: 1 });
    assertValidGeometry(geometry);

    const componentIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    let maxAlongAxis = -Infinity;
    for (let i = 0; i < geometry.vertices.length; i += 3) {
      maxAlongAxis = Math.max(maxAlongAxis, geometry.vertices[i + componentIndex]);
    }
    expect(maxAlongAxis).toBeCloseTo(1, 5);
  });

  it('colours the arrow tip with the axis convention (X=red, Y=green, Z=blue)', () => {
    const x = buildAxisArrowMesh('x');
    const y = buildAxisArrowMesh('y');
    const z = buildAxisArrowMesh('z');
    expect(x.colours[0]).toBeGreaterThan(x.colours[1]);
    expect(y.colours[1]).toBeGreaterThan(y.colours[0]);
    expect(z.colours[2]).toBeGreaterThan(z.colours[0]);
  });
});

describe('buildTranslateGizmoMesh', () => {
  it('merges all three axes into a single valid geometry', () => {
    const geometry = buildTranslateGizmoMesh();
    assertValidGeometry(geometry);
    const single = buildAxisArrowMesh('x');
    expect(geometry.vertices.length).toBe(single.vertices.length * 3);
  });
});

describe('translateGeometry', () => {
  it('offsets every vertex by the given world-space translation, leaving colours/indices untouched', () => {
    const geometry = buildAxisArrowMesh('x', { length: 1 });
    const offset = { x: 3, y: -2, z: 5 };
    const translated = translateGeometry(geometry, offset);
    for (let i = 0; i < geometry.vertices.length; i += 3) {
      expect(translated.vertices[i]).toBeCloseTo(geometry.vertices[i] + offset.x, 6);
      expect(translated.vertices[i + 1]).toBeCloseTo(geometry.vertices[i + 1] + offset.y, 6);
      expect(translated.vertices[i + 2]).toBeCloseTo(geometry.vertices[i + 2] + offset.z, 6);
    }
    expect(translated.colours).toBe(geometry.colours);
    expect(translated.indices).toBe(geometry.indices);
  });
});
