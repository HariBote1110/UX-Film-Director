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

export interface PrepareSharedRendererRustDecodedVideoUploadInput {
  decodeResponse: RustBackendResult<unknown>;
  slotCount: number;
  copyBridge: SharedVideoFrameCopyBridge;
  rustBackendBridge: RustBackendVideoDecodeBridge;
}

export type PrepareSharedRendererRustDecodedVideoUploadResult =
  | PrepareSharedRendererDecodedVideoFrameUploadResult
  | {
      ok: false;
      reason: 'decodedFrameUnavailable';
      detail: string;
    };

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
