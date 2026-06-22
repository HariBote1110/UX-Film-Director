import { describe, expect, it } from 'vitest';
import { buildAviUtlDisplacementPolyObject } from './displacementPolyObjectFactory';

describe('displacementPolyObjectFactory', () => {
  it('builds a 93 DisplacementPoly object for timeline insertion', () => {
    const object = buildAviUtlDisplacementPolyObject({
      id: 'displacement-poly-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 25,
    });

    expect(object).toMatchObject({
      id: 'displacement-poly-1',
      type: 'displacement_poly',
      name: '93 DisplacementPoly',
      layer: 25,
      startTime: 3,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      columns: 14,
      rows: 8,
      displacementScale: 42,
      depthScale: 18,
      meshOpacity: 0.85,
      fillOpacity: 0.18,
      lineColour: '#36c2ff',
      fillColour: '#0b1020',
      seed: 93,
    });
  });
});
