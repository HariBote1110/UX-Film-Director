import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getElectronFilePath,
  mergeResolvedVideoMetadata,
  resolveVideoImportSource,
  toFileProtocolUrl,
} from './mediaMetadata';

const source = () => readFileSync(new URL('./mediaMetadata.ts', import.meta.url), 'utf8');

describe('getElectronFilePath', () => {
  it('uses the Electron webUtils preload bridge before the legacy File.path property', () => {
    const previousWindow = globalThis.window;
    const file = new File([], 'clip.mp4') as File & { path: string };
    file.path = '/legacy/clip.mp4';
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        electronFile: {
          getPathForFile: () => '  /electron-web-utils/clip.mp4  ',
        },
      },
    });

    expect(getElectronFilePath(file)).toBe('/electron-web-utils/clip.mp4');

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    });
  });

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
  it('delegates browser video metadata fallback to the isolated external source provider', () => {
    const code = source();

    expect(code).not.toContain("document.createElement('video')");
    expect(code).not.toContain('loadVideoElementMetadata');
    expect(code).toContain('loadExternalVideoSourceMetadata');
  });

  it('materialises the selected file for Rust probing when Electron does not expose a file path', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'GX020052.MP4', { type: 'video/mp4' });
    const calls: Array<{ channel: string; payload: Record<string, unknown> }> = [];
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        electronFile: {
          getPathForFile: () => '',
        },
        ipcRenderer: {
          invoke: async (channel: string, payload: Record<string, unknown>) => {
            calls.push({ channel, payload });
            if (channel === 'probe-media') {
              const filePath = payload.filePath as string;
              if (filePath === '/tmp/uxfd-import/GX020052.MP4') {
                return {
                  success: true,
                  result: {
                    filePath,
                    duration: 30.25,
                    width: 3840,
                    height: 2160,
                    hasAudio: true,
                    hasVideo: true,
                    ffprobePath: 'ffprobe',
                  },
                };
              }
              return { success: false, error: 'direct path unavailable' };
            }
            if (channel === 'materialise-media-file') {
              expect(payload.fileName).toBe('GX020052.MP4');
              expect(payload.data).toBeInstanceOf(ArrayBuffer);
              return { success: true, filePath: '/tmp/uxfd-import/GX020052.MP4' };
            }
            throw new Error(`unexpected channel: ${channel}`);
          },
        },
      },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: () => {
          throw new Error('browser metadata fallback should not be used');
        },
      },
    });

    await expect(resolveVideoImportSource(file, 'blob:video')).resolves.toEqual({
      filePath: '/tmp/uxfd-import/GX020052.MP4',
      metadata: {
        duration: 30.25,
        width: 3840,
        height: 2160,
      },
    });
    expect(calls.map((call) => call.channel)).toEqual([
      'materialise-media-file',
      'probe-media',
    ]);

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: previousDocument,
    });
  });
});
