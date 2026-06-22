import { describe, expect, it } from 'vitest';
import { buildAviUtlRandomLineExObject } from './randomLineExObjectFactory';

describe('randomLineExObjectFactory', () => {
  it('builds an AviUtlPackV4 random line EX object for timeline insertion', () => {
    const object = buildAviUtlRandomLineExObject({
      id: 'random-line-ex-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 24,
    });

    expect(object).toMatchObject({
      id: 'random-line-ex-1',
      type: 'random_line_ex',
      name: 'ランダムラインEX',
      layer: 24,
      startTime: 3,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      lineCount: 3,
      lineWidth: 6,
      threshold: 128,
      noiseCellSize: 12,
      widthVariance: 0,
      seed: 0,
      lineColour: '#ffffff',
    });
  });
});
