import { describe, expect, it } from 'vitest';
import { buildAviUtlGearObject } from './gearObjectFactory';

describe('gearObjectFactory', () => {
  it('builds an AviUtlPackV4 gear object for timeline insertion', () => {
    const object = buildAviUtlGearObject({
      id: 'gear-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 0.75,
      layer: 12,
    });

    expect(object).toMatchObject({
      id: 'gear-1',
      type: 'gear',
      name: '歯車',
      layer: 12,
      startTime: 0.75,
      duration: 5,
      x: 800,
      y: 380,
      width: 320,
      height: 320,
      outerRadius: 160,
      innerRadiusPercent: 45,
      toothCount: 20,
      toothDepthPercent: 18,
      toothSkewPercent: 0,
      fillColour: '#ffffff',
    });
  });
});
