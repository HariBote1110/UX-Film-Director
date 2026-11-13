import { describe, expect, it } from 'vitest';
import { buildSharedRendererImageOwnership } from './sharedRendererImageOwnership';

describe('buildSharedRendererImageOwnership', () => {
  it('keeps pixi with noImageScene when there is no image scene', () => {
    expect(buildSharedRendererImageOwnership({
      hasImageScene: false,
      nativeRenderFrameReady: true,
      imageObjectIds: ['image-1'],
    })).toEqual({ owner: 'pixi', reason: 'noImageScene', imageObjectIds: [] });
  });

  it('keeps pixi with nativeRenderFrameUnavailable when the frame is not ready', () => {
    expect(buildSharedRendererImageOwnership({
      hasImageScene: true,
      nativeRenderFrameReady: false,
      imageObjectIds: ['image-1'],
    })).toEqual({ owner: 'pixi', reason: 'nativeRenderFrameUnavailable', imageObjectIds: [] });
  });

  it('hands images to the shared renderer once the native frame is ready', () => {
    expect(buildSharedRendererImageOwnership({
      hasImageScene: true,
      nativeRenderFrameReady: true,
      imageObjectIds: ['image-1', 'image-2'],
    })).toEqual({
      owner: 'sharedRenderer',
      reason: 'nativeRenderFrameReady',
      imageObjectIds: ['image-1', 'image-2'],
    });
  });
});
