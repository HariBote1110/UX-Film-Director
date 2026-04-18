import { describe, expect, it } from 'vitest';
import {
  getElectronFilePath,
  mergeResolvedVideoMetadata,
  toFileProtocolUrl,
} from './mediaMetadata';

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
  it('prefers HTMLVideoElement dimensions when probe and element disagree (rotation / display size)', () => {
    const merged = mergeResolvedVideoMetadata(
      {
        filePath: '/tmp/phone.mp4',
        duration: 12,
        width: 1920,
        height: 1080,
        hasAudio: true,
        hasVideo: true,
        ffprobePath: 'ffprobe',
      },
      { duration: 12, width: 1080, height: 1920 }
    );
    expect(merged.width).toBe(1080);
    expect(merged.height).toBe(1920);
    expect(merged.duration).toBe(12);
  });

  it('uses probed duration when element duration is missing or invalid', () => {
    const merged = mergeResolvedVideoMetadata(
      {
        filePath: '/tmp/x.mp4',
        duration: 42,
        width: 1280,
        height: 720,
        hasAudio: false,
        hasVideo: true,
        ffprobePath: 'ffprobe',
      },
      { duration: Number.NaN, width: 1280, height: 720 }
    );
    expect(merged.duration).toBe(42);
  });

  it('falls back to probe dimensions when element metadata is unavailable', () => {
    const merged = mergeResolvedVideoMetadata(
      {
        filePath: '/tmp/x.mp4',
        duration: 5,
        width: 640,
        height: 360,
        hasAudio: true,
        hasVideo: true,
        ffprobePath: 'ffprobe',
      },
      null
    );
    expect(merged).toEqual({ duration: 5, width: 640, height: 360 });
  });

  it('throws when neither element nor a valid video probe is available', () => {
    expect(() =>
      mergeResolvedVideoMetadata(
        { filePath: '', duration: 0, width: null, height: null, hasAudio: false, hasVideo: false, ffprobePath: '' },
        null
      )
    ).toThrow(/Failed to load video metadata/);
  });
});
