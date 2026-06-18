import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const preloadSource = () =>
  readFileSync(new URL('../../electron/preload.ts', import.meta.url), 'utf8');

const viteEnvSource = () =>
  readFileSync(new URL('../vite-env.d.ts', import.meta.url), 'utf8');

describe('shared video frame presented-frame handoff boundary', () => {
  it('exposes an optional native presented-frame handoff bridge through preload and renderer types', () => {
    expect(preloadSource()).toContain('getPresentedFrameHandoffCapabilities');
    expect(viteEnvSource()).toContain('getPresentedFrameHandoffCapabilities?:');
    expect(preloadSource()).toContain('takePresentedFrameSharedFrame');
    expect(viteEnvSource()).toContain('takePresentedFrameSharedFrame?:');
  });
});
