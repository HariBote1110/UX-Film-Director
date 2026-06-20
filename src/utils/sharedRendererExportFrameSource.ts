import type { EditorMode, LayerState, ProjectSettings } from '../types';
import type {
  ProjectExportRustEncodeFrameRequest,
  ProjectExportRustFrameRequest,
  ProjectExportRustFrameSource,
} from './projectExportFrameCanvas';
import {
  buildSharedRendererExportSession,
} from './sharedRendererExportSession';
import {
  releaseRustBackendNativeSharedFrame,
  renderRustBackendNativeSharedFrame,
  type RustBackendNativeRenderReleaseSharedFramePayload,
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
  resolveNativeRenderSourceReleaseUnavailable,
  type PrepareSharedRendererViewportNativeRenderSourcesInput,
  type PrepareSharedRendererViewportNativeRenderSourcesResult,
  type SharedRendererViewportNativeRenderSource,
} from './sharedRendererViewportNativeRenderSource';
import type { SharedRendererViewportVideoDecodeJob } from './sharedRendererViewportVideoUpload';
import { stopRustBackendVideoDecode } from './rustBackendVideoDecodeControl';
import type { RustBackendResult } from './rustBackendVideoDecodeControl';
import type {
  RustBackendVideoEncodeNativeFramePayloadFrame,
  RustBackendVideoEncodeSharedFramePayloadFrame,
} from './rustBackendVideoEncodeExport';
import type { SharedRendererPreviewSurfaceBlockedReason } from './sharedRendererPreviewSurface';
import type { SharedRendererPresentedFrameSharedFrameTaker } from './sharedRendererWebGpuPresenter';
import {
  canRenderSharedRendererNativeMediaOnlyFrame,
} from './sharedRendererNativeMediaSupport';
import { resolveMixedNativeRenderUnsupportedMedia } from './sharedRendererNativeRenderMediaGate';
import { captureProjectExportLegacyCanvasFrame } from './projectExportLegacyCanvasCapture';
import type {
  RustEvaluatedClip,
  RustSceneMediaReference,
  RustSceneSnapshot,
  RustTransform,
} from './rustSceneSnapshot';

type PresenterDataset = Record<string, string | undefined>;

export type SharedRendererExportFrameSourceBlockedReason =
  | SharedRendererPreviewSurfaceBlockedReason
  | 'nativeRenderUnavailable'
  | 'videoUploadFailed'
  | 'videoOwnershipUnavailable'
  | 'presentedSharedFrameHandoffUnavailable'
  | 'presentedSharedFrameHandoffFailed'
  | 'videoBitmapCaptureDisabled'
  | 'nativeRenderSourceReleaseUnavailable'
  | 'nativeRenderSourceReleaseFailed'
  | 'nativeRenderOutputReleaseFailed'
  | 'nativeRenderUnsupportedMedia'
  | 'sharedRendererOutputUnavailable'
  | 'webGpuDrawUnavailable'
  | 'nativeRenderTextureViewUnavailable'
  | 'preparedNativeRenderSourceAbortReleaseFailed'
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

export type SharedRendererExportNativeRenderSourcesPreparer = (
  input: PrepareSharedRendererViewportNativeRenderSourcesInput
) => Promise<PrepareSharedRendererViewportNativeRenderSourcesResult>;

export type SharedRendererExportNativeSharedFrameRenderer = (
  payload: RustBackendNativeRenderSharedFramePayload
) => Promise<RustBackendResult<RustBackendNativeRenderSharedFrameResult>>;

export type SharedRendererExportNativeSharedFrameReleaser = (
  payload: RustBackendNativeRenderReleaseSharedFramePayload
) => Promise<RustBackendResult>;

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
  prepareNativeRenderSources?: SharedRendererExportNativeRenderSourcesPreparer;
  renderNativeSharedFrame?: SharedRendererExportNativeSharedFrameRenderer;
  releaseNativeSharedFrame?: SharedRendererExportNativeSharedFrameReleaser;
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
  readonly fallbackToLegacyCanvas: boolean;

  constructor(
    message: string,
    readonly reason: SharedRendererExportFrameSourceBlockedReason,
    readonly frameIndex: number,
    readonly legacyCanvasFallbackAllowed: boolean = false
  ) {
    super(message);
    this.name = 'SharedRendererExportFrameSourceBlockedError';
    this.fallbackToLegacyCanvas = legacyCanvasFallbackAllowed;
  }
}

export const isSharedRendererExportFrameSourceBlockedError = (
  value: unknown
): value is SharedRendererExportFrameSourceBlockedError =>
  value instanceof SharedRendererExportFrameSourceBlockedError
  || (
    typeof value === 'object'
    && value !== null
    && typeof (value as { fallbackToLegacyCanvas?: unknown }).fallbackToLegacyCanvas === 'boolean'
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
  prepareNativeRenderSources = prepareSharedRendererViewportNativeRenderSources,
  renderNativeSharedFrame: inputRenderNativeSharedFrame,
  releaseNativeSharedFrame = releaseRustBackendNativeSharedFrame,
}: CreateSharedRendererExportFrameSourceInput): SharedRendererEncodeOnlyExportProjectFrameSource {
  let activeVideoDecodeJobs: SharedRendererViewportVideoDecodeJob[] = [];
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
        request.frameIndex,
        true
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
      requireSharedRendererOutput: true,
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

    const sharedRendererOutputBlock = resolveSharedRendererOutputBlock(
      presenterResult,
      canvas.dataset as unknown as PresenterDataset
    );
    if (sharedRendererOutputBlock) {
      presenterResult.control.dispose();
      writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
        status: 'blocked',
        frameIndex: request.frameIndex,
        reason: sharedRendererOutputBlock.reason,
      });
      throw new SharedRendererExportFrameSourceBlockedError(
        sharedRendererOutputBlock.detail,
        sharedRendererOutputBlock.reason,
        request.frameIndex,
        false
      );
    }
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
        request.frameIndex,
        false
      );
    }
    const videoOwnershipBlock = resolveExportVideoOwnershipBlock(
      presenterResult,
      canvas.dataset as unknown as PresenterDataset
    );
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
        request.frameIndex,
        false
      );
    }

    return presenterResult;
  };

  const renderNativeEncodeFrame = async (
    request: ProjectExportRustEncodeFrameRequest
  ): Promise<RustBackendVideoEncodeSharedFramePayloadFrame | RustBackendVideoEncodeNativeFramePayloadFrame | null> => {
    const effectiveNativeRenderRequired = nativeRenderRequired
      || !bitmapCaptureEnabled
      || hasVideoObjects(request.objects);

    if (!nativeSharedFrameRendererAvailable) {
      if (effectiveNativeRenderRequired) {
        writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
          status: 'blocked',
          frameIndex: request.frameIndex,
          reason: 'nativeRenderUnavailable',
        });
        throw new SharedRendererExportFrameSourceBlockedError(
          'Rust backend native render bridge is required for encode-only export frames.',
          'nativeRenderUnavailable',
          request.frameIndex,
          false
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
        const nativeMediaOnlyRenderable = surfaceGate.ok
          && canRenderSharedRendererNativeMediaOnlyFrame({
            snapshot: surfaceGate.snapshot,
            media: surfaceGate.media,
          });
        if (!nativeMediaOnlyRenderable) {
          if (effectiveNativeRenderRequired) {
            writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
              status: 'blocked',
              frameIndex: request.frameIndex,
              reason: 'nativeRenderUnsupportedMedia',
            });
            throw new SharedRendererExportFrameSourceBlockedError(
              'Encode-only export requires every media-only frame source to be Rust native-renderable.',
              'nativeRenderUnsupportedMedia',
              request.frameIndex,
              false
            );
          }
          return null;
        }
        nativeRenderSources = [];
      } else {
        requestId = nextRequestId;
        activeVideoDecodeJobs = nativeSources.activeJobs;
        const nativeRenderBlockedReason = nativeSources.reason === 'preparedNativeRenderSourceAbortReleaseFailed'
          ? nativeSources.reason
          : 'nativeRenderFailed';
        writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
          status: 'blocked',
          frameIndex: request.frameIndex,
          reason: nativeRenderBlockedReason,
        });
        throw new SharedRendererExportFrameSourceBlockedError(
          nativeSources.detail,
          nativeRenderBlockedReason,
          request.frameIndex,
          nativeRenderBlockedReason !== 'preparedNativeRenderSourceAbortReleaseFailed'
            && !effectiveNativeRenderRequired
        );
      }
    } else {
      requestId = nextRequestId;
      activeVideoDecodeJobs = nativeSources.activeJobs;
      nativeRenderSources = nativeSources.sources;
    }
    const surfaceGate = session.surfaceGate;
    if (!surfaceGate.ok) {
      const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
      if (releaseFailure) {
        throwNativeRenderSourceReleaseFailed(canvas, request.frameIndex, releaseFailure);
      }
      return null;
    }
    const sourceReleaseBlock = resolveNativeRenderSourceReleaseUnavailable(nativeRenderSources);
    if (sourceReleaseBlock) {
      const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
      if (releaseFailure) {
        throwNativeRenderSourceReleaseFailed(canvas, request.frameIndex, releaseFailure);
      }
      writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
        status: 'blocked',
        frameIndex: request.frameIndex,
        reason: 'nativeRenderSourceReleaseUnavailable',
      });
      throw new SharedRendererExportFrameSourceBlockedError(
        sourceReleaseBlock,
        'nativeRenderSourceReleaseUnavailable',
        request.frameIndex,
        false
      );
    }
    const unsupportedNativeMedia = resolveMixedNativeRenderUnsupportedMedia({
      snapshot: surfaceGate.snapshot,
      media: surfaceGate.media,
    });
    if (unsupportedNativeMedia) {
      const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
      if (releaseFailure) {
        throwNativeRenderSourceReleaseFailed(canvas, request.frameIndex, releaseFailure);
      }
      writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
        status: 'blocked',
        frameIndex: request.frameIndex,
        reason: 'nativeRenderUnsupportedMedia',
      });
      throw new SharedRendererExportFrameSourceBlockedError(
        unsupportedNativeMedia,
        'nativeRenderUnsupportedMedia',
        request.frameIndex,
        !effectiveNativeRenderRequired
      );
    }

    const decodedVideoPassthroughFrame = resolveDecodedVideoPassthroughEncodeFrame({
      request,
      snapshot: surfaceGate.snapshot,
      media: surfaceGate.media,
      nativeRenderSources,
    });
    if (decodedVideoPassthroughFrame) {
      writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
        status: 'ready',
        frameIndex: request.frameIndex,
        path: 'decodedVideoPassthrough',
        nativeRender: {
          media: surfaceGate.media,
          sources: nativeRenderSources,
        },
      });
      return decodedVideoPassthroughFrame;
    }

    const renderId = buildNativeRenderId(request.encodeSessionId, request.frameIndex);
    const nativeEncodeFramePayload = {
      sessionId: request.encodeSessionId,
      renderId,
      frameIndex: request.frameIndex,
      timestampUs: request.timestampUs,
      width: request.width,
      height: request.height,
      snapshot: surfaceGate.snapshot,
      media: surfaceGate.media,
      sources: nativeRenderSources.map((source) => ({
        mediaId: source.mediaId,
        slotCount: source.slotCount,
        frame: source.frame,
      })),
    };
    if (
      isDefaultNativeEncodeFrameWriterAvailable()
      && isSimpleVideoNativeDirectEncodeFrame({
        snapshot: surfaceGate.snapshot,
        media: surfaceGate.media,
        nativeRenderSources,
      })
    ) {
      writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
        status: 'ready',
        frameIndex: request.frameIndex,
        path: 'nativeRenderDirectEncode',
        nativeRender: {
          media: surfaceGate.media,
          sources: nativeRenderSources,
        },
      });
      return {
        timestamp: request.timestampUs,
        nativeEncodeFramePayload,
        releaseNativeEncodeSourcesAfterWrite: {
          kind: 'nativeRenderSources',
          releaseAfterEncodeFailure: async () => {
            const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
            if (releaseFailure) {
              throw new Error(releaseFailure);
            }
          },
        },
      };
    }

    let renderResponse: RustBackendResult<RustBackendNativeRenderSharedFrameResult>;
    try {
      renderResponse = await renderNativeSharedFrame({
        renderId: nativeEncodeFramePayload.renderId,
        memoryId: buildNativeRenderMemoryId(request.encodeSessionId, request.frameIndex),
        slotCount: 1,
        ptsFrame: request.frameIndex,
        width: nativeEncodeFramePayload.width,
        height: nativeEncodeFramePayload.height,
        snapshot: nativeEncodeFramePayload.snapshot,
        media: nativeEncodeFramePayload.media,
        sources: nativeEncodeFramePayload.sources,
      });
    } catch (error) {
      const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
      if (releaseFailure) {
        throwNativeRenderSourceReleaseFailed(canvas, request.frameIndex, releaseFailure);
      }
      return throwNativeRenderFailed(
        canvas,
        request.frameIndex,
        formatNativeRenderError(error),
        !effectiveNativeRenderRequired
      );
    }
    if (!renderResponse.success || !renderResponse.result) {
      const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
      if (releaseFailure) {
        throwNativeRenderSourceReleaseFailed(canvas, request.frameIndex, releaseFailure);
      }
      writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
        status: 'blocked',
        frameIndex: request.frameIndex,
        reason: 'nativeRenderFailed',
        path: 'nativeRenderSharedFrame',
      });
      throw new SharedRendererExportFrameSourceBlockedError(
        renderResponse.error ?? 'Rust backend native render failed.',
        'nativeRenderFailed',
        request.frameIndex,
        !effectiveNativeRenderRequired
      );
    }
    const completeReleaseFailure = await releaseNativeRenderSourcesAfterComplete(nativeRenderSources);
    if (completeReleaseFailure) {
      const outputReleaseFailure = await releaseNativeRenderOutputAfterSourceReleaseFailure({
        memoryId: renderResponse.result.frame.descriptor.memoryId,
      }, releaseNativeSharedFrame);
      if (outputReleaseFailure) {
        throwNativeRenderOutputReleaseFailed(canvas, request.frameIndex, outputReleaseFailure);
      }
      throwNativeRenderSourceReleaseFailed(canvas, request.frameIndex, completeReleaseFailure);
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
    if (hasVideoObjects(request.objects)) {
      writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
        status: 'blocked',
        frameIndex: request.frameIndex,
        reason: 'videoBitmapCaptureDisabled',
      });
      throw new SharedRendererExportFrameSourceBlockedError(
        'Video export frames require Rust native render shared-frame encoding; ImageBitmap canvas capture is disabled.',
        'videoBitmapCaptureDisabled',
        request.frameIndex,
        false
      );
    }

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
          let sharedFramePayload: RustBackendVideoEncodeSharedFramePayloadFrame['sharedFramePayload'];
          try {
            sharedFramePayload = await control.takePresentedFrameSharedFrame({
              encodeSessionId: request.encodeSessionId,
              memoryId: buildEncodeSourceMemoryId(request.encodeSessionId),
              frameIndex: request.frameIndex,
              timestampUs: request.timestampUs,
              width: request.width,
              height: request.height,
              fps: projectSettings.fps,
            });
          } catch (error) {
            writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
              status: 'blocked',
              frameIndex: request.frameIndex,
              reason: 'presentedSharedFrameHandoffFailed',
            });
            throw new SharedRendererExportFrameSourceBlockedError(
              formatPresentedSharedFrameHandoffError(error),
              'presentedSharedFrameHandoffFailed',
              request.frameIndex,
              false
            );
          }
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

        writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
          status: 'blocked',
          frameIndex: request.frameIndex,
          reason: 'presentedSharedFrameHandoffUnavailable',
        });
        throw new SharedRendererExportFrameSourceBlockedError(
          'Presented shared-frame handoff is required for Rust direct encode frames.',
          'presentedSharedFrameHandoffUnavailable',
          request.frameIndex,
          false
        );
      } finally {
        presenterResult.control.dispose();
      }
    },
    close: async () => {
      if (closed) return;
      closed = true;
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

const resolveDecodedVideoPassthroughEncodeFrame = ({
  request,
  snapshot,
  media,
  nativeRenderSources,
}: {
  request: ProjectExportRustEncodeFrameRequest;
  snapshot: RustSceneSnapshot;
  media: readonly RustSceneMediaReference[];
  nativeRenderSources: readonly SharedRendererViewportNativeRenderSource[];
}): RustBackendVideoEncodeSharedFramePayloadFrame | null => {
  if (snapshot.clips.length !== 1 || media.length !== 1 || nativeRenderSources.length !== 1) {
    return null;
  }
  const clip = snapshot.clips[0];
  const reference = media[0];
  const source = nativeRenderSources[0];
  if (
    !isDecodedVideoPassthroughClip(clip, reference, source)
    || !requestObjectsRepresentIdentityVideoPassthrough(request, clip)
  ) {
    return null;
  }
  const descriptor = source.frame.descriptor;
  if (
    descriptor.width !== request.width
    || descriptor.height !== request.height
    || descriptor.format !== 'rgba8Srgb'
    || descriptor.colour.primaries !== 'bt709'
    || descriptor.colour.transfer !== 'srgb'
    || descriptor.colour.matrix !== 'rgb'
    || descriptor.colour.range !== 'full'
  ) {
    return null;
  }

  return {
    timestamp: request.timestampUs,
    sharedFramePayload: {
      sessionId: request.encodeSessionId,
      frameIndex: request.frameIndex,
      timestampUs: request.timestampUs,
      slotCount: source.slotCount,
      frame: source.frame,
    },
    releaseSharedFrameAfterEncodeSuccess: async () => {
      const releaseFailure = await releaseNativeRenderSourcesAfterComplete([source]);
      if (releaseFailure) {
        throw new Error(releaseFailure);
      }
    },
    releaseSharedFrameAfterEncodeFailure: async () => {
      const releaseFailure = await releaseNativeRenderSourcesAfterAbort([source]);
      if (releaseFailure) {
        throw new Error(releaseFailure);
      }
    },
  };
};

const isDecodedVideoPassthroughClip = (
  clip: RustEvaluatedClip,
  reference: RustSceneMediaReference,
  source: SharedRendererViewportNativeRenderSource
): boolean =>
  reference.kind === 'Video'
  && clip.media_id === reference.id
  && source.mediaId === reference.id
  && clip.source_frame === source.frame.ptsFrame
  && clip.opacity === 1
  && clip.effects.length === 0
  && isIdentityNativeTransform(clip.transform)
  && reference.width === source.frame.descriptor.width
  && reference.height === source.frame.descriptor.height;

const isIdentityNativeTransform = (transform: RustTransform): boolean =>
  transform.translation_x === 0
  && transform.translation_y === 0
  && transform.scale_x === 1
  && transform.scale_y === 1
  && transform.rotation_degrees === 0;

const requestObjectsRepresentIdentityVideoPassthrough = (
  request: ProjectExportRustEncodeFrameRequest,
  clip: RustEvaluatedClip
): boolean => {
  if (request.objects.length !== 1) return false;
  const object = request.objects[0];
  return object.type === 'video'
    && object.id === clip.media_id
    && object.x === 0
    && object.y === 0
    && object.rotation === 0
    && object.scaleX === 1
    && object.scaleY === 1
    && object.opacity === 1
    && object.width === request.width
    && object.height === request.height;
};

const isSimpleVideoNativeDirectEncodeFrame = ({
  snapshot,
  media,
  nativeRenderSources,
}: {
  snapshot: RustSceneSnapshot;
  media: readonly RustSceneMediaReference[];
  nativeRenderSources: readonly SharedRendererViewportNativeRenderSource[];
}): boolean => {
  if (snapshot.clips.length !== 1 || media.length !== 1 || nativeRenderSources.length !== 1) {
    return false;
  }
  const clip = snapshot.clips[0];
  const reference = media[0];
  const source = nativeRenderSources[0];
  const descriptor = source.frame.descriptor;
  return reference.kind === 'Video'
    && clip.media_id === reference.id
    && source.mediaId === reference.id
    && clip.source_frame === source.frame.ptsFrame
    && clip.opacity === 1
    && clip.effects.length === 0
    && Number.isFinite(clip.transform.translation_x)
    && Number.isFinite(clip.transform.translation_y)
    && Math.abs(clip.transform.translation_x - Math.round(clip.transform.translation_x)) <= 1e-6
    && Math.abs(clip.transform.translation_y - Math.round(clip.transform.translation_y)) <= 1e-6
    && Number.isFinite(clip.transform.scale_x)
    && Number.isFinite(clip.transform.scale_y)
    && clip.transform.scale_x > 0
    && clip.transform.scale_y > 0
    && clip.transform.rotation_degrees === 0
    && reference.width === descriptor.width
    && reference.height === descriptor.height
    && descriptor.format === 'rgba8Srgb'
    && descriptor.colour.primaries === 'bt709'
    && descriptor.colour.transfer === 'srgb'
    && descriptor.colour.matrix === 'rgb'
    && descriptor.colour.range === 'full';
};

const defaultCreateFrameBitmap: SharedRendererExportFrameBitmapFactory = (
  canvas,
  sx,
  sy,
  sw,
  sh
) => captureProjectExportLegacyCanvasFrame({
  canvas,
  sx,
  sy,
  width: sw,
  height: sh,
  timestamp: 0,
}).then((frame) => frame.bitmap);

const defaultStopVideoDecodeJob: SharedRendererExportVideoDecodeJobStopper = async (job) => {
  await stopRustBackendVideoDecode({
    jobId: job.jobId,
  });
};

const defaultRenderNativeSharedFrame: SharedRendererExportNativeSharedFrameRenderer = (payload) =>
  renderRustBackendNativeSharedFrame(payload);

const isDefaultNativeSharedFrameRendererAvailable = (): boolean =>
  typeof window !== 'undefined'
  && typeof window.rustBackend?.renderNativeSharedFrame === 'function';

const isDefaultNativeEncodeFrameWriterAvailable = (): boolean =>
  typeof window !== 'undefined'
  && window.rustVideoEncoder?.nativeDirectEncodeEnabled === true
  && typeof window.rustVideoEncoder.writeNativeEncodeFrame === 'function';

const buildEncodeSourceMemoryId = (encodeSessionId: string): string => {
  return `/uxe-${hashSharedMemoryIdPart(encodeSessionId)}`;
};

const buildNativeRenderId = (encodeSessionId: string, frameIndex: number): string =>
  `${sanitiseNativeRenderPart(encodeSessionId)}-frame-${frameIndex}`;

const buildNativeRenderMemoryId = (encodeSessionId: string, frameIndex: number): string =>
  `/uxn-${hashSharedMemoryIdPart(encodeSessionId)}-${Math.max(0, frameIndex).toString(36)}`;

const hashSharedMemoryIdPart = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
};

const sanitiseNativeRenderPart = (value: string): string => {
  const sanitised = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitised || 'session';
};

const hasVideoObjects = (objects: ProjectExportRustFrameRequest['objects']): boolean =>
  objects.some((object) => object.type === 'video');

const resolveExportVideoUploadBlock = (
  presenterResult: StartSharedRendererViewportPresenterResult
): string | null => {
  const videoUploadsResult = presenterResult.videoUploadsResult;
  if (
    videoUploadsResult
    && !videoUploadsResult.ok
    && videoUploadsResult.reason !== 'noVideoDecodeRequest'
  ) {
    return formatExportVideoUploadBlock(
      videoUploadsResult.detail,
      videoUploadsResult.reason === 'uploadFailed'
        ? videoUploadsResult.uploadFailureReason
        : videoUploadsResult.reason,
      videoUploadsResult.uploadFailureClipId,
      videoUploadsResult.uploadFailureMediaId,
    );
  }

  const videoUploadResult = presenterResult.videoUploadResult;
  if (
    videoUploadResult
    && !videoUploadResult.ok
    && videoUploadResult.reason !== 'noVideoDecodeRequest'
  ) {
    return formatExportVideoUploadBlock(
      videoUploadResult.detail,
      videoUploadResult.reason === 'uploadFailed'
        ? videoUploadResult.uploadFailureReason
        : videoUploadResult.reason,
      videoUploadResult.uploadFailureClipId,
      videoUploadResult.uploadFailureMediaId,
    );
  }

  return null;
};

const resolveSharedRendererOutputBlock = (
  presenterResult: StartSharedRendererViewportPresenterResult,
  dataset: PresenterDataset
): { reason: 'sharedRendererOutputUnavailable' | 'webGpuDrawUnavailable' | 'nativeRenderTextureViewUnavailable'; detail: string } | null => {
  if (presenterResult.control.ok) {
    return null;
  }
  if (
    presenterResult.control.reason !== 'sharedRendererOutputUnavailable'
    && presenterResult.control.reason !== 'webGpuDrawUnavailable'
    && presenterResult.control.reason !== 'nativeRenderTextureViewUnavailable'
  ) {
    return null;
  }
  if (presenterResult.control.reason === 'webGpuDrawUnavailable') {
    return {
      reason: 'webGpuDrawUnavailable',
      detail: 'Shared renderer WebGPU presentation is unavailable.',
    };
  }
  if (presenterResult.control.reason === 'nativeRenderTextureViewUnavailable') {
    return {
      reason: 'nativeRenderTextureViewUnavailable',
      detail: 'Native render texture view is unavailable for shared renderer presentation.',
    };
  }
  const nativeRenderUploadResult = presenterResult.nativeRenderUploadResult;
  if (nativeRenderUploadResult && !nativeRenderUploadResult.ok) {
    return {
      reason: 'sharedRendererOutputUnavailable',
      detail: `Shared renderer export output is unavailable (${nativeRenderUploadResult.reason}: ${nativeRenderUploadResult.detail}).`,
    };
  }
  const ownershipDetail = formatSharedRendererPresenterOwnershipBlockDetail(dataset);
  return {
    reason: 'sharedRendererOutputUnavailable',
    detail: ownershipDetail
      ? `Shared renderer export output is unavailable (${ownershipDetail}).`
      : 'Shared renderer export output is unavailable.',
  };
};

const formatSharedRendererPresenterOwnershipBlockDetail = (
  dataset: PresenterDataset
): string | null => {
  const imageOwnership = formatPresenterOwnershipDetail(
    'imageOwnership',
    dataset.uxfdSharedRendererPresenterImageOwner,
    dataset.uxfdSharedRendererPresenterImageCutoverReason
  );
  const psdOwnership = formatPresenterOwnershipDetail(
    'psdOwnership',
    dataset.uxfdSharedRendererPresenterPsdOwner,
    dataset.uxfdSharedRendererPresenterPsdCutoverReason
  );
  const details = [imageOwnership, psdOwnership].filter(Boolean);
  return details.length > 0 ? details.join('; ') : null;
};

const formatPresenterOwnershipDetail = (
  label: string,
  owner: string | undefined,
  reason: string | undefined
): string | null => {
  if (!owner && !reason) return null;
  return `${label}=${owner ?? 'unknown'}:${reason ?? 'unknown'}`;
};

const formatExportVideoUploadBlock = (
  detail: string,
  uploadFailureReason: string | undefined,
  uploadFailureClipId: string | undefined,
  uploadFailureMediaId: string | undefined,
): string => {
  const failureScope = [
    uploadFailureClipId ? `clip=${uploadFailureClipId}` : undefined,
    uploadFailureMediaId ? `media=${uploadFailureMediaId}` : undefined,
  ].filter(Boolean).join(' ');
  const reasonPrefix = uploadFailureReason
    ? [uploadFailureReason, failureScope].filter(Boolean).join(' ')
    : failureScope;

  return reasonPrefix ? `${reasonPrefix}: ${detail}` : detail;
};

const resolveExportVideoOwnershipBlock = (
  presenterResult: StartSharedRendererViewportPresenterResult,
  dataset: PresenterDataset
): string | null => {
  const missingClipIds = dataset.uxfdSharedRendererPresenterVideoUploadMissingClipIds;
  if (missingClipIds) {
    return `Shared renderer export is missing uploaded video clips: ${missingClipIds}.`;
  }

  const control = presenterResult.control;
  if (!('videoOwnership' in control)) return null;
  const { videoOwnership } = control;
  if (videoOwnership.reason === 'noVideoScene') return null;
  if (videoOwnership.owner === 'sharedRenderer') return null;

  return `Shared renderer export cannot delegate video ownership back to Pixi (${videoOwnership.reason}).`;
};

const releaseNativeRenderSourcesAfterComplete = async (
  sources: readonly SharedRendererViewportNativeRenderSource[]
): Promise<string | null> => {
  const results = await Promise.allSettled(
    sources.map((source) => source.releaseAfterNativeRenderComplete?.() ?? Promise.resolve())
  );
  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  return failed ? formatNativeRenderReleaseError(failed.reason) : null;
};

const releaseNativeRenderSourcesAfterAbort = async (
  sources: readonly SharedRendererViewportNativeRenderSource[]
): Promise<string | null> => {
  const results = await Promise.allSettled(
    sources.map((source) => source.releaseAfterNativeRenderAbort?.() ?? Promise.resolve())
  );
  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  return failed ? formatNativeRenderReleaseError(failed.reason) : null;
};

const throwNativeRenderSourceReleaseFailed = (
  canvas: HTMLCanvasElement,
  frameIndex: number,
  detail: string
): never => {
  writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
    status: 'blocked',
    frameIndex,
    reason: 'nativeRenderSourceReleaseFailed',
    path: 'nativeRenderSharedFrame',
  });
  throw new SharedRendererExportFrameSourceBlockedError(
    detail,
    'nativeRenderSourceReleaseFailed',
    frameIndex,
    false
  );
};

const releaseNativeRenderOutputAfterSourceReleaseFailure = async (
  payload: RustBackendNativeRenderReleaseSharedFramePayload,
  releaseNativeSharedFrame: SharedRendererExportNativeSharedFrameReleaser
): Promise<string | null> => {
  try {
    const response = await releaseNativeSharedFrame(payload);
    if (!response.success) {
      return response.error ?? 'Rust backend native render output release failed.';
    }
    return null;
  } catch (error) {
    return formatNativeRenderReleaseError(error);
  }
};

const throwNativeRenderOutputReleaseFailed = (
  canvas: HTMLCanvasElement,
  frameIndex: number,
  detail: string
): never => {
  writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
    status: 'blocked',
    frameIndex,
    reason: 'nativeRenderOutputReleaseFailed',
    path: 'nativeRenderSharedFrame',
  });
  throw new SharedRendererExportFrameSourceBlockedError(
    detail,
    'nativeRenderOutputReleaseFailed',
    frameIndex,
    false
  );
};

const throwNativeRenderFailed = (
  canvas: HTMLCanvasElement,
  frameIndex: number,
  detail: string,
  legacyCanvasFallbackAllowed = true
): never => {
  writeFrameDiagnostics(canvas.dataset as unknown as PresenterDataset, {
    status: 'blocked',
    frameIndex,
    reason: 'nativeRenderFailed',
    path: 'nativeRenderSharedFrame',
  });
  throw new SharedRendererExportFrameSourceBlockedError(
    detail,
    'nativeRenderFailed',
    frameIndex,
    legacyCanvasFallbackAllowed
  );
};

const formatNativeRenderError = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return 'Rust backend native render failed.';
};

const formatNativeRenderReleaseError = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return 'Rust native render source release failed.';
};

const formatPresentedSharedFrameHandoffError = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return 'Presented shared-frame handoff failed.';
};

const writeFrameDiagnostics = (
  dataset: PresenterDataset,
  state: {
    status: 'ready' | 'blocked';
    frameIndex: number;
    reason?: string;
    path?: 'decodedVideoPassthrough' | 'nativeRenderDirectEncode' | 'nativeRenderSharedFrame' | 'presentedSharedFrame';
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
  dataset.uxfdRustExportFrameSourceNativeRenderSourceReleaseRequired =
    state.reason === 'nativeRenderSourceReleaseUnavailable'
      ? 'true'
      : undefined;
};
