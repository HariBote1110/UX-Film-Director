import {
  startSharedRendererPreviewPresenter,
  type SharedRendererPreviewPresenterControl,
  type StartSharedRendererPreviewPresenterInput,
} from './sharedRendererPreviewPresenterController';
import {
  prepareSharedRendererViewportVideoUpload,
  type PrepareSharedRendererViewportVideoUploadInput,
  type PrepareSharedRendererViewportVideoUploadResult,
  type SharedRendererViewportVideoDecodeJob,
} from './sharedRendererViewportVideoUpload';

export type SharedRendererViewportVideoUploadPreparer = (
  input: PrepareSharedRendererViewportVideoUploadInput
) => Promise<PrepareSharedRendererViewportVideoUploadResult>;

export type SharedRendererViewportPresenterStarter = (
  input: StartSharedRendererPreviewPresenterInput
) => Promise<SharedRendererPreviewPresenterControl>;

export interface StartSharedRendererViewportPresenterInput {
  canvas: HTMLCanvasElement;
  session: StartSharedRendererPreviewPresenterInput['session'];
  datasets: StartSharedRendererPreviewPresenterInput['datasets'];
  diagnosticSwatchEnabled: boolean;
  videoCutoverEnabled: boolean;
  activeVideoDecodeJob: SharedRendererViewportVideoDecodeJob | null;
  requestId: number;
  prepareVideoUpload?: SharedRendererViewportVideoUploadPreparer;
  startPresenter?: SharedRendererViewportPresenterStarter;
  onVideoDecodeJobResolved?: (job: SharedRendererViewportVideoDecodeJob | null) => void;
}

export interface StartSharedRendererViewportPresenterResult {
  control: SharedRendererPreviewPresenterControl;
  activeVideoDecodeJob: SharedRendererViewportVideoDecodeJob | null;
  videoUploadResult?: PrepareSharedRendererViewportVideoUploadResult;
}

export const startSharedRendererViewportPresenter = async ({
  canvas,
  session,
  datasets,
  diagnosticSwatchEnabled,
  videoCutoverEnabled,
  activeVideoDecodeJob,
  requestId,
  prepareVideoUpload = prepareSharedRendererViewportVideoUpload,
  startPresenter = startSharedRendererPreviewPresenter,
  onVideoDecodeJobResolved,
}: StartSharedRendererViewportPresenterInput): Promise<StartSharedRendererViewportPresenterResult> => {
  let nextActiveVideoDecodeJob = activeVideoDecodeJob;
  const videoUploadResult = videoCutoverEnabled
    ? await prepareVideoUpload({
      session,
      requestId,
      activeJob: activeVideoDecodeJob,
    })
    : undefined;
  const sharedRendererDecodedVideoFrameUpload = videoUploadResult?.ok
    ? videoUploadResult.upload
    : undefined;

  if (videoUploadResult && 'activeJob' in videoUploadResult) {
    nextActiveVideoDecodeJob = videoUploadResult.activeJob ?? null;
  }
  onVideoDecodeJobResolved?.(nextActiveVideoDecodeJob);

  const control = await startPresenter({
    canvas,
    session,
    datasets,
    diagnosticSwatchEnabled,
    sharedRendererVideoCutoverEnabled: videoCutoverEnabled,
    sharedRendererDecodedVideoFrameUpload,
  });

  return {
    control,
    activeVideoDecodeJob: nextActiveVideoDecodeJob,
    videoUploadResult,
  };
};
