import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const preloadSource = () =>
  readFileSync(new URL('../../electron/preload.ts', import.meta.url), 'utf8');

const viteEnvSource = () =>
  readFileSync(new URL('../vite-env.d.ts', import.meta.url), 'utf8');

describe('shared video frame upload bridge boundary', () => {
  it('does not expose Electron control-plane pixel payload fallback from preload', () => {
    expect(preloadSource()).toContain('copyIntoUploadBuffer(payload: SharedVideoFrameCopyPayload, target: Uint8Array)');
    expect(preloadSource()).not.toContain('rgbaBytes: target');
    expect(viteEnvSource()).not.toContain('rgbaBytes?: Uint8Array | ArrayBuffer | number[]');
  });
});
