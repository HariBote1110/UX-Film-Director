import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainSource = () =>
  readFileSync(new URL('../../electron/main.ts', import.meta.url), 'utf8');

const preloadSource = () =>
  readFileSync(new URL('../../electron/preload.ts', import.meta.url), 'utf8');

const viteEnvSource = () =>
  readFileSync(new URL('../vite-env.d.ts', import.meta.url), 'utf8');

describe('Rust backend native render bridge boundary', () => {
  it('exposes render.nativeSharedFrame through Electron and renderer types', () => {
    expect(mainSource()).toContain("'rust-backend-render-native-shared-frame'");
    expect(mainSource()).toContain("callRustBackend('render.nativeSharedFrame'");
    expect(preloadSource()).toContain('renderNativeSharedFrame(payload: unknown)');
    expect(preloadSource()).toContain("'rust-backend-render-native-shared-frame'");
    expect(viteEnvSource()).toContain('renderNativeSharedFrame: (payload: unknown)');
  });
});
