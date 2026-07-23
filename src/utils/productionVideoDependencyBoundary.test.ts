import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = new URL('../..', import.meta.url).pathname;
const srcRoot = join(projectRoot, 'src');
const electronMainPath = join(projectRoot, 'electron/main.ts');
const rendererEntryPath = join(projectRoot, 'src/main.tsx');
const packageJsonPath = join(projectRoot, 'package.json');
const viteConfigPath = join(projectRoot, 'vite.config.ts');

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

const allowedProductionVideoDependencyTokens = new Map<string, Set<string>>([
  [
    'src/components/Viewport.tsx',
    new Set([
      'HTMLVideoElement',
      'requestVideoFrameCallback',
    ]),
  ],
  [
    'src/utils/sharedRendererExternalVideoMasterClock.ts',
    new Set([
      'HTMLVideoElement',
    ]),
  ],
  [
    'src/utils/sharedRendererExternalVideoSource.ts',
    new Set([
      "document.createElement('video')",
      'requestVideoFrameCallback',
    ]),
  ],
  [
    'src/utils/sharedRendererWebGpuPresenter.ts',
    new Set([
      'HTMLVideoElement',
    ]),
  ],
]);

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
  it('limits browser/Pixi video fallbacks to explicit shared-renderer compatibility modules', () => {
    const offenders = collectProductionSources(srcRoot).flatMap((path) => {
      const code = readFileSync(path, 'utf8');
      const relativePath = relative(projectRoot, path);
      const allowedTokens = allowedProductionVideoDependencyTokens.get(relativePath) ?? new Set<string>();
      return forbiddenTokens
        .filter((token) => code.includes(token) && !allowedTokens.has(token))
        .map((token) => `${relativePath} -> ${token}`);
    });

    expect(offenders).toEqual([]);
  });

  it('pins the approved shared-renderer browser video compatibility surface', () => {
    expect([...allowedProductionVideoDependencyTokens.entries()]).toEqual([
      [
        'src/components/Viewport.tsx',
        new Set([
          'HTMLVideoElement',
          'requestVideoFrameCallback',
        ]),
      ],
      [
        'src/utils/sharedRendererExternalVideoMasterClock.ts',
        new Set([
          'HTMLVideoElement',
        ]),
      ],
      [
        'src/utils/sharedRendererExternalVideoSource.ts',
        new Set([
          "document.createElement('video')",
          'requestVideoFrameCallback',
        ]),
      ],
      [
        'src/utils/sharedRendererWebGpuPresenter.ts',
        new Set([
          'HTMLVideoElement',
        ]),
      ],
    ]);
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

  it('keeps MP4Box out of production dependencies', () => {
    const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(manifest.dependencies).not.toHaveProperty('mp4box');
    expect(manifest.devDependencies).toHaveProperty('mp4box');
  });

  it('keeps export test harness imports out of normal Vite dependency scanning', () => {
    const code = readFileSync(rendererEntryPath, 'utf8');

    expect(code).toContain('/* @vite-ignore */');
    expect(code).not.toContain("await import('./exportTest/exportTestHarness')");
  });

  it('limits normal Vite dependency scanning to the app entry html', () => {
    const code = readFileSync(viteConfigPath, 'utf8');

    expect(code).toContain('optimizeDeps');
    expect(code).toContain("entries: ['index.html']");
  });

  it('aliases MP4Box to the shipped module file for Vite scans', () => {
    const code = readFileSync(viteConfigPath, 'utf8');

    expect(code).toContain('resolve');
    expect(code).toContain('alias');
    expect(code).toContain('mp4boxModulePath');
    expect(code).toContain("new URL('./node_modules/mp4box/dist/mp4box.all.mjs', import.meta.url)");
    expect(code).toContain('mp4box: mp4boxModulePath');
  });
});
