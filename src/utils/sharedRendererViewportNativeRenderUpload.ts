import {
  releaseRustBackendNativeSharedFrame,
  renderRustBackendNativeSharedFrame,
  type RustBackendNativeRenderReleaseSharedFramePayload,
  type RustBackendNativeRenderSharedFramePayload,
  type RustBackendNativeRenderSharedFrameResult,
} from './rustBackendNativeRenderControl';
import type { RustBackendResult } from './rustBackendVideoDecodeControl';
import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
import {
  prepareSharedRendererDecodedVideoFrameUpload,
  type PrepareSharedRendererDecodedVideoFrameUploadResult,
  type SharedVideoFrameCopyBridge,
} from './sharedVideoFrameUploadBridge';
import { canRenderSharedRendererNativeMediaOnlyFrame } from './sharedRendererNativeMediaSupport';
import { resolveMixedNativeRenderUnsupportedMedia } from './sharedRendererNativeRenderMediaGate';
import {
  prepareSharedRendererViewportNativeRenderSources,
  resolveNativeRenderSourceReleaseUnavailable,
  type PrepareSharedRendererViewportNativeRenderSourcesInput,
  type PrepareSharedRendererViewportNativeRenderSourcesResult,
  type SharedRendererViewportNativeRenderSource,
} from './sharedRendererViewportNativeRenderSource';
import type { SharedRendererViewportVideoDecodeJob } from './sharedRendererViewportVideoUpload';

type PreparedNativeRenderUpload = Extract<
  PrepareSharedRendererDecodedVideoFrameUploadResult,
  { ok: true }
>;

export type SharedRendererViewportNativeRenderSourcesPreparer = (
  input: PrepareSharedRendererViewportNativeRenderSourcesInput
) => Promise<PrepareSharedRendererViewportNativeRenderSourcesResult>;

export type SharedRendererViewportNativeSharedFrameRenderer = (
  payload: RustBackendNativeRenderSharedFramePayload
) => Promise<RustBackendResult<RustBackendNativeRenderSharedFrameResult>>;

export type SharedRendererViewportNativeSharedFrameReleaser = (
  payload: RustBackendNativeRenderReleaseSharedFramePayload
) => Promise<RustBackendResult>;

export interface PrepareSharedRendererViewportNativeRenderUploadInput {
  session: SharedRendererPreviewSession;
  requestId?: number;
  activeJobs?: readonly SharedRendererViewportVideoDecodeJob[];
  sourceSlotCount?: number;
  outputSlotCount?: number;
  prepareNativeRenderSources?: SharedRendererViewportNativeRenderSourcesPreparer;
  renderNativeSharedFrame?: SharedRendererViewportNativeSharedFrameRenderer;
  releaseNativeSharedFrame?: SharedRendererViewportNativeSharedFrameReleaser;
  copyBridge?: SharedVideoFrameCopyBridge;
}

export type PrepareSharedRendererViewportNativeRenderUploadResult =
  | {
      ok: true;
      activeJobs: SharedRendererViewportVideoDecodeJob[];
      upload: PreparedNativeRenderUpload;
    }
  | {
      ok: false;
      reason:
        | 'surfaceGateUnavailable'
        | 'nativeRenderSourcesUnavailable'
        | 'nativeRenderSourceReleaseUnavailable'
        | 'nativeRenderSourceReleaseFailed'
        | 'nativeRenderOutputReleaseFailed'
        | 'nativeRenderUnsupportedMedia'
        | 'nativeRenderUnsupportedMediaOnly'
        | 'nativeRenderFailed'
        | 'uploadFailed';
      detail: string;
      activeJobs: SharedRendererViewportVideoDecodeJob[];
    };

export const prepareSharedRendererViewportNativeRenderUpload = async ({
  session,
  requestId,
  activeJobs = [],
  sourceSlotCount = 2,
  outputSlotCount = 1,
  prepareNativeRenderSources = prepareSharedRendererViewportNativeRenderSources,
  renderNativeSharedFrame = renderRustBackendNativeSharedFrame,
  releaseNativeSharedFrame = releaseRustBackendNativeSharedFrame,
  copyBridge = window.sharedVideoFrame,
}: PrepareSharedRendererViewportNativeRenderUploadInput): Promise<PrepareSharedRendererViewportNativeRenderUploadResult> => {
  if (!session.surfaceGate.ok) {
    return {
      ok: false,
      reason: 'surfaceGateUnavailable',
      detail: session.surfaceGate.detail,
      activeJobs: [...activeJobs],
    };
  }

  const resolvedRequestId = requestId ?? session.surfaceGate.snapshot.frame_index;
  const nativeSources = await prepareNativeRenderSources({
    session,
    requestId: resolvedRequestId,
    slotCount: sourceSlotCount,
    activeJobs,
  });
  const surfaceGate = session.surfaceGate;
  let activeRenderJobs: SharedRendererViewportVideoDecodeJob[];
  let nativeRenderSources: readonly SharedRendererViewportNativeRenderSource[] = [];
  let renderSources: RustBackendNativeRenderSharedFramePayload['sources'];

  if (nativeSources.ok) {
    activeRenderJobs = nativeSources.activeJobs;
    nativeRenderSources = nativeSources.sources;
    renderSources = nativeRenderSources.map((source) => ({
      mediaId: source.mediaId,
      slotCount: source.slotCount,
      frame: source.frame,
    }));
  } else if (nativeSources.reason === 'noVideoDecodeRequest') {
    activeRenderJobs = nativeSources.activeJobs;
    if (!canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: surfaceGate.snapshot,
      media: surfaceGate.media,
    })) {
      return {
        ok: false,
        reason: 'nativeRenderUnsupportedMediaOnly',
        detail: 'Shared renderer preview session does not contain only Rust native-renderable media.',
        activeJobs: activeRenderJobs,
      };
    }
    renderSources = [];
  } else {
    return {
      ok: false,
      reason: 'nativeRenderSourcesUnavailable',
      detail: nativeSources.detail,
      activeJobs: nativeSources.activeJobs,
    };
  }

  const sourceReleaseBlock = resolveNativeRenderSourceReleaseUnavailable(nativeRenderSources);
  if (sourceReleaseBlock) {
    const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
    if (releaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderSourceReleaseFailed',
        detail: releaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    return {
      ok: false,
      reason: 'nativeRenderSourceReleaseUnavailable',
      detail: sourceReleaseBlock,
      activeJobs: activeRenderJobs,
    };
  }

  const unsupportedNativeMedia = resolveMixedNativeRenderUnsupportedMedia({
    snapshot: surfaceGate.snapshot,
    media: surfaceGate.media,
  });
  if (unsupportedNativeMedia) {
    const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
    if (releaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderSourceReleaseFailed',
        detail: releaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    return {
      ok: false,
      reason: 'nativeRenderUnsupportedMedia',
      detail: unsupportedNativeMedia,
      activeJobs: activeRenderJobs,
    };
  }

  const renderId = buildPreviewNativeRenderId(resolvedRequestId);
  const renderMemoryId = buildPreviewNativeRenderMemoryId(resolvedRequestId);
  let renderResponse: RustBackendResult<RustBackendNativeRenderSharedFrameResult>;
  try {
    renderResponse = await renderNativeSharedFrame({
      renderId,
      memoryId: renderMemoryId,
      slotCount: outputSlotCount,
      ptsFrame: surfaceGate.snapshot.frame_index,
      width: surfaceGate.canvas.width,
      height: surfaceGate.canvas.height,
      snapshot: surfaceGate.snapshot,
      media: surfaceGate.media,
      sources: renderSources,
    });
  } catch (error) {
    const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
    if (releaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderSourceReleaseFailed',
        detail: releaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    return {
      ok: false,
      reason: 'nativeRenderFailed',
      detail: formatNativeRenderError(error),
      activeJobs: activeRenderJobs,
    };
  }
  if (!renderResponse.success || !renderResponse.result) {
    const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
    if (releaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderSourceReleaseFailed',
        detail: releaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    return {
      ok: false,
      reason: 'nativeRenderFailed',
      detail: renderResponse.error ?? 'Rust backend native render failed.',
      activeJobs: activeRenderJobs,
    };
  }

  const releaseNativeOutput = createSingleUseNativeOutputReleaser(
    renderResponse.result.frame.descriptor.memoryId,
    releaseNativeSharedFrame
  );
  let upload: PrepareSharedRendererDecodedVideoFrameUploadResult;
  try {
    upload = await prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame: renderResponse.result.frame,
      slotCount: renderResponse.result.slotCount,
      bridge: copyBridge,
      releaseAfterGpuUpload: releaseNativeOutput,
      releaseAfterUploadAbort: releaseNativeOutput,
    });
  } catch (error) {
    const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
    const outputReleaseFailure = await releaseNativeRenderOutputAfterAbort(releaseNativeOutput);
    if (outputReleaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderOutputReleaseFailed',
        detail: outputReleaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    if (releaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderSourceReleaseFailed',
        detail: releaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    throw error;
  }
  if (!upload.ok) {
    const releaseFailure = await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
    const outputReleaseFailure = await releaseNativeRenderOutputAfterAbort(releaseNativeOutput);
    if (outputReleaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderOutputReleaseFailed',
        detail: outputReleaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    if (releaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderSourceReleaseFailed',
        detail: releaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    return {
      ok: false,
      reason: 'uploadFailed',
      detail: upload.detail,
      activeJobs: activeRenderJobs,
    };
  }
  const completeReleaseFailure = await releaseNativeRenderSourcesAfterComplete(nativeRenderSources);
  if (completeReleaseFailure) {
    const outputReleaseFailure = await releasePreparedNativeRenderOutputAfterAbort(upload);
    if (outputReleaseFailure) {
      return {
        ok: false,
        reason: 'nativeRenderOutputReleaseFailed',
        detail: outputReleaseFailure,
        activeJobs: activeRenderJobs,
      };
    }
    return {
      ok: false,
      reason: 'nativeRenderSourceReleaseFailed',
      detail: completeReleaseFailure,
      activeJobs: activeRenderJobs,
    };
  }

  return {
    ok: true,
    activeJobs: activeRenderJobs,
    upload,
  };
};

const buildPreviewNativeRenderId = (requestId: number): string =>
  `preview-native-render-${sanitiseNativeRenderPart(String(requestId))}`;

const buildPreviewNativeRenderMemoryId = (requestId: number): string =>
  `/uxfd-${buildPreviewNativeRenderId(requestId)}`;

const sanitiseNativeRenderPart = (value: string): string =>
  value
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'frame';

const createSingleUseNativeOutputReleaser = (
  memoryId: string,
  releaseNativeSharedFrame: SharedRendererViewportNativeSharedFrameReleaser
): (() => Promise<void>) => {
  let releasePromise: Promise<void> | null = null;
  return () => {
    if (!releasePromise) {
      releasePromise = releaseNativeSharedFrame({ memoryId }).then((response) => {
        if (!response.success) {
          throw new Error(response.error ?? 'Rust backend native render output release failed.');
        }
      });
    }
    return releasePromise;
  };
};

const releasePreparedNativeRenderOutputAfterAbort = async (
  upload: PreparedNativeRenderUpload
): Promise<string | null> => {
  return releaseNativeRenderOutputAfterAbort(upload.releaseAfterUploadAbort);
};

const releaseNativeRenderOutputAfterAbort = async (
  releaseNativeOutput: (() => Promise<void>) | undefined
): Promise<string | null> => {
  try {
    await releaseNativeOutput?.();
    return null;
  } catch (error) {
    return formatNativeRenderReleaseError(error, 'Rust backend native render output release failed.');
  }
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

const formatNativeRenderReleaseError = (
  error: unknown,
  fallback = 'Rust native render source release failed.'
): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return fallback;
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
