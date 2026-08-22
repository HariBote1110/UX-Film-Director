import { describe, expect, it } from 'vitest';
import { shouldRouteFrameToNativeOverlay } from './nativeOverlayNv12Gate';

describe('shouldRouteFrameToNativeOverlay', () => {
  it('is false whenever attach itself has not resolved, regardless of video/nv12 state', () => {
    expect(
      shouldRouteFrameToNativeOverlay({
        nativeOverlayReady: false,
        nv12Ready: true,
        sceneHasVideo: false,
      }),
    ).toBe(false);
    expect(
      shouldRouteFrameToNativeOverlay({
        nativeOverlayReady: false,
        nv12Ready: false,
        sceneHasVideo: true,
      }),
    ).toBe(false);
  });

  it('routes a no-video scene to overlay immediately once essential is ready, even if nv12 is not ready yet', () => {
    expect(
      shouldRouteFrameToNativeOverlay({
        nativeOverlayReady: true,
        nv12Ready: false,
        sceneHasVideo: false,
      }),
    ).toBe(true);
  });

  it('keeps a video-containing scene on the presenter while nv12 is not ready', () => {
    expect(
      shouldRouteFrameToNativeOverlay({
        nativeOverlayReady: true,
        nv12Ready: false,
        sceneHasVideo: true,
      }),
    ).toBe(false);
  });

  it('routes a video-containing scene to overlay once nv12 becomes ready', () => {
    expect(
      shouldRouteFrameToNativeOverlay({
        nativeOverlayReady: true,
        nv12Ready: true,
        sceneHasVideo: true,
      }),
    ).toBe(true);
  });

  it('behaves correctly when video is added mid-wait (scene composition changes while nv12 is still compiling)', () => {
    // Same attach/nv12 state throughout (essential ready, nv12 still
    // compiling) — only the scene's video content changes tick to tick,
    // exactly as it would when a user drags a video clip onto an
    // until-now shape-only timeline while nv12 is still warming up.
    const base = { nativeOverlayReady: true, nv12Ready: false };
    expect(shouldRouteFrameToNativeOverlay({ ...base, sceneHasVideo: false })).toBe(true);
    expect(shouldRouteFrameToNativeOverlay({ ...base, sceneHasVideo: true })).toBe(false);
    // Removing the video again immediately un-gates overlay routing.
    expect(shouldRouteFrameToNativeOverlay({ ...base, sceneHasVideo: false })).toBe(true);
  });

  it('flips a previously-gated video scene to overlay routing the instant nv12Ready flips true', () => {
    const withoutNv12 = shouldRouteFrameToNativeOverlay({
      nativeOverlayReady: true,
      nv12Ready: false,
      sceneHasVideo: true,
    });
    const withNv12 = shouldRouteFrameToNativeOverlay({
      nativeOverlayReady: true,
      nv12Ready: true,
      sceneHasVideo: true,
    });
    expect(withoutNv12).toBe(false);
    expect(withNv12).toBe(true);
  });
});
