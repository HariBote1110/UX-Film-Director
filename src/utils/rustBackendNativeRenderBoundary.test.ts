import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainSource = () =>
  readFileSync(new URL('../../electron/main.ts', import.meta.url), 'utf8');

const preloadSource = () =>
  readFileSync(new URL('../../electron/preload.ts', import.meta.url), 'utf8');

const viteEnvSource = () =>
  readFileSync(new URL('../vite-env.d.ts', import.meta.url), 'utf8');

const rustBackendSource = () =>
  readFileSync(new URL('../../rust-backend/src/main.rs', import.meta.url), 'utf8');

describe('Rust backend native render bridge boundary', () => {
  it('exposes render.nativeSharedFrame through Electron and renderer types', () => {
    expect(mainSource()).toContain("'rust-backend-render-native-shared-frame'");
    expect(mainSource()).toContain("callRustBackend('render.nativeSharedFrame'");
    expect(preloadSource()).toContain('renderNativeSharedFrame(payload: unknown)');
    expect(preloadSource()).toContain("'rust-backend-render-native-shared-frame'");
    expect(viteEnvSource()).toContain('renderNativeSharedFrame: (payload: unknown)');
  });

  it('exposes render.releaseNativeSharedFrame through Electron and renderer types', () => {
    expect(mainSource()).toContain("'rust-backend-render-release-native-shared-frame'");
    expect(mainSource()).toContain("callRustBackend('render.releaseNativeSharedFrame'");
    expect(preloadSource()).toContain('releaseNativeSharedFrame(payload: unknown)');
    expect(preloadSource()).toContain("'rust-backend-render-release-native-shared-frame'");
    expect(viteEnvSource()).toContain('releaseNativeSharedFrame: (payload: unknown)');
  });

  it('keeps a persistent native WGPU renderer in backend state for repeated export frames', () => {
    const code = rustBackendSource();

    expect(code).toContain('NativeWgpuRenderer');
    expect(code).toContain('native_wgpu_renderer: Option<NativeWgpuRenderer>');
    expect(code).toContain('get_or_create_native_wgpu_renderer');
    expect(code).toContain('.render_frame_to_shared_ring(');
  });

  it('exposes direct native render encode without returning an output shared frame', () => {
    const main = mainSource();
    const preload = preloadSource();
    const viteEnv = viteEnvSource();
    const backend = rustBackendSource();

    expect(main).toContain("'rust-backend-encode-write-native-frame'");
    expect(main).toContain("callRustBackend('encode.writeNativeFrame'");
    expect(preload).toContain('writeNativeEncodeFrame(payload: unknown)');
    expect(preload).toContain("'rust-backend-encode-write-native-frame'");
    expect(viteEnv).toContain('writeNativeEncodeFrame: (payload:');
    expect(backend).toContain('"encode.writeNativeFrame"');
    expect(backend).toContain('render_frame_stages(');
    expect(backend).toContain('write_tight_rgba_frame_to_encoder');
    expect(backend).not.toContain('render_frame_to_shared_ring_for_encode');
  });
});
