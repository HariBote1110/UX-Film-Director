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

export interface StartSharedRendererViewportPresenterInput {
  canvas: HTMLCanvasElement;
  session: StartSharedRendererPreviewPresenterInput['session'];
  datasets: StartSharedRendererPreviewPresenterInput['datasets'];
  diagnosticSwatchEnabled: boolean;
  videoCutoverEnabled: boolean;
  nativeRenderPreviewEnabled?: boolean;
  requireSharedRendererVideo?: boolean;
  requireRustVideoControlPlane?: boolean;
  requireSharedRendererOutput?: boolean;
  activeVideoDecodeJob: SharedRendererViewportVideoDecodeJob | null;
  activeVideoDecodeJobs?: SharedRendererViewportVideoDecodeJob[];
  requestId: number;
  presentedFrameSharedFrameTaker?: SharedRendererPresentedFrameSharedFrameTaker;
  prepareVideoUpload?: SharedRendererViewportVideoUploadPreparer;
  prepareVideoUploads?: SharedRendererViewportVideoUploadsPreparer;
  prepareNativeRenderUpload?: SharedRendererViewportNativeRenderUploadPreparer;
  startPresenter?: SharedRendererViewportPresenterStarter;
  onVideoDecodeJobResolved?: (job: SharedRendererViewportVideoDecodeJob | null) => void;
  onVideoDecodeJobsResolved?: (jobs: SharedRendererViewportVideoDecodeJob[]) => void;
}

export interface StartSharedRendererViewportPresenterResult {
  control: SharedRendererPreviewPresenterControl;
  activeVideoDecodeJob: SharedRendererViewportVideoDecodeJob | null;
  activeVideoDecodeJobs: SharedRendererViewportVideoDecodeJob[];
  videoUploadResult?: PrepareSharedRendererViewportVideoUploadResult;
  videoUploadsResult?: PrepareSharedRendererViewportVideoUploadsResult;
  nativeRenderUploadResult?: PrepareSharedRendererViewportNativeRenderUploadResult;
}

export const startSharedRendererViewportPresenter = async ({
  canvas,
  session,
  datasets,
  diagnosticSwatchEnabled,
  videoCutoverEnabled,
  nativeRenderPreviewEnabled = false,
  requireSharedRendererVideo = false,
  requireRustVideoControlPlane = false,
  requireSharedRendererOutput = false,
  activeVideoDecodeJob,
  activeVideoDecodeJobs,
  requestId,
  presentedFrameSharedFrameTaker,
  prepareVideoUpload = prepareSharedRendererViewportVideoUpload,
  prepareVideoUploads = prepareSharedRendererViewportVideoUploads,
  prepareNativeRenderUpload,
  startPresenter = startSharedRendererPreviewPresenter,
  onVideoDecodeJobResolved,
  onVideoDecodeJobsResolved,
}: StartSharedRendererViewportPresenterInput): Promise<StartSharedRendererViewportPresenterResult> => {
  let nextActiveVideoDecodeJob = activeVideoDecodeJob;
  let nextActiveVideoDecodeJobs = activeVideoDecodeJobs ?? (activeVideoDecodeJob ? [activeVideoDecodeJob] : []);
  const effectiveVideoCutoverEnabled = videoCutoverEnabled || requireSharedRendererVideo;
  const shouldUseMultipleVideoUploads = Boolean(activeVideoDecodeJobs);
  const nativeRenderUploadPreparer = prepareNativeRenderUpload
    ?? (nativeRenderPreviewEnabled ? prepareSharedRendererViewportNativeRenderUpload : undefined);
  const nativeRenderUploadResult = nativeRenderUploadPreparer
    ? await nativeRenderUploadPreparer({
      session,
      requestId,
      activeJobs: nextActiveVideoDecodeJobs,
    })
    : undefined;
  const sharedRendererNativeRenderFrameUpload = nativeRenderUploadResult?.ok
    ? nativeRenderUploadResult.upload
    : undefined;
  const sharedRendererNativeRenderFailure = nativeRenderUploadResult && !nativeRenderUploadResult.ok
    ? {
      reason: nativeRenderUploadResult.reason,
      detail: nativeRenderUploadResult.detail,
    }
    : undefined;
  if (nativeRenderUploadResult) {
    nextActiveVideoDecodeJobs = nativeRenderUploadResult.activeJobs;
    nextActiveVideoDecodeJob = nextActiveVideoDecodeJobs[0] ?? null;
  }
  const shouldPrepareVideoUploads = effectiveVideoCutoverEnabled && !sharedRendererNativeRenderFrameUpload;
  const videoUploadsResult = shouldPrepareVideoUploads && shouldUseMultipleVideoUploads
    ? await prepareVideoUploads({
      session,
      requestId,
      activeJobs: nextActiveVideoDecodeJobs,
    })
    : undefined;
  const videoUploadResult = shouldPrepareVideoUploads && !shouldUseMultipleVideoUploads
    ? await prepareVideoUpload({
      session,
      requestId,
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

  if (videoUploadResult && 'activeJob' in videoUploadResult) {
    nextActiveVideoDecodeJob = videoUploadResult.activeJob ?? null;
    nextActiveVideoDecodeJobs = nextActiveVideoDecodeJob ? [nextActiveVideoDecodeJob] : [];
  }
  if (videoUploadsResult) {
    nextActiveVideoDecodeJobs = videoUploadsResult.activeJobs;
    nextActiveVideoDecodeJob = nextActiveVideoDecodeJobs[0] ?? null;
  }
  onVideoDecodeJobResolved?.(nextActiveVideoDecodeJob);
  onVideoDecodeJobsResolved?.(nextActiveVideoDecodeJobs);

  const control = await startPresenter({
    canvas,
    session,
    datasets,
    diagnosticSwatchEnabled,
    sharedRendererVideoCutoverEnabled: effectiveVideoCutoverEnabled,
    requireSharedRendererVideo,
    requireRustVideoControlPlane,
    requireSharedRendererOutput,
    sharedRendererNativeRenderFrameUpload,
    sharedRendererNativeRenderFailure,
    sharedRendererVideoUploadFailure,
    sharedRendererDecodedVideoFrameUpload,
    sharedRendererDecodedVideoFrameUploads,
    presentedFrameSharedFrameTaker,
  });

  return {
    control,
    activeVideoDecodeJob: nextActiveVideoDecodeJob,
    activeVideoDecodeJobs: nextActiveVideoDecodeJobs,
    videoUploadResult,
    videoUploadsResult,
    nativeRenderUploadResult,
  };
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
    clipId: result.reason === 'uploadFailed' ? result.uploadFailureClipId : undefined,
    mediaId: result.reason === 'uploadFailed' ? result.uploadFailureMediaId : undefined,
  };
};
