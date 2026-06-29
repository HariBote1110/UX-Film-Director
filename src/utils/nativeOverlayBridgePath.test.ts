import { describe, expect, it } from 'vitest';
import { resolveNativeOverlayBridgeModulePath } from '../../electron/nativeOverlayBridgePath';

describe('resolveNativeOverlayBridgeModulePath', () => {
  it('uses the explicit native overlay addon path first', () => {
    expect(resolveNativeOverlayBridgeModulePath({
      env: {
        UXFD_NATIVE_OVERLAY_MODULE: '/tmp/explicit/native-overlay.node',
      },
      cwd: '/repo',
      resourcesPath: '/Applications/UXFD.app/Contents/Resources',
      existsSync: () => false,
    })).toBe('/tmp/explicit/native-overlay.node');
  });

  it('uses the development native overlay addon path when present', () => {
    expect(resolveNativeOverlayBridgeModulePath({
      env: {},
      cwd: '/repo',
      resourcesPath: '/Applications/UXFD.app/Contents/Resources',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
    })).toBe('/repo/native-overlay/native-overlay.node');
  });

  it('uses the packaged native overlay addon path when development output is absent', () => {
    expect(resolveNativeOverlayBridgeModulePath({
      env: {},
      cwd: '/repo',
      resourcesPath: '/Applications/UXFD.app/Contents/Resources',
      existsSync: (candidate) => candidate === '/Applications/UXFD.app/Contents/Resources/native-overlay/native-overlay.node',
    })).toBe('/Applications/UXFD.app/Contents/Resources/native-overlay/native-overlay.node');
  });

  it('returns null when no native overlay addon candidate is available', () => {
    expect(resolveNativeOverlayBridgeModulePath({
      env: {},
      cwd: '/repo',
      resourcesPath: '/Applications/UXFD.app/Contents/Resources',
      existsSync: () => false,
    })).toBeNull();
  });
});
