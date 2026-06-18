import type { EditorMode, LayerState, ProjectSettings } from '../types';
import type {
  ProjectExportRustEncodeFrameRequest,
  ProjectExportRustFrameRequest,
  ProjectExportRustFrameSource,
} from './projectExportFrameCanvas';
import type {
  CreateRustBackendVideoEncodeSharedFrameWriterInput,
  RustBackendVideoEncodeSharedFrameWriter,
} from './rustBackendVideoEncodeSharedFrameWriter';
import {
  buildSharedRendererExportSession,
} from './sharedRendererExportSession';
import {
  renderRustBackendNativeSharedFrame,
  type RustBackendNativeRenderSharedFramePayload,
  type RustBackendNativeRenderSharedFrameResult,
} from './rustBackendNativeRenderControl';
import {
  startSharedRendererViewportPresenter,
  type StartSharedRendererViewportPresenterInput,
  type StartSharedRendererViewportPresenterResult,
} from './sharedRendererViewportPresenterOrchestration';
import {
  prepareSharedRendererViewportNativeRenderSources,
  type PrepareSharedRendererViewportNativeRenderSourcesInput,
  type PrepareSharedRendererViewportNativeRenderSourcesResult,
  type SharedRendererViewportNativeRenderSource,
} from './sharedRendererViewportNativeRenderSource';
import type { SharedRendererViewportVideoDecodeJob } from './sharedRendererViewportVideoUpload';
import { stopRustBackendVideoDecode } from './rustBackendVideoDecodeControl';
import type { RustBackendResult } from './rustBackendVideoDecodeControl';
import type { RustBackendVideoEncodeSharedFramePayloadFrame } from './rustBackendVideoEncodeExport';
import type { SharedRendererPreviewSurfaceBlockedReason } from './sharedRendererPreviewSurface';
import type { SharedRendererPresentedFrameSharedFrameTaker } from './sharedRendererWebGpuPresenter';
import {
  canRenderSharedRendererNativeMediaOnlyFrame,
} from './sharedRendererNativeMediaSupport';
import { resolveMixedNativeRenderUnsupportedMedia } from './sharedRendererNativeRenderMediaGate';

type PresenterDataset = Record<string, string | undefined>;

export type SharedRendererExportFrameSourceBlockedReason =
  | SharedRendererPreviewSurfaceBlockedReason
  | 'nativeRenderUnavailable'
  | 'videoUploadFailed'
  | 'videoOwnershipUnavailable'
  | 'webGpuReadbackUnavailable'
  | 'nativeRenderUnsupportedMedia'
  | 'nativeRenderFailed';

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

export type SharedRendererExportNativeRenderSourcesPreparer = (
  input: PrepareSharedRendererViewportNativeRenderSourcesInput
) => Promise<PrepareSharedRendererViewportNativeRenderSourcesResult>;

export type SharedRendererExportNativeSharedFrameRenderer = (
  payload: RustBackendNativeRenderSharedFramePayload
) => Promise<RustBackendResult<RustBackendNativeRenderSharedFrameResult>>;

export interface CreateSharedRendererExportFrameSourceInput {
  canvas: HTMLCanvasElement;
  projectSettings: ProjectSettings;
  layers: LayerState[];
  editorMode: EditorMode;
  webGpuAvailable: boolean;
  fallbackAdapter: boolean;
  videoCutoverEnabled: boolean;
  bitmapCaptureEnabled?: boolean;
  nativeRenderRequired?: boolean;
  presentedFrameSharedFrameTaker?: SharedRendererPresentedFrameSharedFrameTaker;
  datasets?: PresenterDataset[];
  buildExportSession?: SharedRendererExportSessionBuilder;
  startViewportPresenter?: SharedRendererExportViewportPresenterStarter;
  createFrameBitmap?: SharedRendererExportFrameBitmapFactory;
  stopVideoDecodeJob?: SharedRendererExportVideoDecodeJobStopper;
  createEncodeFrameWriter?: SharedRendererExportEncodeFrameWriterFactory;
  prepareNativeRenderSources?: SharedRendererExportNativeRenderSourcesPreparer;
  renderNativeSharedFrame?: SharedRendererExportNativeSharedFrameRenderer;
}

export type SharedRendererExportProjectFrameSource = ProjectExportRustFrameSource & Required<Pick<
  ProjectExportRustFrameSource,
  'renderFrame' | 'renderEncodeFrame'
>>;

export type SharedRendererEncodeOnlyExportProjectFrameSource = ProjectExportRustFrameSource & Required<Pick<
  ProjectExportRustFrameSource,
  'renderEncodeFrame'
>>;

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

export function createSharedRendererExportFrameSource(
  input: CreateSharedRendererExportFrameSourceInput & { bitmapCaptureEnabled: false }
): SharedRendererEncodeOnlyExportProjectFrameSource;
export function createSharedRendererExportFrameSource(
  input: CreateSharedRendererExportFrameSourceInput
): SharedRendererExportProjectFrameSource;
export function createSharedRendererExportFrameSource({
  canvas,
  projectSettings,
  layers,
  editorMode,
  webGpuAvailable,
  fallbackAdapter,
  videoCutoverEnabled,
  bitmapCaptureEnabled = true,
  nativeRenderRequired = false,
  presentedFrameSharedFrameTaker,
  datasets = [canvas.dataset as unknown as PresenterDataset],
  buildExportSession = buildSharedRendererExportSession,
  startViewportPresenter = startSharedRendererViewportPresenter,
  createFrameBitmap = defaultCreateFrameBitmap,
  stopVideoDecodeJob = defaultStopVideoDecodeJob,
  createEncodeFrameWriter = defaultCreateEncodeFrameWriter,
  prepareNativeRenderSources = prepareSharedRendererViewportNativeRenderSources,
  renderNativeSharedFrame: inputRenderNativeSharedFrame,
}: CreateSharedRendererExportFrameSourceInput): SharedRendererEncodeOnlyExportProjectFrameSource {
  let activeVideoDecodeJobs: SharedRendererViewportVideoDecodeJob[] = [];
  let activeEncodeFrameWriter: RustBackendVideoEncodeSharedFrameWriter | null = null;
  let activeEncodeSessionId: string | null = null;
  let requestId = 0;
  let closed = false;
  const renderNativeSharedFrame = inputRenderNativeSharedFrame ?? defaultRenderNativeSharedFrame;
  const nativeSharedFrameRendererAvailable =
    inputRenderNativeSharedFrame != null || isDefaultNativeSharedFrameRendererAvailable();

  const buildFrameSession = (request: ProjectExportRustFrameRequest) => {
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

    return session;
  };

  const presentFrame = async (
    request: ProjectExportRustFrameRequest
  ): Promise<StartSharedRendererViewportPresenterResult> => {
    const session = buildFrameSession(request);

    const presenterResult = await startViewportPresenter({
      canvas,
      session,
      datasets,
      diagnosticSwatchEnabled: false,
      videoCutoverEnabled,
      activeVideoDecodeJob: activeVideoDecodeJobs[0] ?? null,
      activeVideoDecodeJobs,
      requestId: (requestId += 1),
      presentedFrameSharedFrameTaker,
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

  const renderNativeEncodeFrame = async (
    request: ProjectExportRustEncodeFrameRequest
  ): Promise<RustBackendVideoEncodeSharedFramePayloadFrame | null> => {
    if (!nativeSharedFrameRendererAvailable) {
      if (nativeRenderRequired) {
        writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
          status: 'blocked',
          frameIndex: request.frameIndex,
          reason: 'nativeRenderUnavailable',
        });
        throw new SharedRendererExportFrameSourceBlockedError(
          'Rust backend native render bridge is required for encode-only export frames.',
          'nativeRenderUnavailable',
          request.frameIndex
        );
      }
      return null;
    }

    const session = buildFrameSession(request);
    const nextRequestId = requestId + 1;
    const nativeSources = await prepareNativeRenderSources({
      session,
      requestId: nextRequestId,
      activeJobs: activeVideoDecodeJobs,
    });

    let nativeRenderSources: SharedRendererViewportNativeRenderSource[];
    if (!nativeSources.ok) {
      if (nativeSources.reason === 'noVideoDecodeRequest') {
        requestId = nextRequestId;
        activeVideoDecodeJobs = nativeSources.activeJobs;
        const surfaceGate = session.surfaceGate;
        if (
          !nativeSharedFrameRendererAvailable
          || !surfaceGate.ok
          || !canRenderSharedRendererNativeMediaOnlyFrame({
            snapshot: surfaceGate.snapshot,
            media: surfaceGate.media,
          })
        ) {
          return null;
        }
        nativeRenderSources = [];
      } else {
        requestId = nextRequestId;
        activeVideoDecodeJobs = nativeSources.activeJobs;
        writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
          status: 'blocked',
          frameIndex: request.frameIndex,
          reason: 'nativeRenderFailed',
        });
        throw new SharedRendererExportFrameSourceBlockedError(
          nativeSources.detail,
          'nativeRenderFailed',
          request.frameIndex
        );
      }
    } else {
      requestId = nextRequestId;
      activeVideoDecodeJobs = nativeSources.activeJobs;
      nativeRenderSources = nativeSources.sources;
    }
    const surfaceGate = session.surfaceGate;
    if (!surfaceGate.ok) {
      return null;
    }
    const unsupportedNativeMedia = resolveMixedNativeRenderUnsupportedMedia({
      snapshot: surfaceGate.snapshot,
      media: surfaceGate.media,
    });
    if (unsupportedNativeMedia) {
      writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
        status: 'blocked',
        frameIndex: request.frameIndex,
        reason: 'nativeRenderUnsupportedMedia',
      });
      throw new SharedRendererExportFrameSourceBlockedError(
        unsupportedNativeMedia,
        'nativeRenderUnsupportedMedia',
        request.frameIndex
      );
    }

    const renderId = buildNativeRenderId(request.encodeSessionId, request.frameIndex);
    const renderResponse = await renderNativeSharedFrame({
      renderId,
      memoryId: buildNativeRenderMemoryId(request.encodeSessionId, request.frameIndex),
      slotCount: 1,
      ptsFrame: request.frameIndex,
      width: request.width,
      height: request.height,
      snapshot: surfaceGate.snapshot,
      media: surfaceGate.media,
      sources: nativeRenderSources.map((source) => ({
        mediaId: source.mediaId,
        slotCount: source.slotCount,
        frame: source.frame,
      })),
    });
    if (!renderResponse.success || !renderResponse.result) {
      writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
        status: 'blocked',
        frameIndex: request.frameIndex,
        reason: 'nativeRenderFailed',
      });
      throw new SharedRendererExportFrameSourceBlockedError(
        renderResponse.error ?? 'Rust backend native render failed.',
        'nativeRenderFailed',
        request.frameIndex
      );
    }

    writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
      status: 'ready',
      frameIndex: request.frameIndex,
      path: 'nativeRenderSharedFrame',
      nativeRender: {
        media: surfaceGate.media,
        sources: nativeRenderSources,
      },
    });

    return {
      timestamp: request.timestampUs,
      sharedFramePayload: {
        sessionId: request.encodeSessionId,
        frameIndex: request.frameIndex,
        timestampUs: request.timestampUs,
        slotCount: renderResponse.result.slotCount,
        frame: renderResponse.result.frame,
      },
      releaseAfterEncodeFailure: {
        kind: 'nativeRenderOutput',
        memoryId: renderResponse.result.frame.descriptor.memoryId,
      },
    };
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

  const source: SharedRendererEncodeOnlyExportProjectFrameSource = {
    renderEncodeFrame: async (request) => {
      const nativeFrame = await renderNativeEncodeFrame(request);
      if (nativeFrame) {
        return nativeFrame;
      }

      const presenterResult = await presentFrame(request);
      try {
        const control = presenterResult.control;
        if (control.ok && typeof control.takePresentedFrameSharedFrame === 'function') {
          const sharedFramePayload = await control.takePresentedFrameSharedFrame({
            encodeSessionId: request.encodeSessionId,
            memoryId: buildEncodeSourceMemoryId(request.encodeSessionId),
            frameIndex: request.frameIndex,
            timestampUs: request.timestampUs,
            width: request.width,
            height: request.height,
            fps: projectSettings.fps,
          });
          writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
            status: 'ready',
            frameIndex: request.frameIndex,
            path: 'presentedSharedFrame',
          });
          return {
            timestamp: request.timestampUs,
            sharedFramePayload,
          };
        }

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
          writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
            status: 'ready',
            frameIndex: request.frameIndex,
            path: 'webGpuReadbackSharedFrameWriter',
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

  if (bitmapCaptureEnabled) {
    source.renderFrame = renderFrameBitmap;
  }

  return source;
}

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

const defaultCreateEncodeFrameWriter: SharedRendererExportEncodeFrameWriterFactory = async (input) => {
  const { createRustBackendVideoEncodeSharedFrameWriter } = await import('./rustBackendVideoEncodeSharedFrameWriter');
  return createRustBackendVideoEncodeSharedFrameWriter(input);
};

const defaultRenderNativeSharedFrame: SharedRendererExportNativeSharedFrameRenderer = (payload) =>
  renderRustBackendNativeSharedFrame(payload);

const isDefaultNativeSharedFrameRendererAvailable = (): boolean =>
  typeof window !== 'undefined'
  && typeof window.rustBackend?.renderNativeSharedFrame === 'function';

const buildEncodeSourceMemoryId = (encodeSessionId: string): string => {
  const safeSessionId = encodeSessionId.replace(/[^A-Za-z0-9_-]/g, '-');
  return `/uxfd-export-source-${safeSessionId}`;
};

const buildNativeRenderId = (encodeSessionId: string, frameIndex: number): string =>
  `${sanitiseNativeRenderPart(encodeSessionId)}-frame-${frameIndex}`;

const buildNativeRenderMemoryId = (encodeSessionId: string, frameIndex: number): string =>
  `/uxfd-native-render-${buildNativeRenderId(encodeSessionId, frameIndex)}`;

const sanitiseNativeRenderPart = (value: string): string => {
  const sanitised = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitised || 'session';
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
    path?: 'nativeRenderSharedFrame' | 'presentedSharedFrame' | 'webGpuReadbackSharedFrameWriter';
    nativeRender?: {
      media: readonly { kind: string }[];
      sources: readonly { mediaId: string }[];
    };
  }
): void => {
  dataset.uxfdRustExportFrameSourceFrameStatus = state.status;
  dataset.uxfdRustExportFrameSourceFrameIndex = String(state.frameIndex);
  dataset.uxfdRustExportFrameSourceFrameReason = state.reason;
  dataset.uxfdRustExportFrameSourceFramePath = state.path;
  dataset.uxfdRustExportFrameSourceNativeRenderMediaCount = state.nativeRender
    ? String(state.nativeRender.media.length)
    : undefined;
  dataset.uxfdRustExportFrameSourceNativeRenderMediaKinds = state.nativeRender
    ? state.nativeRender.media.map((reference) => reference.kind).join(',')
    : undefined;
  dataset.uxfdRustExportFrameSourceNativeRenderSourceCount = state.nativeRender
    ? String(state.nativeRender.sources.length)
    : undefined;
  dataset.uxfdRustExportFrameSourceNativeRenderSourceMediaIds = state.nativeRender
    ? state.nativeRender.sources.map((source) => source.mediaId).join(',')
    : undefined;
};
