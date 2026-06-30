import { describe, expect, it } from 'vitest';
import {
  resolveSharedRendererNativeReuseReplayTime,
} from './sharedRendererNativeReuseCadence';

describe('sharedRendererNativeReuseCadence', () => {
  it('advances a pending native reuse replay by at most one preview frame after a slow decode', () => {
    const replayTime = resolveSharedRendererNativeReuseReplayTime({
      requestedTime: 1,
      pendingTime: 3.25,
      previewFps: 60,
    });

    expect(replayTime).toBeCloseTo(1 + (1 / 60), 6);
  });

  it('keeps a pending native reuse replay time when it is already near the decoded frame', () => {
    const replayTime = resolveSharedRendererNativeReuseReplayTime({
      requestedTime: 1,
      pendingTime: 1.016,
      previewFps: 60,
    });

    expect(replayTime).toBe(1.016);
  });
});
