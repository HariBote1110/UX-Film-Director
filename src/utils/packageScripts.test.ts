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
  });
});
