import { describe, expect, it } from 'vitest';
import { buildAviUtlRegionFrameObject } from './regionFrameObjectFactory';

describe('regionFrameObjectFactory', () => {
  it('builds a 93 region frame generated object for timeline insertion', () => {
    const object = buildAviUtlRegionFrameObject({
      id: 'region-frame-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 32,
    });

    expect(object).toMatchObject({
      id: 'region-frame-1',
      type: 'region_frame',
      name: '93 領域枠',
      layer: 32,
      startTime: 3,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      lineWidth: 10,
      extraWidth: 0,
      extraHeight: 0,
      backgroundOpacity: 0.2,
      frameColour: '#ffffff',
      backgroundColour: '#ccccff',
    });
  });
});
