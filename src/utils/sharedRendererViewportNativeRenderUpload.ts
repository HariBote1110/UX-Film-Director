import {
  releaseRustBackendNativeSharedFrame,
  renderRustBackendNativeSharedFrame,
  type RustBackendNativeRenderAudioWaveform,
  type RustBackendNativeRenderReleaseSharedFramePayload,
  type RustBackendNativeRenderSharedFramePayload,
  type RustBackendNativeRenderSharedFrameResult,
} from './rustBackendNativeRenderControl';
import {
  requestRustBackendAudioWaveformSamples,
  type RustBackendAudioWaveformBridge,
} from './rustBackendAudioWaveformControl';
import type { RustBackendResult } from './rustBackendVideoDecodeControl';
import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
import { isNativeOverlayDirectMediaSourceSupported } from './nativeOverlayDirectMediaSupport';
import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';
import {
  prepareSharedRendererDecodedVideoFrameUpload,
  type PrepareSharedRendererDecodedVideoFrameUploadResult,
  type SharedVideoFrameCopyBridge,
} from './sharedVideoFrameUploadBridge';
import { canRenderSharedRendererNativeMediaOnlyFrame } from './sharedRendererNativeMediaSupport';
import { resolveMixedNativeRenderUnsupportedMedia } from './sharedRendererNativeRenderMediaGate';
import {
  prepareSharedRendererViewportNativeRenderSources,
  resolveNativeRenderSourceReleaseUnavailable,
  type PrepareSharedRendererViewportNativeRenderSourcesInput,
  type PrepareSharedRendererViewportNativeRenderSourcesResult,
  type SharedRendererViewportNativeRenderSource,
} from './sharedRendererViewportNativeRenderSource';
import type { SharedRendererViewportVideoDecodeJob } from './sharedRendererViewportVideoUpload';
import {
  toNativeOverlaySceneMediaPayload,
  toNativeOverlaySceneSnapshotPayload,
  type NativeOverlayDecodedFrameBridge,
} from './sharedRendererRustVideoUploadPipeline';
import type { SelectionDecorationPayload } from './nativeOverlaySelectionDecoration';

type PreparedNativeRenderUpload = Extract<
  PrepareSharedRendererDecodedVideoFrameUploadResult,
  { ok: true }
>;

export interface SharedRendererNativeRenderDiagnostics {
  decodePaths: string[];
  renderPath?: string;
  nv12ZeroCopyMediaIds: string[];
}

export type SharedRendererViewportNativeRenderSourcesPreparer = (
  input: PrepareSharedRendererViewportNativeRenderSourcesInput
) => Promise<PrepareSharedRendererViewportNativeRenderSourcesResult>;

export type SharedRendererViewportNativeSharedFrameRenderer = (
  payload: RustBackendNativeRenderSharedFramePayload
) => Promise<RustBackendResult<RustBackendNativeRenderSharedFrameResult>>;

export type SharedRendererViewportNativeSharedFrameReleaser = (
  payload: RustBackendNativeRenderReleaseSharedFramePayload
) => Promise<RustBackendResult>;

export interface PrepareSharedRendererViewportNativeRenderUploadInput {
  session: SharedRendererPreviewSession;
  requestId?: number;
  activeJobs?: readonly SharedRendererViewportVideoDecodeJob[];
  sourceSlotCount?: number;
  maxDecodeEdge?: number | null;
  outputSlotCount?: number;
  discardNativeRenderOutputForBenchmark?: boolean;
  prepareNativeRenderSources?: SharedRendererViewportNativeRenderSourcesPreparer;
  renderNativeSharedFrame?: SharedRendererViewportNativeSharedFrameRenderer;
  releaseNativeSharedFrame?: SharedRendererViewportNativeSharedFrameReleaser;
  requestAudioWaveformSamples?: RustBackendAudioWaveformBridge['requestAudioWaveformSamples'];
  copyBridge?: SharedVideoFrameCopyBridge;
}

export type PrepareSharedRendererViewportNativeRenderUploadResult =
  | {
      ok: true;
      activeJobs: SharedRendererViewportVideoDecodeJob[];
      upload: PreparedNativeRenderUpload;
      diagnostics: SharedRendererNativeRenderDiagnostics;
    }
  | {
      ok: false;
      reason:
        | 'surfaceGateUnavailable'
        | 'nativeRenderSourcesUnavailable'
        | 'preparedNativeRenderSourceAbortReleaseFailed'
        | 'nativeRenderSourceReleaseUnavailable'
        | 'nativeRenderSourceReleaseFailed'
        | 'nativeRenderOutputReleaseFailed'
        | 'nativeRenderUnsupportedMedia'
        | 'nativeRenderUnsupportedMediaOnly'
        | 'nativeRenderFailed'
        | 'uploadFailed';
      detail: string;
      activeJobs: SharedRendererViewportVideoDecodeJob[];
    };

export const prepareSharedRendererViewportNativeRenderUpload = async ({
  session,
  requestId,
  activeJobs = [],
  sourceSlotCount = 2,
  maxDecodeEdge,
  outputSlotCount = 1,
  discardNativeRenderOutputForBenchmark = false,
  prepareNativeRenderSources = prepareSharedRendererViewportNativeRenderSources,
  renderNativeSharedFrame = renderRustBackendNativeSharedFrame,
  releaseNativeSharedFrame = releaseRustBackendNativeSharedFrame,
  requestAudioWaveformSamples = requestRustBackendAudioWaveformSamples,
  copyBridge = window.sharedVideoFrame,
}: PrepareSharedRendererViewportNativeRenderUploadInput): Promise<PrepareSharedRendererViewportNativeRenderUploadResult> => {
  if (!session.surfaceGate.ok) {
    return {
      ok: false,
      reason: 'surfaceGateUnavailable',
      detail: session.surfaceGate.detail,
      activeJobs: [...activeJobs],
    };
  }

  const resolvedRequestId = requestId ?? session.surfaceGate.snapshot.frame_index;
  const nativeSources = await prepareNativeRenderSources({
    session,
    requestId: resolvedRequestId,
    slotCount: sourceSlotCount,
    maxDecodeEdge,
    activeJobs,
  });
  const surfaceGate = session.surfaceGate;
  let activeRenderJobs: SharedRendererViewportVideoDecodeJob[];
  let nativeRenderSources: readonly SharedRendererViewportNativeRenderSource[] = [];
  let renderSources: RustBackendNativeRenderSharedFramePayload['sources'];

  if (nativeSources.ok) {
    activeRenderJobs = nativeSources.activeJobs;
    nativeRenderSources = nativeSources.sources;
    renderSources = nativeRenderSources.map((source) => ({
      mediaId: source.mediaId,
      ...(source.jobId ? { jobId: source.jobId } : {}),
      slotCount: source.slotCount,
      frame: source.frame,
    }));
  } else if (nativeSources.reason === 'noVideoDecodeRequest') {
    activeRenderJobs = nativeSources.activeJobs;
    if (!canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: surfaceGate.snapshot,
      media: surfaceGate.media,
    })) {
      return {
        ok: false,
        reason: 'nativeRenderUnsupportedMediaOnly',
        detail: 'Shared renderer preview session does not contain only Rust native-renderable media.',
        activeJobs: activeRenderJobs,
      };
    }
    renderSources = [];
  } else {
    if (nativeSources.reason === 'preparedNativeRenderSourceAbortReleaseFailed') {
      return {
        ok: false,
        reason: nativeSources.reason,
        detail: nativeSources.detail,
        activeJobs: nativeSources.activeJobs,
      };
    }
    return {
      ok: false,
      reason: 'nativeRenderSourcesUnavailable',
      detail: nativeSources.detail,
      activeJobs: nativeSources.activeJobs,
    };
  }

  const sourceReleaseBlock = resolveNativeRenderSourceReleaseUnavailable(nativeRenderSources);
  if (sourceReleaseBlock) {
    const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
    if (releaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderSourceReleaseFailed',
        detail: releaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    return {
      ok: false,
      reason: 'nativeRenderSourceReleaseUnavailable',
      detail: sourceReleaseBlock,
      activeJobs: activeRenderJobs,
    };
  }

  if (discardNativeRenderOutputForBenchmark && nativeSources.ok) {
    const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
    if (releaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderSourceReleaseFailed',
        detail: releaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    return {
      ok: false,
      reason: 'nativeRenderFailed',
      detail: 'native render output discarded for benchmark',
      activeJobs: activeRenderJobs,
    };
  }

  const unsupportedNativeMedia = resolveMixedNativeRenderUnsupportedMedia({
    snapshot: surfaceGate.snapshot,
    media: surfaceGate.media,
  });
  if (unsupportedNativeMedia) {
    const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
    if (releaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderSourceReleaseFailed',
        detail: releaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    return {
      ok: false,
      reason: 'nativeRenderUnsupportedMedia',
      detail: unsupportedNativeMedia,
      activeJobs: activeRenderJobs,
    };
  }

  const renderId = buildPreviewNativeRenderId(resolvedRequestId);
  const renderMemoryId = buildPreviewNativeRenderMemoryId(resolvedRequestId);
  const audioWaveforms = await prepareNativeRenderAudioWaveforms({
    snapshot: surfaceGate.snapshot,
    media: surfaceGate.media,
    requestAudioWaveformSamples,
  });
  let renderResponse: RustBackendResult<RustBackendNativeRenderSharedFrameResult>;
  try {
    renderResponse = await renderNativeSharedFrame({
      renderId,
      memoryId: renderMemoryId,
      slotCount: outputSlotCount,
      ptsFrame: surfaceGate.snapshot.frame_index,
      width: surfaceGate.canvas.width,
      height: surfaceGate.canvas.height,
      snapshot: surfaceGate.snapshot,
      media: surfaceGate.media,
      sources: renderSources,
      ...(audioWaveforms.length > 0 ? { audioWaveforms } : {}),
    });
  } catch (error) {
    const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
    if (releaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderSourceReleaseFailed',
        detail: releaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    return {
      ok: false,
      reason: 'nativeRenderFailed',
      detail: formatNativeRenderError(error),
      activeJobs: activeRenderJobs,
    };
  }
  if (!renderResponse.success || !renderResponse.result) {
    const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
    if (releaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderSourceReleaseFailed',
        detail: releaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    return {
      ok: false,
      reason: 'nativeRenderFailed',
      detail: renderResponse.error ?? 'Rust backend native render failed.',
      activeJobs: activeRenderJobs,
    };
  }

  const releaseNativeOutput = createSingleUseNativeOutputReleaser(
    renderResponse.result.frame.descriptor.memoryId,
    releaseNativeSharedFrame
  );
  let upload: PrepareSharedRendererDecodedVideoFrameUploadResult;
  try {
    upload = await prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame: renderResponse.result.frame,
      slotCount: renderResponse.result.slotCount,
      bridge: copyBridge,
      releaseAfterGpuUpload: releaseNativeOutput,
      releaseAfterUploadAbort: releaseNativeOutput,
    });
  } catch (error) {
    const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
    const outputReleaseFailure = await releaseNativeRenderOutputAfterAbort(releaseNativeOutput);
    if (outputReleaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderOutputReleaseFailed',
        detail: outputReleaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    if (releaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderSourceReleaseFailed',
        detail: releaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    throw error;
  }
  if (!upload.ok) {
    const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
    const outputReleaseFailure = await releaseNativeRenderOutputAfterAbort(releaseNativeOutput);
    if (outputReleaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderOutputReleaseFailed',
        detail: outputReleaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    if (releaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderSourceReleaseFailed',
        detail: releaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    return {
      ok: false,
      reason: 'uploadFailed',
      detail: upload.detail,
      activeJobs: activeRenderJobs,
    };
  }
  const completeReleaseFailure = await releaseNativeRenderSourcesAfterComplete(nativeRenderSources);
  if (completeReleaseFailure) {
    const outputReleaseFailure = await releasePreparedNativeRenderOutputAfterAbort(upload);
    if (outputReleaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderOutputReleaseFailed',
        detail: outputReleaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    return {
      ok: false,
      reason: 'nativeRenderSourceReleaseFailed',
      detail: completeReleaseFailure,
      activeJobs: activeRenderJobs,
    };
  }

  return {
    ok: true,
    activeJobs: activeRenderJobs,
    upload,
    diagnostics: {
      decodePaths: [...new Set(nativeRenderSources
        .map((source) => source.decodePath)
        .filter((path): path is string => Boolean(path)))],
      renderPath: renderResponse.result.renderPath,
      nv12ZeroCopyMediaIds: renderResponse.result.nv12ZeroCopyMediaIds ?? [],
    },
  };
};

// Phase 3b Step 2 — native-render-only（図形/画像のみ、Video を含まない）
// セッション向け。render.nativeSharedFrame の合成結果（POSIX shared-memory の
// frame descriptor。video decode 経由の RustBackendSharedVideoFrame と全く
// 同じ型）を、DOM canvas への GPU テクスチャコピーを経由せずそのまま
// window.nativeOverlay.presentSharedFrame（napi: presentNativeOverlaySharedFrame）
// へ渡す。snapshot/media を省略して呼ぶと、Rust 側 upload_frame_to_scene_sources
// は「アップロード済みの1枚を drawable いっぱいの単一 quad として表示する」
// モードで扱う（native-overlay/src/lib.rs、変更不要）。これは
// render.nativeSharedFrame の出力（＝キャンバス全体を合成済みの1枚）と
// ちょうど合致する。選択デコレーションは同一 present に同梱できる
// （Phase 2 の co-delivery 契約をそのまま利用）。
export interface PrepareSharedRendererViewportNativeRenderOverlayPresentInput {
  windowId?: number;
  session: SharedRendererPreviewSession;
  requestId?: number;
  outputSlotCount?: number;
  nativeOverlayBridge?: NativeOverlayDecodedFrameBridge;
  renderNativeSharedFrame?: SharedRendererViewportNativeSharedFrameRenderer;
  releaseNativeSharedFrame?: SharedRendererViewportNativeSharedFrameReleaser;
  requestAudioWaveformSamples?: RustBackendAudioWaveformBridge['requestAudioWaveformSamples'];
  selectionDecoration?: SelectionDecorationPayload;
  /**
   * decode 済みスロットを解放して present を抑止する（reason:
   * 'supersededRequest'）。クリップ削除等で presenter が再起動（空セッション
   * → 透明clear）した後に、in-flight の古い tick の present が完了して
   * 削除済みフレームを overlay に上書きするレースを防ぐ（video decode 経路の
   * prepareSharedRendererViewportNativeOverlayPresent と同じ契約）。
   */
  isRequestCurrent?: () => boolean;
}

export type PrepareSharedRendererViewportNativeRenderOverlayPresentResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'surfaceGateUnavailable'
        | 'nativeRenderUnsupportedMediaOnly'
        | 'nativeRenderFailed'
        | 'nativeOverlayPresentFailed'
        | 'nativeOverlayReleaseMismatch'
        | 'nativeRenderOutputReleaseFailed'
        | 'supersededRequest'
        | 'supersededDecodeReleaseFailed';
      detail: string;
    };

export const prepareSharedRendererViewportNativeRenderOverlayPresent = async ({
  windowId,
  session,
  requestId,
  outputSlotCount = 1,
  nativeOverlayBridge = window.nativeOverlay,
  renderNativeSharedFrame = renderRustBackendNativeSharedFrame,
  releaseNativeSharedFrame = releaseRustBackendNativeSharedFrame,
  requestAudioWaveformSamples = requestRustBackendAudioWaveformSamples,
  selectionDecoration,
  isRequestCurrent,
}: PrepareSharedRendererViewportNativeRenderOverlayPresentInput): Promise<PrepareSharedRendererViewportNativeRenderOverlayPresentResult> => {
  if (!session.surfaceGate.ok) {
    return {
      ok: false,
      reason: 'surfaceGateUnavailable',
      detail: session.surfaceGate.detail,
    };
  }
  const surfaceGate = session.surfaceGate;

  // native overlay 合成は video-decode 注入を持たないため、この経路は
  // render.nativeSharedFrame が単独で描ける（＝Video を含まない）シーンに
  // 限定する。動画を含むセッションは呼び出し側（Viewport.tsx）が video-only
  // 判定で別経路（prepareSharedRendererViewportNativeOverlayPresent）へ振り、
  // 混在セッションは DOM canvas フォールバック
  // （prepareSharedRendererViewportNativeRenderUpload）を使い続ける。
  if (!canRenderSharedRendererNativeMediaOnlyFrame({
    snapshot: surfaceGate.snapshot,
    media: surfaceGate.media,
  })) {
    return {
      ok: false,
      reason: 'nativeRenderUnsupportedMediaOnly',
      detail: 'Shared renderer preview session does not contain only Rust native-renderable media.',
    };
  }

  const canPresentSceneDirectly = nativeOverlayBridge.presentScene != null
    && surfaceGate.media.every((reference) => (
      reference.kind !== 'Video'
      && isNativeOverlayDirectMediaSourceSupported(reference.kind, reference.source)
    ));
  if (canPresentSceneDirectly) {
    const presentResponse = await nativeOverlayBridge.presentScene?.({
      windowId,
      snapshot: toNativeOverlaySceneSnapshotPayload(surfaceGate.snapshot, surfaceGate.canvas),
      media: surfaceGate.media.map(toNativeOverlaySceneMediaPayload),
      ...(selectionDecoration ? { selectionDecoration } : {}),
    });
    if (presentResponse?.success) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: 'nativeOverlayPresentFailed',
      detail: presentResponse?.reason ?? 'Native overlay did not present the scene directly.',
    };
  }

  const resolvedRequestId = requestId ?? surfaceGate.snapshot.frame_index;
  const renderId = buildPreviewNativeRenderId(resolvedRequestId);
  const renderMemoryId = buildPreviewNativeRenderMemoryId(resolvedRequestId);
  const audioWaveforms = await prepareNativeRenderAudioWaveforms({
    snapshot: surfaceGate.snapshot,
    media: surfaceGate.media,
    requestAudioWaveformSamples,
  });

  let renderResponse: RustBackendResult<RustBackendNativeRenderSharedFrameResult>;
  try {
    renderResponse = await renderNativeSharedFrame({
      renderId,
      memoryId: renderMemoryId,
      slotCount: outputSlotCount,
      ptsFrame: surfaceGate.snapshot.frame_index,
      width: surfaceGate.canvas.width,
      height: surfaceGate.canvas.height,
      snapshot: surfaceGate.snapshot,
      media: surfaceGate.media,
      sources: [],
      ...(audioWaveforms.length > 0 ? { audioWaveforms } : {}),
    });
  } catch (error) {
    return {
      ok: false,
      reason: 'nativeRenderFailed',
      detail: formatNativeRenderError(error),
    };
  }
  if (!renderResponse.success || !renderResponse.result) {
    return {
      ok: false,
      reason: 'nativeRenderFailed',
      detail: renderResponse.error ?? 'Rust backend native render failed.',
    };
  }

  // 追い越し検知 — render の await 中に新しい presenter 要求（クリップ削除に
  // よる再起動等）が始まっていたら、この present は overlay を古いフレームで
  // 上書きしてしまう。レンダリング済み shared-memory 出力を解放して present
  // せずに終了する。
  if (isRequestCurrent && !isRequestCurrent()) {
    const releaseFailure = await releaseNativeRenderOutputAfterAbort(async () => {
      const response = await releaseNativeSharedFrame({ memoryId: renderMemoryId });
      if (!response.success) {
        throw new Error(response.error ?? 'Rust backend native render output release failed.');
      }
    });
    if (releaseFailure) {
      return {
        ok: false,
        reason: 'supersededDecodeReleaseFailed',
        detail: releaseFailure,
      };
    }
    return {
      ok: false,
      reason: 'supersededRequest',
      detail: 'A newer presenter request superseded this native overlay present; the rendered frame was released without presenting.',
    };
  }

  const frame = renderResponse.result.frame;
  const presentResponse = await nativeOverlayBridge.presentSharedFrame({
    windowId,
    mediaId: renderMemoryId,
    slotCount: renderResponse.result.slotCount,
    frame,
    ...(selectionDecoration ? { selectionDecoration } : {}),
  });
  if (!presentResponse.success || !presentResponse.releaseFrame) {
    // overlay がこの present を受け取らなかった（未 attach 等）ため、レンダリング
    // 済み shared-memory 出力の所有権は呼び出し側に残ったまま。ここで解放しないと
    // POSIX shm リークになる。呼び出し側は overlay 経路の失敗を検知して presenter
    // を再起動し、restart 経路の DOM canvas フォールバックへ自然に落ちる。
    const releaseFailure = await releaseNativeRenderOutputAfterAbort(async () => {
      const response = await releaseNativeSharedFrame({ memoryId: renderMemoryId });
      if (!response.success) {
        throw new Error(response.error ?? 'Rust backend native render output release failed.');
      }
    });
    if (releaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderOutputReleaseFailed',
        detail: releaseFailure,
      };
    }
    return {
      ok: false,
      reason: 'nativeOverlayPresentFailed',
      detail: presentResponse.reason ?? 'Native overlay did not return a native render frame release payload.',
    };
  }
  const releaseFrame = presentResponse.releaseFrame;
  if (
    releaseFrame.memoryId !== frame.descriptor.memoryId
    || releaseFrame.slotIndex !== frame.descriptor.slotIndex
    || releaseFrame.generation !== frame.descriptor.generation
    || releaseFrame.ptsFrame !== frame.ptsFrame
  ) {
    return {
      ok: false,
      reason: 'nativeOverlayReleaseMismatch',
      detail: 'Native overlay native render frame release payload did not match the rendered frame descriptor.',
    };
  }

  const releaseResponse = await releaseNativeSharedFrame({ memoryId: renderMemoryId });
  if (!releaseResponse.success) {
    return {
      ok: false,
      reason: 'nativeRenderOutputReleaseFailed',
      detail: releaseResponse.error ?? 'Rust backend native render output release failed.',
    };
  }

  return { ok: true };
};

export const DEFAULT_AUDIO_WAVEFORM_SAMPLE_RATE = 8000;

type AudioWaveformSourceMetadata = {
  generator: string;
  target_audio_id: string;
  target_source: string;
  sample_window_seconds: number;
  colour: string;
  thickness: number;
  amplitude: number;
};

type AudioSphereSourceMetadata = {
  generator: string;
  target_audio_id: string;
  target_source: string;
  sample_window_seconds: number;
  columns: number;
  rows: number;
  base_radius: number;
  audio_influence: number;
  point_size: number;
  polygon_size: number;
  random_amount: number;
  colour: string;
  seed: number;
};

type AudioReactiveSourceMetadata = AudioWaveformSourceMetadata | AudioSphereSourceMetadata;

export const prepareNativeRenderAudioWaveforms = async ({
  snapshot,
  media,
  requestAudioWaveformSamples,
}: {
  snapshot: RustSceneSnapshot;
  media: readonly RustSceneMediaReference[];
  requestAudioWaveformSamples: RustBackendAudioWaveformBridge['requestAudioWaveformSamples'];
}): Promise<RustBackendNativeRenderAudioWaveform[]> => {
  const waveforms = media
    .filter((reference) => reference.kind === 'GeneratedAudioWaveform' || reference.kind === 'GeneratedAudioSphere')
    .map((reference) => ({
      reference,
      metadata: parseAudioReactiveSourceMetadata(reference.source),
    }))
    .filter((entry): entry is { reference: RustSceneMediaReference; metadata: AudioReactiveSourceMetadata } =>
      entry.metadata !== null
    );

  const prepared = await Promise.all(waveforms.map(async ({ reference, metadata }) => {
    const sampleRate = DEFAULT_AUDIO_WAVEFORM_SAMPLE_RATE;
    const durationSeconds = metadata.sample_window_seconds;
    const startSeconds = sourceFrameSecondsForMedia(snapshot, reference.id);
    const response = await requestAudioWaveformSamples({
      source: metadata.target_source,
      sampleRate,
      maxSamples: Math.max(1, Math.ceil(sampleRate * durationSeconds)),
      startSeconds,
      durationSeconds,
    });
    if (!response.success || !response.result) {
      throw new Error(response.error ?? `Rust backend audio waveform sample request failed for '${reference.id}'.`);
    }
    return {
      mediaId: reference.id,
      source: reference.source,
      samples: response.result.samples,
      sampleRate: response.result.sampleRate,
      width: reference.width,
      height: reference.height,
    };
  }));

  return prepared;
};

const SOURCE_FRAME_RATE = 60;

const sourceFrameSecondsForMedia = (snapshot: RustSceneSnapshot, mediaId: string): number => {
  const sourceFrame = snapshot.clips.find((clip) => clip.media_id === mediaId)?.source_frame ?? 0;
  return Math.max(0, sourceFrame) / SOURCE_FRAME_RATE;
};

const parseAudioWaveformSourceMetadata = (source: string): AudioWaveformSourceMetadata | null => {
  try {
    const parsed = JSON.parse(source) as Partial<AudioWaveformSourceMetadata>;
    if (
      parsed.generator !== 'audio-waveform-r'
      || typeof parsed.target_audio_id !== 'string'
      || parsed.target_audio_id.length === 0
      || typeof parsed.target_source !== 'string'
      || parsed.target_source.length === 0
      || typeof parsed.sample_window_seconds !== 'number'
      || !Number.isFinite(parsed.sample_window_seconds)
      || parsed.sample_window_seconds <= 0
      || typeof parsed.colour !== 'string'
      || typeof parsed.thickness !== 'number'
      || !Number.isFinite(parsed.thickness)
      || parsed.thickness <= 0
      || typeof parsed.amplitude !== 'number'
      || !Number.isFinite(parsed.amplitude)
      || parsed.amplitude < 0
    ) {
      return null;
    }
    return parsed as AudioWaveformSourceMetadata;
  } catch {
    return null;
  }
};

const parseAudioSphereSourceMetadata = (source: string): AudioSphereSourceMetadata | null => {
  try {
    const parsed = JSON.parse(source) as Partial<AudioSphereSourceMetadata>;
    if (
      parsed.generator !== 'audio-sphere-93'
      || typeof parsed.target_audio_id !== 'string'
      || parsed.target_audio_id.length === 0
      || typeof parsed.target_source !== 'string'
      || parsed.target_source.length === 0
      || typeof parsed.sample_window_seconds !== 'number'
      || !Number.isFinite(parsed.sample_window_seconds)
      || parsed.sample_window_seconds <= 0
      || parsed.sample_window_seconds > 10
      || typeof parsed.columns !== 'number'
      || !Number.isInteger(parsed.columns)
      || parsed.columns < 2
      || parsed.columns > 64
      || typeof parsed.rows !== 'number'
      || !Number.isInteger(parsed.rows)
      || parsed.rows < 2
      || parsed.rows > 64
      || typeof parsed.base_radius !== 'number'
      || !Number.isFinite(parsed.base_radius)
      || parsed.base_radius <= 0
      || typeof parsed.audio_influence !== 'number'
      || !Number.isFinite(parsed.audio_influence)
      || parsed.audio_influence < 0
      || typeof parsed.point_size !== 'number'
      || !Number.isFinite(parsed.point_size)
      || parsed.point_size < 0
      || typeof parsed.polygon_size !== 'number'
      || !Number.isFinite(parsed.polygon_size)
      || parsed.polygon_size < 0
      || typeof parsed.random_amount !== 'number'
      || !Number.isFinite(parsed.random_amount)
      || parsed.random_amount < 0
      || typeof parsed.colour !== 'string'
      || typeof parsed.seed !== 'number'
      || !Number.isInteger(parsed.seed)
    ) {
      return null;
    }
    return parsed as AudioSphereSourceMetadata;
  } catch {
    return null;
  }
};

const parseAudioReactiveSourceMetadata = (source: string): AudioReactiveSourceMetadata | null =>
  parseAudioWaveformSourceMetadata(source) ?? parseAudioSphereSourceMetadata(source);

const buildPreviewNativeRenderId = (requestId: number): string =>
  `preview-native-render-${sanitiseNativeRenderPart(String(requestId))}`;

// macOS caps POSIX shm names (including the leading '/') at 31 bytes
// (PSHMNAMLEN). requestId is a monotonically increasing counter seeded from
// the surface-gate frame_index, so it keeps growing for the lifetime of a
// preview session; a decimal-digit encoding eventually overflows the limit
// (observed in practice past four digits, i.e. ~16.6s of 60fps playback) and
// shm_open(create) fails with ENAMETOOLONG, breaking native render for the
// rest of playback. Base36-encode requestId instead: it stays well under the
// limit for any requestId up to Number.MAX_SAFE_INTEGER, and — since the
// caller always increments requestId before calling — still gives every
// in-flight present its own unique memory id.
const buildPreviewNativeRenderMemoryId = (requestId: number): string =>
  `/uxfd-pn-${Math.max(0, Math.trunc(requestId)).toString(36)}`;

const sanitiseNativeRenderPart = (value: string): string =>
  value
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'frame';

const createSingleUseNativeOutputReleaser = (
  memoryId: string,
  releaseNativeSharedFrame: SharedRendererViewportNativeSharedFrameReleaser
): (() => Promise<void>) => {
  let releasePromise: Promise<void> | null = null;
  return () => {
    if (!releasePromise) {
      releasePromise = releaseNativeSharedFrame({ memoryId }).then((response) => {
        if (!response.success) {
          throw new Error(response.error ?? 'Rust backend native render output release failed.');
        }
      });
    }
    return releasePromise;
  };
};

const releasePreparedNativeRenderOutputAfterAbort = async (
  upload: PreparedNativeRenderUpload
): Promise<string | null> => {
  return releaseNativeRenderOutputAfterAbort(upload.releaseAfterUploadAbort);
};

const releaseNativeRenderOutputAfterAbort = async (
  releaseNativeOutput: (() => Promise<void>) | undefined
): Promise<string | null> => {
  try {
    await releaseNativeOutput?.();
    return null;
  } catch (error) {
    return formatNativeRenderReleaseError(error, 'Rust backend native render output release failed.');
  }
};

const releaseNativeRenderSourcesAfterComplete = async (
  sources: readonly SharedRendererViewportNativeRenderSource[]
): Promise<string | null> => {
  const results = await Promise.allSettled(
    sources.map((source) => source.releaseAfterNativeRenderComplete?.() ?? Promise.resolve())
  );
  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  return failed ? formatNativeRenderReleaseError(failed.reason) : null;
};

const releaseNativeRenderSourcesAfterAbort = async (
  sources: readonly SharedRendererViewportNativeRenderSource[]
): Promise<string | null> => {
  const results = await Promise.allSettled(
    sources.map((source) => source.releaseAfterNativeRenderAbort?.() ?? Promise.resolve())
  );
  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  return failed ? formatNativeRenderReleaseError(failed.reason) : null;
};

const formatNativeRenderReleaseError = (
  error: unknown,
  fallback = 'Rust native render source release failed.'
): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return fallback;
};

const formatNativeRenderError = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return 'Rust backend native render failed.';
};
