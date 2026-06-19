import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = new URL('../..', import.meta.url).pathname;
const srcRoot = join(projectRoot, 'src');
const electronMainPath = join(projectRoot, 'electron/main.ts');

const forbiddenTokens = [
  "document.createElement('video')",
  'new PIXI.VideoSource',
  'HTMLVideoElement',
  'VideoFrameTextureState',
  'videoElementsRef',
  'videoFrameTexturesRef',
  'allowLegacyPixiVideo',
  'pixiVideoElement',
  'pauseLegacyBrowserVideosForExport',
  'requiresHtmlVideoElementSeekFallback',
  'requiresLegacyBrowserVideoProviders',
  'PlaybackFrameProvider',
  'requestVideoFrameCallback',
  'playbackFrameProvider',
  'frameProvider',
  'loadVideoElementMetadata',
  'useMediaOptimization',
  'check-intermediate',
  'generate-intermediate',
  'cancel-intermediate',
  'new VideoDecoder',
  'VideoDecoder.isConfigSupported',
  "from 'mp4box'",
  'decodeVideoStream',
];

const collectProductionSources = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const rel = relative(srcRoot, path);
    if (rel.startsWith('exportTest')) continue;
    if (rel.includes('__fixtures__')) continue;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...collectProductionSources(path));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(path)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(path)) continue;
    files.push(path);
  }
  return files;
};

describe('production video dependency boundary', () => {
  it('keeps browser/Pixi video fallbacks out of production implementation files', () => {
    const offenders = collectProductionSources(srcRoot).flatMap((path) => {
      const code = readFileSync(path, 'utf8');
      return forbiddenTokens
        .filter((token) => code.includes(token))
        .map((token) => `${relative(projectRoot, path)} -> ${token}`);
    });

    expect(offenders).toEqual([]);
  });

  it('keeps VideoDecoder proxy fixture IPC out of production Electron main', () => {
    const code = readFileSync(electronMainPath, 'utf8');

    expect(code).not.toContain('resolve-4k-proxy-video');
    expect(code).not.toContain('VideoDecoder テスト用');
    expect(code).not.toContain('GX010052.proxy.mp4');
  });

  it('does not force browser video codec feature flags in production Electron main', () => {
    const code = readFileSync(electronMainPath, 'utf8');

    expect(code).not.toContain('UseChromeOSDirectVideoDecoder');
    expect(code).not.toContain('VideoToolboxVideoCodecFactory');
    expect(code).not.toContain('VaapiVideoDecoder');
    expect(code).not.toContain('VaapiVideoEncoder');
    expect(code).not.toContain('WebCodecs');
  });
});
