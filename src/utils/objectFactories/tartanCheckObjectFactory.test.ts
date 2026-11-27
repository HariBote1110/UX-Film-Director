import { describe, expect, it } from 'vitest';
import { buildAviUtlTartanCheckObject } from './tartanCheckObjectFactory';

describe('tartanCheckObjectFactory', () => {
  it('builds an AviUtlPackV4 tartan check object for timeline insertion', () => {
    const object = buildAviUtlTartanCheckObject({
      id: 'tartan-check-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 18,
    });

    expect(object).toMatchObject({
      id: 'tartan-check-1',
      type: 'tartan_check',
      name: 'タータンチェック',
      layer: 18,
      startTime: 3,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      tileSize: 100,
      blurRadius: 1,
      baseColour: '#143e10',
      stripeColourA: '#a81616',
      stripeColourB: '#c9c526',
      lineColour: '#000000',
    });
  });
});
