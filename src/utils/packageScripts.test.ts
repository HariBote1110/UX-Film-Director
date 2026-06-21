import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';

describe('package scripts', () => {
  it('provides a cross-platform Rust video preview/export dev command', () => {
    expect(packageJson.scripts['dev:rust-video']).toBe('node scripts/dev-rust-video.mjs');

    const script = readFileSync(new URL('../../scripts/dev-rust-video.mjs', import.meta.url), 'utf8');
    expect(script).toContain('VITE_UXFD_SHARED_RENDERER_PREVIEW');
    expect(script).toContain('VITE_UXFD_SHARED_RENDERER_EXPORT');
    expect(script).toContain('VITE_UXFD_RUST_EXPORT_ONLY');
    expect(script).toContain('VITE_UXFD_RUST_VIDEO_ONLY');
    expect(script).toContain('node_modules/vite/bin/vite.js');
    expect(script).toContain('scripts/build-shared-video-frame-node-addon.mjs');
    expect(script.indexOf('scripts/build-shared-video-frame-node-addon.mjs'))
      .toBeLessThan(script.indexOf('node_modules/vite/bin/vite.js'));
  });

  it('records real video export E2E duration separately from Electron startup time', () => {
    expect(packageJson.scripts['test:video-export:e2e']).toBe('node scripts/run-video-export-e2e.mjs');

    const script = readFileSync(new URL('../../scripts/run-video-export-e2e.mjs', import.meta.url), 'utf8');
    expect(script).toContain('UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS');
    expect(script).toContain('UXFD_VIDEO_EXPORT_E2E_USER_DATA_DIR');
    expect(script).toContain('--user-data-dir=');
    expect(script).toContain('exportDurationMs');
    expect(script).toContain('exportFramesPerSecond');
    expect(script.indexOf('const exportStartTimeMs = Date.now()'))
      .toBeLessThan(script.indexOf('exportDurationMs'));
  });

  it('provides a real video export quality comparison command', () => {
    expect(packageJson.scripts['test:video-export:quality']).toBe('node scripts/compare-video-export-quality.mjs');

    const script = readFileSync(new URL('../../scripts/compare-video-export-quality.mjs', import.meta.url), 'utf8');
    expect(script).toContain('run-video-export-e2e.mjs');
    expect(script).toContain('psnr=');
    expect(script).toContain('ssim=');
    expect(script).toContain('libvmaf');
    expect(script).toContain('quality-report.json');
  });

  it('provides an all-readable-media Rust boundary E2E command', () => {
    expect(packageJson.scripts['test:all-readable-media:e2e'])
      .toBe('vitest run --config vite.config.ts src/e2e/allReadableMedia.e2e.test.ts');
  });
});
