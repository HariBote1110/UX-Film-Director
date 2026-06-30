import { describe, expect, it, vi } from 'vitest';
import { createNativeOverlayMainBridge } from '../../electron/nativeOverlayMainBridge';

const attachPayload = {
  windowId: 7,
  x: 12,
  y: 34,
  width: 640,
  height: 360,
  scaleFactor: 2,
};

describe('createNativeOverlayMainBridge', () => {
  it('keeps the WebGPU presenter fallback when the native overlay flag is disabled', async () => {
    const bridge = createNativeOverlayMainBridge({
      env: {},
      cwd: '/repo',
      existsSync: () => true,
      requireModule: vi.fn(),
    });

    await expect(bridge.attach(attachPayload)).resolves.toEqual({
      success: false,
      attached: false,
      fallback: 'webgpuPresenter',
      reason: 'Native overlay preview is disabled.',
    });
  });

  it('falls back to the WebGPU presenter when the addon cannot be resolved', async () => {
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: () => false,
      requireModule: vi.fn(),
    });

    await expect(bridge.attach(attachPayload)).resolves.toEqual({
      success: false,
      attached: false,
      fallback: 'webgpuPresenter',
      reason: 'Native overlay addon is unavailable.',
    });
  });

  it('accepts the Vite native overlay flag used by renderer-driven dev startup', async () => {
    const nativeAddon = {
      attachNativeOverlay: vi.fn(() => ({ success: true, attached: true })),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { VITE_UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
      resolveNativeWindowHandle: vi.fn(() => Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])),
    });

    await expect(bridge.attach(attachPayload)).resolves.toEqual({
      success: true,
      attached: true,
    });
  });

  it('attaches and detaches through the native overlay addon when the flag and addon are available', async () => {
    const nativeWindowHandle = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const nativeAddon = {
      attachNativeOverlay: vi.fn(() => ({ success: true, attached: true })),
      detachNativeOverlay: vi.fn(() => ({ success: true, attached: false })),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
      resolveNativeWindowHandle: vi.fn((windowId) => windowId === 7 ? nativeWindowHandle : null),
    });

    await expect(bridge.attach(attachPayload)).resolves.toEqual({
      success: true,
      attached: true,
    });
    await expect(bridge.detach({ windowId: 7 })).resolves.toEqual({
      success: true,
      attached: false,
    });
    expect(nativeAddon.attachNativeOverlay).toHaveBeenCalledWith({
      ...attachPayload,
      nativeWindowHandle,
    });
    expect(nativeAddon.detachNativeOverlay).toHaveBeenCalledWith({
      windowId: 7,
      nativeWindowHandle,
    });
  });

  it('canonicalises the attach scale factor from the main-process backing scale factor', async () => {
    const nativeWindowHandle = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const nativeAddon = {
      attachNativeOverlay: vi.fn(() => ({ success: true, attached: true })),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
      resolveNativeWindowHandle: vi.fn(() => nativeWindowHandle),
      resolveBackingScaleFactor: vi.fn((windowId) => windowId === 7 ? 2.5 : null),
    });

    await expect(bridge.attach({
      ...attachPayload,
      scaleFactor: 1,
    })).resolves.toEqual({
      success: true,
      attached: true,
    });
    expect(nativeAddon.attachNativeOverlay).toHaveBeenCalledWith({
      ...attachPayload,
      scaleFactor: 2.5,
      nativeWindowHandle,
    });
  });

  it('falls back when detach cannot resolve the BrowserWindow handle', async () => {
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => ({
        detachNativeOverlay: vi.fn(() => ({ success: true, attached: false })),
      })),
      resolveNativeWindowHandle: vi.fn(() => null),
    });

    await expect(bridge.detach({ windowId: 7 })).resolves.toEqual({
      success: false,
      attached: false,
      fallback: 'webgpuPresenter',
      reason: 'Native overlay window handle is unavailable.',
    });
  });

  it('falls back to the WebGPU presenter when the BrowserWindow handle cannot be resolved', async () => {
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => ({
        attachNativeOverlay: vi.fn(() => ({ success: true, attached: true })),
      })),
      resolveNativeWindowHandle: vi.fn(() => null),
    });

    await expect(bridge.attach(attachPayload)).resolves.toEqual({
      success: false,
      attached: false,
      fallback: 'webgpuPresenter',
      reason: 'Native overlay window handle is unavailable.',
    });
  });

  it('falls back to the WebGPU presenter when the addon throws during attach', async () => {
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => ({
        attachNativeOverlay: () => {
          throw new Error('panic guard reported failure');
        },
      })),
      resolveNativeWindowHandle: vi.fn(() => Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])),
    });

    await expect(bridge.attach(attachPayload)).resolves.toEqual({
      success: false,
      attached: false,
      fallback: 'webgpuPresenter',
      reason: 'panic guard reported failure',
    });
  });

  it('presents a decoded shared frame through the native addon and returns a release payload', async () => {
    const nativeWindowHandle = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const releasePayload = {
      memoryId: '/uxfd-decode-ring',
      slotIndex: 0,
      generation: 5,
      ptsFrame: 12,
      copyOutState: 'gpuUploadFenceSignalled' as const,
    };
    const nativeAddon = {
      presentNativeOverlaySharedFrame: vi.fn(() => ({
        success: true,
        attached: true,
        releaseFrame: releasePayload,
      })),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
      resolveNativeWindowHandle: vi.fn((windowId) => windowId === 7 ? nativeWindowHandle : null),
    });

    const payload = {
      windowId: 7,
      mediaId: 'clip-video',
      slotCount: 2,
      frame: {
        descriptor: {
          memoryId: '/uxfd-decode-ring',
          slotIndex: 0,
          generation: 5,
          byteOffset: 0,
          byteLen: 8,
          width: 2,
          height: 1,
          strideBytes: 8,
          format: 'rgba8Srgb',
        },
        ptsFrame: 12,
      },
    };

    await expect(bridge.presentSharedFrame(payload)).resolves.toEqual({
      success: true,
      attached: true,
      releaseFrame: releasePayload,
    });
    expect(nativeAddon.presentNativeOverlaySharedFrame).toHaveBeenCalledWith({
      ...payload,
      nativeWindowHandle,
    });
  });

  it('emits an opt-in present timing trace with release generation details', async () => {
    const nativeWindowHandle = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const diagnostics: Array<[string, unknown]> = [];
    const nowValues = [1000, 1012.75];
    const releasePayload = {
      memoryId: '/uxfd-decode-ring',
      slotIndex: 1,
      generation: 9,
      ptsFrame: 24,
      copyOutState: 'gpuUploadFenceSignalled' as const,
    };
    const nativeAddon = {
      presentNativeOverlaySharedFrame: vi.fn(() => ({
        success: true,
        attached: true,
        releaseFrame: releasePayload,
      })),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1', UXFD_DECODE_TRACE: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
      resolveNativeWindowHandle: vi.fn(() => nativeWindowHandle),
      now: () => nowValues.shift() ?? 1012.75,
      logDiagnostic: (eventName, payload) => diagnostics.push([eventName, payload]),
    });

    await bridge.presentSharedFrame({
      windowId: 7,
      mediaId: 'decode-job-1',
      slotCount: 2,
      frame: {
        descriptor: {
          memoryId: '/uxfd-decode-ring',
          slotIndex: 1,
          generation: 9,
          byteOffset: 0,
          byteLen: 16,
          width: 2,
          height: 2,
          strideBytes: 8,
          format: 'rgba8Srgb',
        },
        ptsFrame: 24,
      },
    });

    expect(diagnostics).toEqual([[
      'presentSharedFrameTrace',
      {
        mediaId: 'decode-job-1',
        presentMs: 12.75,
        success: true,
        attached: true,
        slotIndex: 1,
        generation: 9,
        ptsFrame: 24,
        releaseGeneration: 9,
        releasePtsFrame: 24,
      },
    ]]);
  });
});
