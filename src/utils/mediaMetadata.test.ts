import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getElectronFilePath,
  mergeResolvedVideoMetadata,
  toFileProtocolUrl,
} from './mediaMetadata';

const source = () => readFileSync(new URL('./mediaMetadata.ts', import.meta.url), 'utf8');

describe('getElectronFilePath', () => {
  it('returns null when File has no path property', () => {
    const file = new File([], 'clip.mp4');
    expect(getElectronFilePath(file)).toBeNull();
  });

  it('returns trimmed path when present on File', () => {
    const file = new File([], 'clip.mp4') as File & { path: string };
    file.path = '  /tmp/clip.mp4  ';
    expect(getElectronFilePath(file)).toBe('/tmp/clip.mp4');
  });

  it('returns null for empty path string', () => {
    const file = new File([], 'x') as File & { path: string };
    file.path = '   ';
    expect(getElectronFilePath(file)).toBeNull();
  });
});

describe('toFileProtocolUrl', () => {
  it('returns empty string for blank input', () => {
    expect(toFileProtocolUrl('')).toBe('');
    expect(toFileProtocolUrl('   ')).toBe('');
  });

  it('normalises Windows drive paths to file:/// URI', () => {
    const url = toFileProtocolUrl('C:\\Users\\test\\file.png');
    expect(url.startsWith('file:///C:/Users/test/file.png')).toBe(true);
  });

  it('prefixes absolute POSIX paths with file://', () => {
    const url = toFileProtocolUrl('/home/user/video.mov');
    expect(url).toMatch(/^file:\/\/\/home\/user\/video\.mov$/);
  });

  it('encodes spaces in relative paths', () => {
    const url = toFileProtocolUrl('my folder/file.wav');
    expect(url).toContain('%20');
  });
});

describe('mergeResolvedVideoMetadata', () => {
  it('uses Rust-probed video metadata without browser element dimensions', () => {
    const merged = mergeResolvedVideoMetadata({
      filePath: '/tmp/x.mp4',
      duration: 5,
      width: 640,
      height: 360,
      hasAudio: true,
      hasVideo: true,
      ffprobePath: 'ffprobe',
    });
    expect(merged).toEqual({ duration: 5, width: 640, height: 360 });
  });

  it('falls back to default dimensions when Rust probe lacks dimensions', () => {
    expect(mergeResolvedVideoMetadata({
      filePath: '/tmp/x.mp4',
      duration: 5,
      width: null,
      height: null,
      hasAudio: true,
      hasVideo: true,
      ffprobePath: 'ffprobe',
    })).toEqual({ duration: 5, width: 1280, height: 720 });
  });

  it('throws when a valid video probe is unavailable', () => {
    expect(() =>
      mergeResolvedVideoMetadata(
        { filePath: '', duration: 0, width: null, height: null, hasAudio: false, hasVideo: false, ffprobePath: '' }
      )
    ).toThrow(/Failed to load video metadata/);
  });
});

describe('resolveVideoMetadata browser video boundary', () => {
  it('does not create HTMLVideoElement metadata fallbacks in production metadata loading', () => {
    const code = source();

    expect(code).not.toContain("document.createElement('video')");
    expect(code).not.toContain('loadVideoElementMetadata');
  });
});
