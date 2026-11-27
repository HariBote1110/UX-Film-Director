import { describe, expect, it } from 'vitest';
import { isTimelineDropVideoFile } from './useTimelineDrop';

describe('isTimelineDropVideoFile', () => {
  it('accepts dropped GoPro-style video files even when Electron leaves the MIME type empty', () => {
    const file = new File([], 'GX010052.MP4', { type: '' });

    expect(isTimelineDropVideoFile(file)).toBe(true);
  });

  it('keeps normal browser video MIME detection', () => {
    const file = new File([], 'clip.bin', { type: 'video/mp4' });

    expect(isTimelineDropVideoFile(file)).toBe(true);
  });

  it('does not treat images as videos', () => {
    const file = new File([], 'still.png', { type: 'image/png' });

    expect(isTimelineDropVideoFile(file)).toBe(false);
  });
});
