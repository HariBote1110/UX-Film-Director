import type { SharedRendererDecodedVideoFrameUpload } from './sharedRendererPreviewPresenterController';
import type {
  RustBackendResult,
  RustBackendSharedVideoFrame,
} from './rustBackendVideoDecodeControl';

export interface SharedVideoFrameCopyIntoUploadBufferPayload {
  memoryId: string;
  slotCount: number;
  slotByteLen: number;
  ptsFrame: number;
}

export interface SharedVideoFrameCopyReport {
  sequence: number;
  byteLen: number;
  expectedChecksum: number;
  actualChecksum: number;
  rgbaBytes?: Uint8Array | ArrayBuffer | ReadonlyArray<number>;
}

export interface SharedVideoFrameCopyBridge {
  copyIntoUploadBuffer: (
    payload: SharedVideoFrameCopyIntoUploadBufferPayload,
    target: Uint8Array
  ) => Promise<RustBackendResult<SharedVideoFrameCopyReport>>;
}

export interface PrepareSharedRendererDecodedVideoFrameUploadInput {
  sharedFrame: RustBackendSharedVideoFrame;
  slotCount: number;
  bridge?: SharedVideoFrameCopyBridge;
  releaseAfterGpuUpload?: () => Promise<void>;
}

export type PrepareSharedRendererDecodedVideoFrameUploadResult =
  | (SharedRendererDecodedVideoFrameUpload & {
      ok: true;
      copyReport: SharedVideoFrameCopyReport;
    })
  | {
      ok: false;
      reason: 'copyFailed';
      detail: string;
    }
  | {
      ok: false;
      reason: 'copyReportByteLengthMismatch';
      detail: string;
      expectedByteLength: number;
      actualByteLength: number;
    };

const normaliseReturnedRgbaBytes = (
  candidate: SharedVideoFrameCopyReport['rgbaBytes'],
): Uint8Array | null => {
  if (!candidate) {
    return null;
  }
  if (candidate instanceof Uint8Array) {
    return candidate;
  }
  if (candidate instanceof ArrayBuffer) {
    return new Uint8Array(candidate);
  }
  if (ArrayBuffer.isView(candidate)) {
    return new Uint8Array(candidate.buffer, candidate.byteOffset, candidate.byteLength);
  }
  if (Array.isArray(candidate)) {
    return Uint8Array.from(candidate);
  }

  return null;
};

export const prepareSharedRendererDecodedVideoFrameUpload = async ({
  sharedFrame,
  slotCount,
  bridge = window.sharedVideoFrame,
  releaseAfterGpuUpload,
}: PrepareSharedRendererDecodedVideoFrameUploadInput): Promise<PrepareSharedRendererDecodedVideoFrameUploadResult> => {
  const { descriptor, ptsFrame } = sharedFrame;
  const rgbaBytes = new Uint8Array(descriptor.byteLen);
  const response = await bridge.copyIntoUploadBuffer({
    memoryId: descriptor.memoryId,
    slotCount,
    slotByteLen: descriptor.byteLen,
    ptsFrame,
  }, rgbaBytes);

  if (!response.success || !response.result) {
    return {
      ok: false,
      reason: 'copyFailed',
      detail: response.error ?? 'Shared video frame copy failed.',
    };
  }
  if (response.result.byteLen !== descriptor.byteLen) {
    return {
      ok: false,
      reason: 'copyReportByteLengthMismatch',
      detail: 'Shared video frame copy report must match the decoded frame descriptor.',
      expectedByteLength: descriptor.byteLen,
      actualByteLength: response.result.byteLen,
    };
  }
  const returnedBytes = normaliseReturnedRgbaBytes(response.result.rgbaBytes);
  if (returnedBytes) {
    if (returnedBytes.byteLength !== descriptor.byteLen) {
      return {
        ok: false,
        reason: 'copyReportByteLengthMismatch',
        detail: 'Shared video frame copy report must match the decoded frame descriptor.',
        expectedByteLength: descriptor.byteLen,
        actualByteLength: returnedBytes.byteLength,
      };
    }
    rgbaBytes.set(returnedBytes);
  }

  return {
    ok: true,
    descriptor,
    ptsFrame,
    rgbaBytes,
    releaseAfterGpuUpload,
    copyReport: response.result,
  };
};
