import { describe, expect, it } from 'vitest';
import { buildAviUtlColourWheelObject } from './colourWheelObjectFactory';

describe('colourWheelObjectFactory', () => {
  it('builds an AviUtlPackV4 colour wheel object for timeline insertion', () => {
    const object = buildAviUtlColourWheelObject({
      id: 'colour-wheel-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 0.75,
      layer: 12,
    });

    expect(object).toMatchObject({
      id: 'colour-wheel-1',
      type: 'colour_wheel',
      name: '色相環',
      layer: 12,
      startTime: 0.75,
      duration: 5,
      x: 840,
      y: 420,
      width: 240,
      height: 240,
      radius: 120,
      saturation: 100,
      brightness: 100,
      ringWidthPercent: 25,
      segmentCount: 24,
    });
  });
});
