import { describe, expect, it } from 'vitest';
import { shouldRunRendererPlaybackClock } from './playbackClockOwnership';

describe('再生クロック所有権', () => {
  it('native playbackが有効な間だけChromiumのrAF時計を停止する', () => {
    expect(shouldRunRendererPlaybackClock({
      isPlaying: true,
      nativePlaybackActive: false,
    })).toBe(true);
    expect(shouldRunRendererPlaybackClock({
      isPlaying: true,
      nativePlaybackActive: true,
    })).toBe(false);
    expect(shouldRunRendererPlaybackClock({
      isPlaying: false,
      nativePlaybackActive: false,
    })).toBe(false);
  });
});
