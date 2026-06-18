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
  releaseAfterUploadAbort?: () => Promise<void>;
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
    }
  | {
      ok: false;
      reason: 'descriptorOutsideSharedRingLayout';
      detail: string;
    };

const normaliseReturnedRgbaBytes = (
  candidate: SharedVideoFrameCopyReport['rgbaBytes'],
): Uint8Array<ArrayBuffer> | null => {
  if (!candidate) {
    return null;
  }
  if (candidate instanceof Uint8Array) {
    return candidate as Uint8Array<ArrayBuffer>;
  }
  if (candidate instanceof ArrayBuffer) {
    return new Uint8Array(candidate);
  }
  if (ArrayBuffer.isView(candidate)) {
    return new Uint8Array(candidate.buffer as ArrayBuffer, candidate.byteOffset, candidate.byteLength);
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
  releaseAfterUploadAbort,
}: PrepareSharedRendererDecodedVideoFrameUploadInput): Promise<PrepareSharedRendererDecodedVideoFrameUploadResult> => {
  const { descriptor, ptsFrame } = sharedFrame;
  if (!isDescriptorInsideSharedRingLayout(descriptor, slotCount)) {
    return {
      ok: false,
      reason: 'descriptorOutsideSharedRingLayout',
      detail: 'Shared video frame descriptor points outside the declared ring layout.',
    };
  }

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
  let resolvedRgbaBytes = rgbaBytes;
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
    resolvedRgbaBytes = returnedBytes;
  }

  return {
    ok: true,
    descriptor,
    ptsFrame,
    rgbaBytes: resolvedRgbaBytes,
    releaseAfterGpuUpload,
    releaseAfterUploadAbort,
    copyReport: response.result,
  };
};

const isDescriptorInsideSharedRingLayout = (
  descriptor: RustBackendSharedVideoFrame['descriptor'],
  slotCount: number,
): boolean => {
  if (!Number.isSafeInteger(slotCount) || slotCount <= 0) return false;
  if (!Number.isSafeInteger(descriptor.slotIndex) || descriptor.slotIndex < 0) return false;
  if (!Number.isSafeInteger(descriptor.byteLen) || descriptor.byteLen <= 0) return false;
  if (!Number.isSafeInteger(descriptor.byteOffset) || descriptor.byteOffset < 0) return false;

  const expectedOffset = descriptor.byteLen * descriptor.slotIndex;
  const ringByteLen = descriptor.byteLen * slotCount;

  return descriptor.slotIndex < slotCount
    && Number.isSafeInteger(expectedOffset)
    && Number.isSafeInteger(ringByteLen)
    && descriptor.byteOffset === expectedOffset
    && descriptor.byteOffset + descriptor.byteLen <= ringByteLen;
};
