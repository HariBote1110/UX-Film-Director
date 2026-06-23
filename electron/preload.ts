import { ipcRenderer, contextBridge, webUtils } from 'electron'
import { createRequire } from 'node:module'
import { resolveSharedVideoFrameNativeBridgeModulePath } from './sharedVideoFrameNativeBridgePath'
import { rustVideoEncodeIpcChannels } from './rustVideoEncodeIpc'

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

type SharedVideoFrameNativeBridge = {
  getPresentedFrameHandoffCapabilities?: () => SharedVideoFramePresentedFrameHandoffCapabilities
  copyIntoUploadBuffer?: (
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
})
