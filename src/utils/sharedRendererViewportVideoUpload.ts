import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
import {
  buildSharedRendererVideoFrameDecodeRequests,
  type SharedRendererVideoFrameDecodeRequest,
  type SharedRendererVideoFrameDecodeRequestBuilder,
} from './sharedRendererVideoDecodeRequest';
import {
  requestRustBackendVideoDecodeFrame,
  startRustBackendVideoDecode,
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

type PreparedViewportVideoUpload = Extract<
  PrepareSharedRendererRustDecodedVideoUploadResult,
  { ok: true }
>;

export interface PrepareSharedRendererViewportVideoUploadInput {
  session: SharedRendererPreviewSession;
  requestId?: number;
  slotCount?: number;
  activeJob?: SharedRendererViewportVideoDecodeJob | null;
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
        | 'startFailed'
        | 'frameDecodeFailed'
        | 'uploadFailed';
      detail: string;
      activeJob?: SharedRendererViewportVideoDecodeJob | null;
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

  const decodeRequests = decodeRequestBuilder({
    snapshot: session.surfaceGate.snapshot,
    media: session.surfaceGate.media,
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

  const nextJob = buildViewportVideoDecodeJob(request, slotCount);
  const resolvedJob = sameDecodeJob(activeJob, nextJob)
    ? activeJob
    : await startDecodeJob(nextJob, request, rustBackendBridge);
  if ('ok' in resolvedJob && resolvedJob.ok === false) {
    return {
      ok: false,
      reason: 'startFailed',
      detail: resolvedJob.detail,
      activeJob,
    };
  }

  const decodeResponse = await requestRustBackendVideoDecodeFrame({
    jobId: resolvedJob.jobId,
    requestId: requestId ?? session.surfaceGate.snapshot.frame_index,
    frameIndex: request.sourceFrame,
    mode: 'latestWins',
  }, rustBackendBridge);
  if (!decodeResponse.success) {
    return {
      ok: false,
      reason: 'frameDecodeFailed',
      detail: decodeResponse.error ?? 'Rust backend video frame decode request failed.',
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

const buildViewportVideoDecodeJob = (
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
  && current.sourceRate.numerator === next.sourceRate.numerator
  && current.sourceRate.denominator === next.sourceRate.denominator;

const sanitiseJobPart = (value: string): string => {
  const sanitised = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitised || 'video';
};
