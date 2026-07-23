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
  it('enables the native overlay by default when the addon is available', async () => {
    const nativeAddon = {
      attachNativeOverlay: vi.fn(() => ({ success: true, attached: true })),
    };
    const bridge = createNativeOverlayMainBridge({
      env: {},
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

  it('keeps the WebGPU presenter fallback when the native overlay flag is explicitly disabled', async () => {
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '0' },
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

  it('presents a scene directly without resolving a shared-frame window handle', async () => {
    const nativeAddon = {
      presentNativeOverlayScene: vi.fn(() => ({
        success: true,
        attached: true,
      })),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
      resolveNativeWindowHandle: vi.fn(() => null),
    });
    const payload = {
      windowId: 7,
      snapshot: { frameIndex: 24, canvasWidth: 4, canvasHeight: 4 },
      media: [{ id: 'shape-1', kind: 'SolidColour', source: '#ff0000', width: 4, height: 4 }],
    };

    await expect(bridge.presentScene(payload)).resolves.toEqual({
      success: true,
      attached: true,
    });
    expect(nativeAddon.presentNativeOverlayScene).toHaveBeenCalledWith(payload);
  });

  it('passes an embedded selectionDecoration through to the native addon present call (Bug B対策: body co-delivery)', async () => {
    const nativeWindowHandle = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const nativeAddon = {
      presentNativeOverlaySharedFrame: vi.fn(() => ({
        success: true,
        attached: true,
        releaseFrame: {
          memoryId: '/uxfd-decode-ring',
          slotIndex: 0,
          generation: 5,
          ptsFrame: 12,
          copyOutState: 'gpuUploadFenceSignalled' as const,
        },
      })),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
      resolveNativeWindowHandle: vi.fn((windowId) => windowId === 7 ? nativeWindowHandle : null),
    });

    const selectionDecoration = {
      canvasWidth: 1920,
      canvasHeight: 1080,
      quads: [{
        topLeftX: 1, topLeftY: 2,
        topRightX: 3, topRightY: 2,
        bottomRightX: 3, bottomRightY: 4,
        bottomLeftX: 1, bottomLeftY: 4,
      }],
    };
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
      selectionDecoration,
    };

    await bridge.presentSharedFrame(payload);

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

  it('includes live surface readback diagnostics in the opt-in present trace', async () => {
    const nativeWindowHandle = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const diagnostics: Array<[string, unknown]> = [];
    const nowValues = [2000, 2014.5];
    const nativeAddon = {
      presentNativeOverlaySharedFrame: vi.fn(() => ({
        success: true,
        attached: true,
        livePreparedClipCount: 2,
        liveReadbackNonTransparentPixels: 128,
        liveReadbackChecksum: 424242,
      })),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1', UXFD_DECODE_TRACE: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
      resolveNativeWindowHandle: vi.fn(() => nativeWindowHandle),
      now: () => nowValues.shift() ?? 2014.5,
      logDiagnostic: (eventName, payload) => diagnostics.push([eventName, payload]),
    });

    await bridge.presentSharedFrame({
      windowId: 7,
      mediaId: 'scene-video-1',
      slotCount: 2,
      frame: {
        descriptor: {
          memoryId: '/uxfd-decode-ring',
          slotIndex: 0,
          generation: 11,
          byteOffset: 0,
          byteLen: 16,
          width: 2,
          height: 2,
          strideBytes: 8,
          format: 'rgba8Srgb',
        },
        ptsFrame: 30,
      },
    });

    expect(diagnostics).toEqual([[
      'presentSharedFrameTrace',
      expect.objectContaining({
        mediaId: 'scene-video-1',
        presentMs: 14.5,
        livePreparedClipCount: 2,
        liveReadbackNonTransparentPixels: 128,
        liveReadbackChecksum: 424242,
      }),
    ]]);
  });

  it('clears the live surface transparently through the addon clearNativeOverlayLiveSurface entry point', async () => {
    // Bug D — clip 削除後 overlay の drawable に古いフレームが残る症状に対する
    // bridge 側の契約。`bridge.clearSurface({ windowId })` が addon の
    // `clearNativeOverlayLiveSurface` を window_id 経由で呼び、native_window_handle
    // 無しでも成立する（clear は registry lookup で完結するため）ことを保証する。
    const nativeAddon = {
      clearNativeOverlayLiveSurface: vi.fn(() => ({ success: true, attached: true })),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
      resolveNativeWindowHandle: vi.fn(() => null),
    });

    await expect(bridge.clearSurface({ windowId: 7 })).resolves.toEqual({
      success: true,
      attached: true,
    });
    expect(nativeAddon.clearNativeOverlayLiveSurface).toHaveBeenCalledWith({
      windowId: 7,
    });
  });

  it('falls back to the WebGPU presenter when clearSurface is invoked with the native overlay flag disabled', async () => {
    // Bug D — 既定 OFF 経路（`UXFD_NATIVE_OVERLAY=0`）では clearSurface も
    // WebGPU presenter fallback を返し、addon 側を触らないことを保証する。
    const nativeAddon = {
      clearNativeOverlayLiveSurface: vi.fn(),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '0' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
    });

    await expect(bridge.clearSurface({ windowId: 7 })).resolves.toEqual({
      success: false,
      attached: false,
      fallback: 'webgpuPresenter',
      reason: 'Native overlay preview is disabled.',
    });
    expect(nativeAddon.clearNativeOverlayLiveSurface).not.toHaveBeenCalled();
  });

  it('falls back to the WebGPU presenter when the addon lacks a clearNativeOverlayLiveSurface entry point', async () => {
    // Bug D — 未対応 addon（旧 build）に対しては clearSurface が fallback を返す
    // ことで attach 経路の存在確認と同じ境界を保つ。
    const nativeAddon = {
      attachNativeOverlay: vi.fn(),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
    });

    await expect(bridge.clearSurface({ windowId: 7 })).resolves.toEqual({
      success: false,
      attached: false,
      fallback: 'webgpuPresenter',
      reason: 'Native overlay addon is unavailable.',
    });
  });

  it('toggles the child NSWindow z-order through the addon setNativeOverlayObstructed entry point', async () => {
    // Bug E（計画書 §4 Phase E2）— ui:preview-obstruction-changed を受けた
    // main が `bridge.setObstructed({ windowId, obstructed })` を呼ぶと、
    // addon の setNativeOverlayObstructed が window_id + obstructed で
    // 呼ばれる。clearSurface と同じく native_window_handle 不要（registry
    // lookup で完結する）。
    const nativeAddon = {
      setNativeOverlayObstructed: vi.fn(() => ({ success: true, attached: true })),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
      resolveNativeWindowHandle: vi.fn(() => null),
    });

    await expect(bridge.setObstructed({ windowId: 7, obstructed: true })).resolves.toEqual({
      success: true,
      attached: true,
    });
    expect(nativeAddon.setNativeOverlayObstructed).toHaveBeenCalledWith({
      windowId: 7,
      obstructed: true,
    });
  });

  it('falls back to the WebGPU presenter when setObstructed is invoked with the native overlay flag disabled', async () => {
    const nativeAddon = {
      setNativeOverlayObstructed: vi.fn(),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '0' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
    });

    await expect(bridge.setObstructed({ windowId: 7, obstructed: true })).resolves.toEqual({
      success: false,
      attached: false,
      fallback: 'webgpuPresenter',
      reason: 'Native overlay preview is disabled.',
    });
    expect(nativeAddon.setNativeOverlayObstructed).not.toHaveBeenCalled();
  });

  it('falls back to the WebGPU presenter when the addon lacks a setNativeOverlayObstructed entry point', async () => {
    const nativeAddon = {
      attachNativeOverlay: vi.fn(),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
    });

    await expect(bridge.setObstructed({ windowId: 7, obstructed: false })).resolves.toEqual({
      success: false,
      attached: false,
      fallback: 'webgpuPresenter',
      reason: 'Native overlay addon is unavailable.',
    });
  });

  it('sets the selection decoration through the addon setNativeOverlaySelectionDecoration entry point', async () => {
    // 選択デコレーション — bridge.setSelectionDecoration が addon の
    // setNativeOverlaySelectionDecoration を windowId + canvas + quads で呼ぶ。
    // clearSurface / setObstructed と同じく native_window_handle 不要。
    const nativeAddon = {
      setNativeOverlaySelectionDecoration: vi.fn(() => ({ success: true, attached: true })),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
      resolveNativeWindowHandle: vi.fn(() => null),
    });

    const payload = {
      windowId: 7,
      canvasWidth: 1920,
      canvasHeight: 1080,
      quads: [{
        topLeftX: 10, topLeftY: 20,
        topRightX: 110, topRightY: 20,
        bottomRightX: 110, bottomRightY: 70,
        bottomLeftX: 10, bottomLeftY: 70,
      }],
    };
    await expect(bridge.setSelectionDecoration(payload)).resolves.toEqual({
      success: true,
      attached: true,
    });
    expect(nativeAddon.setNativeOverlaySelectionDecoration).toHaveBeenCalledWith(payload);
  });

  it('falls back to the WebGPU presenter when the addon lacks a setNativeOverlaySelectionDecoration entry point', async () => {
    const nativeAddon = {
      attachNativeOverlay: vi.fn(),
    };
    const bridge = createNativeOverlayMainBridge({
      env: { UXFD_NATIVE_OVERLAY: '1' },
      cwd: '/repo',
      existsSync: (candidate) => candidate === '/repo/native-overlay/native-overlay.node',
      requireModule: vi.fn(() => nativeAddon),
    });

    await expect(bridge.setSelectionDecoration({
      windowId: 7,
      canvasWidth: 1920,
      canvasHeight: 1080,
      quads: [],
    })).resolves.toEqual({
      success: false,
      attached: false,
      fallback: 'webgpuPresenter',
      reason: 'Native overlay addon is unavailable.',
    });
  });
});
