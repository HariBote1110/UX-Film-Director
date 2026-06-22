import { describe, expect, it } from 'vitest';
import { buildAviUtlToneCurveObject } from './toneCurveObjectFactory';

describe('toneCurveObjectFactory', () => {
  it('builds an AviUtlPackV4 simple tone curve object for timeline insertion', () => {
    const object = buildAviUtlToneCurveObject({
      id: 'tone-curve-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 2,
      layer: 27,
    });

    expect(object).toMatchObject({
      id: 'tone-curve-1',
      type: 'tone_curve',
      name: '簡易トーンカーブ',
      layer: 27,
      startTime: 2,
      duration: 5,
      x: 780,
      y: 360,
      width: 360,
      height: 360,
      gridDivisions: 4,
      lineWidth: 3,
      curvePoints: [0, 0.16, 0.42, 0.7, 1],
      curveColour: '#ffffff',
      gridColour: '#333333',
      backgroundColour: '#000000',
    });
  });
});
