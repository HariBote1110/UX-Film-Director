import { describe, expect, it } from 'vitest';
import { buildSharedRendererPresentationContract } from '../utils/sharedRendererPresentationContract';
import {
  prepareSharedRendererViewportNativeOverlayPresent,
} from '../utils/sharedRendererViewportVideoUpload';
import {
  resolveNativeOverlayTransparentClearTransition,
  startSharedRendererViewportPresenter,
  NATIVE_OVERLAY_TRANSPARENT_CLEAR_INITIAL_STATE,
  type SharedRendererViewportNativeOverlayPresentResult,
} from '../utils/sharedRendererViewportPresenterOrchestration';
import type { RustBackendVideoDecodeBridge } from '../utils/rustBackendVideoDecodeControl';
import type { SharedRendererPreviewSession } from '../utils/sharedRendererPreviewSession';

/**
 * 実測オラクル（実機/GPU 無し）— 「動画をタイムラインから消してもキャンバスに
 * 動画フレームが残る」問題について、静的解析ではなく**実コードを実行して**
 * 以下の2点を白黒つける:
 *   Q1: 削除後のセッション（動画→空 / 動画→図形のみ）で、実
 *       prepareSharedRendererViewportNativeOverlayPresent が noVideoDecodeRequest
 *       を返し、実 resolveNativeOverlayTransparentClearTransition が
 *       shouldClear=true を出すか（＝Bug F クリアが発火する判定になるか）。
 *   Q2: in-flight の video present が、削除に伴う presenter 再起動（requestId の
 *       前進）で追い越されたとき、isRequestCurrent ガードが実際に present を
 *       抑止するか（hypothesis A ＋ 9048ff4c の実効性）。
 *
 * これらは純関数単体ではなく、overlay present の実 decode/present 経路を
 * 記録用モックブリッジで駆動する統合オラクルである。
 */

const videoClip = {
  clip_id: 'gopro',
  track_id: 'layer-0',
  media_id: 'gopro',
  source_frame: 10,
  z_index: 0,
  transform: {
    translation_x: 0,
    translation_y: 0,
    scale_x: 1,
    scale_y: 1,
    rotation_degrees: 0,
    sampling: 'bilinear' as const,
  },
  opacity: 1,
  effects: [],
};

const videoMedia = {
  id: 'gopro',
  kind: 'Video' as const,
  source: '/tmp/gopro.mp4',
  width: 1920,
  height: 1080,
  source_rate: { numerator: 60, denominator: 1 },
};

const shapeClip = {
  clip_id: 'rect-1',
  track_id: 'layer-0',
  media_id: 'rect-1',
  source_frame: 0,
  z_index: 0,
  transform: {
    translation_x: 0,
    translation_y: 0,
    scale_x: 1,
    scale_y: 1,
    rotation_degrees: 0,
    sampling: 'nearest' as const,
  },
  opacity: 1,
  effects: [],
};

const shapeMedia = {
  id: 'rect-1',
  kind: 'SolidColour' as const,
  source: '#ff0000',
  width: 200,
  height: 100,
};

const buildSession = (
  clips: unknown[],
  media: unknown[],
): SharedRendererPreviewSession => {
  const snapshot = {
    frame_index: 10,
    colour: {
      profile: 'rec709-sdr' as const,
      working_space: 'linear-light' as const,
      alpha: 'premultiplied' as const,
    },
    clips: clips as never,
  };
  return {
    plan: { mode: 'sharedRenderer', snapshot, media: media as never },
    surfaceGate: {
      ok: true,
      canvas: { width: 1920, height: 1080 },
      snapshot,
      media: media as never,
    },
    presentationContract: buildSharedRendererPresentationContract(),
  } as SharedRendererPreviewSession;
};

const videoOnlySession = buildSession([videoClip], [videoMedia]);
const emptySession = buildSession([], []);
const shapeOnlySession = buildSession([shapeClip], [shapeMedia]);

interface DecodeGate {
  release: () => void;
  gate: Promise<void>;
}

const createRecordingBridges = (options: {
  decodeGate?: DecodeGate;
} = {}) => {
  const events: string[] = [];
  const rustBackendBridge: RustBackendVideoDecodeBridge = {
    startVideoDecode: async (payload) => {
      events.push('startVideoDecode');
      return {
        success: true,
        result: {
          jobId: payload.jobId,
          memoryId: '/uxfd-node-video-ring',
          slotCount: payload.slotCount,
          slotByteLen: 8192,
          width: payload.width,
          height: payload.height,
          strideBytes: 256,
          sourceRate: payload.sourceRate,
          format: payload.format,
          colour: payload.colour,
        },
      };
    },
    requestVideoDecodeFrame: async (payload) => {
      events.push('requestVideoDecodeFrame');
      if (options.decodeGate) {
        // decode を in-flight のまま止め、追い越し（restart）を差し込ませる。
        await options.decodeGate.gate;
      }
      return {
        success: true,
        result: {
          accepted: true,
          jobId: payload.jobId,
          requestId: payload.requestId,
          frameIndex: payload.frameIndex,
          mode: payload.mode,
          frame: {
            descriptor: {
              memoryId: '/uxfd-node-video-ring',
              slotIndex: 0,
              generation: 3,
              byteOffset: 0,
              byteLen: 8192,
              width: 64,
              height: 32,
              strideBytes: 256,
              format: 'rgba8Srgb',
              colour: { primaries: 'bt709', transfer: 'srgb', matrix: 'rgb', range: 'full' },
            },
            ptsFrame: payload.frameIndex,
          },
          verification: {
            frameIndex: payload.frameIndex,
            checksum: { algorithm: 'crc32', valueHex: '12345678', byteLen: 8192 },
            status: 'withinTolerance',
          },
        },
      };
    },
    releaseVideoDecodeFrame: async (payload) => {
      events.push(`releaseVideoDecodeFrame:${payload.copyOutState}`);
      return { success: true };
    },
    stopVideoDecode: async (payload) => {
      events.push('stopVideoDecode');
      return { success: true, result: { stopped: true, jobId: payload.jobId } };
    },
  };
  const nativeOverlayBridge = {
    presentSharedFrame: async (payload: any) => {
      events.push('presentSharedFrame');
      return {
        success: true,
        attached: true,
        releaseFrame: {
          memoryId: payload.frame.descriptor.memoryId,
          slotIndex: payload.frame.descriptor.slotIndex,
          generation: payload.frame.descriptor.generation,
          ptsFrame: payload.frame.ptsFrame,
          copyOutState: 'gpuUploadFenceSignalled' as const,
        },
      };
    },
  };
  return { events, rustBackendBridge, nativeOverlayBridge };
};

describe('deleted clip residual frame integration oracle', () => {
  it('Q1a: video→empty deletion yields noVideoDecodeRequest and a Bug F clear decision', async () => {
    const { events, rustBackendBridge, nativeOverlayBridge } = createRecordingBridges();

    const result = await prepareSharedRendererViewportNativeOverlayPresent({
      windowId: 101,
      session: emptySession,
      requestId: 200,
      slotCount: 2,
      activeJob: null,
      rustBackendBridge,
      nativeOverlayBridge,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('empty session must not present a video frame');
    expect(result.reason).toBe('noVideoDecodeRequest');
    expect(events).not.toContain('presentSharedFrame');

    const transition = resolveNativeOverlayTransparentClearTransition(
      NATIVE_OVERLAY_TRANSPARENT_CLEAR_INITIAL_STATE,
      result as SharedRendererViewportNativeOverlayPresentResult,
    );
    expect(transition.shouldClear).toBe(true);
  });

  it('Q1b: video→shape-only deletion also yields noVideoDecodeRequest and a Bug F clear decision', async () => {
    const { events, rustBackendBridge, nativeOverlayBridge } = createRecordingBridges();

    const result = await prepareSharedRendererViewportNativeOverlayPresent({
      windowId: 102,
      session: shapeOnlySession,
      requestId: 201,
      slotCount: 2,
      activeJob: null,
      rustBackendBridge,
      nativeOverlayBridge,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('shape-only session must not present a video frame');
    expect(result.reason).toBe('noVideoDecodeRequest');
    expect(events).not.toContain('presentSharedFrame');

    const transition = resolveNativeOverlayTransparentClearTransition(
      NATIVE_OVERLAY_TRANSPARENT_CLEAR_INITIAL_STATE,
      result as SharedRendererViewportNativeOverlayPresentResult,
    );
    expect(transition.shouldClear).toBe(true);
  });

  it('Q1c: the full presenter start orchestration (what the restart effect calls) surfaces noVideoDecodeRequest for a deletion', async () => {
    // グルー（Viewport 再起動 effect）が実際に呼ぶ startSharedRendererViewportPresenter
    // まで実行し、その戻り値 nativeOverlayPresentResult が .then の Bug F clear
    // 判定へ noVideoDecodeRequest を渡すことを実測する。
    const { events, rustBackendBridge, nativeOverlayBridge } = createRecordingBridges();
    let presenterStarted = false;

    const result = await startSharedRendererViewportPresenter({
      canvas: {} as HTMLCanvasElement,
      session: emptySession,
      datasets: [],
      diagnosticSwatchEnabled: false,
      videoCutoverEnabled: true,
      nativeRenderPreviewEnabled: true,
      nativeOverlayPreviewEnabled: true,
      requireSharedRendererVideo: true,
      activeVideoDecodeJob: null,
      activeVideoDecodeJobs: [],
      requestId: 210,
      presentNativeOverlayDecodedFrame: (input: { session: SharedRendererPreviewSession; requestId?: number }) =>
        prepareSharedRendererViewportNativeOverlayPresent({
          ...input,
          nativeOverlayBridge,
          rustBackendBridge,
        }),
      // 空セッションでは video upload fallback も動画要求無しになる（既定実装は
      // window.rustBackend を触るため node 環境向けに注入）。
      prepareVideoUploads: async () => ({
        ok: false,
        reason: 'noVideoDecodeRequest',
        detail: 'no video',
        activeJobs: [],
      }),
      prepareVideoUpload: async () => ({
        ok: false,
        reason: 'noVideoDecodeRequest',
        detail: 'no video',
        activeJob: null,
      }),
      prepareNativeRenderUpload: async () => ({
        ok: false,
        reason: 'noVideoDecodeRequest',
        detail: 'no video',
        activeJobs: [],
      }),
      startPresenter: async () => {
        presenterStarted = true;
        return { ok: false, reason: 'noSharedRendererScene' } as never;
      },
    } as never);

    expect(presenterStarted).toBe(true);
    expect(result.nativeOverlayPresentResult?.ok).toBe(false);
    expect(result.nativeOverlayPresentResult && !result.nativeOverlayPresentResult.ok
      ? result.nativeOverlayPresentResult.reason
      : null).toBe('noVideoDecodeRequest');
    expect(events).not.toContain('presentSharedFrame');

    const transition = resolveNativeOverlayTransparentClearTransition(
      NATIVE_OVERLAY_TRANSPARENT_CLEAR_INITIAL_STATE,
      result.nativeOverlayPresentResult,
    );
    expect(transition.shouldClear).toBe(true);
  });

  it('Q2: an in-flight video present superseded by a restart (requestId bump) is suppressed, not painted', async () => {
    let released = false;
    let releaseGate: () => void = () => {};
    const gatePromise = new Promise<void>((resolve) => {
      releaseGate = () => {
        released = true;
        resolve();
      };
    });
    const gate: DecodeGate = { release: releaseGate, gate: gatePromise };
    const { events, rustBackendBridge, nativeOverlayBridge } = createRecordingBridges({ decodeGate: gate });

    // グローバル requestId カウンタ（Viewport の
    // sharedRendererVideoDecodeRequestIdRef を模す）。
    const requestIdRef = { current: 300 };
    const inFlightRequestId = requestIdRef.current;

    const presentPromise = prepareSharedRendererViewportNativeOverlayPresent({
      windowId: 103,
      session: videoOnlySession,
      requestId: inFlightRequestId,
      slotCount: 2,
      activeJob: null,
      rustBackendBridge,
      nativeOverlayBridge,
      isRequestCurrent: () => requestIdRef.current === inFlightRequestId,
    });

    // decode が in-flight のうちに削除→再起動が起きて requestId が前進する。
    await Promise.resolve();
    requestIdRef.current = 301;

    // decode 完了 → present 直前の isRequestCurrent ガードが評価される。
    gate.release();
    const result = await presentPromise;

    expect(released).toBe(true);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('superseded present must not report success');
    expect(result.reason).toBe('supersededRequest');
    // present は一度も呼ばれず、decode 済みスロットは解放される。
    expect(events).not.toContain('presentSharedFrame');
    expect(events).toContain('releaseVideoDecodeFrame:rendererUploadAborted');
  });
});
