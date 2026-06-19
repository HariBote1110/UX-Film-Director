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

  const unsupportedNativeMedia = resolveMixedNativeRenderUnsupportedMedia({
    snapshot: surfaceGate.snapshot,
    media: surfaceGate.media,
  });
  if (unsupportedNativeMedia) {
    await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
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
    await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
    throw error;
  }
  if (!renderResponse.success || !renderResponse.result) {
    await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
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
    await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
    await releaseNativeOutput();
    throw error;
  }
  if (!upload.ok) {
    await releaseNativeRenderSourcesAfterAbort(nativeRenderSources);
    await releaseNativeOutput();
    return {
      ok: false,
      reason: 'uploadFailed',
      detail: upload.detail,
      activeJobs: activeRenderJobs,
    };
  }
  await releaseNativeRenderSourcesAfterComplete(nativeRenderSources);

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
      releasePromise = releaseNativeSharedFrame({ memoryId }).then(() => undefined);
    }
    return releasePromise;
  };
};

const releaseNativeRenderSourcesAfterComplete = async (
  sources: readonly SharedRendererViewportNativeRenderSource[]
): Promise<void> => {
  await Promise.all(
    sources.map((source) => source.releaseAfterNativeRenderComplete?.() ?? Promise.resolve())
  );
};

const releaseNativeRenderSourcesAfterAbort = async (
  sources: readonly SharedRendererViewportNativeRenderSource[]
): Promise<void> => {
  await Promise.all(
    sources.map((source) => source.releaseAfterNativeRenderAbort?.() ?? Promise.resolve())
  );
};
