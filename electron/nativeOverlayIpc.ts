import type {
  NativeOverlayAttachPayload,
  NativeOverlayDetachPayload,
  NativeOverlayResponse,
  NativeOverlaySetObstructedPayload,
  NativeOverlaySharedFramePayload,
} from './nativeOverlayMainBridge'

export const nativeOverlayIpcChannels = {
  attach: 'native-overlay-attach',
  detach: 'native-overlay-detach',
  presentSharedFrame: 'native-overlay-present-shared-frame',
  capabilities: 'native-overlay-capabilities',
  // Bug D — clip 削除後 overlay の drawable に古いフレームが残る症状を
  // 潰すための独立 channel。scene 空遷移 / unmount / project 切替の
  // 3 経路から window 単位で呼ばれる。
  clearSurface: 'native-overlay-clear-surface',
  // Bug E（Native_Overlay_Bug_E_Plan.md §3・§4 Phase E2）— renderer の
  // previewObstructionDetector.ts（subscribeStoreToPreviewObstructionIpc）が
  // 転送する channel。payload は { obstructed, reason, rect? }。
  previewObstructionChanged: 'ui:preview-obstruction-changed',
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
  clearSurface: (payload: NativeOverlayDetachPayload) => Promise<NativeOverlayResponse>
  setObstructed: (payload: NativeOverlaySetObstructedPayload) => Promise<NativeOverlayResponse>
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
  ipcMain.handle(nativeOverlayIpcChannels.clearSurface, async (event, payload) =>
    bridge.clearSurface(
      withWindowId(payload, event, options.resolveWindowIdFromEvent) as NativeOverlayDetachPayload,
    ))
  ipcMain.handle(nativeOverlayIpcChannels.previewObstructionChanged, async (event, payload) => {
    const obstructed = typeof payload === 'object' && payload !== null && 'obstructed' in payload
      ? Boolean((payload as { obstructed?: unknown }).obstructed)
      : false
    const windowId = resolveWindowId(event, options.resolveWindowIdFromEvent)
    return bridge.setObstructed({ windowId, obstructed })
  })
}

const resolveWindowId = (
  event: unknown,
  resolveWindowIdFromEvent?: (event: unknown) => number | null,
): number => {
  const windowId = resolveWindowIdFromEvent?.(event) ?? null
  return typeof windowId === 'number' ? windowId : -1
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
