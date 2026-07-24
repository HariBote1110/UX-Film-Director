import { ipcRenderer, contextBridge, webUtils } from 'electron'
import { createRequire } from 'node:module'
import { resolveSharedVideoFrameNativeBridgeModulePath } from './sharedVideoFrameNativeBridgePath'
import { rustVideoEncodeIpcChannels } from './rustVideoEncodeIpc'
import { nativeOverlayIpcChannels } from './nativeOverlayIpc'

const require = createRequire(`${process.cwd()}/package.json`)

type SharedVideoFrameCopyPayload = {
  memoryId: string
  slotCount: number
  slotByteLen: number
  slotIndex: number
  generation: number
  ptsFrame: number
}

type SharedVideoFramePresentedFramePayload = {
  encodeSessionId: string
  memoryId: string
  frameIndex: number
  timestampUs: number
  width: number
  height: number
  fps: number
  device: unknown
  texture: unknown
  format: string
  canvasSize: {
    width: number
    height: number
  }
}

type SharedVideoFramePresentedFrameHandoffCapabilities = {
  available: boolean
  reason?: string
}

type SharedVideoFrameCopyResult = {
  success: boolean
  result?: {
    sequence: number
    slotIndex: number
    generation: number
    byteLen: number
    checksumAlgorithm: 'crc32'
    expectedChecksum: number
    actualChecksum: number
  }
  copiedBytes?: Uint8Array
  error?: string
}

type SharedVideoFramePresentedFrameResult = {
  success: boolean
  result?: unknown
  error?: string
}

type SharedVideoFrameSharedCopyPayload = SharedVideoFrameCopyPayload & {
  // window.postMessageで登録済みのSharedArrayBufferを指す参照。
  // contextBridgeはSAB/viewをクローンできないため、copy呼び出しは
  // この文字列参照のみを渡す。
  sharedUploadBufferId: string
}

type SharedVideoFrameNativeBridge = {
  getPresentedFrameHandoffCapabilities?: () => SharedVideoFramePresentedFrameHandoffCapabilities
  copyIntoUploadBuffer?: (
    payload: SharedVideoFrameCopyPayload,
    target: Uint8Array
  ) => Promise<SharedVideoFrameCopyResult> | SharedVideoFrameCopyResult
  // SAB zero-copy経路（addon未更新なら存在しない）。copy report契約は
  // copyIntoUploadBufferと同一。
  copyIntoSharedUploadBuffer?: (
    payload: SharedVideoFrameCopyPayload,
    target: Uint8Array
  ) => Promise<SharedVideoFrameCopyResult> | SharedVideoFrameCopyResult
  takePresentedFrameSharedFrame?: (
    payload: SharedVideoFramePresentedFramePayload
  ) => Promise<SharedVideoFramePresentedFrameResult> | SharedVideoFramePresentedFrameResult
}

let sharedVideoFrameNativeBridge: SharedVideoFrameNativeBridge | null | undefined

const loadSharedVideoFrameNativeBridge = (): SharedVideoFrameNativeBridge | null => {
  if (sharedVideoFrameNativeBridge !== undefined) {
    return sharedVideoFrameNativeBridge
  }

  const modulePath = resolveSharedVideoFrameNativeBridgeModulePath({
    env: process.env,
    cwd: process.cwd(),
    resourcesPath: process.resourcesPath,
  })
  if (!modulePath) {
    sharedVideoFrameNativeBridge = null
    return sharedVideoFrameNativeBridge
  }

  try {
    const loaded = require(modulePath) as Partial<SharedVideoFrameNativeBridge>
    sharedVideoFrameNativeBridge = typeof loaded.copyIntoUploadBuffer === 'function'
      || typeof loaded.getPresentedFrameHandoffCapabilities === 'function'
      || typeof loaded.takePresentedFrameSharedFrame === 'function'
      ? loaded as SharedVideoFrameNativeBridge
      : null
  } catch {
    sharedVideoFrameNativeBridge = null
  }

  return sharedVideoFrameNativeBridge
}

contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

contextBridge.exposeInMainWorld('electronFile', {
  getPathForFile(file: File) {
    return webUtils.getPathForFile(file)
  },
})

contextBridge.exposeInMainWorld('rustBackend', {
  health() {
    return ipcRenderer.invoke('rust-backend-health')
  },
  echo(payload: unknown) {
    return ipcRenderer.invoke('rust-backend-echo', payload)
  },
  replaceScene(payload: unknown) {
    return ipcRenderer.invoke('rust-backend-scene-replace', payload)
  },
  evaluateScene(payload: unknown) {
    return ipcRenderer.invoke('rust-backend-scene-evaluate', payload)
  },
  startScenePlayback(payload: unknown) {
    return ipcRenderer.invoke('rust-backend-scene-playback-start', payload)
  },
  pauseScenePlayback() {
    return ipcRenderer.invoke('rust-backend-scene-playback-pause')
  },
  stopScenePlayback() {
    return ipcRenderer.invoke('rust-backend-scene-playback-stop')
  },
  startVideoDecode(payload: unknown) {
    return ipcRenderer.invoke('rust-backend-decode-start', payload)
  },
  requestVideoDecodeFrame(payload: unknown) {
    return ipcRenderer.invoke('rust-backend-decode-request-frame', payload)
  },
  requestVideoDecodeFrameInline(payload: unknown) {
    return ipcRenderer.invoke('rust-backend-decode-request-frame-inline', payload)
  },
  stopVideoDecode(payload: unknown) {
    return ipcRenderer.invoke('rust-backend-decode-stop', payload)
  },
  releaseVideoDecodeFrame(payload: unknown) {
    return ipcRenderer.invoke('rust-backend-decode-release-frame', payload)
  },
  renderNativeSharedFrame(payload: unknown) {
    return ipcRenderer.invoke('rust-backend-render-native-shared-frame', payload)
  },
  releaseNativeSharedFrame(payload: unknown) {
    return ipcRenderer.invoke('rust-backend-render-release-native-shared-frame', payload)
  },
  requestAudioWaveformSamples(payload: unknown) {
    return ipcRenderer.invoke('rust-backend-audio-waveform-samples', payload)
  },
  listFonts() {
    return ipcRenderer.invoke('rust-backend-fonts-list')
  },
})

contextBridge.exposeInMainWorld('rustVideoEncoder', {
  nativeDirectEncodeEnabled: process.env.VITE_UXFD_NATIVE_DIRECT_ENCODE === '1',
  startVideoEncode(payload: unknown) {
    return ipcRenderer.invoke(rustVideoEncodeIpcChannels.start, payload)
  },
  writeVideoEncodeFrame(payload: unknown) {
    return ipcRenderer.invoke(rustVideoEncodeIpcChannels.writeFrame, payload)
  },
  writeNativeEncodeFrame(payload: unknown) {
    return ipcRenderer.invoke(rustVideoEncodeIpcChannels.writeNativeFrame, payload)
  },
  writeResidentSceneEncodeFrame(payload: unknown) {
    return ipcRenderer.invoke(rustVideoEncodeIpcChannels.writeResidentSceneFrame, payload)
  },
  transcodeVideo(payload: unknown) {
    return ipcRenderer.invoke(rustVideoEncodeIpcChannels.transcodeVideo, payload)
  },
  onTranscodeProgress(listener: (event: unknown) => void) {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on(rustVideoEncodeIpcChannels.transcodeVideoProgress, wrapped)
    return () => ipcRenderer.off(rustVideoEncodeIpcChannels.transcodeVideoProgress, wrapped)
  },
  finishVideoEncode(payload: unknown) {
    return ipcRenderer.invoke(rustVideoEncodeIpcChannels.finish, payload)
  },
  abortVideoEncode(payload: unknown) {
    return ipcRenderer.invoke(rustVideoEncodeIpcChannels.abort, payload)
  },
})

contextBridge.exposeInMainWorld('nativeOverlay', {
  getCapabilities() {
    return ipcRenderer.invoke(nativeOverlayIpcChannels.capabilities)
  },
  attach(payload: unknown) {
    return ipcRenderer.invoke(nativeOverlayIpcChannels.attach, payload)
  },
  detach(payload: unknown) {
    return ipcRenderer.invoke(nativeOverlayIpcChannels.detach, payload)
  },
  presentSharedFrame(payload: unknown) {
    return ipcRenderer.invoke(nativeOverlayIpcChannels.presentSharedFrame, payload)
  },
  presentScene(payload: unknown) {
    return ipcRenderer.invoke(nativeOverlayIpcChannels.presentScene, payload)
  },
  clearSurface(payload: unknown) {
    // Bug D — scene 空遷移 / unmount / project 切替のいずれかで発火する
    // 単発 transparent clear。addon 側で drawable を全 pixel alpha=0 に
    // 塗り替えるため、削除前フレームが CAMetalLayer に残らなくなる。
    return ipcRenderer.invoke(nativeOverlayIpcChannels.clearSurface, payload)
  },
  setSelectionDecoration(payload: unknown) {
    // 選択デコレーション — SceneSelectionOverlay（SVG）は child NSWindow 化
    // された native overlay に隠れるため、選択枠・リサイズハンドルの見た目を
    // addon 側（Rust/wgpu）が scene present の最後に上乗せ描画する。
    return ipcRenderer.invoke(nativeOverlayIpcChannels.setSelectionDecoration, payload)
  },
})

contextBridge.exposeInMainWorld('sharedVideoFrame', {
  getPresentedFrameHandoffCapabilities() {
    const bridge = loadSharedVideoFrameNativeBridge()
    if (!bridge || typeof bridge.getPresentedFrameHandoffCapabilities !== 'function') {
      return {
        available: false,
        reason: 'Shared video frame presented-frame native handoff capability is unavailable.',
      }
    }

    return bridge.getPresentedFrameHandoffCapabilities()
  },
  async takePresentedFrameSharedFrame(payload: SharedVideoFramePresentedFramePayload) {
    const bridge = loadSharedVideoFrameNativeBridge()
    if (!bridge || typeof bridge.takePresentedFrameSharedFrame !== 'function') {
      return {
        success: false,
        error: 'Shared video frame presented-frame native handoff is unavailable.',
      }
    }

    return bridge.takePresentedFrameSharedFrame(payload)
  },
  async copyIntoUploadBuffer(payload: SharedVideoFrameCopyPayload, target: Uint8Array) {
    const bridge = loadSharedVideoFrameNativeBridge()
    if (!bridge || typeof bridge.copyIntoUploadBuffer !== 'function') {
      return {
        success: false,
        error: 'Shared video frame native bridge is unavailable.',
      }
    }

    const response = await bridge.copyIntoUploadBuffer(payload, target)
    if (!response.success) return response
    return {
      ...response,
      copiedBytes: target,
    }
  },
  async copyIntoSharedUploadBuffer(payload: SharedVideoFrameSharedCopyPayload) {
    // rendererがwindow.postMessageで登録したSABのviewへaddonが直接memcpyする
    // zero-copy経路。画素はcontextBridgeを一切通らない（copiedBytesのエコー
    // バックも行わない）。sharedUploadUnavailable: true はrenderer側が既存の
    // copyIntoUploadBuffer経路へ自動フォールバックしてよい合図。
    const bridge = loadSharedVideoFrameNativeBridge()
    if (!bridge || typeof bridge.copyIntoSharedUploadBuffer !== 'function') {
      return {
        success: false,
        sharedUploadUnavailable: true,
        error: 'Shared video frame native bridge shared-upload entry is unavailable.',
      }
    }
    const target = sharedUploadBufferRegistry.get(payload.sharedUploadBufferId)
    if (!target) {
      return {
        success: false,
        sharedUploadUnavailable: true,
        error: `Shared upload buffer is not registered: ${payload.sharedUploadBufferId}`,
      }
    }
    const { sharedUploadBufferId: _sharedUploadBufferId, ...corePayload } = payload

    return bridge.copyIntoSharedUploadBuffer(corePayload, target)
  },
})

// SAB zero-copy経路のバッファ登録簿 — ElectronのcontextBridgeはSharedArrayBuffer
// （バックのview含む）を「An object could not be cloned.」で拒否するため、SAB
// 本体はwindow.postMessage（本物の構造化クローンが走り、SABのバッキングメモリ
// は共有される）で一回だけ受け取ってここに保持する。以後のcopy呼び出しは
// bufferIdの文字列参照だけがcontextBridgeを通る。
const sharedUploadBufferRegistry = new Map<string, Uint8Array>()

window.addEventListener('message', (event) => {
  const data = event.data as { type?: unknown; bufferId?: unknown; buffer?: unknown } | null
  if (!data || typeof data !== 'object' || typeof data.bufferId !== 'string') return
  if (data.type === 'uxfd:registerSharedUploadBuffer') {
    if (!(data.buffer instanceof SharedArrayBuffer)) return
    sharedUploadBufferRegistry.set(data.bufferId, new Uint8Array(data.buffer))
    // renderer側(src/utils/sharedVideoFrameUploadBridge.ts)が登録完了を
    // awaitできるようackを返す
    window.postMessage({ type: 'uxfd:sharedUploadBufferRegistered', bufferId: data.bufferId }, '*')
    return
  }
  if (data.type === 'uxfd:releaseSharedUploadBuffer') {
    // byteLen変更等でringが作り直された時、旧解像度のSABを保持し続けない
    sharedUploadBufferRegistry.delete(data.bufferId)
  }
})
