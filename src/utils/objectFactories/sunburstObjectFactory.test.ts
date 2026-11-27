import { describe, expect, it } from 'vitest';
import { buildAviUtlSunburstObject } from './sunburstObjectFactory';

describe('sunburstObjectFactory', () => {
  it('builds an AviUtlPackV4 sunrise object for timeline insertion', () => {
    const object = buildAviUtlSunburstObject({
      id: 'sunburst-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 2,
      layer: 15,
    });

    expect(object).toMatchObject({
      id: 'sunburst-1',
      type: 'sunburst',
      name: '日の出',
      layer: 15,
      startTime: 2,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      rayCount: 10,
      rayCoveragePercent: 50,
      rotationOffsetDegrees: 0,
      centreXPercent: 50,
      centreYPercent: 50,
      motifSize: 200,
      motifShape: 'circle',
      rayColour: '#ff0000',
      backgroundColour: '#ffff00',
    });
  });
});
