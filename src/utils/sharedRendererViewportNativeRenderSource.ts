import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
import {
  buildSharedRendererVideoFrameDecodeRequests,
  type SharedRendererVideoFrameDecodeRequest,
  type SharedRendererVideoFrameDecodeRequestBuilder,
} from './sharedRendererVideoDecodeRequest';
import {
  isRustBackendDecodedVideoFrameAvailable,
  releaseRustBackendVideoDecodeFrame,
  requestRustBackendVideoDecodeFrame,
  startRustBackendVideoDecode,
  stopRustBackendVideoDecode,
  type RustBackendSharedVideoFrame,
  type RustBackendVideoDecodeCopyOutState,
  type RustBackendVideoDecodeBridge,
  type RustBackendVideoDecodeFrameRate,
} from './rustBackendVideoDecodeControl';
import type { SharedRendererViewportVideoDecodeJob } from './sharedRendererViewportVideoUpload';

export interface SharedRendererViewportNativeRenderSource {
  mediaId: string;
  slotCount: number;
  frame: RustBackendSharedVideoFrame;
  releaseAfterNativeRenderComplete?: () => Promise<void>;
  releaseAfterNativeRenderAbort?: () => Promise<void>;
}

const MAX_VIEWPORT_VIDEO_DECODE_EDGE = 1920;

export const resolveNativeRenderSourceReleaseUnavailable = (
  sources: readonly SharedRendererViewportNativeRenderSource[]
): string | null => {
  const sourceWithoutRelease = sources.find((source) =>
    typeof source.releaseAfterNativeRenderComplete !== 'function'
    || typeof source.releaseAfterNativeRenderAbort !== 'function');

  if (!sourceWithoutRelease) return null;

  return `Rust native render source '${sourceWithoutRelease.mediaId}' is missing decoded frame release callbacks.`;
};

export interface PrepareSharedRendererViewportNativeRenderSourcesInput {
  session: SharedRendererPreviewSession;
  requestId?: number;
  slotCount?: number;
  activeJobs?: readonly SharedRendererViewportVideoDecodeJob[];
  rustBackendBridge?: RustBackendVideoDecodeBridge;
  decodeRequestBuilder?: SharedRendererVideoFrameDecodeRequestBuilder;
}

export type PrepareSharedRendererViewportNativeRenderSourcesResult =
  | {
      ok: true;
      activeJobs: SharedRendererViewportVideoDecodeJob[];
      sources: SharedRendererViewportNativeRenderSource[];
    }
  | {
      ok: false;
      reason:
        | 'surfaceGateUnavailable'
        | 'decodeRequestUnavailable'
        | 'noVideoDecodeRequest'
        | 'stopFailed'
        | 'startFailed'
        | 'frameDecodeFailed'
        | 'staleDecodeResponse'
        | 'staleDecodeReleaseFailed'
        | 'preparedNativeRenderSourceAbortReleaseFailed'
        | 'decodedFrameUnavailable';
      detail: string;
      activeJobs: SharedRendererViewportVideoDecodeJob[];
    };

export const prepareSharedRendererViewportNativeRenderSources = async ({
  session,
  requestId,
  slotCount = 2,
  activeJobs = [],
  rustBackendBridge,
  decodeRequestBuilder = buildSharedRendererVideoFrameDecodeRequests,
}: PrepareSharedRendererViewportNativeRenderSourcesInput): Promise<PrepareSharedRendererViewportNativeRenderSourcesResult> => {
  if (!session.surfaceGate.ok) {
    return {
      ok: false,
      reason: 'surfaceGateUnavailable',
      detail: session.surfaceGate.detail,
      activeJobs: [...activeJobs],
    };
  }
  const surfaceGate = session.surfaceGate;

  const decodeRequests = decodeRequestBuilder({
    snapshot: surfaceGate.snapshot,
    media: surfaceGate.media,
  });
  if (!decodeRequests.ok) {
    return {
      ok: false,
      reason: 'decodeRequestUnavailable',
      detail: decodeRequests.detail,
      activeJobs: [...activeJobs],
    };
  }

  if (decodeRequests.requests.length === 0) {
    return {
      ok: false,
      reason: 'noVideoDecodeRequest',
      detail: 'Shared renderer preview session does not contain a visible video frame request.',
      activeJobs: [...activeJobs],
    };
  }

  const bridge = rustBackendBridge ?? window.rustBackend;
  const resolvedActiveJobs: SharedRendererViewportVideoDecodeJob[] = [];
  const sources: SharedRendererViewportNativeRenderSource[] = [];
  const resolvedRequestId = requestId ?? surfaceGate.snapshot.frame_index;
  const requestedJobs = decodeRequests.requests.map((request) => ({
    request,
    nextJob: buildViewportNativeRenderDecodeJob(request, slotCount),
  }));
  const visibleActiveJobs = activeJobs.filter((job) =>
    requestedJobs.some(({ nextJob }) => sameDecodeJob(job, nextJob)));
  const staleActiveJobs = activeJobs.filter((job) =>
    !requestedJobs.some(({ nextJob }) => sameDecodeJob(job, nextJob)));

  for (const staleJob of staleActiveJobs) {
    const stopResponse = await stopRustBackendVideoDecode({
      jobId: staleJob.jobId,
    }, bridge);
    if (!stopResponse.success) {
      return {
        ok: false,
        reason: 'stopFailed',
        detail: stopResponse.error ?? 'Rust backend rejected the stale video decode stop request.',
        activeJobs: visibleActiveJobs,
      };
    }
  }

  for (const { request, nextJob } of requestedJobs) {
    const activeMatch = visibleActiveJobs.find((job) => sameDecodeJob(job, nextJob));
    let resolvedJob: SharedRendererViewportVideoDecodeJob;
    if (activeMatch) {
      resolvedJob = activeMatch;
    } else {
      const startResult = await startDecodeJob(nextJob, request, bridge);
      if (isDecodeJobStartFailure(startResult)) {
        const preparedSourceReleaseFailure = await releasePreparedNativeRenderSourcesAfterAbort(sources);
        if (preparedSourceReleaseFailure) {
          return {
            ok: false,
            reason: 'preparedNativeRenderSourceAbortReleaseFailed',
            detail: preparedSourceReleaseFailure,
            activeJobs: resolvedActiveJobs,
          };
        }
        return {
          ok: false,
          reason: 'startFailed',
          detail: startResult.detail,
          activeJobs: resolvedActiveJobs,
        };
      }
      resolvedJob = startResult;
    }

    const decodeFramePayload = {
      jobId: resolvedJob.jobId,
      requestId: resolvedRequestId,
      frameIndex: request.sourceFrame,
      mode: 'latestWins',
    } as const;
    let decodeResponse = await requestRustBackendVideoDecodeFrame(decodeFramePayload, bridge);
    if (!decodeResponse.success && activeMatch && isNoActiveDecodeSessionError(decodeResponse.error)) {
      const restartResult = await startDecodeJob(nextJob, request, bridge);
      if (isDecodeJobStartFailure(restartResult)) {
        const preparedSourceReleaseFailure = await releasePreparedNativeRenderSourcesAfterAbort(sources);
        if (preparedSourceReleaseFailure) {
          return {
            ok: false,
            reason: 'preparedNativeRenderSourceAbortReleaseFailed',
            detail: preparedSourceReleaseFailure,
            activeJobs: resolvedActiveJobs,
          };
        }
        return {
          ok: false,
          reason: 'startFailed',
          detail: restartResult.detail,
          activeJobs: resolvedActiveJobs,
        };
      }
      resolvedJob = restartResult;
      decodeResponse = await requestRustBackendVideoDecodeFrame(decodeFramePayload, bridge);
    }
    resolvedActiveJobs.push(resolvedJob);
    if (!decodeResponse.success) {
      const preparedSourceReleaseFailure = await releasePreparedNativeRenderSourcesAfterAbort(sources);
      if (preparedSourceReleaseFailure) {
        return {
          ok: false,
          reason: 'preparedNativeRenderSourceAbortReleaseFailed',
          detail: preparedSourceReleaseFailure,
          activeJobs: resolvedActiveJobs,
        };
      }
      return {
        ok: false,
        reason: 'frameDecodeFailed',
        detail: decodeResponse.error ?? 'Rust backend video frame decode request failed.',
        activeJobs: resolvedActiveJobs,
      };
    }
    if (
      isRustBackendDecodedVideoFrameAvailable(decodeResponse)
      && (
        decodeResponse.result.requestId !== resolvedRequestId
        || decodeResponse.result.jobId !== resolvedJob.jobId
      )
    ) {
      const releaseResponse = await releaseRustBackendVideoDecodeFrame({
        jobId: decodeResponse.result.jobId,
        slotIndex: decodeResponse.result.frame.descriptor.slotIndex,
        generation: decodeResponse.result.frame.descriptor.generation,
        copyOutState: 'rendererUploadAborted',
      }, bridge);
      if (!releaseResponse.success) {
        return {
          ok: false,
          reason: 'staleDecodeReleaseFailed',
          detail: releaseResponse.error ?? 'Rust backend stale decoded frame release failed.',
          activeJobs: resolvedActiveJobs,
        };
      }
      const preparedSourceReleaseFailure = await releasePreparedNativeRenderSourcesAfterAbort(sources);
      if (preparedSourceReleaseFailure) {
        return {
          ok: false,
          reason: 'preparedNativeRenderSourceAbortReleaseFailed',
          detail: preparedSourceReleaseFailure,
          activeJobs: resolvedActiveJobs,
        };
      }
      return {
        ok: false,
        reason: 'staleDecodeResponse',
        detail: buildStaleDecodedFrameDetail(decodeResponse.result, resolvedRequestId, resolvedJob.jobId, request),
        activeJobs: resolvedActiveJobs,
      };
    }
    if (!isRustBackendDecodedVideoFrameAvailable(decodeResponse)) {
      const preparedSourceReleaseFailure = await releasePreparedNativeRenderSourcesAfterAbort(sources);
      if (preparedSourceReleaseFailure) {
        return {
          ok: false,
          reason: 'preparedNativeRenderSourceAbortReleaseFailed',
          detail: preparedSourceReleaseFailure,
          activeJobs: resolvedActiveJobs,
        };
      }
      return {
        ok: false,
        reason: 'decodedFrameUnavailable',
        detail: 'Rust backend did not return a verified decoded video frame for native render.',
        activeJobs: resolvedActiveJobs,
      };
    }
    const { frame } = decodeResponse.result;
    const releaseFrame = createSingleUseNativeRenderSourceReleaser((copyOutState) =>
      releaseRustBackendVideoDecodeFrame({
        jobId: resolvedJob.jobId,
        slotIndex: frame.descriptor.slotIndex,
        generation: frame.descriptor.generation,
        copyOutState,
      }, bridge).then(assertNativeRenderSourceReleaseSucceeded));

    sources.push({
      mediaId: request.mediaId,
      slotCount: resolvedJob.slotCount,
      frame,
      releaseAfterNativeRenderComplete: () => releaseFrame('gpuUploadFenceSignalled'),
      releaseAfterNativeRenderAbort: () => releaseFrame('rendererUploadAborted'),
    });
  }

  return {
    ok: true,
    activeJobs: resolvedActiveJobs,
    sources,
  };
};

const assertNativeRenderSourceReleaseSucceeded = (result: { success: boolean; error?: string }): void => {
  if (!result.success) {
    throw new Error(result.error ?? 'Rust backend native render source release failed.');
  }
};

const startDecodeJob = async (
  job: SharedRendererViewportVideoDecodeJob,
  request: SharedRendererVideoFrameDecodeRequest,
  rustBackendBridge: RustBackendVideoDecodeBridge
): Promise<SharedRendererViewportVideoDecodeJob | { ok: false; detail: string }> => {
  const response = await startRustBackendVideoDecode({
    jobId: job.jobId,
    source: job.source,
    slotCount: job.slotCount,
    width: job.width,
    height: job.height,
    sourceRate: job.sourceRate,
    format: request.format,
    colour: {
      primaries: 'bt709',
      transfer: 'srgb',
      matrix: 'rgb',
      range: 'full',
    },
  }, rustBackendBridge);

  if (!response.success) {
    if (isDecodeSessionAlreadyActiveForJobIdError(response.error)) {
      return job;
    }
    return {
      ok: false,
      detail: response.error ?? 'Rust backend rejected the video decode start request.',
    };
  }

  return job;
};

const isDecodeJobStartFailure = (
  value: SharedRendererViewportVideoDecodeJob | { ok: false; detail: string }
): value is { ok: false; detail: string } =>
  'ok' in value && value.ok === false;

const isNoActiveDecodeSessionError = (error: string | undefined): boolean =>
  typeof error === 'string'
  && error.toLowerCase().includes('no active decode session');

const isDecodeSessionAlreadyActiveForJobIdError = (error: string | undefined): boolean =>
  typeof error === 'string'
  && error.toLowerCase().includes('decode session already active for jobid');

const buildStaleDecodedFrameDetail = (
  result: {
    requestId: number;
    jobId: string;
  },
  expectedRequestId: number,
  expectedJobId: string,
  request: SharedRendererVideoFrameDecodeRequest,
): string => {
  const scope = ` clip=${request.clipId} media=${request.mediaId}`;
  if (result.requestId !== expectedRequestId) {
    return `Rust backend returned a decoded frame for a stale request id.${scope}`;
  }
  if (result.jobId !== expectedJobId) {
    return `Rust backend returned a decoded frame for a stale job id.${scope}`;
  }
  return `Rust backend returned a stale decoded frame.${scope}`;
};

const buildViewportNativeRenderDecodeJob = (
  request: SharedRendererVideoFrameDecodeRequest,
  slotCount: number
): SharedRendererViewportVideoDecodeJob => {
  const size = resolveViewportVideoDecodeSize(request);
  return {
    jobId: [
      'shared-renderer-video',
      sanitiseJobPart(request.mediaId),
      `${size.width}x${size.height}`,
      `${request.sourceRate.numerator}over${request.sourceRate.denominator}`,
    ].join('-'),
    source: request.source,
    slotCount,
    width: size.width,
    height: size.height,
    sourceRate: request.sourceRate,
  };
};

const resolveViewportVideoDecodeSize = (
  request: SharedRendererVideoFrameDecodeRequest
): { width: number; height: number } => {
  const sourceWidth = Math.max(1, request.width);
  const sourceHeight = Math.max(1, request.height);
  const maxWidth = Math.max(1, Math.min(sourceWidth, MAX_VIEWPORT_VIDEO_DECODE_EDGE));
  const maxHeight = Math.max(1, Math.min(sourceHeight, MAX_VIEWPORT_VIDEO_DECODE_EDGE));
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
};

const sameDecodeJob = (
  current: SharedRendererViewportVideoDecodeJob | null,
  next: SharedRendererViewportVideoDecodeJob
): current is SharedRendererViewportVideoDecodeJob =>
  current !== null
  && current.jobId === next.jobId
  && current.source === next.source
  && current.slotCount === next.slotCount
  && current.width === next.width
  && current.height === next.height
  && sameFrameRate(current.sourceRate, next.sourceRate);

const sameFrameRate = (
  left: RustBackendVideoDecodeFrameRate,
  right: RustBackendVideoDecodeFrameRate
): boolean =>
  left.numerator === right.numerator
  && left.denominator === right.denominator;

const createSingleUseNativeRenderSourceReleaser = (
  releaseFrame: (copyOutState: RustBackendVideoDecodeCopyOutState) => Promise<void>
): (copyOutState: RustBackendVideoDecodeCopyOutState) => Promise<void> => {
  let releasePromise: Promise<void> | null = null;

  return (copyOutState) => {
    if (!releasePromise) {
      releasePromise = releaseFrame(copyOutState);
    }
    return releasePromise;
  };
};

const releasePreparedNativeRenderSourcesAfterAbort = async (
  sources: readonly SharedRendererViewportNativeRenderSource[]
): Promise<string | null> => {
  const releaseResults = await Promise.allSettled(
    sources.map((source) => source.releaseAfterNativeRenderAbort?.() ?? Promise.resolve())
  );
  const failedRelease = releaseResults.find((result) => result.status === 'rejected');
  if (!failedRelease || failedRelease.status !== 'rejected') return null;

  return failedRelease.reason instanceof Error
    ? failedRelease.reason.message
    : 'Rust backend prepared native render source abort release failed.';
};

const sanitiseJobPart = (value: string): string => {
  const sanitised = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitised || 'video';
};
