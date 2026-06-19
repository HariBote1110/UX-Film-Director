import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
import type { SharedRendererSolidColourVertexSceneBuilder } from './sharedRendererSolidColourScene';
import {
  buildSharedRendererVideoPlaneVertexScene,
  type SharedRendererVideoPlaneVertexSceneBuilder,
} from './sharedRendererVideoPlaneScene';
import {
  buildSharedRendererVideoFrameDecodeRequests,
  type SharedRendererVideoFrameDecodeRequestBuilder,
  type SharedRendererVideoFrameDecodeRequestResult,
} from './sharedRendererVideoDecodeRequest';
import {
  createSharedRendererWebGpuPresenter,
  type SharedRendererPresentedFrameSharedFrameInput,
  type SharedRendererPresentedFrameSharedFrameTaker,
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
import {
  buildSharedRendererImageOwnership,
  type SharedRendererImageOwnership,
} from './sharedRendererImageOwnership';
import {
  buildSharedRendererPsdOwnership,
  type SharedRendererPsdOwnership,
} from './sharedRendererPsdOwnership';
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
      imageOwnership: SharedRendererImageOwnership;
      psdOwnership: SharedRendererPsdOwnership;
      takePresentedFrameSharedFrame?: (
        input: SharedRendererPresentedFrameSharedFrameInput
      ) => Promise<RustBackendVideoEncodeWriteFramePayload>;
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
  requireRustVideoControlPlane?: boolean;
  requireSharedRendererOutput?: boolean;
  sharedRendererVideoFrameUploadReady?: boolean;
  sharedRendererNativeRenderFrameUpload?: SharedRendererDecodedVideoFrameUpload;
  sharedRendererNativeRenderFailure?: {
    reason: string;
    detail: string;
  };
  sharedRendererVideoUploadFailure?: {
    reason: string;
    detail: string;
    clipId?: string;
    mediaId?: string;
    missingClipIds?: string;
  };
  sharedRendererDecodedVideoFrameUpload?: SharedRendererDecodedVideoFrameUpload;
  sharedRendererDecodedVideoFrameUploads?: SharedRendererDecodedVideoFrameUploadForClip[];
  presentedFrameSharedFrameTaker?: SharedRendererPresentedFrameSharedFrameTaker;
}

export interface SharedRendererDecodedVideoFrameUpload extends SharedRendererVideoFrameTextureUploadInput {
  ptsFrame: number;
  releaseAfterGpuUpload?: () => Promise<void>;
  releaseAfterUploadAbort?: () => Promise<void>;
}

export interface SharedRendererDecodedVideoFrameUploadForClip extends SharedRendererDecodedVideoFrameUpload {
  clipId: string;
  mediaId?: string;
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
  requireRustVideoControlPlane = false,
  requireSharedRendererOutput = false,
  sharedRendererVideoFrameUploadReady = false,
  sharedRendererNativeRenderFrameUpload,
  sharedRendererNativeRenderFailure,
  sharedRendererVideoUploadFailure,
  sharedRendererDecodedVideoFrameUpload,
  sharedRendererDecodedVideoFrameUploads,
  presentedFrameSharedFrameTaker,
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
  const hasImageScene = hasImageClip(session);
  const hasPsdScene = hasPsdClip(session);
  const resolvedRustVideoPlaneVertexSceneBuilder = hasVideoScene
    ? rustVideoPlaneVertexSceneBuilder
      ?? await loadSharedRendererRustVideoPlaneVertexSceneBuilder({
        enabled: rustVideoPlaneWasmEnabled,
        fallbackAllowed: !requireRustVideoControlPlane,
      })
    : null;
  const resolvedRustVideoFrameDecodeRequestBuilder = hasVideoScene
    ? rustVideoFrameDecodeRequestBuilder
      ?? await loadSharedRendererRustVideoFrameDecodeRequestBuilder({
        enabled: rustVideoFrameDecodeRequestWasmEnabled,
        fallbackAllowed: !requireRustVideoControlPlane,
      })
    : null;
  if (
    hasVideoScene
    && requireRustVideoControlPlane
    && (
      !resolvedRustVideoPlaneVertexSceneBuilder
      || !resolvedRustVideoFrameDecodeRequestBuilder
    )
  ) {
    writeDiagnostics({
      status: 'blocked',
      reason: 'requiredRustVideoControlPlaneUnavailable',
    });
    return {
      ok: false,
      reason: 'requiredRustVideoControlPlaneUnavailable',
      dispose: noop,
    };
  }
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
  const imageObjectIds = hasImageScene
    ? collectObjectIdsByMediaKind(session, 'Image')
    : [];
  const psdObjectIds = hasPsdScene
    ? collectObjectIdsByMediaKind(session, 'Psd')
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
    presentedFrameSharedFrameTaker,
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
  let resolvedVideoUploadFailure = sharedRendererVideoUploadFailure;
  let nativeRenderFrameReady = false;
  let nativeRenderFailure = sharedRendererNativeRenderFailure;
  if (sharedRendererNativeRenderFrameUpload) {
    const uploadResult = presenter.uploadVideoFrameTexture(sharedRendererNativeRenderFrameUpload);
    if (uploadResult.ok) {
      const presentation = presenter.presentNativeRenderFrame({
        texture: uploadResult.texture,
      });
      if (!presentation.ok) {
        const releaseFailureDetail = await releaseDecodedVideoUploadAfterAbort(
          sharedRendererNativeRenderFrameUpload.releaseAfterUploadAbort
        );
        const fallbackReason = releaseFailureDetail
          ? 'nativeRenderOutputReleaseFailed'
          : presentation.reason;
        writeDiagnostics({
          status: 'fallback',
          reason: fallbackReason,
          nativeRenderFailureReason: releaseFailureDetail ? fallbackReason : undefined,
          nativeRenderFailureDetail: releaseFailureDetail ?? undefined,
        });
        return {
          ok: false,
          reason: fallbackReason,
          dispose: presenter.dispose,
        };
      }
      if (sharedRendererNativeRenderFrameUpload.releaseAfterGpuUpload) {
        await presenter.device.queue?.onSubmittedWorkDone?.();
        const releaseFailureDetail = await releaseDecodedVideoUploadAfterGpuUpload(
          sharedRendererNativeRenderFrameUpload.releaseAfterGpuUpload
        );
        if (releaseFailureDetail) {
          nativeRenderFailure = {
            reason: 'nativeRenderOutputReleaseFailed',
            detail: releaseFailureDetail,
          };
        }
      }
      nativeRenderFrameReady = true;
    } else {
      const releaseFailureDetail = await releaseDecodedVideoUploadAfterAbort(
        sharedRendererNativeRenderFrameUpload.releaseAfterUploadAbort
      );
      nativeRenderFailure = releaseFailureDetail
        ? {
            reason: 'nativeRenderOutputReleaseFailed',
            detail: releaseFailureDetail,
          }
        : {
            reason: uploadResult.reason,
            detail: uploadResult.detail,
          };
    }
  }
  let uploadedVideoFrameTexture: unknown | null = null;
  const uploadedVideoFrameTexturesByClipId = new Map<string, unknown>();
  const singleVideoUploadScope = resolveSingleVideoUploadScope(session);
  const scopedSingleVideoFrameUpload = sharedRendererDecodedVideoFrameUpload && singleVideoUploadScope
    ? {
      clipId: singleVideoUploadScope.clipId,
      mediaId: singleVideoUploadScope.mediaId,
      upload: sharedRendererDecodedVideoFrameUpload,
    }
    : null;
  if (hasVideoScene && sharedRendererDecodedVideoFrameUpload && !scopedSingleVideoFrameUpload && !sharedRendererDecodedVideoFrameUploads) {
    const releaseFailureDetail = await releaseDecodedVideoUploadAfterAbort(
      sharedRendererDecodedVideoFrameUpload.releaseAfterUploadAbort
    );
    if (releaseFailureDetail) {
      resolvedVideoUploadFailure ??= {
        reason: 'videoUploadAbortReleaseFailed',
        detail: releaseFailureDetail,
      };
    }
  }
  const uploadedVideoObjectIds = sharedRendererDecodedVideoFrameUploads || scopedSingleVideoFrameUpload
    ? new Set<string>()
    : undefined;
  const decodedVideoFrameUploads = sharedRendererDecodedVideoFrameUploads
    ? sharedRendererDecodedVideoFrameUploads.map((upload) => ({
      clipId: upload.clipId,
      mediaId: upload.mediaId,
      upload,
    }))
    : scopedSingleVideoFrameUpload
      ? [scopedSingleVideoFrameUpload]
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
        const releaseFailureDetail = await releaseDecodedVideoUploadAfterGpuUpload(
          decodedVideoFrameUpload.upload.releaseAfterGpuUpload
        );
        if (releaseFailureDetail) {
          resolvedVideoUploadFailure ??= {
            reason: 'videoUploadGpuReleaseFailed',
            detail: releaseFailureDetail,
            clipId: decodedVideoFrameUpload.clipId,
            mediaId: decodedVideoFrameUpload.mediaId,
          };
        }
      }
      resolvedVideoFrameUploadReady = true;
    } else {
      const releaseFailureDetail = await releaseDecodedVideoUploadAfterAbort(
        decodedVideoFrameUpload.upload.releaseAfterUploadAbort
      );
      resolvedVideoUploadFailure ??= releaseFailureDetail
        ? {
            reason: 'videoUploadAbortReleaseFailed',
            detail: releaseFailureDetail,
            clipId: decodedVideoFrameUpload.clipId,
            mediaId: decodedVideoFrameUpload.mediaId,
          }
        : {
            reason: uploadResult.reason,
            detail: uploadResult.detail,
            clipId: decodedVideoFrameUpload.clipId,
            mediaId: decodedVideoFrameUpload.mediaId,
          };
    }
  }

  let videoOwnership: SharedRendererVideoOwnership = buildSharedRendererVideoOwnership({
    cutoverEnabled: sharedRendererVideoCutoverEnabled,
    hasVideoScene,
    nativeRenderFrameReady,
    nativeRenderVideoObjectIds: nativeRenderFrameReady
      ? collectObjectIdsByMediaKind(session, 'Video')
      : undefined,
    videoDecodeRequestSource,
    videoDecodeRequestResult,
    videoFrameUploadReady: resolvedVideoFrameUploadReady,
    uploadedVideoObjectIds,
    stackSafeVideoObjectIds: videoCutoverStackSafety
      ? new Set(videoCutoverStackSafety.safeVideoObjectIds)
      : undefined,
  });
  const missingUploadedVideoObjectIds = resolveMissingUploadedVideoObjectIds(
    videoDecodeRequestResult,
    uploadedVideoObjectIds
  );
  if (missingUploadedVideoObjectIds.length > 0) {
    const missingClipIds = missingUploadedVideoObjectIds.join(',');
    resolvedVideoUploadFailure ??= {
      reason: 'videoUploadMissingClip',
      detail: `Rust decoded upload is missing for video clips: ${missingClipIds}`,
      missingClipIds,
    };
  }
  const solidColourStackSafety = hasSolidColourScene
    ? buildSharedRendererSolidColourStackSafety({
      snapshot: session.surfaceGate.snapshot,
      media: session.surfaceGate.media,
      candidateSolidColourObjectIds: solidColourObjectIds,
      sharedRendererVideoObjectIds: videoOwnership.videoObjectIds,
    })
    : null;
  let solidColourOwnership: SharedRendererSolidColourOwnership = buildSharedRendererSolidColourOwnership({
    cutoverEnabled: sharedRendererSolidColourCutoverEnabled,
    hasSolidColourScene,
    nativeRenderFrameReady,
    nativeRenderSolidColourObjectIds: nativeRenderFrameReady
      ? collectObjectIdsByMediaKind(session, 'SolidColour')
      : undefined,
    geometrySource: solidColourGeometrySource,
    solidColourObjectIds,
    stackSafeSolidColourObjectIds: solidColourStackSafety
      ? new Set(solidColourStackSafety.safeSolidColourObjectIds)
      : undefined,
  });
  const imageOwnership = buildSharedRendererImageOwnership({
    hasImageScene,
    nativeRenderFrameReady,
    imageObjectIds,
  });
  const psdOwnership = buildSharedRendererPsdOwnership({
    hasPsdScene,
    nativeRenderFrameReady,
    psdObjectIds,
  });

  if (requireSharedRendererVideo && hasVideoScene && videoOwnership.owner !== 'sharedRenderer') {
    writeDiagnostics({
      status: 'blocked',
      reason: 'requiredVideoOwnershipUnavailable',
      nativeRenderFailureReason: nativeRenderFailure?.reason,
      nativeRenderFailureDetail: nativeRenderFailure?.detail,
      videoUploadFailureReason: resolvedVideoUploadFailure?.reason,
      videoUploadFailureDetail: resolvedVideoUploadFailure?.detail,
      videoUploadFailureClipId: resolvedVideoUploadFailure?.clipId,
      videoUploadFailureMediaId: resolvedVideoUploadFailure?.mediaId,
      videoUploadMissingClipIds: resolvedVideoUploadFailure?.missingClipIds,
      videoOwner: videoOwnership.owner,
      videoCutoverReason: videoOwnership.reason,
      sharedVideoObjectCount: videoOwnership.videoObjectIds.length,
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
  if (requireSharedRendererOutput && shouldPassThroughToPixi && !nativeRenderFrameReady && !shouldPresentUploadedVideoFrame) {
    writeDiagnostics({
      status: 'blocked',
      reason: 'sharedRendererOutputUnavailable',
      swatch: 'pixi-passthrough',
      nativeRenderFailureReason: nativeRenderFailure?.reason,
      nativeRenderFailureDetail: nativeRenderFailure?.detail,
    });
    return {
      ok: false,
      reason: 'sharedRendererOutputUnavailable',
      dispose: presenter.dispose,
    };
  }

  if (nativeRenderFrameReady) {
    // The native render frame is already the final composited canvas image.
  } else if (shouldPresentUploadedVideoFrame) {
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
        status: requireSharedRendererOutput ? 'blocked' : 'fallback',
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
    imageOwner: hasImageScene ? imageOwnership.owner : undefined,
    imageCutoverReason: hasImageScene ? imageOwnership.reason : undefined,
    sharedImageObjectCount: hasImageScene ? imageOwnership.imageObjectIds.length : undefined,
    psdOwner: hasPsdScene ? psdOwnership.owner : undefined,
    psdCutoverReason: hasPsdScene ? psdOwnership.reason : undefined,
    sharedPsdObjectCount: hasPsdScene ? psdOwnership.psdObjectIds.length : undefined,
    videoGeometrySource,
    videoDecodeRequestSource,
    videoDecodeRequestCount,
    videoFrameUploadReady: hasVideoScene ? resolvedVideoFrameUploadReady : undefined,
    videoUploadFailureReason: hasVideoScene ? resolvedVideoUploadFailure?.reason : undefined,
    videoUploadFailureDetail: hasVideoScene ? resolvedVideoUploadFailure?.detail : undefined,
    videoUploadFailureClipId: hasVideoScene ? resolvedVideoUploadFailure?.clipId : undefined,
    videoUploadFailureMediaId: hasVideoScene ? resolvedVideoUploadFailure?.mediaId : undefined,
    videoUploadMissingClipIds: hasVideoScene ? resolvedVideoUploadFailure?.missingClipIds : undefined,
    videoOwner: hasVideoScene ? videoOwnership.owner : undefined,
    videoCutoverReason: hasVideoScene ? videoOwnership.reason : undefined,
    sharedVideoObjectCount: hasVideoScene ? videoOwnership.videoObjectIds.length : undefined,
    nativeRenderFrameReady: nativeRenderFrameReady ? true : undefined,
    nativeRenderMediaCount: nativeRenderFrameReady ? session.surfaceGate.media.length : undefined,
    nativeRenderMediaKinds: nativeRenderFrameReady
      ? session.surfaceGate.media.map((reference) => reference.kind).join(',')
      : undefined,
    nativeRenderSourceCount: nativeRenderFrameReady
      ? collectObjectIdsByMediaKind(session, 'Video').length
      : undefined,
    nativeRenderSourceMediaIds: nativeRenderFrameReady
      ? collectObjectIdsByMediaKind(session, 'Video').join(',')
      : undefined,
    nativeRenderFailureReason: nativeRenderFailure?.reason,
    nativeRenderFailureDetail: nativeRenderFailure?.detail,
    swatch: hasSolidColourScene
      ? 'solid-colour-scene'
      : nativeRenderFrameReady
        ? 'native-render-frame'
        : diagnosticSwatchEnabled
        ? 'solid-srgb'
        : 'pixi-passthrough',
  });

  return {
    ok: true,
    format: presenter.format,
    solidColourOwnership,
    videoOwnership,
    imageOwnership,
    psdOwnership,
    takePresentedFrameSharedFrame: presenter.takePresentedFrameSharedFrame,
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
  import.meta.env.VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER !== '0';

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

const collectObjectIdsByMediaKind = (
  session: SharedRendererPreviewSession,
  kind: 'Video' | 'SolidColour' | 'Image' | 'Psd'
): string[] => {
  if (!session.surfaceGate.ok) return [];

  const mediaKindById = new Map(session.surfaceGate.media.map((reference) => [reference.id, reference.kind]));
  return session.surfaceGate.snapshot.clips
    .filter((clip) => mediaKindById.get(clip.media_id) === kind)
    .sort((left, right) => left.z_index - right.z_index)
    .map((clip) => clip.clip_id);
};

const resolveSingleVideoUploadScope = (
  session: SharedRendererPreviewSession,
): { clipId: string; mediaId: string } | undefined => {
  if (!session.surfaceGate.ok) return undefined;

  const mediaKindById = new Map(session.surfaceGate.media.map((reference) => [reference.id, reference.kind]));
  const videoClips = session.surfaceGate.snapshot.clips
    .filter((clip) => mediaKindById.get(clip.media_id) === 'Video')
    .sort((left, right) => left.z_index - right.z_index);

  if (videoClips.length !== 1) return undefined;
  const [clip] = videoClips;
  return {
    clipId: clip.clip_id,
    mediaId: clip.media_id,
  };
};

const resolveMissingUploadedVideoObjectIds = (
  videoDecodeRequestResult: SharedRendererVideoFrameDecodeRequestResult | null | undefined,
  uploadedVideoObjectIds: ReadonlySet<string> | undefined,
): string[] => {
  if (!uploadedVideoObjectIds || !videoDecodeRequestResult?.ok) return [];

  const requestedVideoObjectIds = [...new Set(videoDecodeRequestResult.requests.map((request) => request.clipId))];
  return requestedVideoObjectIds.filter((videoObjectId) => !uploadedVideoObjectIds.has(videoObjectId));
};

const releaseDecodedVideoUploadAfterAbort = async (
  releaseAfterUploadAbort: (() => Promise<void>) | undefined,
): Promise<string | null> => {
  if (!releaseAfterUploadAbort) return null;

  try {
    await releaseAfterUploadAbort();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const releaseDecodedVideoUploadAfterGpuUpload = async (
  releaseAfterGpuUpload: (() => Promise<void>) | undefined,
): Promise<string | null> => {
  if (!releaseAfterGpuUpload) return null;

  try {
    await releaseAfterGpuUpload();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const hasVideoClip = (session: SharedRendererPreviewSession): boolean => {
  if (!session.surfaceGate.ok) return false;

  const mediaKindById = new Map(session.surfaceGate.media.map((reference) => [reference.id, reference.kind]));
  return session.surfaceGate.snapshot.clips.some((clip) => mediaKindById.get(clip.media_id) === 'Video');
};

const hasImageClip = (session: SharedRendererPreviewSession): boolean => {
  if (!session.surfaceGate.ok) return false;

  const mediaKindById = new Map(session.surfaceGate.media.map((reference) => [reference.id, reference.kind]));
  return session.surfaceGate.snapshot.clips.some((clip) => mediaKindById.get(clip.media_id) === 'Image');
};

const hasPsdClip = (session: SharedRendererPreviewSession): boolean => {
  if (!session.surfaceGate.ok) return false;

  const mediaKindById = new Map(session.surfaceGate.media.map((reference) => [reference.id, reference.kind]));
  return session.surfaceGate.snapshot.clips.some((clip) => mediaKindById.get(clip.media_id) === 'Psd');
};
