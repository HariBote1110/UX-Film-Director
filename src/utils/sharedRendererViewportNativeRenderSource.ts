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
  type RustBackendVideoDecodeBridge,
  type RustBackendVideoDecodeFrameRate,
} from './rustBackendVideoDecodeControl';
import type { SharedRendererViewportVideoDecodeJob } from './sharedRendererViewportVideoUpload';

export interface SharedRendererViewportNativeRenderSource {
  mediaId: string;
  slotCount: number;
  frame: RustBackendSharedVideoFrame;
}

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
        | 'decodedFrameUnavailable';
      detail: string;
      activeJobs: SharedRendererViewportVideoDecodeJob[];
    };

export const prepareSharedRendererViewportNativeRenderSources = async ({
  session,
  requestId,
  slotCount = 2,
  activeJobs = [],
  rustBackendBridge = window.rustBackend,
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

  const decodeRequests = decodeRequestBuilder({
    snapshot: session.surfaceGate.snapshot,
    media: session.surfaceGate.media,
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

  const resolvedActiveJobs: SharedRendererViewportVideoDecodeJob[] = [];
  const sources: SharedRendererViewportNativeRenderSource[] = [];
  const resolvedRequestId = requestId ?? session.surfaceGate.snapshot.frame_index;
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
    }, rustBackendBridge);
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
      const startResult = await startDecodeJob(nextJob, request, rustBackendBridge);
      if (isDecodeJobStartFailure(startResult)) {
        return {
          ok: false,
          reason: 'startFailed',
          detail: startResult.detail,
          activeJobs: resolvedActiveJobs,
        };
      }
      resolvedJob = startResult;
    }

    resolvedActiveJobs.push(resolvedJob);
    const decodeResponse = await requestRustBackendVideoDecodeFrame({
      jobId: resolvedJob.jobId,
      requestId: resolvedRequestId,
      frameIndex: request.sourceFrame,
      mode: 'latestWins',
    }, rustBackendBridge);
    if (!decodeResponse.success) {
      return {
        ok: false,
        reason: 'frameDecodeFailed',
        detail: decodeResponse.error ?? 'Rust backend video frame decode request failed.',
        activeJobs: resolvedActiveJobs,
      };
    }
    if (
      isRustBackendDecodedVideoFrameAvailable(decodeResponse)
      && decodeResponse.result.requestId !== resolvedRequestId
    ) {
      await releaseRustBackendVideoDecodeFrame({
        jobId: resolvedJob.jobId,
        slotIndex: decodeResponse.result.frame.descriptor.slotIndex,
        generation: decodeResponse.result.frame.descriptor.generation,
        copyOutState: 'rendererUploadAborted',
      }, rustBackendBridge);
      return {
        ok: false,
        reason: 'staleDecodeResponse',
        detail: 'Rust backend returned a decoded frame for a stale request id.',
        activeJobs: resolvedActiveJobs,
      };
    }
    if (!isRustBackendDecodedVideoFrameAvailable(decodeResponse)) {
      return {
        ok: false,
        reason: 'decodedFrameUnavailable',
        detail: 'Rust backend did not return a verified decoded video frame for native render.',
        activeJobs: resolvedActiveJobs,
      };
    }

    sources.push({
      mediaId: request.mediaId,
      slotCount: resolvedJob.slotCount,
      frame: decodeResponse.result.frame,
    });
  }

  return {
    ok: true,
    activeJobs: resolvedActiveJobs,
    sources,
  };
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

const buildViewportNativeRenderDecodeJob = (
  request: SharedRendererVideoFrameDecodeRequest,
  slotCount: number
): SharedRendererViewportVideoDecodeJob => ({
  jobId: [
    'shared-renderer-video',
    sanitiseJobPart(request.mediaId),
    `${request.width}x${request.height}`,
    `${request.sourceRate.numerator}over${request.sourceRate.denominator}`,
  ].join('-'),
  source: request.source,
  slotCount,
  width: request.width,
  height: request.height,
  sourceRate: request.sourceRate,
});

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

const sanitiseJobPart = (value: string): string => {
  const sanitised = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitised || 'video';
};
