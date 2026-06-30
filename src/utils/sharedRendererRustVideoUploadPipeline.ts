import {
  isRustBackendDecodedVideoFrameAvailable,
  releaseRustBackendVideoDecodeFrame,
  type RustBackendResult,
  type RustBackendSharedVideoFrame,
  type RustBackendVideoDecodeBridge,
  type RustBackendVideoDecodeFramePayload,
} from './rustBackendVideoDecodeControl';
import {
  prepareSharedRendererDecodedVideoFrameUpload,
  type PrepareSharedRendererDecodedVideoFrameUploadResult,
  type SharedVideoFrameCopyBridge,
} from './sharedVideoFrameUploadBridge';
import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';

type NativeOverlaySceneSnapshotPayload = {
  frameIndex: number;
  colour: {
    profile: string;
    workingSpace: string;
    alpha: string;
  };
  clips: Array<{
    clipId: string;
    trackId: string;
    mediaId: string;
    sourceFrame: number;
    zIndex: number;
    transform: {
      translationX: number;
      translationY: number;
      scaleX: number;
      scaleY: number;
      rotationDegrees: number;
      sampling?: string;
    };
    opacity: number;
  }>;
};

type NativeOverlaySceneMediaPayload = {
  id: string;
  kind: string;
  source: string;
  width: number;
  height: number;
};

export interface PrepareSharedRendererRustDecodedVideoUploadInput {
  decodeResponse: RustBackendResult<unknown>;
  slotCount: number;
  copyBridge: SharedVideoFrameCopyBridge;
  rustBackendBridge: RustBackendVideoDecodeBridge;
}

export interface NativeOverlayDecodedFrameBridge {
  presentSharedFrame: (payload: {
    windowId?: number;
    mediaId: string;
    snapshot?: NativeOverlaySceneSnapshotPayload;
    media?: readonly NativeOverlaySceneMediaPayload[];
    slotCount: number;
    frame: RustBackendSharedVideoFrame;
  }) => Promise<{
    success: boolean;
    attached: boolean;
    releaseFrame?: {
      memoryId: string;
      slotIndex: number;
      generation: number;
      ptsFrame: number;
      copyOutState: 'gpuUploadFenceSignalled';
    };
    reason?: string;
  }>;
}

export interface PresentNativeOverlayRustDecodedVideoFrameInput {
  windowId?: number;
  mediaId?: string;
  decodeResponse: RustBackendResult<unknown>;
  snapshot?: RustSceneSnapshot;
  media?: readonly RustSceneMediaReference[];
  slotCount: number;
  nativeOverlayBridge: NativeOverlayDecodedFrameBridge;
  rustBackendBridge: RustBackendVideoDecodeBridge;
}

export type PresentNativeOverlayRustDecodedVideoFrameResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'decodedFrameUnavailable'
        | 'nativeOverlayPresentFailed'
        | 'nativeOverlayReleaseMismatch'
        | 'nativeOverlayReleaseFailed';
      detail: string;
    };

export type PrepareSharedRendererRustDecodedVideoUploadResult =
  | PrepareSharedRendererDecodedVideoFrameUploadResult
  | {
      ok: false;
      reason: 'decodedFrameUnavailable';
      detail: string;
    };

const lastNativeOverlayVisualFrameKeyByTarget = new Map<string, string>();

export const resetNativeOverlayVisualFrameCache = (windowId?: number, mediaId?: string): void => {
  if (mediaId) {
    if (typeof windowId === 'number') {
      lastNativeOverlayVisualFrameKeyByTarget.delete(`${windowId}:${mediaId}`);
      return;
    }
    for (const key of lastNativeOverlayVisualFrameKeyByTarget.keys()) {
      if (key.endsWith(`:${mediaId}`)) {
        lastNativeOverlayVisualFrameKeyByTarget.delete(key);
      }
    }
    return;
  }
  lastNativeOverlayVisualFrameKeyByTarget.clear();
};

export const presentNativeOverlayRustDecodedVideoFrame = async ({
  windowId,
  mediaId,
  decodeResponse,
  snapshot,
  media,
  slotCount,
  nativeOverlayBridge,
  rustBackendBridge,
}: PresentNativeOverlayRustDecodedVideoFrameInput): Promise<PresentNativeOverlayRustDecodedVideoFrameResult> => {
  if (!isRustBackendDecodedVideoFrameAvailable(decodeResponse)) {
    return {
      ok: false,
      reason: 'decodedFrameUnavailable',
      detail: 'Rust backend did not return a verified decoded video frame.',
    };
  }

  const { frame, jobId } = decodeResponse.result;
  const visualFrameKey = buildNativeOverlayVisualFrameKey({
    windowId,
    mediaId: mediaId ?? jobId,
    ptsFrame: frame.ptsFrame,
    snapshot,
    media,
  });
  const visualFrameTarget = `${windowId ?? 'default'}:${mediaId ?? jobId}`;
  if (lastNativeOverlayVisualFrameKeyByTarget.get(visualFrameTarget) === visualFrameKey) {
    return releaseNativeOverlayDecodedFrameLease({
      jobId,
      frame,
      rustBackendBridge,
    });
  }

  const presentResponse = await nativeOverlayBridge.presentSharedFrame({
    windowId,
    mediaId: mediaId ?? jobId,
    ...(snapshot ? { snapshot: toNativeOverlaySceneSnapshotPayload(snapshot) } : {}),
    ...(media ? { media: media.map(toNativeOverlaySceneMediaPayload) } : {}),
    slotCount,
    frame,
  });
  if (!presentResponse.success || !presentResponse.releaseFrame) {
    return {
      ok: false,
      reason: 'nativeOverlayPresentFailed',
      detail: presentResponse.reason ?? 'Native overlay did not return a decoded frame release payload.',
    };
  }
  const releaseFrame = presentResponse.releaseFrame;
  if (
    releaseFrame.memoryId !== frame.descriptor.memoryId
    || releaseFrame.slotIndex !== frame.descriptor.slotIndex
    || releaseFrame.generation !== frame.descriptor.generation
    || releaseFrame.ptsFrame !== frame.ptsFrame
  ) {
    return {
      ok: false,
      reason: 'nativeOverlayReleaseMismatch',
      detail: 'Native overlay decoded frame release payload did not match the leased frame descriptor.',
    };
  }

  const releaseResponse = await releaseRustBackendVideoDecodeFrame({
    jobId,
    slotIndex: frame.descriptor.slotIndex,
    generation: frame.descriptor.generation,
    copyOutState: 'gpuUploadFenceSignalled',
  }, rustBackendBridge);
  if (!releaseResponse.success) {
    return {
      ok: false,
      reason: 'nativeOverlayReleaseFailed',
      detail: releaseResponse.error ?? 'Rust backend decoded frame release failed.',
    };
  }

  lastNativeOverlayVisualFrameKeyByTarget.set(visualFrameTarget, visualFrameKey);
  return { ok: true };
};

const releaseNativeOverlayDecodedFrameLease = async ({
  jobId,
  frame,
  rustBackendBridge,
}: {
  jobId: string;
  frame: RustBackendSharedVideoFrame;
  rustBackendBridge: RustBackendVideoDecodeBridge;
}): Promise<PresentNativeOverlayRustDecodedVideoFrameResult> => {
  const releaseResponse = await releaseRustBackendVideoDecodeFrame({
    jobId,
    slotIndex: frame.descriptor.slotIndex,
    generation: frame.descriptor.generation,
    copyOutState: 'gpuUploadFenceSignalled',
  }, rustBackendBridge);
  if (!releaseResponse.success) {
    return {
      ok: false,
      reason: 'nativeOverlayReleaseFailed',
      detail: releaseResponse.error ?? 'Rust backend decoded frame release failed.',
    };
  }

  return { ok: true };
};

const buildNativeOverlayVisualFrameKey = ({
  windowId,
  mediaId,
  ptsFrame,
  snapshot,
  media,
}: {
  windowId?: number;
  mediaId: string;
  ptsFrame: number;
  snapshot?: RustSceneSnapshot;
  media?: readonly RustSceneMediaReference[];
}): string => JSON.stringify({
  windowId: windowId ?? null,
  mediaId,
  ptsFrame,
  snapshot: snapshot ? {
    colour: snapshot.colour,
    clips: snapshot.clips,
  } : null,
  media: media ?? null,
});

const toNativeOverlaySceneSnapshotPayload = (
  snapshot: RustSceneSnapshot
): NativeOverlaySceneSnapshotPayload => ({
  frameIndex: snapshot.frame_index,
  colour: {
    profile: snapshot.colour.profile,
    workingSpace: snapshot.colour.working_space,
    alpha: snapshot.colour.alpha,
  },
  clips: snapshot.clips.map((clip) => ({
    clipId: clip.clip_id,
    trackId: clip.track_id,
    mediaId: clip.media_id,
    sourceFrame: clip.source_frame,
    zIndex: clip.z_index,
    transform: {
      translationX: clip.transform.translation_x,
      translationY: clip.transform.translation_y,
      scaleX: clip.transform.scale_x,
      scaleY: clip.transform.scale_y,
      rotationDegrees: clip.transform.rotation_degrees,
      sampling: clip.transform.sampling,
    },
    opacity: clip.opacity,
  })),
});

const toNativeOverlaySceneMediaPayload = (
  media: RustSceneMediaReference
): NativeOverlaySceneMediaPayload => ({
  id: media.id,
  kind: media.kind,
  source: media.source,
  width: media.width,
  height: media.height,
});

export const prepareSharedRendererRustDecodedVideoUpload = async ({
  decodeResponse,
  slotCount,
  copyBridge,
  rustBackendBridge,
}: PrepareSharedRendererRustDecodedVideoUploadInput): Promise<PrepareSharedRendererRustDecodedVideoUploadResult> => {
  if (!isRustBackendDecodedVideoFrameAvailable(decodeResponse)) {
    return {
      ok: false,
      reason: 'decodedFrameUnavailable',
      detail: 'Rust backend did not return a verified decoded video frame.',
    };
  }

  const { frame, jobId } = decodeResponse.result;
  const releaseFrame = createSingleUseDecodedFrameReleaser((copyOutState) =>
    releaseRustBackendVideoDecodeFrame({
      jobId,
      slotIndex: frame.descriptor.slotIndex,
      generation: frame.descriptor.generation,
      copyOutState,
    }, rustBackendBridge).then(assertDecodedFrameReleaseSucceeded));

  let upload: PrepareSharedRendererDecodedVideoFrameUploadResult;
  try {
    upload = await prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame: frame,
      slotCount,
      bridge: copyBridge,
      releaseAfterGpuUpload: () => releaseFrame('gpuUploadFenceSignalled'),
      releaseAfterUploadAbort: () => releaseFrame('rendererUploadAborted'),
    });
  } catch (error) {
    await releaseFrame('rendererUploadAborted');
    throw error;
  }
  if (!upload.ok && shouldUseInlineDecodedFrameMvpPath(upload) && rustBackendBridge.requestVideoDecodeFrameInline) {
    const inlineUpload = await prepareInlineDecodedVideoUpload({
      payload: {
        jobId,
        requestId: decodeResponse.result.requestId,
        frameIndex: decodeResponse.result.frameIndex,
        mode: decodeResponse.result.mode,
      },
      expectedFrame: frame,
      requestInlineFrame: rustBackendBridge.requestVideoDecodeFrameInline,
      releaseAfterGpuUpload: () => releaseFrame('gpuUploadFenceSignalled'),
      releaseAfterUploadAbort: () => releaseFrame('rendererUploadAborted'),
    });
    if (inlineUpload.ok) {
      return inlineUpload;
    }
  }
  if (!upload.ok) {
    await releaseFrame('rendererUploadAborted');
  }

  return upload;
};

const shouldUseInlineDecodedFrameMvpPath = (
  upload: PrepareSharedRendererDecodedVideoFrameUploadResult
): boolean =>
  !upload.ok
  && (
    (upload.reason === 'copyFailed' && upload.detail.toLowerCase().includes('native bridge'))
    || upload.reason === 'copyReportChecksumMismatch'
    || upload.reason === 'copyReportTargetChecksumMismatch'
  );

const prepareInlineDecodedVideoUpload = async ({
  payload,
  expectedFrame,
  requestInlineFrame,
  releaseAfterGpuUpload,
  releaseAfterUploadAbort,
}: {
  payload: RustBackendVideoDecodeFramePayload;
  expectedFrame: RustBackendSharedVideoFrame;
  requestInlineFrame: NonNullable<RustBackendVideoDecodeBridge['requestVideoDecodeFrameInline']>;
  releaseAfterGpuUpload: () => Promise<void>;
  releaseAfterUploadAbort: () => Promise<void>;
}): Promise<PrepareSharedRendererDecodedVideoFrameUploadResult> => {
  const inlineResponse = await requestInlineFrame(payload);
  const inlineRgbaBytes = resolveInlineDecodedVideoFrameBytes(inlineResponse);
  if (!inlineRgbaBytes) {
    return {
      ok: false,
      reason: 'copyFailed',
      detail: inlineResponse.error ?? 'Rust backend inline decoded video frame was unavailable.',
    };
  }
  const rgbaBytes = normaliseInlineRgbaBytes(inlineRgbaBytes);
  if (!rgbaBytes || rgbaBytes.byteLength !== expectedFrame.descriptor.byteLen) {
    return {
      ok: false,
      reason: 'copyFailed',
      detail: 'Rust backend inline decoded video frame byte length did not match the descriptor.',
    };
  }

  return {
    ok: true,
    descriptor: expectedFrame.descriptor,
    ptsFrame: expectedFrame.ptsFrame,
    rgbaBytes,
    releaseAfterGpuUpload,
    releaseAfterUploadAbort,
    copyReport: {
      sequence: expectedFrame.ptsFrame,
      slotIndex: expectedFrame.descriptor.slotIndex,
      generation: expectedFrame.descriptor.generation,
      byteLen: rgbaBytes.byteLength,
      checksumAlgorithm: 'crc32',
      expectedChecksum: 0,
      actualChecksum: 0,
    },
  };
};

const resolveInlineDecodedVideoFrameBytes = (
  response: RustBackendResult<unknown>
): Uint8Array | number[] | string | null => {
  if (!response.success || !isRecord(response.result)) return null;
  const frame = response.result.frame;
  if (!isRecord(frame)) return null;
  const rgbaBytes = frame.rgbaBytes;
  if (!(rgbaBytes instanceof Uint8Array) && !Array.isArray(rgbaBytes) && typeof rgbaBytes !== 'string') {
    return null;
  }
  return rgbaBytes;
};

const normaliseInlineRgbaBytes = (
  rgbaBytes: Uint8Array | number[] | string
): Uint8Array | null => {
  if (rgbaBytes instanceof Uint8Array) return rgbaBytes;
  if (Array.isArray(rgbaBytes)) return Uint8Array.from(rgbaBytes);
  if (typeof atob !== 'function') return null;
  const binary = atob(rgbaBytes);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const assertDecodedFrameReleaseSucceeded = (result: RustBackendResult): void => {
  if (!result.success) {
    throw new Error(result.error ?? 'Rust backend decoded frame release failed.');
  }
};

const createSingleUseDecodedFrameReleaser = (
  releaseFrame: (copyOutState: 'gpuUploadFenceSignalled' | 'rendererUploadAborted') => Promise<void>
): (copyOutState: 'gpuUploadFenceSignalled' | 'rendererUploadAborted') => Promise<void> => {
  let releasePromise: Promise<void> | null = null;

  return (copyOutState) => {
    if (!releasePromise) {
      releasePromise = releaseFrame(copyOutState);
    }
    return releasePromise;
  };
};
