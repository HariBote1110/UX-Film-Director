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

  it('attaches and detaches through the native overlay addon when the flag and addon are available', async () => {
    const nativeAddon = {
      attachNativeOverlay: vi.fn(() => ({ success: true, attached: true })),
      detachNativeOverlay: vi.fn(() => ({ success: true, attached: false })),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
    });

    await expect(bridge.attach(attachPayload)).resolves.toEqual({
      success: true,
      attached: true,
    });
    await expect(bridge.detach({ windowId: 7 })).resolves.toEqual({
      success: true,
      attached: false,
    });
    expect(nativeAddon.attachNativeOverlay).toHaveBeenCalledWith(attachPayload);
    expect(nativeAddon.detachNativeOverlay).toHaveBeenCalledWith({ windowId: 7 });
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
    });

    await expect(bridge.attach(attachPayload)).resolves.toEqual({
      success: false,
      attached: false,
      fallback: 'webgpuPresenter',
      reason: 'panic guard reported failure',
    });
  });
});
