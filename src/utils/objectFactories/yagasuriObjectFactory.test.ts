import { describe, expect, it } from 'vitest';
import { buildAviUtlYagasuriObject } from './yagasuriObjectFactory';

describe('yagasuriObjectFactory', () => {
  it('builds an AviUtlPackV4 yagasuri object for timeline insertion', () => {
    const object = buildAviUtlYagasuriObject({
      id: 'yagasuri-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 20,
    });

    expect(object).toMatchObject({
      id: 'yagasuri-1',
      type: 'yagasuri',
      name: '矢がすり',
      layer: 20,
      startTime: 3,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      arrowWidth: 15,
      arrowHeight: 65,
      lineWidth: 2,
      staggered: true,
      foregroundColour: '#000000',
      backgroundColour: '#ffffff',
    });
  });
});
