import type { SharedRendererDecodedVideoFrameUpload } from './sharedRendererPreviewPresenterController';
import type {
  RustBackendResult,
  RustBackendSharedVideoFrame,
} from './rustBackendVideoDecodeControl';

export interface SharedVideoFrameCopyIntoUploadBufferPayload {
  memoryId: string;
  slotCount: number;
  slotByteLen: number;
  slotIndex: number;
  generation: number;
  ptsFrame: number;
}

export interface SharedVideoFrameCopyReport {
  sequence: number;
  slotIndex: number;
  generation: number;
  byteLen: number;
  checksumAlgorithm?: 'crc32';
  expectedChecksum: number;
  actualChecksum: number;
}

export type SharedVideoFrameCopyResponse = RustBackendResult<SharedVideoFrameCopyReport> & {
  copiedBytes?: Uint8Array | number[];
};

export interface SharedVideoFrameCopyBridge {
  copyIntoUploadBuffer: (
    payload: SharedVideoFrameCopyIntoUploadBufferPayload,
    target: Uint8Array
  ) => Promise<SharedVideoFrameCopyResponse>;
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
      reason: 'copyReportSlotLeaseMismatch';
      detail: string;
      expectedSlotIndex: number;
      actualSlotIndex: number;
      expectedGeneration: number;
      actualGeneration: number;
    }
  | {
      ok: false;
      reason: 'copyReportSequenceMismatch';
      detail: string;
      expectedSequence: number;
      actualSequence: number;
    }
  | {
      ok: false;
      reason: 'copyReportChecksumMismatch';
      detail: string;
      expectedChecksum: number;
      actualChecksum: number;
    }
  | {
      ok: false;
      reason: 'copyReportTargetChecksumMismatch';
      detail: string;
      expectedChecksum: number;
      actualChecksum: number;
    }
  | {
      ok: false;
      reason: 'copyReportChecksumAlgorithmUnsupported';
      detail: string;
      checksumAlgorithm: string;
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
    slotIndex: descriptor.slotIndex,
    generation: descriptor.generation,
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
  const copiedBytes = normaliseCopiedUploadBytes(response.copiedBytes);
  if (copiedBytes) {
    if (copiedBytes.byteLength !== descriptor.byteLen) {
      return {
        ok: false,
        reason: 'copyReportByteLengthMismatch',
        detail: 'Shared video frame copy report must match the decoded frame descriptor.',
        expectedByteLength: descriptor.byteLen,
        actualByteLength: copiedBytes.byteLength,
      };
    }
    rgbaBytes.set(copiedBytes);
  }
  if (
    response.result.slotIndex !== descriptor.slotIndex
    || response.result.generation !== descriptor.generation
  ) {
    return {
      ok: false,
      reason: 'copyReportSlotLeaseMismatch',
      detail: 'Shared video frame copy report must match the decoded frame descriptor slot lease.',
      expectedSlotIndex: descriptor.slotIndex,
      actualSlotIndex: response.result.slotIndex,
      expectedGeneration: descriptor.generation,
      actualGeneration: response.result.generation,
    };
  }
  if (response.result.sequence !== ptsFrame) {
    return {
      ok: false,
      reason: 'copyReportSequenceMismatch',
      detail: 'Shared video frame copy report must match the decoded frame pts.',
      expectedSequence: ptsFrame,
      actualSequence: response.result.sequence,
    };
  }
  if (
    response.result.checksumAlgorithm !== undefined
    && response.result.checksumAlgorithm !== 'crc32'
  ) {
    return {
      ok: false,
      reason: 'copyReportChecksumAlgorithmUnsupported',
      detail: 'Shared video frame copy report checksum algorithm must be crc32.',
      checksumAlgorithm: response.result.checksumAlgorithm,
    };
  }
  if (response.result.expectedChecksum !== response.result.actualChecksum) {
    return {
      ok: false,
      reason: 'copyReportChecksumMismatch',
      detail: 'Shared video frame copy report checksum verification failed.',
      expectedChecksum: response.result.expectedChecksum,
      actualChecksum: response.result.actualChecksum,
    };
  }
  if (response.result.checksumAlgorithm === 'crc32') {
    const targetChecksum = crc32(rgbaBytes);
    if (targetChecksum !== response.result.actualChecksum) {
      return {
        ok: false,
        reason: 'copyReportTargetChecksumMismatch',
        detail: 'Shared video frame upload buffer checksum must match the copy report.',
        expectedChecksum: response.result.actualChecksum,
        actualChecksum: targetChecksum,
      };
    }
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

const normaliseCopiedUploadBytes = (value: unknown): Uint8Array | null => {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) && value.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255)) {
    return Uint8Array.from(value);
  }
  return null;
};

let crc32Table: Uint32Array | null = null;

const crc32 = (bytes: Uint8Array): number => {
  const table = crc32Table ??= buildCrc32Table();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const buildCrc32Table = (): Uint32Array => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0
        ? (0xedb88320 ^ (value >>> 1))
        : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
};
