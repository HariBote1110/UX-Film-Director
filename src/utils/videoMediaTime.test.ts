import { describe, expect, it } from 'vitest';
import type { VideoObject } from '../types';
import { mediaTimeInClipForPlayhead } from './videoMediaTime';

const baseVideo = (): Pick<VideoObject, 'startTime' | 'duration' | 'offset' | 'id'> => ({
  id: 'v1',
  startTime: 5,
  duration: 10,
  offset: 1.5
});

describe('mediaTimeInClipForPlayhead', () => {
  it('returns null before clip', () => {
    const v = baseVideo();
    expect(mediaTimeInClipForPlayhead(v, 4.9)).toBeNull();
  });

  it('returns null after clip', () => {
    const v = baseVideo();
    expect(mediaTimeInClipForPlayhead(v, 15.1)).toBeNull();
  });

  it('maps start of clip to offset', () => {
    const v = baseVideo();
    expect(mediaTimeInClipForPlayhead(v, 5)).toBe(1.5);
  });

  it('maps middle of clip', () => {
    const v = baseVideo();
    expect(mediaTimeInClipForPlayhead(v, 10)).toBeCloseTo(1.5 + 5, 5);
  });

  it('treats missing offset as zero', () => {
    const v: Pick<VideoObject, 'startTime' | 'duration' | 'offset'> = {
      startTime: 0,
      duration: 5
    };
    expect(mediaTimeInClipForPlayhead(v, 2)).toBe(2);
  });
});
