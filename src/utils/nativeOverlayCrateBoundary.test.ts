import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('native overlay napi crate boundary', () => {
  it('defines a napi-rs cdylib crate for the Electron main process', () => {
    expect(existsSync(resolve(root, 'native-overlay/Cargo.toml'))).toBe(true);
    const cargoToml = read('native-overlay/Cargo.toml');

    expect(cargoToml).toContain('name = "uxfd-native-overlay"');
    expect(cargoToml).toContain('crate-type = ["cdylib"]');
    expect(cargoToml).toContain('napi = ');
    expect(cargoToml).toContain('napi-derive = ');
    expect(cargoToml).toContain('napi-build = ');
  });

  it('exports attach, detach, and capability functions through napi', () => {
    const lib = read('native-overlay/src/lib.rs');

    expect(lib).toContain('#[napi(js_name = "attachNativeOverlay")]');
    expect(lib).toContain('#[napi(js_name = "detachNativeOverlay")]');
    expect(lib).toContain('#[napi(js_name = "getNativeOverlayCapabilities")]');
    expect(lib).toContain('std::panic::catch_unwind');
  });

  it('keeps macOS support behind cfg while non-macOS returns an explicit fallback capability', () => {
    const lib = read('native-overlay/src/lib.rs');

    expect(lib).toContain('#[cfg(target_os = "macos")]');
    expect(lib).toContain('#[cfg(not(target_os = "macos"))]');
    expect(lib).toContain('available: false');
  });

  it('provides build and smoke-test scripts for the native overlay addon', () => {
    expect(existsSync(resolve(root, 'scripts/build-native-overlay-addon.mjs'))).toBe(true);
    expect(existsSync(resolve(root, 'scripts/test-native-overlay-addon.mjs'))).toBe(true);

    expect(read('scripts/build-native-overlay-addon.mjs')).toContain('native-overlay.node');
    expect(read('scripts/test-native-overlay-addon.mjs')).toContain('attachNativeOverlay');
  });
});
