import { describe, expect, it, vi } from 'vitest';
import {
  nativeOverlayIpcChannels,
  registerNativeOverlayIpcHandlers,
} from '../../electron/nativeOverlayIpc';

describe('nativeOverlayIpc', () => {
  it('uses stable native overlay IPC channel names', () => {
    expect(nativeOverlayIpcChannels.attach).toBe('native-overlay-attach');
    expect(nativeOverlayIpcChannels.detach).toBe('native-overlay-detach');
    expect(nativeOverlayIpcChannels.presentSharedFrame).toBe('native-overlay-present-shared-frame');
    expect(nativeOverlayIpcChannels.capabilities).toBe('native-overlay-capabilities');
    // Bug D — clip 削除後 overlay の drawable に古いフレームが残る症状を
    // 潰すため、`clear-surface` を独立 IPC channel として固定する。
    expect(nativeOverlayIpcChannels.clearSurface).toBe('native-overlay-clear-surface');
    // Bug E（計画書 §3・§4 Phase E2）— renderer の previewObstructionDetector.ts
    // が転送する ui:preview-obstruction-changed を受ける channel。
    expect(nativeOverlayIpcChannels.previewObstructionChanged).toBe('ui:preview-obstruction-changed');
    // 選択デコレーション — 選択枠・リサイズハンドルの見た目を native overlay
    // 側で描くための quad 送信 channel。
    expect(nativeOverlayIpcChannels.setSelectionDecoration).toBe('native-overlay-set-selection-decoration');
  });

  it('registers attach, detach, present, clear-surface, and capabilities handlers against the bridge', async () => {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => Promise<unknown>>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (_event: unknown, payload: unknown) => Promise<unknown>) => {
        handlers.set(channel, handler);
      }),
    };
    const bridge = {
      attach: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      detach: vi.fn(async (payload: unknown) => ({ success: true, attached: false, payload })),
      presentSharedFrame: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      clearSurface: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      getCapabilities: vi.fn(() => ({ available: true })),
    };

    registerNativeOverlayIpcHandlers(ipcMain, bridge);

    // 選択デコレーション channel が追加され、登録される channel は 7 個になった。
    expect(ipcMain.handle).toHaveBeenCalledTimes(7);
    await expect(handlers.get(nativeOverlayIpcChannels.attach)?.({}, { windowId: 3 })).resolves.toEqual({
      success: true,
      attached: true,
      payload: { windowId: 3 },
    });
    await expect(handlers.get(nativeOverlayIpcChannels.detach)?.({}, { windowId: 3 })).resolves.toEqual({
      success: true,
      attached: false,
      payload: { windowId: 3 },
    });
    await expect(handlers.get(nativeOverlayIpcChannels.presentSharedFrame)?.({}, {
      windowId: 3,
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
    })).resolves.toMatchObject({
      success: true,
      attached: true,
      payload: {
        windowId: 3,
        mediaId: 'clip-video',
      },
    });
    await expect(handlers.get(nativeOverlayIpcChannels.capabilities)?.({}, undefined)).resolves.toEqual({
      available: true,
    });
  });

  it('fills the current BrowserWindow id from the IPC event when attach omits windowId', async () => {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => Promise<unknown>>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (_event: unknown, payload: unknown) => Promise<unknown>) => {
        handlers.set(channel, handler);
      }),
    };
    const bridge = {
      attach: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      detach: vi.fn(async (payload: unknown) => ({ success: true, attached: false, payload })),
      presentSharedFrame: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      getCapabilities: vi.fn(() => ({ available: true })),
    };

    registerNativeOverlayIpcHandlers(ipcMain, bridge, {
      resolveWindowIdFromEvent: vi.fn(() => 9),
    });

    await expect(handlers.get(nativeOverlayIpcChannels.attach)?.({ sender: 'webContents' }, {
      x: 1,
      y: 2,
      width: 320,
      height: 180,
      scaleFactor: 2,
    })).resolves.toEqual({
      success: true,
      attached: true,
      payload: {
        windowId: 9,
        x: 1,
        y: 2,
        width: 320,
        height: 180,
        scaleFactor: 2,
      },
    });
  });

  it('fills the current BrowserWindow id from the IPC event when detach omits windowId', async () => {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => Promise<unknown>>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (_event: unknown, payload: unknown) => Promise<unknown>) => {
        handlers.set(channel, handler);
      }),
    };
    const bridge = {
      attach: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      detach: vi.fn(async (payload: unknown) => ({ success: true, attached: false, payload })),
      presentSharedFrame: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      getCapabilities: vi.fn(() => ({ available: true })),
    };

    registerNativeOverlayIpcHandlers(ipcMain, bridge, {
      resolveWindowIdFromEvent: vi.fn(() => 9),
    });

    await expect(handlers.get(nativeOverlayIpcChannels.detach)?.({ sender: 'webContents' }, {})).resolves.toEqual({
      success: true,
      attached: false,
      payload: {
        windowId: 9,
      },
    });
  });

  it('logs native overlay attach results for opt-in diagnostics', async () => {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => Promise<unknown>>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (_event: unknown, payload: unknown) => Promise<unknown>) => {
        handlers.set(channel, handler);
      }),
    };
    const logger = vi.fn();
    const bridge = {
      attach: vi.fn(async () => ({
        success: false,
        attached: false,
        fallback: 'webgpuPresenter' as const,
        reason: 'Native overlay addon is unavailable.',
      })),
      detach: vi.fn(async (payload: unknown) => ({ success: true, attached: false, payload })),
      presentSharedFrame: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      getCapabilities: vi.fn(() => ({ available: false })),
    };

    registerNativeOverlayIpcHandlers(ipcMain, bridge, {
      resolveWindowIdFromEvent: vi.fn(() => 9),
      logDiagnostic: logger,
    });

    await handlers.get(nativeOverlayIpcChannels.attach)?.({}, {
      x: 1,
      y: 2,
      width: 320,
      height: 180,
      scaleFactor: 2,
    });

    expect(logger).toHaveBeenCalledWith('attach', {
      success: false,
      attached: false,
      fallback: 'webgpuPresenter',
      reason: 'Native overlay addon is unavailable.',
    });
  });

  it('registers a clear-surface handler that routes to bridge.clearSurface with the resolved windowId', async () => {
    // Bug D — `native-overlay-clear-surface` channel は windowId を bridge.clearSurface
    // に届け、attach/detach と同じ resolveWindowIdFromEvent 経路を再利用する契約。
    const handlers = new Map<string, (_event: unknown, payload: unknown) => Promise<unknown>>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (_event: unknown, payload: unknown) => Promise<unknown>) => {
        handlers.set(channel, handler);
      }),
    };
    const bridge = {
      attach: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      detach: vi.fn(async (payload: unknown) => ({ success: true, attached: false, payload })),
      presentSharedFrame: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      clearSurface: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      getCapabilities: vi.fn(() => ({ available: true })),
    };

    registerNativeOverlayIpcHandlers(ipcMain, bridge, {
      resolveWindowIdFromEvent: vi.fn(() => 11),
    });

    // 選択デコレーション channel が追加され、登録される channel は 7 個になった。
    expect(ipcMain.handle).toHaveBeenCalledTimes(7);
    await expect(handlers.get(nativeOverlayIpcChannels.clearSurface)?.({ sender: 'webContents' }, {})).resolves.toEqual({
      success: true,
      attached: true,
      payload: { windowId: 11 },
    });
    expect(bridge.clearSurface).toHaveBeenCalledWith({ windowId: 11 });
  });

  it('registers a preview-obstruction-changed handler that routes to bridge.setObstructed with the resolved windowId', async () => {
    // Bug E（計画書 §3・§4 Phase E2）— renderer の
    // subscribeStoreToPreviewObstructionIpc が送る { obstructed, reason, rect? }
    // を受け、resolveWindowIdFromEvent で解決した windowId とともに
    // bridge.setObstructed へ委譲する契約。
    const handlers = new Map<string, (_event: unknown, payload: unknown) => Promise<unknown>>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (_event: unknown, payload: unknown) => Promise<unknown>) => {
        handlers.set(channel, handler);
      }),
    };
    const bridge = {
      attach: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      detach: vi.fn(async (payload: unknown) => ({ success: true, attached: false, payload })),
      presentSharedFrame: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      clearSurface: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      setObstructed: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      getCapabilities: vi.fn(() => ({ available: true })),
    };

    registerNativeOverlayIpcHandlers(ipcMain, bridge, {
      resolveWindowIdFromEvent: vi.fn(() => 11),
    });

    expect(ipcMain.handle).toHaveBeenCalledTimes(7);
    await expect(handlers.get(nativeOverlayIpcChannels.previewObstructionChanged)?.(
      { sender: 'webContents' },
      { obstructed: true, reason: 'export-modal' },
    )).resolves.toEqual({
      success: true,
      attached: true,
      payload: { windowId: 11, obstructed: true },
    });
    expect(bridge.setObstructed).toHaveBeenCalledWith({ windowId: 11, obstructed: true });
  });

  it('registers a set-selection-decoration handler that routes quads to bridge.setSelectionDecoration with the resolved windowId', async () => {
    // 選択デコレーション — renderer（Viewport.tsx）が送る project 座標系の
    // world quad を、resolveWindowIdFromEvent で解決した windowId とともに
    // bridge.setSelectionDecoration へ委譲する契約。
    const handlers = new Map<string, (_event: unknown, payload: unknown) => Promise<unknown>>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown> | unknown) => {
        handlers.set(channel, handler as (_event: unknown, payload: unknown) => Promise<unknown>);
      }),
    };
    const bridge = {
      attach: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      detach: vi.fn(async (payload: unknown) => ({ success: true, attached: false, payload })),
      presentSharedFrame: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      clearSurface: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      setObstructed: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      setSelectionDecoration: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      getCapabilities: vi.fn(() => ({ available: true })),
    };

    registerNativeOverlayIpcHandlers(ipcMain, bridge, {
      resolveWindowIdFromEvent: vi.fn(() => 11),
    });

    const decorationPayload = {
      canvasWidth: 1920,
      canvasHeight: 1080,
      quads: [{
        topLeftX: 10, topLeftY: 20,
        topRightX: 110, topRightY: 20,
        bottomRightX: 110, bottomRightY: 70,
        bottomLeftX: 10, bottomLeftY: 70,
      }],
    };
    await expect(handlers.get(nativeOverlayIpcChannels.setSelectionDecoration)?.(
      { sender: 'webContents' },
      decorationPayload,
    )).resolves.toEqual({
      success: true,
      attached: true,
      payload: { windowId: 11, ...decorationPayload },
    });
    expect(bridge.setSelectionDecoration).toHaveBeenCalledWith({ windowId: 11, ...decorationPayload });
  });
});
