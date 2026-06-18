import type { EditorMode, LayerState, ProjectSettings } from '../types';
import type {
  ProjectExportRustEncodeFrameRequest,
  ProjectExportRustFrameRequest,
  ProjectExportRustFrameSource,
} from './projectExportFrameCanvas';
import {
  createRustBackendVideoEncodeSharedFrameWriter,
  type CreateRustBackendVideoEncodeSharedFrameWriterInput,
  type RustBackendVideoEncodeSharedFrameWriter,
} from './rustBackendVideoEncodeSharedFrameWriter';
import {
  buildSharedRendererExportSession,
} from './sharedRendererExportSession';
import {
  startSharedRendererViewportPresenter,
  type StartSharedRendererViewportPresenterInput,
  type StartSharedRendererViewportPresenterResult,
} from './sharedRendererViewportPresenterOrchestration';
import type { SharedRendererViewportVideoDecodeJob } from './sharedRendererViewportVideoUpload';
import { stopRustBackendVideoDecode } from './rustBackendVideoDecodeControl';
import type { SharedRendererPreviewSurfaceBlockedReason } from './sharedRendererPreviewSurface';

type PresenterDataset = Record<string, string | undefined>;

export type SharedRendererExportFrameSourceBlockedReason =
  | SharedRendererPreviewSurfaceBlockedReason
  | 'videoUploadFailed'
  | 'videoOwnershipUnavailable'
  | 'webGpuReadbackUnavailable';

export type SharedRendererExportFrameBitmapFactory = (
  canvas: HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number
) => Promise<ImageBitmap>;

export type SharedRendererExportSessionBuilder = typeof buildSharedRendererExportSession;

export type SharedRendererExportViewportPresenterStarter = (
  input: StartSharedRendererViewportPresenterInput
) => Promise<StartSharedRendererViewportPresenterResult>;

export type SharedRendererExportVideoDecodeJobStopper = (
  job: SharedRendererViewportVideoDecodeJob
) => Promise<void>;

export type SharedRendererExportEncodeFrameWriterFactory = (
  input: CreateRustBackendVideoEncodeSharedFrameWriterInput
) => Promise<RustBackendVideoEncodeSharedFrameWriter>;

export interface CreateSharedRendererExportFrameSourceInput {
  canvas: HTMLCanvasElement;
  projectSettings: ProjectSettings;
  layers: LayerState[];
  editorMode: EditorMode;
  webGpuAvailable: boolean;
  fallbackAdapter: boolean;
  videoCutoverEnabled: boolean;
  datasets?: PresenterDataset[];
  buildExportSession?: SharedRendererExportSessionBuilder;
  startViewportPresenter?: SharedRendererExportViewportPresenterStarter;
  createFrameBitmap?: SharedRendererExportFrameBitmapFactory;
  stopVideoDecodeJob?: SharedRendererExportVideoDecodeJobStopper;
  createEncodeFrameWriter?: SharedRendererExportEncodeFrameWriterFactory;
}

export class SharedRendererExportFrameSourceBlockedError extends Error {
  readonly fallbackToLegacyCanvas = true;

  constructor(
    message: string,
    readonly reason: SharedRendererExportFrameSourceBlockedReason,
    readonly frameIndex: number
  ) {
    super(message);
    this.name = 'SharedRendererExportFrameSourceBlockedError';
  }
}

export const isSharedRendererExportFrameSourceBlockedError = (
  value: unknown
): value is SharedRendererExportFrameSourceBlockedError =>
  value instanceof SharedRendererExportFrameSourceBlockedError
  || (
    typeof value === 'object'
    && value !== null
    && (value as { fallbackToLegacyCanvas?: unknown }).fallbackToLegacyCanvas === true
    && typeof (value as { reason?: unknown }).reason === 'string'
    && typeof (value as { frameIndex?: unknown }).frameIndex === 'number'
  );

export const createSharedRendererExportFrameSource = ({
  canvas,
  projectSettings,
  layers,
  editorMode,
  webGpuAvailable,
  fallbackAdapter,
  videoCutoverEnabled,
  datasets = [canvas.dataset as unknown as PresenterDataset],
  buildExportSession = buildSharedRendererExportSession,
  startViewportPresenter = startSharedRendererViewportPresenter,
  createFrameBitmap = defaultCreateFrameBitmap,
  stopVideoDecodeJob = defaultStopVideoDecodeJob,
  createEncodeFrameWriter = createRustBackendVideoEncodeSharedFrameWriter,
}: CreateSharedRendererExportFrameSourceInput): ProjectExportRustFrameSource => {
  let activeVideoDecodeJobs: SharedRendererViewportVideoDecodeJob[] = [];
  let activeEncodeFrameWriter: RustBackendVideoEncodeSharedFrameWriter | null = null;
  let activeEncodeSessionId: string | null = null;
  let requestId = 0;
  let closed = false;

  const presentFrame = async (
    request: ProjectExportRustFrameRequest
  ): Promise<StartSharedRendererViewportPresenterResult> => {
    if (closed) {
      throw new Error('Shared renderer export frame source has already been closed.');
    }

    const session = buildExportSession({
      enabled: true,
      projectSettings,
      layers,
      objects: [...request.objects],
      time: request.time,
      editorMode,
      webGpuAvailable,
      fallbackAdapter,
    });
    const surfaceGate = session.surfaceGate;
    if (!surfaceGate.ok) {
      writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
        status: 'blocked',
        frameIndex: request.frameIndex,
        reason: surfaceGate.reason,
      });
      throw new SharedRendererExportFrameSourceBlockedError(
        surfaceGate.detail,
        surfaceGate.reason,
        request.frameIndex
      );
    }
    writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
      status: 'ready',
      frameIndex: request.frameIndex,
    });

    if (canvas.width !== surfaceGate.canvas.width) {
      canvas.width = surfaceGate.canvas.width;
    }
    if (canvas.height !== surfaceGate.canvas.height) {
      canvas.height = surfaceGate.canvas.height;
    }

    const presenterResult = await startViewportPresenter({
      canvas,
      session,
      datasets,
      diagnosticSwatchEnabled: false,
      videoCutoverEnabled,
      activeVideoDecodeJob: activeVideoDecodeJobs[0] ?? null,
      activeVideoDecodeJobs,
      requestId: (requestId += 1),
      onVideoDecodeJobsResolved: (jobs) => {
        activeVideoDecodeJobs = jobs;
      },
      onVideoDecodeJobResolved: (job) => {
        activeVideoDecodeJobs = job ? [job] : [];
      },
    });
    activeVideoDecodeJobs = presenterResult.activeVideoDecodeJobs;

    const videoUploadBlock = resolveExportVideoUploadBlock(presenterResult);
    if (videoUploadBlock) {
      presenterResult.control.dispose();
      writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
        status: 'blocked',
        frameIndex: request.frameIndex,
        reason: 'videoUploadFailed',
      });
      throw new SharedRendererExportFrameSourceBlockedError(
        videoUploadBlock,
        'videoUploadFailed',
        request.frameIndex
      );
    }
    const videoOwnershipBlock = resolveExportVideoOwnershipBlock(presenterResult);
    if (videoOwnershipBlock) {
      presenterResult.control.dispose();
      writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
        status: 'blocked',
        frameIndex: request.frameIndex,
        reason: 'videoOwnershipUnavailable',
      });
      throw new SharedRendererExportFrameSourceBlockedError(
        videoOwnershipBlock,
        'videoOwnershipUnavailable',
        request.frameIndex
      );
    }

    return presenterResult;
  };

  const renderFrameBitmap = async (request: ProjectExportRustFrameRequest): Promise<ImageBitmap> => {
    const presenterResult = await presentFrame(request);
    try {
      return await createFrameBitmap(
        canvas,
        0,
        0,
        request.width,
        request.height
      );
    } finally {
      presenterResult.control.dispose();
    }
  };

  const closeEncodeFrameWriter = async (): Promise<void> => {
    if (!activeEncodeFrameWriter) return;
    const writer = activeEncodeFrameWriter;
    activeEncodeFrameWriter = null;
    activeEncodeSessionId = null;
    await writer.close();
  };

  const getEncodeFrameWriter = async (
    request: ProjectExportRustEncodeFrameRequest
  ): Promise<RustBackendVideoEncodeSharedFrameWriter> => {
    if (activeEncodeFrameWriter && activeEncodeSessionId === request.encodeSessionId) {
      return activeEncodeFrameWriter;
    }
    await closeEncodeFrameWriter();
    activeEncodeSessionId = request.encodeSessionId;
    activeEncodeFrameWriter = await createEncodeFrameWriter({
      sessionId: request.encodeSessionId,
      memoryId: buildEncodeSourceMemoryId(request.encodeSessionId),
      width: request.width,
      height: request.height,
      fps: projectSettings.fps,
    });
    return activeEncodeFrameWriter;
  };

  return {
    renderFrame: renderFrameBitmap,
    renderEncodeFrame: async (request) => {
      const presenterResult = await presentFrame(request);
      try {
        const control = presenterResult.control;
        if (control.ok && 'readPresentedFrameRgbaBytes' in control) {
          const readback = await control.readPresentedFrameRgbaBytes({
            width: request.width,
            height: request.height,
          });
          const writer = await getEncodeFrameWriter(request);
          const sharedFramePayload = await writer.writePaddedFrame({
            frameIndex: request.frameIndex,
            timestampUs: request.timestampUs,
            paddedRgbaBytes: readback.rgbaBytes,
            strideBytes: readback.strideBytes,
          });
          return {
            timestamp: request.timestampUs,
            sharedFramePayload,
          };
        }

        writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
          status: 'blocked',
          frameIndex: request.frameIndex,
          reason: 'webGpuReadbackUnavailable',
        });
        throw new SharedRendererExportFrameSourceBlockedError(
          'WebGPU presented frame readback is required for Rust direct encode frames.',
          'webGpuReadbackUnavailable',
          request.frameIndex
        );
      } finally {
        presenterResult.control.dispose();
      }
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await closeEncodeFrameWriter();
      const jobsToStop = activeVideoDecodeJobs;
      activeVideoDecodeJobs = [];
      await Promise.all(jobsToStop.map(stopVideoDecodeJob));
    },
  };
};

const defaultCreateFrameBitmap: SharedRendererExportFrameBitmapFactory = (
  canvas,
  sx,
  sy,
  sw,
  sh
) => createImageBitmap(canvas, sx, sy, sw, sh);

const defaultStopVideoDecodeJob: SharedRendererExportVideoDecodeJobStopper = async (job) => {
  await stopRustBackendVideoDecode({
    jobId: job.jobId,
  });
};

const buildEncodeSourceMemoryId = (encodeSessionId: string): string => {
  const safeSessionId = encodeSessionId.replace(/[^A-Za-z0-9_-]/g, '-');
  return `/uxfd-export-source-${safeSessionId}`;
};

const resolveExportVideoUploadBlock = (
  presenterResult: StartSharedRendererViewportPresenterResult
): string | null => {
  const videoUploadsResult = presenterResult.videoUploadsResult;
  if (
    videoUploadsResult
    && !videoUploadsResult.ok
    && videoUploadsResult.reason !== 'noVideoDecodeRequest'
  ) {
    return videoUploadsResult.detail;
  }

  const videoUploadResult = presenterResult.videoUploadResult;
  if (
    videoUploadResult
    && !videoUploadResult.ok
    && videoUploadResult.reason !== 'noVideoDecodeRequest'
  ) {
    return videoUploadResult.detail;
  }

  return null;
};

const resolveExportVideoOwnershipBlock = (
  presenterResult: StartSharedRendererViewportPresenterResult
): string | null => {
  const control = presenterResult.control;
  if (!('videoOwnership' in control)) return null;
  const { videoOwnership } = control;
  if (videoOwnership.reason === 'noVideoScene') return null;
  if (videoOwnership.owner === 'sharedRenderer') return null;

  return `Shared renderer export cannot delegate video ownership back to Pixi (${videoOwnership.reason}).`;
};

const writeFrameDiagnostics = (
  dataset: PresenterDataset,
  state: {
    status: 'ready' | 'blocked';
    frameIndex: number;
    reason?: string;
  }
): void => {
  dataset.uxfdRustExportFrameSourceFrameStatus = state.status;
  dataset.uxfdRustExportFrameSourceFrameIndex = String(state.frameIndex);
  dataset.uxfdRustExportFrameSourceFrameReason = state.reason;
};
