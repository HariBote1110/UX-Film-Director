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

  it('uses the backing scale factor as the canonical HiDPI scale input', () => {
    expect(buildNativeOverlayAttachRect({
      viewportRect: {
        left: 24,
        top: 32,
        width: 480,
        height: 270,
      },
      contentHeight: 720,
      backingScaleFactor: 2.5,
    })).toEqual({
      x: 24,
      y: 418,
      width: 480,
      height: 270,
      scaleFactor: 2.5,
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

  it('adds visual viewport offsets before converting to the native lower-left origin', () => {
    expect(buildNativeOverlayAttachRect({
      viewportRect: {
        left: 10.25,
        top: 20.5,
        width: 640.5,
        height: 360.25,
      },
      contentHeight: 800.75,
      devicePixelRatio: 1.5,
      viewportOffsetLeft: 3.5,
      viewportOffsetTop: 7.25,
    })).toEqual({
      x: 13.75,
      y: 412.75,
      width: 640.5,
      height: 360.25,
      scaleFactor: 1.5,
    });
  });
});
