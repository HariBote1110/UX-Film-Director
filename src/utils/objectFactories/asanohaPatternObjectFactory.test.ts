import { describe, expect, it } from 'vitest';
import { buildAviUtlAsanohaPatternObject } from './asanohaPatternObjectFactory';

describe('asanohaPatternObjectFactory', () => {
  it('builds an AviUtlPackV4 asanoha pattern object for timeline insertion', () => {
    const object = buildAviUtlAsanohaPatternObject({
      id: 'asanoha-pattern-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 22,
    });

    expect(object).toMatchObject({
      id: 'asanoha-pattern-1',
      type: 'asanoha_pattern',
      name: '麻の葉模様',
      layer: 22,
      startTime: 3,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      patternSize: 50,
      lineWidth: 2,
      foregroundColour: '#000000',
      backgroundColour: '#ffffff',
    });
  });
});
