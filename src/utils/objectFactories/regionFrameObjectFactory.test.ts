import { describe, expect, it } from 'vitest';
import {
  buildAviUtlCutCornerRegionFrameObject,
  buildAviUtlEllipseRegionFrameObject,
  buildAviUtlRegionFrameObject,
} from './regionFrameObjectFactory';

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
      shape: 'rectangle',
      extraWidth: 0,
      extraHeight: 0,
      backgroundOpacity: 0.2,
      frameColour: '#ffffff',
      backgroundColour: '#ccccff',
    });
  });

  it('builds a 93 ellipse region frame generated object', () => {
    const object = buildAviUtlEllipseRegionFrameObject({
      id: 'ellipse-region-frame-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 4,
      layer: 33,
    });

    expect(object).toMatchObject({
      id: 'ellipse-region-frame-1',
      type: 'region_frame',
      name: '93 領域枠(楕円)',
      layer: 33,
      startTime: 4,
      width: 800,
      height: 450,
      lineWidth: 10,
      shape: 'ellipse',
      backgroundOpacity: 0.2,
    });
  });

  it('builds a 93 cut-corner region frame generated object', () => {
    const object = buildAviUtlCutCornerRegionFrameObject({
      id: 'cut-region-frame-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 5,
      layer: 34,
    });

    expect(object).toMatchObject({
      id: 'cut-region-frame-1',
      type: 'region_frame',
      name: '93 領域枠(角落ち)',
      layer: 34,
      startTime: 5,
      width: 800,
      height: 450,
      lineWidth: 10,
      shape: 'cut_corner',
      cornerCut: 20,
      backgroundOpacity: 0.2,
    });
  });
});
