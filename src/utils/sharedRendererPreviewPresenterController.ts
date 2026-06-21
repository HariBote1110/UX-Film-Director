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
  type SharedRendererVideoFrameScenePresentationResult,
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

export interface SharedRendererExternalVideoFrameRepaintInput {
  session: SharedRendererPreviewSession;
  sourcesByClipId?: ReadonlyMap<string, unknown>;
}

export type SharedRendererPreviewPresenterControl =
  | {
      ok: true;
      format: string;
      solidColourOwnership: SharedRendererSolidColourOwnership;
      videoOwnership: SharedRendererVideoOwnership;
      imageOwnership: SharedRendererImageOwnership;
      psdOwnership: SharedRendererPsdOwnership;
      generatedEffectObjectIds: string[];
      takePresentedFrameSharedFrame?: (
        input: SharedRendererPresentedFrameSharedFrameInput
      ) => Promise<RustBackendVideoEncodeWriteFramePayload>;
      presentExternalVideoFrameScene?: (
        input: SharedRendererExternalVideoFrameRepaintInput
      ) => SharedRendererVideoFrameScenePresentationResult;
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
  sharedRendererExternalVideoSourcesByClipId?: ReadonlyMap<string, unknown>;
  sharedRendererDecodedVideoFrameUpload?: SharedRendererDecodedVideoFrameUpload;
  sharedRendererDecodedVideoFrameUploads?: SharedRendererDecodedVideoFrameUploadForClip[];
  presentedFrameSharedFrameTaker?: SharedRendererPresentedFrameSharedFrameTaker;
  isStartCurrent?: () => boolean;
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
  sharedRendererExternalVideoSourcesByClipId,
  sharedRendererDecodedVideoFrameUpload,
  sharedRendererDecodedVideoFrameUploads,
  presentedFrameSharedFrameTaker,
  isStartCurrent,
}: StartSharedRendererPreviewPresenterInput): Promise<SharedRendererPreviewPresenterControl> => {
  assertPresenterStartCurrent(isStartCurrent);

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
  assertPresenterStartCurrent(isStartCurrent);
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
  assertPresenterStartCurrent(isStartCurrent);
  const resolvedRustVideoFrameDecodeRequestBuilder = hasVideoScene
    ? rustVideoFrameDecodeRequestBuilder
      ?? await loadSharedRendererRustVideoFrameDecodeRequestBuilder({
        enabled: rustVideoFrameDecodeRequestWasmEnabled,
        fallbackAllowed: !requireRustVideoControlPlane,
      })
    : null;
  assertPresenterStartCurrent(isStartCurrent);
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
  const videoPresentedSourceFrame = videoDecodeRequestResult?.ok
    ? videoDecodeRequestResult.requests[0]?.sourceFrame
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
    isStartCurrent,
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
          status: requireSharedRendererOutput ? 'blocked' : 'fallback',
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
  const externalVideoObjectIds = hasVideoScene
    && sharedRendererExternalVideoSourcesByClipId
    && videoDecodeRequestResult?.ok
    ? new Set(videoDecodeRequestResult.requests
      .map((request) => request.clipId)
      .filter((clipId) => sharedRendererExternalVideoSourcesByClipId.has(clipId)))
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

  const effectiveUploadedVideoObjectIds = mergeVideoObjectIdSets(uploadedVideoObjectIds, externalVideoObjectIds);
  const effectiveVideoFrameUploadReady = resolvedVideoFrameUploadReady
    || Boolean(externalVideoObjectIds && externalVideoObjectIds.size > 0);

  let videoOwnership: SharedRendererVideoOwnership = buildSharedRendererVideoOwnership({
    cutoverEnabled: sharedRendererVideoCutoverEnabled,
    hasVideoScene,
    nativeRenderFrameReady,
    nativeRenderVideoObjectIds: nativeRenderFrameReady
      ? collectObjectIdsByMediaKind(session, 'Video')
      : undefined,
    videoDecodeRequestSource,
    videoDecodeRequestResult,
    videoFrameUploadReady: effectiveVideoFrameUploadReady,
    uploadedVideoObjectIds: effectiveUploadedVideoObjectIds,
    stackSafeVideoObjectIds: videoCutoverStackSafety
      ? new Set(videoCutoverStackSafety.safeVideoObjectIds)
      : undefined,
  });
  const missingUploadedVideoObjectIds = resolveMissingUploadedVideoObjectIds(
    videoDecodeRequestResult,
    effectiveUploadedVideoObjectIds
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
      ? collectGeneratedPaintObjectIds(session)
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

  if (
    requireSharedRendererOutput
    && (
      (hasImageScene && imageOwnership.owner !== 'sharedRenderer')
      || (hasPsdScene && psdOwnership.owner !== 'sharedRenderer')
    )
  ) {
    writeDiagnostics({
      status: 'blocked',
      reason: 'sharedRendererOutputUnavailable',
      nativeRenderFailureReason: nativeRenderFailure?.reason,
      nativeRenderFailureDetail: nativeRenderFailure?.detail,
      imageOwner: hasImageScene ? imageOwnership.owner : undefined,
      imageCutoverReason: hasImageScene ? imageOwnership.reason : undefined,
      sharedImageObjectCount: hasImageScene ? imageOwnership.imageObjectIds.length : undefined,
      psdOwner: hasPsdScene ? psdOwnership.owner : undefined,
      psdCutoverReason: hasPsdScene ? psdOwnership.reason : undefined,
      sharedPsdObjectCount: hasPsdScene ? psdOwnership.psdObjectIds.length : undefined,
    });
    return {
      ok: false,
      reason: 'sharedRendererOutputUnavailable',
      dispose: presenter.dispose,
    };
  }

  const shouldPresentUploadedVideoFrame = hasVideoScene
    && uploadedVideoFrameTexture
    && videoOwnership.owner === 'sharedRenderer';
  const shouldPresentExternalVideoFrame = hasVideoScene
    && sharedRendererExternalVideoSourcesByClipId
    && effectiveUploadedVideoObjectIds
    && effectiveUploadedVideoObjectIds.size > 0
    && videoOwnership.owner === 'sharedRenderer';
  const shouldPassThroughToPixi = !hasSolidColourScene && !diagnosticSwatchEnabled;
  if (
    requireSharedRendererOutput
    && shouldPassThroughToPixi
    && !nativeRenderFrameReady
    && !shouldPresentUploadedVideoFrame
    && !shouldPresentExternalVideoFrame
  ) {
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
  } else if (shouldPresentExternalVideoFrame) {
    const presentation = presenter.presentExternalVideoFrameScene({
      snapshot: session.surfaceGate.snapshot,
      media: session.surfaceGate.media,
      sourcesByClipId: sharedRendererExternalVideoSourcesByClipId,
      videoObjectIds: new Set(videoOwnership.videoObjectIds),
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
        status: requireSharedRendererOutput ? 'blocked' : 'fallback',
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

  const shouldSuppressNativeRenderFailureForVideoOnlyReady = hasVideoScene
    && !hasSolidColourScene
    && !hasImageScene
    && !hasPsdScene
    && videoOwnership.owner === 'sharedRenderer'
    && videoOwnership.reason === 'rustDecodedFrameUploadReady';
  const publishedNativeRenderFailure = shouldSuppressNativeRenderFailureForVideoOnlyReady
    ? undefined
    : nativeRenderFailure;
  const videoPresentationSource = hasVideoScene
    ? nativeRenderFrameReady
      ? 'native-render-frame'
      : shouldPresentExternalVideoFrame
        ? 'external-video-source'
        : shouldPresentUploadedVideoFrame
          ? 'rust-decoded-rgba'
          : undefined
    : undefined;
  const presentExternalVideoFrameScene = shouldPresentExternalVideoFrame
    ? ({
      session: repaintSession,
      sourcesByClipId,
    }: SharedRendererExternalVideoFrameRepaintInput): SharedRendererVideoFrameScenePresentationResult => {
      if (!repaintSession.surfaceGate.ok) {
        return {
          ok: false,
          reason: 'unsupportedVideoScene',
          detail: `Shared renderer surface gate is blocked: ${repaintSession.surfaceGate.reason}`,
        };
      }
      const presentation = presenter.presentExternalVideoFrameScene({
        snapshot: repaintSession.surfaceGate.snapshot,
        media: repaintSession.surfaceGate.media,
        sourcesByClipId: sourcesByClipId ?? sharedRendererExternalVideoSourcesByClipId,
        videoObjectIds: new Set(videoOwnership.videoObjectIds),
      });
      if (!presentation.ok) {
        writeDiagnostics({
          status: requireSharedRendererOutput ? 'blocked' : 'fallback',
          reason: presentation.reason,
        });
        return presentation;
      }

      writeDiagnostics({
        status: 'ready',
        format: presenter.format,
        swatch: 'pixi-passthrough',
        videoGeometrySource,
        videoDecodeRequestSource,
        videoDecodeRequestCount: collectObjectIdsByMediaKind(repaintSession, 'Video').length,
        videoPresentedSourceFrame: resolveFirstPresentedVideoSourceFrame(repaintSession),
        videoPresentedFrameIndex: repaintSession.surfaceGate.snapshot.frame_index,
        videoPresentationSource: 'external-video-source',
        videoFrameUploadReady: true,
        videoOwner: videoOwnership.owner,
        videoCutoverReason: videoOwnership.reason,
        sharedVideoObjectCount: videoOwnership.videoObjectIds.length,
      });

      return presentation;
    }
    : undefined;

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
    videoPresentedSourceFrame,
    videoPresentedFrameIndex: hasVideoScene && session.surfaceGate.ok
      ? session.surfaceGate.snapshot.frame_index
      : undefined,
    videoPresentationSource,
    videoFrameUploadReady: hasVideoScene ? effectiveVideoFrameUploadReady : undefined,
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
    nativeRenderFailureReason: publishedNativeRenderFailure?.reason,
    nativeRenderFailureDetail: publishedNativeRenderFailure?.detail,
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
    generatedEffectObjectIds: nativeRenderFrameReady
      ? collectGeneratedEffectObjectIds(session)
      : [],
    takePresentedFrameSharedFrame: presenter.takePresentedFrameSharedFrame,
    presentExternalVideoFrameScene,
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

const isPresenterStartCurrent = (isStartCurrent: (() => boolean) | undefined): boolean =>
  isStartCurrent ? isStartCurrent() : true;

const assertPresenterStartCurrent = (isStartCurrent: (() => boolean) | undefined): void => {
  if (!isPresenterStartCurrent(isStartCurrent)) {
    throw new Error('Shared renderer presenter start was cancelled.');
  }
};

const hasSolidColourClip = (session: SharedRendererPreviewSession): boolean => {
  if (!session.surfaceGate.ok) return false;

  const mediaKindById = new Map(session.surfaceGate.media.map((reference) => [reference.id, reference.kind]));
  return session.surfaceGate.snapshot.clips.some((clip) => isGeneratedPaintMediaKind(mediaKindById.get(clip.media_id)));
};

const collectSolidColourObjectIds = (session: SharedRendererPreviewSession): string[] => {
  return collectGeneratedPaintObjectIds(session);
};

const collectGeneratedPaintObjectIds = (session: SharedRendererPreviewSession): string[] => {
  if (!session.surfaceGate.ok) return [];

  const mediaKindById = new Map(session.surfaceGate.media.map((reference) => [reference.id, reference.kind]));
  return session.surfaceGate.snapshot.clips
    .filter((clip) => isGeneratedPaintMediaKind(mediaKindById.get(clip.media_id)))
    .sort((left, right) => left.z_index - right.z_index)
    .map((clip) => clip.clip_id);
};

const isGeneratedPaintMediaKind = (
  kind: 'Image' | 'Video' | 'SolidColour' | 'GeneratedGradient' | 'GeneratedAudioWaveform' | 'GeneratedAudioSphere' | 'GeneratedParticle' | 'GeneratedBarcode' | 'GeneratedPuzzlePiece' | 'GeneratedColourWheel' | 'GeneratedGourd' | 'GeneratedGear' | 'GeneratedTrackBar' | 'GeneratedPieChart' | 'GeneratedHistogram' | 'GeneratedToneCurve' | 'GeneratedGetColorDots' | 'GeneratedHksyCheckerGrid' | 'GeneratedRegionFrame' | 'GeneratedSimpleTube' | 'GeneratedSphereDots' | 'GeneratedSunburst' | 'GeneratedCircularArrow' | 'GeneratedTriangleBracket' | 'GeneratedTartanCheck' | 'GeneratedHoundstooth' | 'GeneratedYagasuri' | 'GeneratedPaperAirplane' | 'GeneratedAsanohaPattern' | 'GeneratedFocusLinesPlus' | 'GeneratedRandomLineEx' | 'GeneratedHologram' | 'GeneratedProtractor' | 'GeneratedShakingPolygon' | 'Psd' | undefined
): boolean =>
  kind === 'SolidColour' || kind === 'GeneratedGradient';

const collectObjectIdsByMediaKind = (
  session: SharedRendererPreviewSession,
  kind: 'Video' | 'SolidColour' | 'Image' | 'Psd' | 'GeneratedAudioWaveform' | 'GeneratedAudioSphere' | 'GeneratedParticle' | 'GeneratedBarcode' | 'GeneratedPuzzlePiece' | 'GeneratedColourWheel' | 'GeneratedGourd' | 'GeneratedGear' | 'GeneratedTrackBar' | 'GeneratedPieChart' | 'GeneratedHistogram' | 'GeneratedToneCurve' | 'GeneratedGetColorDots' | 'GeneratedHksyCheckerGrid' | 'GeneratedRegionFrame' | 'GeneratedSimpleTube' | 'GeneratedSphereDots' | 'GeneratedSunburst' | 'GeneratedCircularArrow' | 'GeneratedTriangleBracket' | 'GeneratedTartanCheck' | 'GeneratedHoundstooth' | 'GeneratedYagasuri' | 'GeneratedPaperAirplane' | 'GeneratedAsanohaPattern' | 'GeneratedFocusLinesPlus' | 'GeneratedRandomLineEx' | 'GeneratedHologram' | 'GeneratedProtractor' | 'GeneratedShakingPolygon'
): string[] => {
  if (!session.surfaceGate.ok) return [];

  const mediaKindById = new Map(session.surfaceGate.media.map((reference) => [reference.id, reference.kind]));
  return session.surfaceGate.snapshot.clips
    .filter((clip) => mediaKindById.get(clip.media_id) === kind)
    .sort((left, right) => left.z_index - right.z_index)
    .map((clip) => clip.clip_id);
};

const collectGeneratedEffectObjectIds = (session: SharedRendererPreviewSession): string[] => [
  ...collectObjectIdsByMediaKind(session, 'GeneratedAudioWaveform'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedAudioSphere'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedParticle'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedBarcode'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedPuzzlePiece'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedColourWheel'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedGourd'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedGear'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedTrackBar'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedPieChart'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedHistogram'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedToneCurve'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedGetColorDots'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedHksyCheckerGrid'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedRegionFrame'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedSimpleTube'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedSphereDots'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedSunburst'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedCircularArrow'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedTriangleBracket'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedTartanCheck'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedHoundstooth'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedYagasuri'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedPaperAirplane'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedAsanohaPattern'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedFocusLinesPlus'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedRandomLineEx'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedHologram'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedProtractor'),
  ...collectObjectIdsByMediaKind(session, 'GeneratedShakingPolygon'),
];

const resolveFirstPresentedVideoSourceFrame = (
  session: SharedRendererPreviewSession,
): number | undefined => {
  if (!session.surfaceGate.ok) return undefined;

  const mediaKindById = new Map(session.surfaceGate.media.map((reference) => [reference.id, reference.kind]));
  return session.surfaceGate.snapshot.clips
    .filter((clip) => mediaKindById.get(clip.media_id) === 'Video')
    .sort((left, right) => left.z_index - right.z_index)[0]?.source_frame;
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

const mergeVideoObjectIdSets = (
  left: ReadonlySet<string> | undefined,
  right: ReadonlySet<string> | undefined,
): ReadonlySet<string> | undefined => {
  if (!left && !right) return undefined;
  return new Set([
    ...(left ? [...left] : []),
    ...(right ? [...right] : []),
  ]);
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
