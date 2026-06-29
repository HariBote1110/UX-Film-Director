import { describe, expect, it } from 'vitest';
import { buildNativeOverlayAttachRect } from './nativeOverlayViewportGeometry';

describe('nativeOverlayViewportGeometry', () => {
  it('builds a viewport-relative attach rectangle with scale factor', () => {
    expect(buildNativeOverlayAttachRect({
      viewportRect: {
        left: 100,
        top: 50,
        width: 800,
        height: 200,
      },
      contentHeight: 600,
      devicePixelRatio: 2,
    })).toEqual({
      x: 100,
      y: 350,
      width: 800,
      height: 200,
      scaleFactor: 2,
    });
  });

  it('clamps invalid dimensions and scale factor before IPC', () => {
    expect(buildNativeOverlayAttachRect({
      viewportRect: {
        left: 0,
        top: 0,
        width: 0,
        height: Number.NaN,
      },
      contentHeight: 0,
      devicePixelRatio: 0,
    })).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      scaleFactor: 1,
    });
  });
});
