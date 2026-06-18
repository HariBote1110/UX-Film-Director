import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
import type { SharedRendererSolidColourVertexSceneBuilder } from './sharedRendererSolidColourScene';
import {
  buildSharedRendererVideoPlaneVertexScene,
  type SharedRendererVideoPlaneVertexSceneBuilder,
} from './sharedRendererVideoPlaneScene';
import {
  buildSharedRendererVideoFrameDecodeRequests,
  type SharedRendererVideoFrameDecodeRequestBuilder,
} from './sharedRendererVideoDecodeRequest';
import {
  createSharedRendererWebGpuPresenter,
  type SharedRendererPresentedFrameSharedFrameInput,
  type SharedRendererPresentedFrameReadbackInput,
  type SharedRendererPresentedFrameReadbackResult,
  type SharedRendererSolidSrgbSwatch,
  type SharedRendererVideoFrameTextureUploadInput,
  type SharedRendererWebGpuLike,
} from './sharedRendererWebGpuPresenter';
import { loadSharedRendererRustSolidColourVertexSceneBuilder } from './sharedRendererRustSolidColourScene';
import { loadSharedRendererRustVideoFrameDecodeRequestBuilder } from './sharedRendererRustVideoDecodeRequest';
import { loadSharedRendererRustVideoPlaneVertexSceneBuilder } from './sharedRendererRustVideoPlaneScene';
import {
  writeSharedRendererPresenterDiagnostics,
  type SharedRendererPresenterDiagnosticState,
} from './sharedRendererPresenterDiagnostics';
import {
  buildSharedRendererVideoOwnership,
  type SharedRendererVideoOwnership,
} from './sharedRendererVideoOwnership';
import { buildSharedRendererVideoCutoverStackSafety } from './sharedRendererVideoCutoverStack';
import {
  buildSharedRendererSolidColourOwnership,
  buildSharedRendererSolidColourStackSafety,
  type SharedRendererSolidColourOwnership,
} from './sharedRendererSolidColourOwnership';
import type { RustBackendVideoEncodeWriteFramePayload } from './rustBackendVideoEncodeControl';

export const SHARED_RENDERER_SOLID_SWATCH: SharedRendererSolidSrgbSwatch = {
  red: 0.25,
  green: 0.5,
  blue: 0.75,
  alpha: 1,
};

export const getSharedRendererSolidSwatchCssColour = (): string => {
  const red = Math.round(SHARED_RENDERER_SOLID_SWATCH.red * 255);
  const green = Math.round(SHARED_RENDERER_SOLID_SWATCH.green * 255);
  const blue = Math.round(SHARED_RENDERER_SOLID_SWATCH.blue * 255);
  return `rgb(${red}, ${green}, ${blue})`;
};

type PresenterDataset = Record<string, string | undefined>;

export type SharedRendererPreviewPresenterControl =
  | {
      ok: true;
      format: string;
      solidColourOwnership: SharedRendererSolidColourOwnership;
      videoOwnership: SharedRendererVideoOwnership;
      takePresentedFrameSharedFrame?: (
        input: SharedRendererPresentedFrameSharedFrameInput
      ) => Promise<RustBackendVideoEncodeWriteFramePayload>;
      readPresentedFrameRgbaBytes: (input: SharedRendererPresentedFrameReadbackInput) => Promise<SharedRendererPresentedFrameReadbackResult>;
      dispose: () => void;
    }
  | {
      ok: false;
      reason: string;
      dispose: () => void;
    };

export interface StartSharedRendererPreviewPresenterInput {
  canvas: HTMLCanvasElement;
  session: SharedRendererPreviewSession;
  datasets: PresenterDataset[];
  gpu?: SharedRendererWebGpuLike;
  textureUsageRenderAttachment?: number;
  bufferUsageVertex?: number;
  bufferUsageCopyDst?: number;
  bufferUsageMapRead?: number;
  diagnosticSwatchEnabled?: boolean;
  rustSolidColourWasmEnabled?: boolean;
  rustSolidColourVertexSceneBuilder?: SharedRendererSolidColourVertexSceneBuilder;
  rustVideoPlaneWasmEnabled?: boolean;
  rustVideoPlaneVertexSceneBuilder?: SharedRendererVideoPlaneVertexSceneBuilder;
  rustVideoFrameDecodeRequestWasmEnabled?: boolean;
  rustVideoFrameDecodeRequestBuilder?: SharedRendererVideoFrameDecodeRequestBuilder;
  sharedRendererSolidColourCutoverEnabled?: boolean;
  sharedRendererVideoCutoverEnabled?: boolean;
  requireSharedRendererVideo?: boolean;
  sharedRendererVideoFrameUploadReady?: boolean;
  sharedRendererDecodedVideoFrameUpload?: SharedRendererDecodedVideoFrameUpload;
  sharedRendererDecodedVideoFrameUploads?: SharedRendererDecodedVideoFrameUploadForClip[];
}

export interface SharedRendererDecodedVideoFrameUpload extends SharedRendererVideoFrameTextureUploadInput {
  ptsFrame: number;
  releaseAfterGpuUpload?: () => Promise<void>;
  releaseAfterUploadAbort?: () => Promise<void>;
}

export interface SharedRendererDecodedVideoFrameUploadForClip extends SharedRendererDecodedVideoFrameUpload {
  clipId: string;
}

export const startSharedRendererPreviewPresenter = async ({
  canvas,
  session,
  datasets,
  gpu,
  textureUsageRenderAttachment,
  bufferUsageVertex,
  bufferUsageCopyDst,
  bufferUsageMapRead,
  diagnosticSwatchEnabled = true,
  rustSolidColourWasmEnabled = defaultRustSolidColourWasmEnabled(),
  rustSolidColourVertexSceneBuilder,
  rustVideoPlaneWasmEnabled = defaultRustVideoPlaneWasmEnabled(),
  rustVideoPlaneVertexSceneBuilder,
  rustVideoFrameDecodeRequestWasmEnabled = defaultRustVideoFrameDecodeRequestWasmEnabled(),
  rustVideoFrameDecodeRequestBuilder,
  sharedRendererSolidColourCutoverEnabled = defaultSharedRendererSolidColourCutoverEnabled(),
  sharedRendererVideoCutoverEnabled = defaultSharedRendererVideoCutoverEnabled(),
  requireSharedRendererVideo = false,
  sharedRendererVideoFrameUploadReady = false,
  sharedRendererDecodedVideoFrameUpload,
  sharedRendererDecodedVideoFrameUploads,
}: StartSharedRendererPreviewPresenterInput): Promise<SharedRendererPreviewPresenterControl> => {
  const writeDiagnostics = (state: SharedRendererPresenterDiagnosticState) => {
    datasets.forEach((dataset) => {
      writeSharedRendererPresenterDiagnostics(dataset, state);
    });
  };

  if (!session.surfaceGate.ok) {
    writeDiagnostics({
      status: 'fallback',
      reason: session.surfaceGate.reason,
    });
    return {
      ok: false,
      reason: session.surfaceGate.reason,
      dispose: noop,
    };
  }

  const hasSolidColourScene = hasSolidColourClip(session);
  const resolvedRustSolidColourVertexSceneBuilder = hasSolidColourScene
    ? rustSolidColourVertexSceneBuilder
      ?? await loadSharedRendererRustSolidColourVertexSceneBuilder({
        enabled: rustSolidColourWasmEnabled,
      })
    : null;
  const solidColourGeometrySource = hasSolidColourScene
    ? resolvedRustSolidColourVertexSceneBuilder
      ? 'rust-wasm'
      : 'typescript'
    : undefined;
  const hasVideoScene = hasVideoClip(session);
  const resolvedRustVideoPlaneVertexSceneBuilder = hasVideoScene
    ? rustVideoPlaneVertexSceneBuilder
      ?? await loadSharedRendererRustVideoPlaneVertexSceneBuilder({
        enabled: rustVideoPlaneWasmEnabled,
      })
    : null;
  if (hasVideoScene) {
    const videoPlaneVertexSceneBuilder = resolvedRustVideoPlaneVertexSceneBuilder
      ?? buildSharedRendererVideoPlaneVertexScene;
    videoPlaneVertexSceneBuilder({
      snapshot: session.surfaceGate.snapshot,
      media: session.surfaceGate.media,
      canvas: session.surfaceGate.canvas,
    });
  }
  const videoGeometrySource = hasVideoScene
    ? resolvedRustVideoPlaneVertexSceneBuilder
      ? 'rust-wasm'
      : 'typescript'
    : undefined;
  const resolvedRustVideoFrameDecodeRequestBuilder = hasVideoScene
    ? rustVideoFrameDecodeRequestBuilder
      ?? await loadSharedRendererRustVideoFrameDecodeRequestBuilder({
        enabled: rustVideoFrameDecodeRequestWasmEnabled,
      })
    : null;
  const videoFrameDecodeRequestBuilder = hasVideoScene
    ? resolvedRustVideoFrameDecodeRequestBuilder
      ?? buildSharedRendererVideoFrameDecodeRequests
    : null;
  const videoDecodeRequestResult = videoFrameDecodeRequestBuilder
    ? videoFrameDecodeRequestBuilder({
      snapshot: session.surfaceGate.snapshot,
      media: session.surfaceGate.media,
    })
    : null;
  const videoDecodeRequestSource = hasVideoScene
    ? resolvedRustVideoFrameDecodeRequestBuilder
      ? 'rust-wasm'
      : 'typescript'
    : undefined;
  const videoDecodeRequestCount = videoDecodeRequestResult?.ok
    ? videoDecodeRequestResult.requestCount
    : undefined;
  const videoCutoverStackSafety = videoDecodeRequestResult?.ok
    ? buildSharedRendererVideoCutoverStackSafety({
      snapshot: session.surfaceGate.snapshot,
      media: session.surfaceGate.media,
      candidateVideoObjectIds: videoDecodeRequestResult.requests.map((request) => request.clipId),
    })
    : null;
  const solidColourObjectIds = hasSolidColourScene
    ? collectSolidColourObjectIds(session)
    : [];

  const presenter = await createSharedRendererWebGpuPresenter({
    canvas,
    surfaceGate: session.surfaceGate,
    presentationContract: session.presentationContract,
    gpu,
    textureUsageRenderAttachment,
    bufferUsageVertex,
    bufferUsageCopyDst,
    bufferUsageMapRead,
    solidColourVertexSceneBuilder: resolvedRustSolidColourVertexSceneBuilder ?? undefined,
    onDeviceLost: (event) => {
      writeDiagnostics({
        status: 'deviceLost',
        reason: 'deviceLost',
        staleSharedFrameAllowed: event.staleSharedFrameAllowed,
      });
    },
  });

  if (!presenter.ok) {
    writeDiagnostics({
      status: 'fallback',
      reason: presenter.reason,
    });
    return {
      ok: false,
      reason: presenter.reason,
      dispose: noop,
    };
  }

  let resolvedVideoFrameUploadReady = sharedRendererVideoFrameUploadReady;
  let uploadedVideoFrameTexture: unknown | null = null;
  const uploadedVideoFrameTexturesByClipId = new Map<string, unknown>();
  const uploadedVideoObjectIds = sharedRendererDecodedVideoFrameUploads
    ? new Set<string>()
    : undefined;
  const decodedVideoFrameUploads = sharedRendererDecodedVideoFrameUploads
    ? sharedRendererDecodedVideoFrameUploads.map((upload) => ({
      clipId: upload.clipId,
      upload,
    }))
    : sharedRendererDecodedVideoFrameUpload
      ? [{
        clipId: undefined,
        upload: sharedRendererDecodedVideoFrameUpload,
      }]
      : [];
  for (const decodedVideoFrameUpload of hasVideoScene ? decodedVideoFrameUploads : []) {
    const uploadResult = presenter.uploadVideoFrameTexture(decodedVideoFrameUpload.upload);
    if (uploadResult.ok) {
      uploadedVideoFrameTexture ??= uploadResult.texture;
      if (decodedVideoFrameUpload.clipId) {
        uploadedVideoObjectIds?.add(decodedVideoFrameUpload.clipId);
        uploadedVideoFrameTexturesByClipId.set(decodedVideoFrameUpload.clipId, uploadResult.texture);
      }
      if (decodedVideoFrameUpload.upload.releaseAfterGpuUpload) {
        await presenter.device.queue?.onSubmittedWorkDone?.();
        await decodedVideoFrameUpload.upload.releaseAfterGpuUpload();
      }
      resolvedVideoFrameUploadReady = true;
    } else if (decodedVideoFrameUpload.upload.releaseAfterUploadAbort) {
      await decodedVideoFrameUpload.upload.releaseAfterUploadAbort();
    }
  }

  const videoOwnership = buildSharedRendererVideoOwnership({
    cutoverEnabled: sharedRendererVideoCutoverEnabled,
    hasVideoScene,
    videoDecodeRequestSource,
    videoDecodeRequestResult,
    videoFrameUploadReady: resolvedVideoFrameUploadReady,
    uploadedVideoObjectIds,
    stackSafeVideoObjectIds: videoCutoverStackSafety
      ? new Set(videoCutoverStackSafety.safeVideoObjectIds)
      : undefined,
  });
  const solidColourStackSafety = hasSolidColourScene
    ? buildSharedRendererSolidColourStackSafety({
      snapshot: session.surfaceGate.snapshot,
      media: session.surfaceGate.media,
      candidateSolidColourObjectIds: solidColourObjectIds,
      sharedRendererVideoObjectIds: videoOwnership.videoObjectIds,
    })
    : null;
  const solidColourOwnership = buildSharedRendererSolidColourOwnership({
    cutoverEnabled: sharedRendererSolidColourCutoverEnabled,
    hasSolidColourScene,
    geometrySource: solidColourGeometrySource,
    solidColourObjectIds,
    stackSafeSolidColourObjectIds: solidColourStackSafety
      ? new Set(solidColourStackSafety.safeSolidColourObjectIds)
      : undefined,
  });

  if (requireSharedRendererVideo && hasVideoScene && videoOwnership.owner !== 'sharedRenderer') {
    writeDiagnostics({
      status: 'fallback',
      reason: 'requiredVideoOwnershipUnavailable',
    });
    return {
      ok: false,
      reason: 'requiredVideoOwnershipUnavailable',
      dispose: presenter.dispose,
    };
  }

  const shouldPresentUploadedVideoFrame = hasVideoScene
    && uploadedVideoFrameTexture
    && videoOwnership.owner === 'sharedRenderer';
  const shouldPassThroughToPixi = !hasSolidColourScene && !diagnosticSwatchEnabled;
  if (shouldPresentUploadedVideoFrame) {
    const presentation = uploadedVideoFrameTexturesByClipId.size > 0
      ? presenter.presentVideoFrameScene({
        snapshot: session.surfaceGate.snapshot,
        media: session.surfaceGate.media,
        texturesByClipId: uploadedVideoFrameTexturesByClipId,
        videoObjectIds: new Set(videoOwnership.videoObjectIds),
      })
      : presenter.presentVideoFrameScene({
        snapshot: session.surfaceGate.snapshot,
        media: session.surfaceGate.media,
        texture: uploadedVideoFrameTexture,
      });
    if (!presentation.ok) {
      writeDiagnostics({
        status: 'fallback',
        reason: presentation.reason,
      });
      return {
        ok: false,
        reason: presentation.reason,
        dispose: presenter.dispose,
      };
    }
  } else if (hasSolidColourScene || shouldPassThroughToPixi) {
    const solidColourObjectIdsForPresentation = solidColourGeometrySource === 'rust-wasm'
      ? new Set(solidColourOwnership.solidColourObjectIds)
      : undefined;
    const presentation = presenter.presentSolidColourScene({
      snapshot: session.surfaceGate.snapshot,
      media: session.surfaceGate.media,
      solidColourObjectIds: solidColourObjectIdsForPresentation,
    });
    if (!presentation.ok) {
      writeDiagnostics({
        status: 'fallback',
        reason: presentation.reason,
      });
      return {
        ok: false,
        reason: presentation.reason,
        dispose: presenter.dispose,
      };
    }
  } else {
    presenter.presentSolidSrgbSwatch(SHARED_RENDERER_SOLID_SWATCH);
  }

  writeDiagnostics({
    status: 'ready',
    format: presenter.format,
    geometrySource: solidColourGeometrySource,
    solidColourOwner: hasSolidColourScene ? solidColourOwnership.owner : undefined,
    solidColourCutoverReason: hasSolidColourScene ? solidColourOwnership.reason : undefined,
    sharedSolidColourObjectCount: hasSolidColourScene ? solidColourOwnership.solidColourObjectIds.length : undefined,
    videoGeometrySource,
    videoDecodeRequestSource,
    videoDecodeRequestCount,
    videoFrameUploadReady: hasVideoScene ? resolvedVideoFrameUploadReady : undefined,
    videoOwner: hasVideoScene ? videoOwnership.owner : undefined,
    videoCutoverReason: hasVideoScene ? videoOwnership.reason : undefined,
    sharedVideoObjectCount: hasVideoScene ? videoOwnership.videoObjectIds.length : undefined,
    swatch: hasSolidColourScene
      ? 'solid-colour-scene'
      : diagnosticSwatchEnabled
        ? 'solid-srgb'
        : 'pixi-passthrough',
  });

  return {
    ok: true,
    format: presenter.format,
    solidColourOwnership,
    videoOwnership,
    takePresentedFrameSharedFrame: presenter.takePresentedFrameSharedFrame,
    readPresentedFrameRgbaBytes: presenter.readPresentedFrameRgbaBytes,
    dispose: presenter.dispose,
  };
};

const noop = () => undefined;

const defaultRustSolidColourWasmEnabled = (): boolean =>
  import.meta.env.VITE_UXFD_SHARED_RENDERER_RUST_SHAPES !== '0';

const defaultRustVideoPlaneWasmEnabled = (): boolean =>
  import.meta.env.VITE_UXFD_SHARED_RENDERER_RUST_VIDEO !== '0';

const defaultRustVideoFrameDecodeRequestWasmEnabled = (): boolean =>
  import.meta.env.VITE_UXFD_SHARED_RENDERER_RUST_VIDEO !== '0';

const defaultSharedRendererSolidColourCutoverEnabled = (): boolean =>
  import.meta.env.VITE_UXFD_SHARED_RENDERER_SHAPE_CUTOVER !== '0';

const defaultSharedRendererVideoCutoverEnabled = (): boolean =>
  import.meta.env.VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER === '1';

const hasSolidColourClip = (session: SharedRendererPreviewSession): boolean => {
  if (!session.surfaceGate.ok) return false;

  const mediaKindById = new Map(session.surfaceGate.media.map((reference) => [reference.id, reference.kind]));
  return session.surfaceGate.snapshot.clips.some((clip) => mediaKindById.get(clip.media_id) === 'SolidColour');
};

const collectSolidColourObjectIds = (session: SharedRendererPreviewSession): string[] => {
  if (!session.surfaceGate.ok) return [];

  const mediaKindById = new Map(session.surfaceGate.media.map((reference) => [reference.id, reference.kind]));
  return session.surfaceGate.snapshot.clips
    .filter((clip) => mediaKindById.get(clip.media_id) === 'SolidColour')
    .sort((left, right) => left.z_index - right.z_index)
    .map((clip) => clip.clip_id);
};

const hasVideoClip = (session: SharedRendererPreviewSession): boolean => {
  if (!session.surfaceGate.ok) return false;

  const mediaKindById = new Map(session.surfaceGate.media.map((reference) => [reference.id, reference.kind]));
  return session.surfaceGate.snapshot.clips.some((clip) => mediaKindById.get(clip.media_id) === 'Video');
};
