import { describe, expect, it } from 'vitest';
import { buildAviUtlSphericalFieldObject } from './sphericalFieldObjectFactory';

describe('sphericalFieldObjectFactory', () => {
  it('builds a 93 SphericalField generated object for timeline insertion', () => {
    const object = buildAviUtlSphericalFieldObject({
      id: 'spherical-field-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 9,
      layer: 38,
    });

    expect(object).toMatchObject({
      id: 'spherical-field-1',
      type: 'spherical_field',
      name: '93 SphericalField',
      layer: 38,
      startTime: 9,
      duration: 5,
      x: 720,
      y: 300,
      width: 480,
      height: 480,
      radius: 160,
      strength: 100,
      colourAmount: 100,
      alphaAmount: 0,
      lineWidth: 3,
      ringCount: 4,
      vectorCount: 16,
      fieldColour: '#ff3b30',
      secondaryColour: '#36c2ff',
      backgroundOpacity: 0.08,
      container: false,
      seed: 93,
    });
  });
});
