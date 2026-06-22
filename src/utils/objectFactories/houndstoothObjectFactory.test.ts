import { describe, expect, it } from 'vitest';
import { buildAviUtlHoundstoothObject } from './houndstoothObjectFactory';

describe('houndstoothObjectFactory', () => {
  it('builds an AviUtlPackV4 houndstooth object for timeline insertion', () => {
    const object = buildAviUtlHoundstoothObject({
      id: 'houndstooth-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 19,
    });

    expect(object).toMatchObject({
      id: 'houndstooth-1',
      type: 'houndstooth',
      name: '千鳥格子',
      layer: 19,
      startTime: 3,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      patternSize: 50,
      foregroundColour: '#000000',
      backgroundColour: '#ffffff',
    });
  });
});
