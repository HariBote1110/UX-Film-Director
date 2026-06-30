import { describe, expect, it } from 'vitest';
import {
  SHARED_RENDERER_PLAYBACK_DECODE_MAX_EDGE,
  SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT,
  SHARED_RENDERER_PLAYBACK_PREVIEW_FPS,
  quantiseSharedRendererPlaybackPreviewTime,
} from './sharedRendererPlaybackPreviewSettings';

describe('sharedRendererPlaybackPreviewSettings', () => {
  it('keeps Rust video playback preview cadence high enough for visual continuity', () => {
    expect(SHARED_RENDERER_PLAYBACK_PREVIEW_FPS).toBe(60);
    expect(SHARED_RENDERER_PLAYBACK_DECODE_MAX_EDGE).toBeGreaterThanOrEqual(320);
    expect(SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT).toBeGreaterThanOrEqual(4);
  });

  it('quantises playback time to the configured Rust preview cadence', () => {
    const first = quantiseSharedRendererPlaybackPreviewTime(1.016);
    const second = quantiseSharedRendererPlaybackPreviewTime(1.017);

    expect(first).toBe(1);
    expect(second).toBeCloseTo(1 + (1 / SHARED_RENDERER_PLAYBACK_PREVIEW_FPS), 6);
  });
});
