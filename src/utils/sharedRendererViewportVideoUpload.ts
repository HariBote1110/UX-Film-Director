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
  type RustBackendVideoDecodeBridge,
  type RustBackendVideoDecodeFrameRate,
} from './rustBackendVideoDecodeControl';
import {
  prepareSharedRendererRustDecodedVideoUpload,
  type PrepareSharedRendererRustDecodedVideoUploadResult,
} from './sharedRendererRustVideoUploadPipeline';
import type { SharedVideoFrameCopyBridge } from './sharedVideoFrameUploadBridge';

export interface SharedRendererViewportVideoDecodeJob {
  jobId: string;
  source: string;
  slotCount: number;
  width: number;
  height: number;
  sourceRate: RustBackendVideoDecodeFrameRate;
}

interface PreviewDecodeCanvasSize {
  width: number;
  height: number;
}

const MAX_VIEWPORT_VIDEO_DECODE_EDGE = 1920;

type PreparedViewportVideoUpload = Extract<
  PrepareSharedRendererRustDecodedVideoUploadResult,
  { ok: true }
>;
type PreparedViewportVideoUploadFailureReason = Extract<
  PrepareSharedRendererRustDecodedVideoUploadResult,
  { ok: false }
>['reason'];

export interface PrepareSharedRendererViewportVideoUploadInput {
  session: SharedRendererPreviewSession;
  requestId?: number;
  slotCount?: number;
  activeJob?: SharedRendererViewportVideoDecodeJob | null;
  rustBackendBridge?: RustBackendVideoDecodeBridge;
  copyBridge?: SharedVideoFrameCopyBridge;
  decodeRequestBuilder?: SharedRendererVideoFrameDecodeRequestBuilder;
}

export interface PrepareSharedRendererViewportVideoUploadsInput {
  session: SharedRendererPreviewSession;
  requestId?: number;
  slotCount?: number;
  activeJobs?: readonly SharedRendererViewportVideoDecodeJob[];
  rustBackendBridge?: RustBackendVideoDecodeBridge;
  copyBridge?: SharedVideoFrameCopyBridge;
  decodeRequestBuilder?: SharedRendererVideoFrameDecodeRequestBuilder;
}

export type PrepareSharedRendererViewportVideoUploadResult =
  | {
      ok: true;
      activeJob: SharedRendererViewportVideoDecodeJob;
      request: SharedRendererVideoFrameDecodeRequest;
      upload: PreparedViewportVideoUpload;
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
        | 'uploadAbortReleaseFailed'
        | 'uploadFailed';
      detail: string;
      activeJob?: SharedRendererViewportVideoDecodeJob | null;
      uploadFailureReason?: PreparedViewportVideoUploadFailureReason;
      uploadFailureClipId?: string;
      uploadFailureMediaId?: string;
    };

export type PrepareSharedRendererViewportVideoUploadsResult =
  | {
      ok: true;
      activeJobs: SharedRendererViewportVideoDecodeJob[];
      uploads: Array<{
        request: SharedRendererVideoFrameDecodeRequest;
        upload: PreparedViewportVideoUpload;
      }>;
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
        | 'uploadAbortReleaseFailed'
        | 'uploadFailed';
      detail: string;
      activeJobs: SharedRendererViewportVideoDecodeJob[];
      uploadFailureReason?: PreparedViewportVideoUploadFailureReason;
      uploadFailureClipId?: string;
      uploadFailureMediaId?: string;
    };

export const prepareSharedRendererViewportVideoUploads = async ({
  session,
  requestId,
  slotCount = 2,
  activeJobs = [],
  rustBackendBridge = window.rustBackend,
  copyBridge = window.sharedVideoFrame,
  decodeRequestBuilder = buildSharedRendererVideoFrameDecodeRequests,
}: PrepareSharedRendererViewportVideoUploadsInput): Promise<PrepareSharedRendererViewportVideoUploadsResult> => {
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

  const resolvedActiveJobs: SharedRendererViewportVideoDecodeJob[] = [];
  const uploads: Array<{
    request: SharedRendererVideoFrameDecodeRequest;
    upload: PreparedViewportVideoUpload;
  }> = [];
  const resolvedRequestId = requestId ?? surfaceGate.snapshot.frame_index;
  const requestedJobs = decodeRequests.requests.map((request) => ({
    request,
    nextJob: buildViewportVideoDecodeJob(request, slotCount, surfaceGate.canvas),
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
        const abortReleaseFailure = await releasePreparedViewportVideoUploadsAfterAbort(uploads);
        if (abortReleaseFailure) {
          return {
            ok: false,
            reason: 'uploadAbortReleaseFailed',
            detail: abortReleaseFailure,
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
    let decodeResponse = await requestRustBackendVideoDecodeFrame(decodeFramePayload, rustBackendBridge);
    if (!decodeResponse.success && activeMatch && isNoActiveDecodeSessionError(decodeResponse.error)) {
      const restartResult = await startDecodeJob(nextJob, request, rustBackendBridge);
      if (isDecodeJobStartFailure(restartResult)) {
        const abortReleaseFailure = await releasePreparedViewportVideoUploadsAfterAbort(uploads);
        if (abortReleaseFailure) {
          return {
            ok: false,
            reason: 'uploadAbortReleaseFailed',
            detail: abortReleaseFailure,
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
      decodeResponse = await requestRustBackendVideoDecodeFrame(decodeFramePayload, rustBackendBridge);
    }
    resolvedActiveJobs.push(resolvedJob);
    if (!decodeResponse.success) {
      const abortReleaseFailure = await releasePreparedViewportVideoUploadsAfterAbort(uploads);
      if (abortReleaseFailure) {
        return {
          ok: false,
          reason: 'uploadAbortReleaseFailed',
          detail: abortReleaseFailure,
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
      }, rustBackendBridge);
      if (!releaseResponse.success) {
        const abortReleaseFailure = await releasePreparedViewportVideoUploadsAfterAbort(uploads);
        if (abortReleaseFailure) {
          return {
            ok: false,
            reason: 'uploadAbortReleaseFailed',
            detail: abortReleaseFailure,
            activeJobs: resolvedActiveJobs,
          };
        }
        return {
          ok: false,
          reason: 'staleDecodeReleaseFailed',
          detail: releaseResponse.error ?? 'Rust backend stale decoded frame release failed.',
          activeJobs: resolvedActiveJobs,
        };
      }
      const abortReleaseFailure = await releasePreparedViewportVideoUploadsAfterAbort(uploads);
      if (abortReleaseFailure) {
        return {
          ok: false,
          reason: 'uploadAbortReleaseFailed',
          detail: abortReleaseFailure,
          activeJobs: resolvedActiveJobs,
        };
      }
      return {
        ok: false,
        reason: 'staleDecodeResponse',
        detail: buildStaleDecodedFrameDetail(decodeResponse.result, resolvedRequestId, resolvedJob.jobId),
        uploadFailureClipId: request.clipId,
        uploadFailureMediaId: request.mediaId,
        activeJobs: resolvedActiveJobs,
      };
    }

    const upload = await prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse,
      slotCount: resolvedJob.slotCount,
      copyBridge,
      rustBackendBridge,
    });
    if (!upload.ok) {
      const abortReleaseFailure = await releasePreparedViewportVideoUploadsAfterAbort(uploads);
      if (abortReleaseFailure) {
        return {
          ok: false,
          reason: 'uploadAbortReleaseFailed',
          detail: abortReleaseFailure,
          activeJobs: resolvedActiveJobs,
        };
      }
      return {
        ok: false,
        reason: 'uploadFailed',
        detail: upload.detail,
        uploadFailureReason: upload.reason,
        uploadFailureClipId: request.clipId,
        uploadFailureMediaId: request.mediaId,
        activeJobs: resolvedActiveJobs,
      };
    }

    uploads.push({ request, upload });
  }

  return {
    ok: true,
    activeJobs: resolvedActiveJobs,
    uploads,
  };
};

const releasePreparedViewportVideoUploadsAfterAbort = async (
  uploads: Array<{
    request: SharedRendererVideoFrameDecodeRequest;
    upload: PreparedViewportVideoUpload;
  }>
): Promise<string | null> => {
  let firstFailure: string | null = null;
  for (const { upload } of uploads) {
    try {
      await upload.releaseAfterUploadAbort?.();
    } catch (error) {
      firstFailure ??= error instanceof Error ? error.message : String(error);
    }
  }
  return firstFailure;
};

export const prepareSharedRendererViewportVideoUpload = async ({
  session,
  requestId,
  slotCount = 2,
  activeJob = null,
  rustBackendBridge = window.rustBackend,
  copyBridge = window.sharedVideoFrame,
  decodeRequestBuilder = buildSharedRendererVideoFrameDecodeRequests,
}: PrepareSharedRendererViewportVideoUploadInput): Promise<PrepareSharedRendererViewportVideoUploadResult> => {
  if (!session.surfaceGate.ok) {
    return {
      ok: false,
      reason: 'surfaceGateUnavailable',
      detail: session.surfaceGate.detail,
      activeJob,
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
      activeJob,
    };
  }

  const request = decodeRequests.requests[0];
  if (!request) {
    return {
      ok: false,
      reason: 'noVideoDecodeRequest',
      detail: 'Shared renderer preview session does not contain a visible video frame request.',
      activeJob,
    };
  }

  const nextJob = buildViewportVideoDecodeJob(request, slotCount, surfaceGate.canvas);
  const resolvedJob = sameDecodeJob(activeJob, nextJob)
    ? activeJob
    : await replaceDecodeJob(activeJob, nextJob, request, rustBackendBridge);
  if (isDecodeJobStartFailure(resolvedJob)) {
    return {
      ok: false,
      reason: 'startFailed',
      detail: resolvedJob.detail,
      activeJob,
    };
  }

  const decodeFramePayload = {
    jobId: resolvedJob.jobId,
    requestId: requestId ?? surfaceGate.snapshot.frame_index,
    frameIndex: request.sourceFrame,
    mode: 'latestWins',
  } as const;
  let decodeResponse = await requestRustBackendVideoDecodeFrame(decodeFramePayload, rustBackendBridge);
  if (!decodeResponse.success && sameDecodeJob(activeJob, nextJob) && isNoActiveDecodeSessionError(decodeResponse.error)) {
    const restartResult = await startDecodeJob(nextJob, request, rustBackendBridge);
    if (isDecodeJobStartFailure(restartResult)) {
      return {
        ok: false,
        reason: 'startFailed',
        detail: restartResult.detail,
        activeJob,
      };
    }
    decodeResponse = await requestRustBackendVideoDecodeFrame(decodeFramePayload, rustBackendBridge);
  }
  if (!decodeResponse.success) {
    return {
      ok: false,
      reason: 'frameDecodeFailed',
      detail: decodeResponse.error ?? 'Rust backend video frame decode request failed.',
      activeJob: resolvedJob,
    };
  }
  if (
    isRustBackendDecodedVideoFrameAvailable(decodeResponse)
    && (
      decodeResponse.result.requestId !== (requestId ?? surfaceGate.snapshot.frame_index)
      || decodeResponse.result.jobId !== resolvedJob.jobId
    )
  ) {
    const releaseResponse = await releaseRustBackendVideoDecodeFrame({
      jobId: decodeResponse.result.jobId,
      slotIndex: decodeResponse.result.frame.descriptor.slotIndex,
      generation: decodeResponse.result.frame.descriptor.generation,
      copyOutState: 'rendererUploadAborted',
    }, rustBackendBridge);
    if (!releaseResponse.success) {
      return {
        ok: false,
        reason: 'staleDecodeReleaseFailed',
        detail: releaseResponse.error ?? 'Rust backend stale decoded frame release failed.',
        activeJob: resolvedJob,
      };
    }
    return {
      ok: false,
      reason: 'staleDecodeResponse',
      detail: buildStaleDecodedFrameDetail(
        decodeResponse.result,
        requestId ?? surfaceGate.snapshot.frame_index,
        resolvedJob.jobId
      ),
      uploadFailureClipId: request.clipId,
      uploadFailureMediaId: request.mediaId,
      activeJob: resolvedJob,
    };
  }

  const upload = await prepareSharedRendererRustDecodedVideoUpload({
    decodeResponse,
    slotCount: resolvedJob.slotCount,
    copyBridge,
    rustBackendBridge,
  });
  if (!upload.ok) {
    return {
      ok: false,
      reason: 'uploadFailed',
      detail: upload.detail,
      uploadFailureReason: upload.reason,
      uploadFailureClipId: request.clipId,
      uploadFailureMediaId: request.mediaId,
      activeJob: resolvedJob,
    };
  }

  return {
    ok: true,
    activeJob: resolvedJob,
    request,
    upload,
  };
};

const replaceDecodeJob = async (
  currentJob: SharedRendererViewportVideoDecodeJob | null,
  nextJob: SharedRendererViewportVideoDecodeJob,
  request: SharedRendererVideoFrameDecodeRequest,
  rustBackendBridge: RustBackendVideoDecodeBridge
): Promise<SharedRendererViewportVideoDecodeJob | { ok: false; detail: string }> => {
  if (currentJob) {
    const stopResponse = await stopRustBackendVideoDecode({
      jobId: currentJob.jobId,
    }, rustBackendBridge);
    if (!stopResponse.success) {
      return {
        ok: false,
        detail: stopResponse.error ?? 'Rust backend rejected the stale video decode stop request.',
      };
    }
  }

  return startDecodeJob(nextJob, request, rustBackendBridge);
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

const isNoActiveDecodeSessionError = (error: string | undefined): boolean =>
  typeof error === 'string'
  && error.toLowerCase().includes('no active decode session');

const buildStaleDecodedFrameDetail = (
  result: {
    requestId: number;
    jobId: string;
  },
  expectedRequestId: number,
  expectedJobId: string,
): string => {
  if (result.requestId !== expectedRequestId) {
    return 'Rust backend returned a decoded frame for a stale request id.';
  }
  if (result.jobId !== expectedJobId) {
    return 'Rust backend returned a decoded frame for a stale job id.';
  }
  return 'Rust backend returned a stale decoded frame.';
};

const buildViewportVideoDecodeJob = (
  request: SharedRendererVideoFrameDecodeRequest,
  slotCount: number,
  canvas: PreviewDecodeCanvasSize
): SharedRendererViewportVideoDecodeJob => {
  const size = resolveViewportVideoDecodeSize(request, canvas);
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
  request: SharedRendererVideoFrameDecodeRequest,
  canvas: PreviewDecodeCanvasSize
): { width: number; height: number } => {
  const sourceWidth = Math.max(1, request.width);
  const sourceHeight = Math.max(1, request.height);
  const maxWidth = Math.max(1, Math.min(sourceWidth, canvas.width, MAX_VIEWPORT_VIDEO_DECODE_EDGE));
  const maxHeight = Math.max(1, Math.min(sourceHeight, canvas.height, MAX_VIEWPORT_VIDEO_DECODE_EDGE));
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
  && current.sourceRate.numerator === next.sourceRate.numerator
  && current.sourceRate.denominator === next.sourceRate.denominator;

const sanitiseJobPart = (value: string): string => {
  const sanitised = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitised || 'video';
};
