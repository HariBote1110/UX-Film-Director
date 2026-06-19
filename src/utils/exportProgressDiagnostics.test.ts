import { describe, expect, it } from 'vitest';
import { updateExportProgressPhase } from './exportProgressDiagnostics';

describe('updateExportProgressPhase', () => {
  it('creates a progress payload when no previous export progress exists', () => {
    expect(updateExportProgressPhase(null, {
      phase: 'rendering',
      currentFrame: 4,
      totalFrames: 120,
    })).toEqual({
      phase: 'rendering',
      currentFrame: 4,
      totalFrames: 120,
    });
  });

  it('preserves Rust diagnostics while updating the phase counters', () => {
    expect(updateExportProgressPhase({
      phase: 'rendering',
      currentFrame: 3,
      totalFrames: 120,
      rustFrameSourceBlocked: {
        reason: 'videoOwnershipUnavailable',
        frameIndex: 3,
        legacyCanvasFallbackAllowed: true,
        detail: 'Shared renderer export is missing uploaded video clips: video-2.',
      },
      nativeRenderOutputRelease: {
        status: 'failed',
        memoryId: '/uxfd-native-render-output',
        reason: 'encodeWriteFailed',
        error: 'release rejected',
      },
    }, {
      phase: 'saving',
      currentFrame: 120,
      totalFrames: 120,
    })).toEqual({
      phase: 'saving',
      currentFrame: 120,
      totalFrames: 120,
      rustFrameSourceBlocked: {
        reason: 'videoOwnershipUnavailable',
        frameIndex: 3,
        legacyCanvasFallbackAllowed: false,
        detail: 'Shared renderer export is missing uploaded video clips: video-2.',
      },
      nativeRenderOutputRelease: {
        status: 'failed',
        memoryId: '/uxfd-native-render-output',
        reason: 'encodeWriteFailed',
        error: 'release rejected',
      },
    });
  });
});
