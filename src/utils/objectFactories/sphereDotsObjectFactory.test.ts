import { describe, expect, it } from 'vitest';
import { buildAviUtlSphereDotsObject } from './sphereDotsObjectFactory';

describe('sphereDotsObjectFactory', () => {
  it('builds a 93 Sphere(DrawPixel) generated object for timeline insertion', () => {
    const object = buildAviUtlSphereDotsObject({
      id: 'sphere-dots-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 8,
      layer: 37,
    });

    expect(object).toMatchObject({
      id: 'sphere-dots-1',
      type: 'sphere_dots',
      name: '93 Sphere(DrawPixel)',
      layer: 37,
      startTime: 8,
      duration: 5,
      x: 720,
      y: 300,
      width: 480,
      height: 480,
      radius: 170,
      columns: 16,
      rows: 12,
      rotationDegrees: 10,
      offsetDegrees: 0,
      luminanceInfluence: 0,
      pointSize: 6,
      latitudeLineWidth: 2,
      colour: '#ffffff',
      secondaryColour: '#36c2ff',
      seed: 93,
      planeMode: false,
    });
  });
});
