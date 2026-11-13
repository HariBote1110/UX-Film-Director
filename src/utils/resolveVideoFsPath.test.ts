import { describe, expect, it } from 'vitest';
import type { VideoObject } from '../types';
import { resolveVideoFsPath } from './resolveVideoFsPath';

const video = (overrides: Partial<VideoObject> = {}): VideoObject => ({
  id: 'video-1',
  type: 'video',
  name: 'video.mp4',
  layer: 0,
  startTime: 0,
  duration: 10,
  offset: 0,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  src: 'blob:video',
  width: 320,
  height: 180,
  volume: 1,
  muted: false,
  ...overrides,
});

describe('resolveVideoFsPath', () => {
  it('prefers a trimmed filePath', () => {
    expect(resolveVideoFsPath(video({ filePath: '  /tmp/clip.mp4  ' }))).toBe('/tmp/clip.mp4');
  });

  it('ignores a blank filePath and falls through', () => {
    expect(resolveVideoFsPath(video({ filePath: '   ', src: 'file:///tmp/a.mp4' })))
      .toBe('/tmp/a.mp4');
  });

  it('decodes a file: URL pathname when filePath is absent', () => {
    expect(resolveVideoFsPath(video({ filePath: null, src: 'file:///tmp/a%20b.mp4' })))
      .toBe('/tmp/a b.mp4');
  });

  it('returns null for non-file sources', () => {
    expect(resolveVideoFsPath(video({ filePath: null, src: 'blob:video' }))).toBeNull();
    expect(resolveVideoFsPath(video({ filePath: null, src: 'https://example.com/a.mp4' }))).toBeNull();
    expect(resolveVideoFsPath(video({ filePath: null, src: '/tmp/relative.mp4' }))).toBeNull();
  });

  it('returns null when there is neither a filePath nor a string src', () => {
    expect(resolveVideoFsPath(video({ filePath: null, src: undefined }))).toBeNull();
  });
});
