import { describe, expect, it } from 'vitest';
import { getElectronFilePath, toFileProtocolUrl } from './mediaMetadata';

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
