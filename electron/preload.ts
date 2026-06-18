import { ipcRenderer, contextBridge } from 'electron'
import { createRequire } from 'node:module'
import { resolveSharedVideoFrameNativeBridgeModulePath } from './sharedVideoFrameNativeBridgePath'
import { rustVideoEncodeIpcChannels } from './rustVideoEncodeIpc'

const require = createRequire(import.meta.url)

type SharedVideoFrameCopyPayload = {
  memoryId: string
  slotCount: number
  slotByteLen: number
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

type SharedVideoFrameCopyResult = {
  success: boolean
  result?: {
    sequence: number
    byteLen: number
    expectedChecksum: number
    actualChecksum: number
    rgbaBytes?: Uint8Array
  }
  error?: string
}

type SharedVideoFrameWritableRingPayload = {
  memoryId: string
  slotCount: number
  slotByteLen: number
}

type SharedVideoFrameWritableWritePayload = {
  memoryId: string
  ptsFrame: number
}

type SharedVideoFrameWritableClosePayload = {
  memoryId: string
}

type SharedVideoFrameWritableResult = {
  success: boolean
  result?: unknown
  error?: string
}

type SharedVideoFrameNativeBridge = {
  copyIntoUploadBuffer?: (
    payload: SharedVideoFrameCopyPayload,
    target: Uint8Array
  ) => Promise<SharedVideoFrameCopyResult> | SharedVideoFrameCopyResult
  takePresentedFrameSharedFrame?: (
    payload: SharedVideoFramePresentedFramePayload
  ) => Promise<SharedVideoFrameWritableResult> | SharedVideoFrameWritableResult
  createWritableSharedFrameRing?: (
    payload: SharedVideoFrameWritableRingPayload
  ) => Promise<SharedVideoFrameWritableResult> | SharedVideoFrameWritableResult
  writeIntoSharedFrameRing?: (
    payload: SharedVideoFrameWritableWritePayload,
    source: Uint8Array
  ) => Promise<SharedVideoFrameWritableResult> | SharedVideoFrameWritableResult
  closeWritableSharedFrameRing?: (
    payload: SharedVideoFrameWritableClosePayload
  ) => Promise<SharedVideoFrameWritableResult> | SharedVideoFrameWritableResult
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
      || typeof loaded.takePresentedFrameSharedFrame === 'function'
      || typeof loaded.createWritableSharedFrameRing === 'function'
      || typeof loaded.writeIntoSharedFrameRing === 'function'
      || typeof loaded.closeWritableSharedFrameRing === 'function'
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
  stopVideoDecode(payload: unknown) {
    return ipcRenderer.invoke('rust-backend-decode-stop', payload)
  },
  releaseVideoDecodeFrame(payload: unknown) {
    return ipcRenderer.invoke('rust-backend-decode-release-frame', payload)
  },
})

contextBridge.exposeInMainWorld('rustVideoEncoder', {
  startVideoEncode(payload: unknown) {
    return ipcRenderer.invoke(rustVideoEncodeIpcChannels.start, payload)
  },
  writeVideoEncodeFrame(payload: unknown) {
    return ipcRenderer.invoke(rustVideoEncodeIpcChannels.writeFrame, payload)
  },
  finishVideoEncode(payload: unknown) {
    return ipcRenderer.invoke(rustVideoEncodeIpcChannels.finish, payload)
  },
})

contextBridge.exposeInMainWorld('sharedVideoFrame', {
  async createWritableSharedFrameRing(payload: SharedVideoFrameWritableRingPayload) {
    const bridge = loadSharedVideoFrameNativeBridge()
    if (!bridge || typeof bridge.createWritableSharedFrameRing !== 'function') {
      return {
        success: false,
        error: 'Shared video frame writable native bridge is unavailable.',
      }
    }

    return bridge.createWritableSharedFrameRing(payload)
  },
  async writeIntoSharedFrameRing(payload: SharedVideoFrameWritableWritePayload, source: Uint8Array) {
    const bridge = loadSharedVideoFrameNativeBridge()
    if (!bridge || typeof bridge.writeIntoSharedFrameRing !== 'function') {
      return {
        success: false,
        error: 'Shared video frame writable native bridge is unavailable.',
      }
    }

    return bridge.writeIntoSharedFrameRing(payload, source)
  },
  async closeWritableSharedFrameRing(payload: SharedVideoFrameWritableClosePayload) {
    const bridge = loadSharedVideoFrameNativeBridge()
    if (!bridge || typeof bridge.closeWritableSharedFrameRing !== 'function') {
      return {
        success: false,
        error: 'Shared video frame writable native bridge is unavailable.',
      }
    }

    return bridge.closeWritableSharedFrameRing(payload)
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
    if (!response.success || !response.result) {
      return response
    }

    return {
      ...response,
      result: {
        ...response.result,
        rgbaBytes: target,
      },
    }
  },
})
