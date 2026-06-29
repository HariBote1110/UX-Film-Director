import { describe, expect, it, vi } from 'vitest';
import {
  nativeOverlayIpcChannels,
  registerNativeOverlayIpcHandlers,
} from '../../electron/nativeOverlayIpc';

describe('nativeOverlayIpc', () => {
  it('uses stable native overlay IPC channel names', () => {
    expect(nativeOverlayIpcChannels.attach).toBe('native-overlay-attach');
    expect(nativeOverlayIpcChannels.detach).toBe('native-overlay-detach');
    expect(nativeOverlayIpcChannels.capabilities).toBe('native-overlay-capabilities');
  });

  it('registers attach, detach, and capabilities handlers against the bridge', async () => {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => Promise<unknown>>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (_event: unknown, payload: unknown) => Promise<unknown>) => {
        handlers.set(channel, handler);
      }),
    };
    const bridge = {
      attach: vi.fn(async (payload: unknown) => ({ success: true, attached: true, payload })),
      detach: vi.fn(async (payload: unknown) => ({ success: true, attached: false, payload })),
      getCapabilities: vi.fn(() => ({ available: true })),
    };

    registerNativeOverlayIpcHandlers(ipcMain, bridge);

    expect(ipcMain.handle).toHaveBeenCalledTimes(3);
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
    await expect(handlers.get(nativeOverlayIpcChannels.capabilities)?.({}, undefined)).resolves.toEqual({
      available: true,
    });
  });
});
