import type {
  NativeOverlayAttachPayload,
  NativeOverlayDetachPayload,
  NativeOverlayResponse,
  NativeOverlaySharedFramePayload,
} from './nativeOverlayMainBridge'

export const nativeOverlayIpcChannels = {
  attach: 'native-overlay-attach',
  detach: 'native-overlay-detach',
  presentSharedFrame: 'native-overlay-present-shared-frame',
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
  presentSharedFrame: (payload: NativeOverlaySharedFramePayload) => Promise<NativeOverlayResponse>
  getCapabilities: () => NativeOverlayCapabilities
}

export interface RegisterNativeOverlayIpcHandlersOptions {
  resolveWindowIdFromEvent?: (event: unknown) => number | null
  logDiagnostic?: (eventName: string, payload: unknown) => void
}

export const registerNativeOverlayIpcHandlers = (
  ipcMain: NativeOverlayIpcMainLike,
  bridge: NativeOverlayIpcBridge,
  options: RegisterNativeOverlayIpcHandlersOptions = {},
): void => {
  ipcMain.handle(nativeOverlayIpcChannels.attach, async (event, payload) => {
    const response = await bridge.attach(withWindowId(payload, event, options.resolveWindowIdFromEvent))
    options.logDiagnostic?.('attach', response)
    return response
  })
  ipcMain.handle(nativeOverlayIpcChannels.detach, async (event, payload) =>
    bridge.detach(withWindowId(payload, event, options.resolveWindowIdFromEvent) as NativeOverlayDetachPayload))
  ipcMain.handle(nativeOverlayIpcChannels.presentSharedFrame, async (event, payload) =>
    bridge.presentSharedFrame(
      withWindowId(payload, event, options.resolveWindowIdFromEvent) as NativeOverlaySharedFramePayload,
    ))
  ipcMain.handle(nativeOverlayIpcChannels.capabilities, async () =>
    bridge.getCapabilities())
}

const withWindowId = (
  payload: unknown,
  event: unknown,
  resolveWindowIdFromEvent?: (event: unknown) => number | null,
): NativeOverlayAttachPayload => {
  const attachPayload = {
    ...(typeof payload === 'object' && payload !== null ? payload : {}),
  } as Partial<NativeOverlayAttachPayload>
  if (typeof attachPayload.windowId === 'number') {
    return attachPayload as NativeOverlayAttachPayload
  }

  const windowId = resolveWindowIdFromEvent?.(event) ?? null
  return {
    ...attachPayload,
    windowId: typeof windowId === 'number' ? windowId : -1,
  } as NativeOverlayAttachPayload
}
