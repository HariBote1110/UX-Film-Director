import type {
  NativeOverlayAttachPayload,
  NativeOverlayDetachPayload,
  NativeOverlayResponse,
} from './nativeOverlayMainBridge'

export const nativeOverlayIpcChannels = {
  attach: 'native-overlay-attach',
  detach: 'native-overlay-detach',
  capabilities: 'native-overlay-capabilities',
} as const

export interface NativeOverlayCapabilities {
  available: boolean
  reason?: string
}

export interface NativeOverlayIpcMainLike {
  handle: (
    channel: string,
    handler: (event: unknown, payload: unknown) => Promise<unknown> | unknown,
  ) => void
}

export interface NativeOverlayIpcBridge {
  attach: (payload: NativeOverlayAttachPayload) => Promise<NativeOverlayResponse>
  detach: (payload: NativeOverlayDetachPayload) => Promise<NativeOverlayResponse>
  getCapabilities: () => NativeOverlayCapabilities
}

export const registerNativeOverlayIpcHandlers = (
  ipcMain: NativeOverlayIpcMainLike,
  bridge: NativeOverlayIpcBridge,
): void => {
  ipcMain.handle(nativeOverlayIpcChannels.attach, async (_event, payload) =>
    bridge.attach(payload as NativeOverlayAttachPayload))
  ipcMain.handle(nativeOverlayIpcChannels.detach, async (_event, payload) =>
    bridge.detach(payload as NativeOverlayDetachPayload))
  ipcMain.handle(nativeOverlayIpcChannels.capabilities, async () =>
    bridge.getCapabilities())
}
