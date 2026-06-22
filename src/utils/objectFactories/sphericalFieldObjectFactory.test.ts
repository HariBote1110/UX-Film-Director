import { describe, expect, it } from 'vitest';
import { buildAviUtlSPFieldObject, buildAviUtlSphericalFieldObject } from './sphericalFieldObjectFactory';

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

  it('builds a 93 SPfield generated object as a stronger force-field preset', () => {
    const object = buildAviUtlSPFieldObject({
      id: 'spfield-1',
      projectWidth: 1280,
      projectHeight: 720,
      startTime: 12,
      layer: 41,
    });

    expect(object).toMatchObject({
      id: 'spfield-1',
      type: 'spherical_field',
      name: '93 SPfield',
      layer: 41,
      startTime: 12,
      duration: 5,
      x: 480,
      y: 200,
      width: 320,
      height: 320,
      radius: 220,
      strength: 140,
      colourAmount: 70,
      alphaAmount: 0,
      lineWidth: 4,
      ringCount: 5,
      vectorCount: 24,
      fieldColour: '#8b5cf6',
      secondaryColour: '#22d3ee',
      backgroundOpacity: 0.12,
      container: false,
      seed: 930,
    });
  });
});
