import type {
  NativeOverlayAttachPayload,
  NativeOverlayDetachPayload,
  NativeOverlayResponse,
  NativeOverlayScenePayload,
  NativeOverlaySelectionDecorationPayload,
  NativeOverlaySharedFramePayload,
} from './nativeOverlayMainBridge'

export const nativeOverlayIpcChannels = {
  attach: 'native-overlay-attach',
  detach: 'native-overlay-detach',
  presentSharedFrame: 'native-overlay-present-shared-frame',
  presentScene: 'native-overlay-present-scene',
  capabilities: 'native-overlay-capabilities',
  // Bug D — clip 削除後 overlay の drawable に古いフレームが残る症状を
  // 潰すための独立 channel。scene 空遷移 / unmount / project 切替の
  // 3 経路から window 単位で呼ばれる。
  clearSurface: 'native-overlay-clear-surface',
  // 選択デコレーション — SceneSelectionOverlay（SVG）が child NSWindow 化された
  // native overlay に隠れるため、選択枠・リサイズハンドルの見た目を addon 側
  // （Rust/wgpu）で描く。renderer が world 座標 quad を送る channel。
  setSelectionDecoration: 'native-overlay-set-selection-decoration',
  // Phase 7 (W7) 需要駆動staged attach（Phase 2）: nv12パイプラインの
  // バックグラウンド構築完了をrendererがポーリングするためのchannel。
  isNv12PipelineReady: 'native-overlay-is-nv12-pipeline-ready',
} as const

export interface NativeOverlayCapabilities {
  available: boolean
  reason?: string
}

export interface NativeOverlayIpcMainLike {
  handle: (
    channel: string,
    handler: (event: unknown, payload: unknown) => Promise<unknown>,
  ) => void
}

export interface NativeOverlayIpcBridge {
  attach: (payload: NativeOverlayAttachPayload) => Promise<NativeOverlayResponse>
  detach: (payload: NativeOverlayDetachPayload) => Promise<NativeOverlayResponse>
  presentSharedFrame: (payload: NativeOverlaySharedFramePayload) => Promise<NativeOverlayResponse>
  presentScene: (payload: NativeOverlayScenePayload) => Promise<NativeOverlayResponse>
  clearSurface: (payload: NativeOverlayDetachPayload) => Promise<NativeOverlayResponse>
  setSelectionDecoration: (payload: NativeOverlaySelectionDecorationPayload) => Promise<NativeOverlayResponse>
  getCapabilities: () => NativeOverlayCapabilities
  isNv12PipelineReady: (payload: NativeOverlayDetachPayload) => Promise<boolean>
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
      withWindowId(
        payload,
        event,
        options.resolveWindowIdFromEvent,
      ) as unknown as NativeOverlaySharedFramePayload,
    ))
  ipcMain.handle(nativeOverlayIpcChannels.presentScene, async (event, payload) =>
    bridge.presentScene(
      withWindowId(
        payload,
        event,
        options.resolveWindowIdFromEvent,
      ) as unknown as NativeOverlayScenePayload,
    ))
  ipcMain.handle(nativeOverlayIpcChannels.capabilities, async () =>
    bridge.getCapabilities())
  ipcMain.handle(nativeOverlayIpcChannels.clearSurface, async (event, payload) =>
    bridge.clearSurface(
      withWindowId(payload, event, options.resolveWindowIdFromEvent) as NativeOverlayDetachPayload,
    ))
  ipcMain.handle(nativeOverlayIpcChannels.setSelectionDecoration, async (event, payload) =>
    bridge.setSelectionDecoration(
      withWindowId(payload, event, options.resolveWindowIdFromEvent) as unknown as NativeOverlaySelectionDecorationPayload,
    ))
  ipcMain.handle(nativeOverlayIpcChannels.isNv12PipelineReady, async (event, payload) =>
    bridge.isNv12PipelineReady(
      withWindowId(payload, event, options.resolveWindowIdFromEvent) as NativeOverlayDetachPayload,
    ))
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
