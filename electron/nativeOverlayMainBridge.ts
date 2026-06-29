import { createRequire } from 'node:module'
import { resolveNativeOverlayBridgeModulePath } from './nativeOverlayBridgePath'

const defaultRequire = createRequire(`${process.cwd()}/package.json`)

export interface NativeOverlayAttachPayload {
  windowId: number
  x: number
  y: number
  width: number
  height: number
  scaleFactor: number
}

export interface NativeOverlayAddonAttachPayload extends NativeOverlayAttachPayload {
  nativeWindowHandle: Uint8Array
}

export interface NativeOverlayDetachPayload {
  windowId: number
}

export interface NativeOverlayResponse {
  success: boolean
  attached: boolean
  fallback?: 'webgpuPresenter'
  reason?: string
}

export interface NativeOverlayAddon {
  attachNativeOverlay?: (payload: NativeOverlayAddonAttachPayload) => NativeOverlayResponse | Promise<NativeOverlayResponse>
  detachNativeOverlay?: (payload: NativeOverlayDetachPayload) => NativeOverlayResponse | Promise<NativeOverlayResponse>
  getNativeOverlayCapabilities?: () => NativeOverlayCapabilities
}

export interface CreateNativeOverlayMainBridgeInput {
  env?: Record<string, string | undefined>
  cwd: string
  resourcesPath?: string
  existsSync?: (candidate: string) => boolean
  requireModule?: (modulePath: string) => NativeOverlayAddon
  resolveNativeWindowHandle?: (windowId: number) => Uint8Array | null
}

export interface NativeOverlayMainBridge {
  attach: (payload: NativeOverlayAttachPayload) => Promise<NativeOverlayResponse>
  detach: (payload: NativeOverlayDetachPayload) => Promise<NativeOverlayResponse>
  getCapabilities: () => NativeOverlayCapabilities
}

export interface NativeOverlayCapabilities {
  available: boolean
  reason?: string
}

const fallbackResponse = (reason: string): NativeOverlayResponse => ({
  success: false,
  attached: false,
  fallback: 'webgpuPresenter',
  reason,
})

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const createNativeOverlayMainBridge = ({
  env = process.env,
  cwd,
  resourcesPath,
  existsSync,
  requireModule = defaultRequire as (modulePath: string) => NativeOverlayAddon,
  resolveNativeWindowHandle,
}: CreateNativeOverlayMainBridgeInput): NativeOverlayMainBridge => {
  let loadedAddon: NativeOverlayAddon | null | undefined

  const loadAddon = (): NativeOverlayAddon | null => {
    if (loadedAddon !== undefined) {
      return loadedAddon
    }

    if (env.UXFD_NATIVE_OVERLAY !== '1') {
      loadedAddon = null
      return loadedAddon
    }

    const modulePath = resolveNativeOverlayBridgeModulePath({
      env,
      cwd,
      resourcesPath,
      existsSync,
    })
    if (!modulePath) {
      loadedAddon = null
      return loadedAddon
    }

    try {
      const addon = requireModule(modulePath)
      loadedAddon = typeof addon.attachNativeOverlay === 'function'
        || typeof addon.detachNativeOverlay === 'function'
        || typeof addon.getNativeOverlayCapabilities === 'function'
        ? addon
        : null
    } catch {
      loadedAddon = null
    }

    return loadedAddon
  }

  return {
    async attach(payload) {
      if (env.UXFD_NATIVE_OVERLAY !== '1') {
        return fallbackResponse('Native overlay preview is disabled.')
      }

      const addon = loadAddon()
      if (!addon || typeof addon.attachNativeOverlay !== 'function') {
        return fallbackResponse('Native overlay addon is unavailable.')
      }
      const nativeWindowHandle = resolveNativeWindowHandle?.(payload.windowId) ?? null
      if (!nativeWindowHandle) {
        return fallbackResponse('Native overlay window handle is unavailable.')
      }

      try {
        return await addon.attachNativeOverlay({
          ...payload,
          nativeWindowHandle,
        })
      } catch (error) {
        return fallbackResponse(getErrorMessage(error))
      }
    },
    async detach(payload) {
      const addon = loadAddon()
      if (!addon || typeof addon.detachNativeOverlay !== 'function') {
        return fallbackResponse('Native overlay addon is unavailable.')
      }

      try {
        return await addon.detachNativeOverlay(payload)
      } catch (error) {
        return fallbackResponse(getErrorMessage(error))
      }
    },
    getCapabilities() {
      if (env.UXFD_NATIVE_OVERLAY !== '1') {
        return {
          available: false,
          reason: 'Native overlay preview is disabled.',
        }
      }

      const addon = loadAddon()
      if (!addon || typeof addon.getNativeOverlayCapabilities !== 'function') {
        return {
          available: false,
          reason: 'Native overlay addon is unavailable.',
        }
      }

      try {
        return addon.getNativeOverlayCapabilities()
      } catch (error) {
        return {
          available: false,
          reason: getErrorMessage(error),
        }
      }
    },
  }
}
