import { describe, expect, it } from 'vitest';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';

describe('shared renderer presentation contract', () => {
  it('pins WebGPU canvas presentation to sRGB premultiplied output and keeps comparisons offscreen', () => {
    expect(buildSharedRendererPresentationContract()).toEqual({
      canvas: {
        colorSpace: 'srgb',
        alphaMode: 'premultiplied',
      },
      comparisonReadback: {
        target: 'offscreenRenderTarget',
        includesPageCompositing: false,
      },
      frameTiming: {
        source: 'frozenSceneSnapshot',
      },
      deviceLost: {
        fallback: 'none',
        staleSharedFrameAllowed: false,
      },
    });
  });

  it('Pixi 併走比較（frame lock / frame partition）のAPIは撤去済みである', async () => {
    const module = await import('./sharedRendererPresentationContract');
    expect('validateSharedRendererFrameLock' in module).toBe(false);
    expect('partitionSharedRendererPreviewFrames' in module).toBe(false);
  });
});
