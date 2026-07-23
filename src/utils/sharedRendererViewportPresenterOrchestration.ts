import {
  startSharedRendererPreviewPresenter,
  type SharedRendererPreviewPresenterControl,
  type StartSharedRendererPreviewPresenterInput,
} from './sharedRendererPreviewPresenterController';
import type { SharedRendererPresentedFrameSharedFrameTaker } from './sharedRendererWebGpuPresenter';
import {
  prepareSharedRendererViewportNativeRenderUpload,
  type PrepareSharedRendererViewportNativeRenderUploadInput,
  type PrepareSharedRendererViewportNativeRenderUploadResult,
} from './sharedRendererViewportNativeRenderUpload';
import {
  prepareSharedRendererViewportVideoUpload,
  prepareSharedRendererViewportVideoUploads,
  type PrepareSharedRendererViewportVideoUploadInput,
  type PrepareSharedRendererViewportVideoUploadResult,
  type PrepareSharedRendererViewportVideoUploadsInput,
  type PrepareSharedRendererViewportVideoUploadsResult,
  type SharedRendererViewportVideoDecodeJob,
} from './sharedRendererViewportVideoUpload';

export type SharedRendererViewportVideoUploadPreparer = (
  input: PrepareSharedRendererViewportVideoUploadInput
) => Promise<PrepareSharedRendererViewportVideoUploadResult>;

export type SharedRendererViewportVideoUploadsPreparer = (
  input: PrepareSharedRendererViewportVideoUploadsInput
) => Promise<PrepareSharedRendererViewportVideoUploadsResult>;

export type SharedRendererViewportNativeRenderUploadPreparer = (
  input: PrepareSharedRendererViewportNativeRenderUploadInput
) => Promise<PrepareSharedRendererViewportNativeRenderUploadResult>;

export type SharedRendererViewportPresenterStarter = (
  input: StartSharedRendererPreviewPresenterInput
) => Promise<SharedRendererPreviewPresenterControl>;

export type SharedRendererViewportNativeOverlayPresentResult =
  | {
      ok: true;
      activeJob: SharedRendererViewportVideoDecodeJob | null;
      activeJobs?: SharedRendererViewportVideoDecodeJob[];
    }
  | {
      ok: false;
      reason: string;
      detail: string;
      activeJob: SharedRendererViewportVideoDecodeJob | null;
      activeJobs?: SharedRendererViewportVideoDecodeJob[];
    };

export interface NativeOverlayTransparentClearState {
  clearedForNoVideo: boolean;
}

// Bug F — playhead が動画クリップを含まない位置にある間、native overlay の
// wgpu surface に直前の動画フレームが残留表示される。presenter orchestration
// は nativeOverlayPresentResult.reason === 'noVideoDecodeRequest' でその
// 「動画要求が確定して存在しない」状態を報告するが、これを検出して
// transparent clear を発火する経路が Viewport.tsx 側になかった。
//
// この純粋関数は「いつ clear するか／いつ直前フレームを保持するか」の
// 状態機械を切り出す:
//   - ok: true（可視フレームを present できた）→ ガードを解除し、次に
//     noVideoDecodeRequest へ遷移したときまた clear できるようにする。
//   - ok: false, reason: 'noVideoDecodeRequest'（確定して動画要求が無い）→
//     直前が「未clear」なら1回だけ clear を要求し、ガードを立てる。
//     すでに clear 済みなら毎tick繰り返さない（不要な GPU 負荷を避ける）。
//   - ok: false, その他の reason（frameDecodeFailed 等、再生中の一時的な
//     デコード失敗）→ ちらつき防止のため直前フレームを保持し、ガードの
//     状態も変えない（clear もしない、解除もしない）。
export const NATIVE_OVERLAY_TRANSPARENT_CLEAR_INITIAL_STATE: NativeOverlayTransparentClearState = {
  clearedForNoVideo: false,
};

export const resolveNativeOverlayTransparentClearTransition = (
  previous: NativeOverlayTransparentClearState,
  nativeOverlayPresentResult: SharedRendererViewportNativeOverlayPresentResult | undefined,
): {
  next: NativeOverlayTransparentClearState;
  shouldClear: boolean;
} => {
  if (!nativeOverlayPresentResult) {
    return { next: previous, shouldClear: false };
  }
  if (nativeOverlayPresentResult.ok) {
    return previous.clearedForNoVideo
      ? { next: { clearedForNoVideo: false }, shouldClear: false }
      : { next: previous, shouldClear: false };
  }
  if (nativeOverlayPresentResult.reason !== 'noVideoDecodeRequest') {
    return { next: previous, shouldClear: false };
  }
  if (previous.clearedForNoVideo) {
    return { next: previous, shouldClear: false };
  }
  return { next: { clearedForNoVideo: true }, shouldClear: true };
};

export type SharedRendererViewportNativeOverlayPresenter = (
  input: {
    session: StartSharedRendererPreviewPresenterInput['session'];
    requestId: number;
    activeJob: SharedRendererViewportVideoDecodeJob | null;
    activeJobs: SharedRendererViewportVideoDecodeJob[];
    slotCount?: number;
    maxDecodeEdge?: number;
  }
) => Promise<SharedRendererViewportNativeOverlayPresentResult>;

export interface StartSharedRendererViewportPresenterInput {
  canvas: HTMLCanvasElement;
  session: StartSharedRendererPreviewPresenterInput['session'];
  datasets: StartSharedRendererPreviewPresenterInput['datasets'];
  diagnosticSwatchEnabled: boolean;
  videoCutoverEnabled: boolean;
  nativeRenderPreviewEnabled?: boolean;
  nativeOverlayPreviewEnabled?: boolean;
  preferNativeRenderUpload?: boolean;
  requireSharedRendererVideo?: boolean;
  requireRustVideoControlPlane?: boolean;
  requireSharedRendererOutput?: boolean;
  skipDecodedVideoUploadForBenchmark?: boolean;
  sharedRendererWriteTextureNoOpEnabled?: boolean;
  discardNativeRenderOutputForBenchmark?: boolean;
  activeVideoDecodeJob: SharedRendererViewportVideoDecodeJob | null;
  activeVideoDecodeJobs?: SharedRendererViewportVideoDecodeJob[];
  videoDecodeSlotCount?: number;
  videoDecodeMaxEdge?: number;
  requestId: number;
  presentedFrameSharedFrameTaker?: SharedRendererPresentedFrameSharedFrameTaker;
  sharedRendererExternalVideoSourcesByClipId?: ReadonlyMap<string, unknown>;
  prepareVideoUpload?: SharedRendererViewportVideoUploadPreparer;
  prepareVideoUploads?: SharedRendererViewportVideoUploadsPreparer;
  prepareNativeRenderUpload?: SharedRendererViewportNativeRenderUploadPreparer;
  presentNativeOverlayDecodedFrame?: SharedRendererViewportNativeOverlayPresenter;
  startPresenter?: SharedRendererViewportPresenterStarter;
  onVideoDecodeJobResolved?: (job: SharedRendererViewportVideoDecodeJob | null) => void;
  onVideoDecodeJobsResolved?: (jobs: SharedRendererViewportVideoDecodeJob[]) => void;
  isStartCurrent?: () => boolean;
}

export interface StartSharedRendererViewportPresenterResult {
  control: SharedRendererPreviewPresenterControl;
  activeVideoDecodeJob: SharedRendererViewportVideoDecodeJob | null;
  activeVideoDecodeJobs: SharedRendererViewportVideoDecodeJob[];
  videoUploadResult?: PrepareSharedRendererViewportVideoUploadResult;
  videoUploadsResult?: PrepareSharedRendererViewportVideoUploadsResult;
  nativeRenderUploadResult?: PrepareSharedRendererViewportNativeRenderUploadResult;
  nativeOverlayPresentResult?: SharedRendererViewportNativeOverlayPresentResult;
}

export const startSharedRendererViewportPresenter = async ({
  canvas,
  session,
  datasets,
  diagnosticSwatchEnabled,
  videoCutoverEnabled,
  nativeRenderPreviewEnabled = false,
  nativeOverlayPreviewEnabled = false,
  preferNativeRenderUpload = false,
  requireSharedRendererVideo = false,
  requireRustVideoControlPlane = false,
  requireSharedRendererOutput = false,
  skipDecodedVideoUploadForBenchmark = false,
  sharedRendererWriteTextureNoOpEnabled = false,
  discardNativeRenderOutputForBenchmark = false,
  activeVideoDecodeJob,
  activeVideoDecodeJobs,
  videoDecodeSlotCount,
  videoDecodeMaxEdge,
  requestId,
  presentedFrameSharedFrameTaker,
  sharedRendererExternalVideoSourcesByClipId,
  prepareVideoUpload = prepareSharedRendererViewportVideoUpload,
  prepareVideoUploads = prepareSharedRendererViewportVideoUploads,
  prepareNativeRenderUpload,
  presentNativeOverlayDecodedFrame,
  startPresenter = startSharedRendererPreviewPresenter,
  onVideoDecodeJobResolved,
  onVideoDecodeJobsResolved,
  isStartCurrent,
}: StartSharedRendererViewportPresenterInput): Promise<StartSharedRendererViewportPresenterResult> => {
  assertPresenterStartCurrent(isStartCurrent);

  let nextActiveVideoDecodeJob = activeVideoDecodeJob;
  let nextActiveVideoDecodeJobs = activeVideoDecodeJobs ?? (activeVideoDecodeJob ? [activeVideoDecodeJob] : []);
  const effectiveVideoCutoverEnabled = videoCutoverEnabled || requireSharedRendererVideo;
  const shouldUseMultipleVideoUploads = Boolean(activeVideoDecodeJobs);
  const nativeRenderUploadPreparer = prepareNativeRenderUpload
    ?? (nativeRenderPreviewEnabled ? prepareSharedRendererViewportNativeRenderUpload : undefined);
  const shouldPreferNativeRenderUpload = preferNativeRenderUpload
    && !nativeOverlayPreviewEnabled
    && Boolean(nativeRenderUploadPreparer);
  const preferredNativeRenderUploadResult = shouldPreferNativeRenderUpload && nativeRenderUploadPreparer
    ? await nativeRenderUploadPreparer({
      session,
      requestId,
      activeJobs: nextActiveVideoDecodeJobs,
      sourceSlotCount: videoDecodeSlotCount,
      maxDecodeEdge: videoDecodeMaxEdge,
      discardNativeRenderOutputForBenchmark,
    })
    : undefined;
  if (preferredNativeRenderUploadResult) {
    nextActiveVideoDecodeJobs = preferredNativeRenderUploadResult.activeJobs;
    nextActiveVideoDecodeJob = nextActiveVideoDecodeJobs[0] ?? null;
  }
  assertPresenterStartCurrent(isStartCurrent);

  const nativeOverlayPresentResult = nativeOverlayPreviewEnabled && presentNativeOverlayDecodedFrame
    ? await (async () => {
      writeNativeOverlayAttemptDiagnostics(datasets, { attempt: 'pending' });
      const result = await presentNativeOverlayDecodedFrame({
        session,
        requestId,
        activeJob: nextActiveVideoDecodeJob,
        activeJobs: nextActiveVideoDecodeJobs,
        slotCount: videoDecodeSlotCount,
        maxDecodeEdge: videoDecodeMaxEdge,
      });
      writeNativeOverlayAttemptDiagnostics(datasets, {
        attempt: result.ok ? 'ok' : 'failed',
        reason: result.ok ? undefined : result.reason,
        detail: result.ok ? undefined : result.detail,
      });
      return result;
    })()
    : undefined;
  if (nativeOverlayPresentResult) {
    nextActiveVideoDecodeJob = nativeOverlayPresentResult.activeJob;
    nextActiveVideoDecodeJobs = nativeOverlayPresentResult.activeJobs
      ?? (nextActiveVideoDecodeJob ? [nextActiveVideoDecodeJob] : []);
  }
  assertPresenterStartCurrent(isStartCurrent);

  const shouldPrepareVideoUploads = effectiveVideoCutoverEnabled
    && !preferredNativeRenderUploadResult
    && !nativeOverlayPresentResult?.ok
    && !skipDecodedVideoUploadForBenchmark;
  const videoUploadsResult = shouldPrepareVideoUploads && shouldUseMultipleVideoUploads
    ? await prepareVideoUploads({
      session,
      requestId,
      slotCount: videoDecodeSlotCount,
      maxDecodeEdge: videoDecodeMaxEdge,
      activeJobs: nextActiveVideoDecodeJobs,
    })
    : undefined;
  const videoUploadResult = shouldPrepareVideoUploads && !shouldUseMultipleVideoUploads
    ? await prepareVideoUpload({
      session,
      requestId,
      slotCount: videoDecodeSlotCount,
      maxDecodeEdge: videoDecodeMaxEdge,
      activeJob: nextActiveVideoDecodeJob,
    })
    : undefined;
  const sharedRendererDecodedVideoFrameUpload = videoUploadResult?.ok
    ? videoUploadResult.upload
    : undefined;
  const sharedRendererDecodedVideoFrameUploads = videoUploadsResult?.ok
    ? videoUploadsResult.uploads.map(({ request, upload }) => ({
      ...upload,
      clipId: request.clipId,
      mediaId: request.mediaId,
    }))
    : undefined;
  const sharedRendererVideoUploadFailure = resolveSharedRendererVideoUploadFailure(
    videoUploadResult,
    videoUploadsResult,
  );
  assertPresenterStartCurrent(isStartCurrent);

  if (videoUploadResult && 'activeJob' in videoUploadResult) {
    nextActiveVideoDecodeJob = videoUploadResult.activeJob ?? null;
    nextActiveVideoDecodeJobs = nextActiveVideoDecodeJob ? [nextActiveVideoDecodeJob] : [];
  }
  if (videoUploadsResult) {
    nextActiveVideoDecodeJobs = videoUploadsResult.activeJobs;
    nextActiveVideoDecodeJob = nextActiveVideoDecodeJobs[0] ?? null;
  }
  const hasSharedRendererDecodedVideoFrameUpload = Boolean(
    sharedRendererDecodedVideoFrameUpload
    || (sharedRendererDecodedVideoFrameUploads && sharedRendererDecodedVideoFrameUploads.length > 0)
  );
  const fallbackNativeRenderUploadResult = !preferredNativeRenderUploadResult
    && nativeRenderUploadPreparer
    && !nativeOverlayPresentResult?.ok
    && !hasSharedRendererDecodedVideoFrameUpload
    ? await nativeRenderUploadPreparer({
      session,
      requestId,
      activeJobs: nextActiveVideoDecodeJobs,
      sourceSlotCount: videoDecodeSlotCount,
      maxDecodeEdge: videoDecodeMaxEdge,
      discardNativeRenderOutputForBenchmark,
    })
    : undefined;
  const nativeRenderUploadResult = preferredNativeRenderUploadResult ?? fallbackNativeRenderUploadResult;
  const sharedRendererNativeRenderFrameUpload = nativeRenderUploadResult?.ok
    ? nativeRenderUploadResult.upload
    : undefined;
  const shouldPublishNativeRenderFailure = nativeRenderUploadResult
    && !nativeRenderUploadResult.ok
    && (
      requireSharedRendererOutput
      || nativeRenderUploadResult.reason !== 'nativeRenderUnsupportedMediaOnly'
    );
  const sharedRendererNativeRenderFailure = shouldPublishNativeRenderFailure && nativeRenderUploadResult && !nativeRenderUploadResult.ok
    ? {
      reason: nativeRenderUploadResult.reason,
      detail: nativeRenderUploadResult.detail,
    }
    : undefined;
  if (nativeRenderUploadResult) {
    nextActiveVideoDecodeJobs = nativeRenderUploadResult.activeJobs;
    nextActiveVideoDecodeJob = nextActiveVideoDecodeJobs[0] ?? null;
  }
  assertPresenterStartCurrent(isStartCurrent);
  onVideoDecodeJobResolved?.(nextActiveVideoDecodeJob);
  onVideoDecodeJobsResolved?.(nextActiveVideoDecodeJobs);

  const control = await startPresenter({
    canvas,
    session,
    datasets,
    diagnosticSwatchEnabled,
    sharedRendererVideoCutoverEnabled: effectiveVideoCutoverEnabled,
    requireSharedRendererVideo: requireSharedRendererVideo && !nativeOverlayPresentResult?.ok,
    requireRustVideoControlPlane,
    requireSharedRendererOutput,
    sharedRendererNativeRenderFrameUpload,
    sharedRendererNativeRenderDiagnostics: nativeRenderUploadResult?.ok
      ? nativeRenderUploadResult.diagnostics
      : undefined,
    sharedRendererNativeRenderFailure,
    sharedRendererVideoUploadFailure,
    sharedRendererExternalVideoSourcesByClipId,
    sharedRendererDecodedVideoFrameUpload,
    sharedRendererDecodedVideoFrameUploads,
    sharedRendererWriteTextureNoOpEnabled,
    presentedFrameSharedFrameTaker,
    isStartCurrent,
  });

  return {
    control,
    activeVideoDecodeJob: nextActiveVideoDecodeJob,
    activeVideoDecodeJobs: nextActiveVideoDecodeJobs,
    videoUploadResult,
    videoUploadsResult,
    nativeRenderUploadResult,
    nativeOverlayPresentResult,
  };
};

const writeNativeOverlayAttemptDiagnostics = (
  datasets: StartSharedRendererPreviewPresenterInput['datasets'],
  state: {
    attempt: 'pending' | 'ok' | 'failed';
    reason?: string;
    detail?: string;
  },
): void => {
  datasets.forEach((dataset) => {
    dataset.uxfdSharedRendererPresenterNativeOverlayAttempt = state.attempt;
    if (state.reason) {
      dataset.uxfdSharedRendererPresenterNativeOverlayFailureReason = state.reason;
    } else {
      delete dataset.uxfdSharedRendererPresenterNativeOverlayFailureReason;
    }
    if (state.detail) {
      dataset.uxfdSharedRendererPresenterNativeOverlayFailureDetail = state.detail;
    } else {
      delete dataset.uxfdSharedRendererPresenterNativeOverlayFailureDetail;
    }
  });
};

const resolveSharedRendererVideoUploadFailure = (
  videoUploadResult: PrepareSharedRendererViewportVideoUploadResult | undefined,
  videoUploadsResult: PrepareSharedRendererViewportVideoUploadsResult | undefined,
): {
  reason: string;
  detail: string;
  clipId?: string;
  mediaId?: string;
} | undefined => {
  const result = videoUploadsResult ?? videoUploadResult;
  if (!result || result.ok) {
    return undefined;
  }
  const reason = result.reason === 'uploadFailed' && result.uploadFailureReason
    ? result.uploadFailureReason
    : result.reason;
  return {
    reason,
    detail: result.detail,
    clipId: result.uploadFailureClipId,
    mediaId: result.uploadFailureMediaId,
  };
};

const isPresenterStartCurrent = (isStartCurrent: (() => boolean) | undefined): boolean =>
  isStartCurrent ? isStartCurrent() : true;

const assertPresenterStartCurrent = (isStartCurrent: (() => boolean) | undefined): void => {
  if (!isPresenterStartCurrent(isStartCurrent)) {
    throw new Error('Shared renderer presenter start was cancelled.');
  }
};
