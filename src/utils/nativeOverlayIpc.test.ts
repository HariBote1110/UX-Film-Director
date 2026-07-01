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
  });

  it('registers attach, detach, present, and capabilities handlers against the bridge', async () => {
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

    registerNativeOverlayIpcHandlers(ipcMain, bridge);

    expect(ipcMain.handle).toHaveBeenCalledTimes(4);
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

    expect(ipcMain.handle).toHaveBeenCalledTimes(5);
    await expect(handlers.get(nativeOverlayIpcChannels.clearSurface)?.({ sender: 'webContents' }, {})).resolves.toEqual({
      success: true,
      attached: true,
      payload: { windowId: 11 },
    });
    expect(bridge.clearSurface).toHaveBeenCalledWith({ windowId: 11 });
  });
});
