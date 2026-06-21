import { describe, expect, it } from 'vitest';
import { buildAviUtlGourdObject } from './gourdObjectFactory';

describe('gourdObjectFactory', () => {
  it('builds an AviUtlPackV4 gourd object for timeline insertion', () => {
    const object = buildAviUtlGourdObject({
      id: 'gourd-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 0.75,
      layer: 12,
    });

    expect(object).toMatchObject({
      id: 'gourd-1',
      type: 'gourd',
      name: 'ひょうたんTM',
      layer: 12,
      startTime: 0.75,
      duration: 5,
      x: 760,
      y: 340,
      width: 400,
      height: 400,
      bodyRadius: 80,
      bodyWidth: 250,
      waistRadius: 10,
      squashPercent: 40,
      repeatCount: 1,
      fillColour: '#ffffff',
    });
  });
});
