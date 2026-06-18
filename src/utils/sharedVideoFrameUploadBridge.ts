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
    }
  | {
      ok: false;
      reason: 'copyReportContainsPixelPayload';
      detail: string;
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
  if (copyReportContainsPixelPayload(response.result)) {
    return {
      ok: false,
      reason: 'copyReportContainsPixelPayload',
      detail: 'Shared video frame copy report must not return pixel bytes through the control plane.',
    };
  }

  return {
    ok: true,
    descriptor,
    ptsFrame,
    rgbaBytes,
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

const copyReportPixelPayloadKeys = new Set([
  'bytes',
  'pixels',
  'frameBase64',
  'rgbaBytes',
]);

const copyReportContainsPixelPayload = (report: SharedVideoFrameCopyReport): boolean => {
  const record = report as unknown as Record<string, unknown>;
  return Object.keys(record).some((key) => copyReportPixelPayloadKeys.has(key));
};
