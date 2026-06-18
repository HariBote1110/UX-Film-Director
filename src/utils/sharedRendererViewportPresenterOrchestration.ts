import {
  startSharedRendererPreviewPresenter,
  type SharedRendererPreviewPresenterControl,
  type StartSharedRendererPreviewPresenterInput,
} from './sharedRendererPreviewPresenterController';
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

export type SharedRendererViewportPresenterStarter = (
  input: StartSharedRendererPreviewPresenterInput
) => Promise<SharedRendererPreviewPresenterControl>;

export interface StartSharedRendererViewportPresenterInput {
  canvas: HTMLCanvasElement;
  session: StartSharedRendererPreviewPresenterInput['session'];
  datasets: StartSharedRendererPreviewPresenterInput['datasets'];
  diagnosticSwatchEnabled: boolean;
  videoCutoverEnabled: boolean;
  requireSharedRendererVideo?: boolean;
  activeVideoDecodeJob: SharedRendererViewportVideoDecodeJob | null;
  activeVideoDecodeJobs?: SharedRendererViewportVideoDecodeJob[];
  requestId: number;
  prepareVideoUpload?: SharedRendererViewportVideoUploadPreparer;
  prepareVideoUploads?: SharedRendererViewportVideoUploadsPreparer;
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
}

export const startSharedRendererViewportPresenter = async ({
  canvas,
  session,
  datasets,
  diagnosticSwatchEnabled,
  videoCutoverEnabled,
  requireSharedRendererVideo = false,
  activeVideoDecodeJob,
  activeVideoDecodeJobs,
  requestId,
  prepareVideoUpload = prepareSharedRendererViewportVideoUpload,
  prepareVideoUploads = prepareSharedRendererViewportVideoUploads,
  startPresenter = startSharedRendererPreviewPresenter,
  onVideoDecodeJobResolved,
  onVideoDecodeJobsResolved,
}: StartSharedRendererViewportPresenterInput): Promise<StartSharedRendererViewportPresenterResult> => {
  let nextActiveVideoDecodeJob = activeVideoDecodeJob;
  let nextActiveVideoDecodeJobs = activeVideoDecodeJobs ?? (activeVideoDecodeJob ? [activeVideoDecodeJob] : []);
  const shouldUseMultipleVideoUploads = Boolean(activeVideoDecodeJobs);
  const videoUploadsResult = videoCutoverEnabled && shouldUseMultipleVideoUploads
    ? await prepareVideoUploads({
      session,
      requestId,
      activeJobs: nextActiveVideoDecodeJobs,
    })
    : undefined;
  const videoUploadResult = videoCutoverEnabled && !shouldUseMultipleVideoUploads
    ? await prepareVideoUpload({
      session,
      requestId,
      activeJob: activeVideoDecodeJob,
    })
    : undefined;
  const sharedRendererDecodedVideoFrameUpload = videoUploadResult?.ok
    ? videoUploadResult.upload
    : undefined;
  const sharedRendererDecodedVideoFrameUploads = videoUploadsResult?.ok
    ? videoUploadsResult.uploads.map(({ request, upload }) => ({
      ...upload,
      clipId: request.clipId,
    }))
    : undefined;

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
    sharedRendererVideoCutoverEnabled: videoCutoverEnabled,
    requireSharedRendererVideo,
    sharedRendererDecodedVideoFrameUpload,
    sharedRendererDecodedVideoFrameUploads,
  });

  return {
    control,
    activeVideoDecodeJob: nextActiveVideoDecodeJob,
    activeVideoDecodeJobs: nextActiveVideoDecodeJobs,
    videoUploadResult,
    videoUploadsResult,
  };
};
