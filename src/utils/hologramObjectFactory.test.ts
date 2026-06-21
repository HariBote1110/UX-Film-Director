import { describe, expect, it } from 'vitest';
import { buildAviUtlHologramObject } from './hologramObjectFactory';

describe('hologramObjectFactory', () => {
  it('builds an AviUtlPackV4 hologram object for timeline insertion', () => {
    const object = buildAviUtlHologramObject({
      id: 'hologram-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 24,
    });

    expect(object).toMatchObject({
      id: 'hologram-1',
      type: 'hologram',
      name: 'ホログラム',
      layer: 24,
      startTime: 3,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      tileSize: 80,
      rotationDegrees: 0,
      gradientAngleDegrees: -60,
      colourMode: 1,
      tintColour: '#ffffff',
    });
  });
});
