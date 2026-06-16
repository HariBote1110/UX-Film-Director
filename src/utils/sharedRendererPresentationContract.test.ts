import { describe, expect, it } from 'vitest';
import {
  buildSharedRendererPresentationContract,
  partitionSharedRendererPreviewFrames,
  validateSharedRendererFrameLock,
} from './sharedRendererPresentationContract';
import type { SharedRendererPreviewSurfaceGate } from './sharedRendererPreviewSurface';

const okSurfaceGate: SharedRendererPreviewSurfaceGate = {
  ok: true,
  canvas: { width: 1920, height: 1080 },
  snapshot: {
    frame_index: 42,
    colour: {
      profile: 'rec709-sdr',
      working_space: 'linear-light',
      alpha: 'premultiplied',
    },
    clips: [],
  },
  media: [],
};

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
        fallback: 'pixi',
        staleSharedFrameAllowed: false,
      },
    });
  });

  it('rejects comparisons when Pixi and shared renderer are not locked to the same frame index', () => {
    expect(
      validateSharedRendererFrameLock({
        snapshotFrameIndex: 42,
        pixiFrameIndex: 42,
        candidateFrameIndex: 42,
      })
    ).toEqual({ ok: true });

    expect(
      validateSharedRendererFrameLock({
        snapshotFrameIndex: 42,
        pixiFrameIndex: 43,
        candidateFrameIndex: 42,
      })
    ).toEqual({
      ok: false,
      reason: 'frameIndexSkew',
      detail: 'Pixi, shared renderer, and SceneSnapshot must compare the same frozen frame index.',
    });
  });

  it('partitions unsupported frames out of parity metrics', () => {
    const partition = partitionSharedRendererPreviewFrames([
      {
        frameIndex: 42,
        surfaceGate: okSurfaceGate,
      },
      {
        frameIndex: 43,
        surfaceGate: {
          ok: false,
          reason: 'planNotComparable',
          detail: 'Shared renderer surface requires a parallelCompare plan.',
        },
      },
      {
        frameIndex: 44,
        surfaceGate: {
          ok: false,
          reason: 'fallbackAdapter',
          detail: 'Shared renderer preview requires a non-fallback WebGPU adapter.',
        },
      },
    ]);

    expect(partition).toEqual({
      comparableFrameIndices: [42],
      pixiOnlyFrames: [
        {
          frameIndex: 43,
          reason: 'planNotComparable',
          detail: 'Shared renderer surface requires a parallelCompare plan.',
        },
        {
          frameIndex: 44,
          reason: 'fallbackAdapter',
          detail: 'Shared renderer preview requires a non-fallback WebGPU adapter.',
        },
      ],
    });
  });
});
