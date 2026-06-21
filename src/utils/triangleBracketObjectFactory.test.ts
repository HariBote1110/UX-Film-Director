import { describe, expect, it } from 'vitest';
import { buildAviUtlTriangleBracketObject } from './triangleBracketObjectFactory';

describe('triangleBracketObjectFactory', () => {
  it('builds an AviUtlPackV4 triangle bracket object for timeline insertion', () => {
    const object = buildAviUtlTriangleBracketObject({
      id: 'triangle-bracket-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 2.5,
      layer: 17,
    });

    expect(object).toMatchObject({
      id: 'triangle-bracket-1',
      type: 'triangle_bracket',
      name: '三角括弧',
      layer: 17,
      startTime: 2.5,
      duration: 5,
      x: 880,
      y: 490,
      width: 160,
      height: 100,
      bracketWidth: 100,
      angleDegrees: 120,
      armLength: 50,
      offsetDistance: 0,
      bracketColour: '#ffffff',
    });
  });
});
