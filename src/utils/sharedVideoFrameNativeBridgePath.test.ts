import { describe, expect, it } from 'vitest';
import { resolveSharedVideoFrameNativeBridgeModulePath } from '../../electron/sharedVideoFrameNativeBridgePath';

describe('resolveSharedVideoFrameNativeBridgeModulePath', () => {
  it('uses the explicit environment override first', () => {
    expect(resolveSharedVideoFrameNativeBridgeModulePath({
      env: {
        UXFD_SHARED_VIDEO_FRAME_BRIDGE_MODULE: '/tmp/explicit/shared-video-frame-bridge.node',
      },
      cwd: '/repo',
      resourcesPath: '/Applications/UXFD.app/Contents/Resources',
      existsSync: () => false,
    })).toBe('/tmp/explicit/shared-video-frame-bridge.node');
  });

  it('uses the development addon path when the built .node file exists', () => {
    expect(resolveSharedVideoFrameNativeBridgeModulePath({
      env: {},
      cwd: '/repo',
      resourcesPath: '/Applications/UXFD.app/Contents/Resources',
      existsSync: (candidate) => candidate === '/repo/shared-video-frame-bridge-node/shared-video-frame-bridge.node',
    })).toBe('/repo/shared-video-frame-bridge-node/shared-video-frame-bridge.node');
  });

  it('uses the packaged resources addon path when development output is absent', () => {
    expect(resolveSharedVideoFrameNativeBridgeModulePath({
      env: {},
      cwd: '/repo',
      resourcesPath: '/Applications/UXFD.app/Contents/Resources',
      existsSync: (candidate) => candidate === '/Applications/UXFD.app/Contents/Resources/shared-video-frame-bridge/shared-video-frame-bridge.node',
    })).toBe('/Applications/UXFD.app/Contents/Resources/shared-video-frame-bridge/shared-video-frame-bridge.node');
  });

  it('returns null when no addon candidate is available', () => {
    expect(resolveSharedVideoFrameNativeBridgeModulePath({
      env: {},
      cwd: '/repo',
      resourcesPath: '/Applications/UXFD.app/Contents/Resources',
      existsSync: () => false,
    })).toBeNull();
  });
});
