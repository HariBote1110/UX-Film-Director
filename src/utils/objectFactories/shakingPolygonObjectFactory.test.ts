import { describe, expect, it } from 'vitest';
import { buildAviUtlShakingPolygonObject } from './shakingPolygonObjectFactory';

describe('shakingPolygonObjectFactory', () => {
  it('builds an AviUtlPackV4 shaking polygon object for timeline insertion', () => {
    const object = buildAviUtlShakingPolygonObject({
      id: 'shaking-polygon-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 24,
    });

    expect(object).toMatchObject({
      id: 'shaking-polygon-1',
      type: 'shaking_polygon',
      name: '多角形_震える',
      layer: 24,
      startTime: 3,
      duration: 5,
      x: 780,
      y: 360,
      width: 360,
      height: 360,
      lineWidth: 20,
      vertexCount: 3,
      fixedDiameter: 260,
      verticalDistortionPercent: 0,
      repeatCount: 1,
      repeatFrequency: 1,
      fill: false,
      jitterRange: 20,
      jitterInterval: 10,
      stepped: false,
      colour: '#ffffff',
      seed: 0,
    });
  });
});
