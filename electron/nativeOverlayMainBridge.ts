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

/**
 * Bug E（Native_Overlay_Bug_E_Plan.md §4 Phase E2）— `ui:preview-obstruction-changed`
 * を受けた main が child NSWindow の z-order を切り替えるための payload。
 */
export interface NativeOverlaySetObstructedPayload {
  windowId: number
  obstructed: boolean
}

export interface NativeOverlayAddonDetachPayload extends NativeOverlayDetachPayload {
  nativeWindowHandle: Uint8Array
}

/**
 * 選択デコレーション — renderer（Viewport.tsx）が `getObjectWorldCorners` の
 * world 座標 quad（project 座標系・回転込みの四隅）を送る payload。
 * 空配列はデコレーション解除。native_window_handle は不要
 * （clearSurface / setObstructed と同じく addon 側の registry lookup で完結する）。
 */
export interface NativeOverlaySelectionDecorationQuad {
  topLeftX: number
  topLeftY: number
  topRightX: number
  topRightY: number
  bottomRightX: number
  bottomRightY: number
  bottomLeftX: number
  bottomLeftY: number
}

export interface NativeOverlaySelectionDecorationPayload {
  windowId: number
  canvasWidth: number
  canvasHeight: number
  quads: readonly NativeOverlaySelectionDecorationQuad[]
}

export interface NativeOverlaySharedFrameDescriptor {
  memoryId: string
  slotIndex: number
  generation: number
  byteOffset: number
  byteLen: number
  width: number
  height: number
  strideBytes: number
  format: string
}

export interface NativeOverlaySharedFramePayload {
  windowId: number
  mediaId: string
  snapshot?: unknown
  media?: readonly unknown[]
  slotCount: number
  frame: {
    descriptor: NativeOverlaySharedFrameDescriptor
    ptsFrame: number
  }
  /**
   * Bug B対策（症状B: 選択枠・本体フレームが2チャネル独立配信のため
   * ドラッグ中にズレる不具合）— この present と同じ (objects, time) から
   * 計算された選択デコレーション。addon 側は同梱があればグローバル state
   * の再読みなしにこの present へ使う（同梱が無ければ従来どおり
   * setSelectionDecoration が書き込んだ state へフォールバックする）。
   */
  selectionDecoration?: NativeOverlaySelectionDecorationQuadsPayload
}

export interface NativeOverlayScenePayload {
  windowId: number
  snapshot: unknown
  media: readonly unknown[]
  selectionDecoration?: NativeOverlaySelectionDecorationQuadsPayload
}

export interface NativeOverlaySelectionDecorationQuadsPayload {
  canvasWidth: number
  canvasHeight: number
  quads: readonly NativeOverlaySelectionDecorationQuad[]
}

export interface NativeOverlayAddonSharedFramePayload extends NativeOverlaySharedFramePayload {
  nativeWindowHandle: Uint8Array
}

export interface NativeOverlayReleaseFramePayload {
  memoryId: string
  slotIndex: number
  generation: number
  ptsFrame: number
  copyOutState: 'gpuUploadFenceSignalled'
}

export interface NativeOverlayResponse {
  success: boolean
  attached: boolean
  fallback?: 'webgpuPresenter'
  reason?: string
  releaseFrame?: NativeOverlayReleaseFramePayload
  livePreparedClipCount?: number
  liveReadbackNonTransparentPixels?: number
  liveReadbackChecksum?: number
  liveReadbackExportMaxChannelDelta?: number
}

export interface NativeOverlayAddon {
  attachNativeOverlay?: (payload: NativeOverlayAddonAttachPayload) => NativeOverlayResponse | Promise<NativeOverlayResponse>
  detachNativeOverlay?: (payload: NativeOverlayAddonDetachPayload) => NativeOverlayResponse | Promise<NativeOverlayResponse>
  presentNativeOverlayScene?: (payload: NativeOverlayScenePayload) => NativeOverlayResponse | Promise<NativeOverlayResponse>
  prepareNativeOverlaySources?: (payload: NativeOverlayScenePayload) => NativeOverlayResponse | Promise<NativeOverlayResponse>
  presentNativeOverlaySharedFrame?: (payload: NativeOverlayAddonSharedFramePayload) => NativeOverlayResponse | Promise<NativeOverlayResponse>
  clearNativeOverlayLiveSurface?: (payload: NativeOverlayDetachPayload) => NativeOverlayResponse | Promise<NativeOverlayResponse>
  setNativeOverlayObstructed?: (payload: NativeOverlaySetObstructedPayload) => NativeOverlayResponse | Promise<NativeOverlayResponse>
  setNativeOverlaySelectionDecoration?: (payload: NativeOverlaySelectionDecorationPayload) => NativeOverlayResponse | Promise<NativeOverlayResponse>
  getNativeOverlayCapabilities?: () => NativeOverlayCapabilities
  /**
   * Phase 7 (W7) 需要駆動staged attach（Phase 2）: nv12パイプラインの
   * バックグラウンド構築が完了したかどうかを返すポーリング用getter
   * （`native-overlay/src/lib.rs`の`isNv12PipelineReady`napi関数）。
   * addonが対応していない（古いビルド）場合は呼び出し元で`true`
   * 扱いにフォールバックする（Phase 2以前の単段構成と同じ挙動、
   * 安全側ではなく後方互換側のデフォルト——旧addonはnv12を常に
   * attach完了時点で構築済みだったため）。
   */
  isNv12PipelineReady?: (payload: NativeOverlayDetachPayload) => boolean | Promise<boolean>
}

export interface CreateNativeOverlayMainBridgeInput {
  env?: Record<string, string | undefined>
  cwd: string
  resourcesPath?: string
  existsSync?: (candidate: string) => boolean
  requireModule?: (modulePath: string) => NativeOverlayAddon
  resolveNativeWindowHandle?: (windowId: number) => Uint8Array | null
  resolveBackingScaleFactor?: (windowId: number) => number | null
  now?: () => number
  logDiagnostic?: (eventName: string, payload: unknown) => void
}

export interface NativeOverlayMainBridge {
  attach: (payload: NativeOverlayAttachPayload) => Promise<NativeOverlayResponse>
  detach: (payload: NativeOverlayDetachPayload) => Promise<NativeOverlayResponse>
  presentScene: (payload: NativeOverlayScenePayload) => Promise<NativeOverlayResponse>
  presentSharedFrame: (payload: NativeOverlaySharedFramePayload) => Promise<NativeOverlayResponse>
  clearSurface: (payload: NativeOverlayDetachPayload) => Promise<NativeOverlayResponse>
  setObstructed: (payload: NativeOverlaySetObstructedPayload) => Promise<NativeOverlayResponse>
  setSelectionDecoration: (payload: NativeOverlaySelectionDecorationPayload) => Promise<NativeOverlayResponse>
  getCapabilities: () => NativeOverlayCapabilities
  /** Phase 7 (W7) 需要駆動staged attach（Phase 2）: `NativeOverlayAddon.isNv12PipelineReady`参照。 */
  isNv12PipelineReady: (payload: NativeOverlayDetachPayload) => Promise<boolean>
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

const nativeOverlayEnabled = (env: Record<string, string | undefined>): boolean =>
  env.UXFD_NATIVE_OVERLAY !== '0' && env.VITE_UXFD_NATIVE_OVERLAY !== '0'

const nativeOverlayTraceEnabled = (env: Record<string, string | undefined>): boolean =>
  env.UXFD_DECODE_TRACE === '1'

const resolveCanonicalScaleFactor = (
  windowId: number,
  rendererScaleFactor: number,
  resolveBackingScaleFactor?: (windowId: number) => number | null,
): number => {
  const backingScaleFactor = resolveBackingScaleFactor?.(windowId) ?? null
  return typeof backingScaleFactor === 'number' && Number.isFinite(backingScaleFactor) && backingScaleFactor > 0
    ? backingScaleFactor
    : rendererScaleFactor
}

export const createNativeOverlayMainBridge = ({
  env = process.env,
  cwd,
  resourcesPath,
  existsSync,
  requireModule = defaultRequire as (modulePath: string) => NativeOverlayAddon,
  resolveNativeWindowHandle,
  resolveBackingScaleFactor,
  now = () => performance.now(),
  logDiagnostic,
}: CreateNativeOverlayMainBridgeInput): NativeOverlayMainBridge => {
  let loadedAddon: NativeOverlayAddon | null | undefined

  const loadAddon = (): NativeOverlayAddon | null => {
    if (loadedAddon !== undefined) {
      return loadedAddon
    }

    if (!nativeOverlayEnabled(env)) {
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
        || typeof addon.presentNativeOverlayScene === 'function'
        || typeof addon.presentNativeOverlaySharedFrame === 'function'
        || typeof addon.clearNativeOverlayLiveSurface === 'function'
        || typeof addon.setNativeOverlayObstructed === 'function'
        || typeof addon.setNativeOverlaySelectionDecoration === 'function'
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
      if (!nativeOverlayEnabled(env)) {
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
          scaleFactor: resolveCanonicalScaleFactor(payload.windowId, payload.scaleFactor, resolveBackingScaleFactor),
          nativeWindowHandle,
        })
      } catch (error) {
        return fallbackResponse(getErrorMessage(error))
      }
    },
    async detach(payload) {
      if (!nativeOverlayEnabled(env)) {
        return fallbackResponse('Native overlay preview is disabled.')
      }

      const addon = loadAddon()
      if (!addon || typeof addon.detachNativeOverlay !== 'function') {
        return fallbackResponse('Native overlay addon is unavailable.')
      }
      const nativeWindowHandle = resolveNativeWindowHandle?.(payload.windowId) ?? null
      if (!nativeWindowHandle) {
        return fallbackResponse('Native overlay window handle is unavailable.')
      }

      try {
        return await addon.detachNativeOverlay({
          ...payload,
          nativeWindowHandle,
        })
      } catch (error) {
        return fallbackResponse(getErrorMessage(error))
      }
    },
    async presentSharedFrame(payload) {
      if (!nativeOverlayEnabled(env)) {
        return fallbackResponse('Native overlay preview is disabled.')
      }

      const addon = loadAddon()
      if (!addon || typeof addon.presentNativeOverlaySharedFrame !== 'function') {
        return fallbackResponse('Native overlay addon is unavailable.')
      }
      const nativeWindowHandle = resolveNativeWindowHandle?.(payload.windowId) ?? null
      if (!nativeWindowHandle) {
        return fallbackResponse('Native overlay window handle is unavailable.')
      }

      try {
        const presentStartedAt = now()
        const response = await addon.presentNativeOverlaySharedFrame({
          ...payload,
          nativeWindowHandle,
        })
        if (nativeOverlayTraceEnabled(env)) {
          logDiagnostic?.('presentSharedFrameTrace', {
            mediaId: payload.mediaId,
            presentMs: now() - presentStartedAt,
            success: response.success,
            attached: response.attached,
            slotIndex: payload.frame.descriptor.slotIndex,
            generation: payload.frame.descriptor.generation,
            ptsFrame: payload.frame.ptsFrame,
            releaseGeneration: response.releaseFrame?.generation,
            releasePtsFrame: response.releaseFrame?.ptsFrame,
            livePreparedClipCount: response.livePreparedClipCount,
            liveReadbackNonTransparentPixels: response.liveReadbackNonTransparentPixels,
            liveReadbackChecksum: response.liveReadbackChecksum,
            liveReadbackExportMaxChannelDelta: response.liveReadbackExportMaxChannelDelta,
          })
        }
        return response
      } catch (error) {
        return fallbackResponse(getErrorMessage(error))
      }
    },
    async presentScene(payload) {
      if (!nativeOverlayEnabled(env)) {
        return fallbackResponse('Native overlay preview is disabled.')
      }

      const addon = loadAddon()
      if (!addon || typeof addon.presentNativeOverlayScene !== 'function') {
        return fallbackResponse('Native overlay direct scene presentation is unavailable.')
      }

      try {
        // beachball 対策 Fix 2: presentNativeOverlayScene は Electron main thread
        // 上で同期実行される（AppKit/Metal の描画自体を main thread から動かせない
        // ため）。PSD の fs::read+decode+composite だけを先に libuv threadpool へ
        // 逃がして対象 window の source cache を温めておくことで、直後の present
        // 経路はキャッシュ hit のみで完結し main thread を長時間塞がなくなる
        // （契約は native-overlay/src/lib.rs の
        // psd_source_cache_warm_then_present_incurs_zero_additional_decode を参照）。
        // prepare 自体が失敗しても present は通常どおり同期デコードにフォール
        // バックできるため、prepare のエラーは無視して present を続行する。
        if (typeof addon.prepareNativeOverlaySources === 'function') {
          try {
            await addon.prepareNativeOverlaySources(payload)
          } catch {
            // prepare は最適化のみが目的なので失敗は無視し、present の同期
            // デコードにフォールバックする。
          }
        }
        const presentStartedAt = now()
        const response = await addon.presentNativeOverlayScene(payload)
        if (nativeOverlayTraceEnabled(env)) {
          const traceSnapshot = payload.snapshot && typeof payload.snapshot === 'object'
            ? payload.snapshot as Record<string, unknown>
            : {}
          const traceMedia = payload.media.filter(
            (media): media is Record<string, unknown> =>
              media !== null && typeof media === 'object'
          )
          logDiagnostic?.('presentSceneTrace', {
            presentMs: now() - presentStartedAt,
            success: response.success,
            attached: response.attached,
            frameIndex: traceSnapshot.frameIndex,
            mediaIds: traceMedia.map((media) => media.id),
            mediaKinds: traceMedia.map((media) => media.kind),
            livePreparedClipCount: response.livePreparedClipCount,
            liveReadbackNonTransparentPixels: response.liveReadbackNonTransparentPixels,
            liveReadbackChecksum: response.liveReadbackChecksum,
            liveReadbackExportMaxChannelDelta: response.liveReadbackExportMaxChannelDelta,
          })
        }
        return response
      } catch (error) {
        return fallbackResponse(getErrorMessage(error))
      }
    },
    async isNv12PipelineReady(payload) {
      // Phase 7 (W7) 需要駆動staged attach（Phase 2）: attach後にVideo
      // クリップを含むシーンをoverlayへ流してよいかをTS側（Viewport.tsx）が
      // 判断するためのポーリング用getter。addon未対応（古いビルド）・
      // native overlay無効時は`true`（=常時ready扱い）にフォールバックする
      // ——旧addonは単段構成でattach完了時点で常にnv12も構築済みだった
      // ため、この関数が無いこと自体を「まだ準備できていない」と誤解して
      // 動画をpresenterに留め続けるのは誤り（後方互換のためのデフォルト、
      // `getCapabilities`等の「無効/未対応ならfalse」パターンとはあえて逆）。
      if (!nativeOverlayEnabled(env)) {
        return true
      }
      const addon = loadAddon()
      if (!addon || typeof addon.isNv12PipelineReady !== 'function') {
        return true
      }
      try {
        return await addon.isNv12PipelineReady({ windowId: payload.windowId })
      } catch {
        return true
      }
    },
    async clearSurface(payload) {
      // Bug D — clip 削除後 overlay の drawable に古いフレームが残る症状を潰す
      // ための単発 transparent clear present。attach/detach と同じ環境判定を
      // 用い、addon が対応していない場合は WebGPU presenter fallback を返す。
      if (!nativeOverlayEnabled(env)) {
        return fallbackResponse('Native overlay preview is disabled.')
      }

      const addon = loadAddon()
      if (!addon || typeof addon.clearNativeOverlayLiveSurface !== 'function') {
        return fallbackResponse('Native overlay addon is unavailable.')
      }

      try {
        return await addon.clearNativeOverlayLiveSurface({
          windowId: payload.windowId,
        })
      } catch (error) {
        return fallbackResponse(getErrorMessage(error))
      }
    },
    async setObstructed(payload) {
      // Bug E（計画書 §4 Phase E2）— ui:preview-obstruction-changed を受けた
      // main が child NSWindow の z-order を切り替える。clearSurface と同じく
      // native_window_handle は不要（addon 側の registry lookup で完結する）。
      if (!nativeOverlayEnabled(env)) {
        return fallbackResponse('Native overlay preview is disabled.')
      }

      const addon = loadAddon()
      if (!addon || typeof addon.setNativeOverlayObstructed !== 'function') {
        return fallbackResponse('Native overlay addon is unavailable.')
      }

      try {
        return await addon.setNativeOverlayObstructed({
          windowId: payload.windowId,
          obstructed: payload.obstructed,
        })
      } catch (error) {
        return fallbackResponse(getErrorMessage(error))
      }
    },
    async setSelectionDecoration(payload) {
      // 選択デコレーション — 選択枠・リサイズハンドルの見た目を addon 側で
      // scene present に上乗せ描画する。clearSurface / setObstructed と同じく
      // native_window_handle は不要（addon 側の registry lookup で完結する）。
      if (!nativeOverlayEnabled(env)) {
        return fallbackResponse('Native overlay preview is disabled.')
      }

      const addon = loadAddon()
      if (!addon || typeof addon.setNativeOverlaySelectionDecoration !== 'function') {
        return fallbackResponse('Native overlay addon is unavailable.')
      }

      try {
        return await addon.setNativeOverlaySelectionDecoration({
          windowId: payload.windowId,
          canvasWidth: payload.canvasWidth,
          canvasHeight: payload.canvasHeight,
          quads: payload.quads,
        })
      } catch (error) {
        return fallbackResponse(getErrorMessage(error))
      }
    },
    getCapabilities() {
      if (!nativeOverlayEnabled(env)) {
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
