import { ipcRenderer, contextBridge } from 'electron'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

type SharedVideoFrameCopyPayload = {
  memoryId: string
  slotCount: number
  slotByteLen: number
  ptsFrame: number
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

type SharedVideoFrameNativeBridge = {
  copyIntoUploadBuffer: (
    payload: SharedVideoFrameCopyPayload,
    target: Uint8Array
  ) => Promise<SharedVideoFrameCopyResult> | SharedVideoFrameCopyResult
}

let sharedVideoFrameNativeBridge: SharedVideoFrameNativeBridge | null | undefined

const loadSharedVideoFrameNativeBridge = (): SharedVideoFrameNativeBridge | null => {
  if (sharedVideoFrameNativeBridge !== undefined) {
    return sharedVideoFrameNativeBridge
  }

  const modulePath = process.env.UXFD_SHARED_VIDEO_FRAME_BRIDGE_MODULE
  if (!modulePath) {
    sharedVideoFrameNativeBridge = null
    return sharedVideoFrameNativeBridge
  }

  try {
    const loaded = require(modulePath) as Partial<SharedVideoFrameNativeBridge>
    sharedVideoFrameNativeBridge = typeof loaded.copyIntoUploadBuffer === 'function'
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
  releaseVideoDecodeFrame(payload: unknown) {
    return ipcRenderer.invoke('rust-backend-decode-release-frame', payload)
  },
})

contextBridge.exposeInMainWorld('sharedVideoFrame', {
  async copyIntoUploadBuffer(payload: SharedVideoFrameCopyPayload, target: Uint8Array) {
    const bridge = loadSharedVideoFrameNativeBridge()
    if (!bridge) {
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
