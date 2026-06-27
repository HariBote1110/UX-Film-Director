export type RustBackendDecodedVideoFrameFormat = 'rgba8Srgb';
export type RustBackendVideoDecodeCopyOutState =
  | 'gpuUploadFenceSignalled'
  | 'rendererUploadAborted';

export interface RustBackendVideoDecodeColour {
  primaries: 'bt709';
  transfer: 'srgb';
  matrix: 'rgb';
  range: 'full';
}

export interface RustBackendVideoDecodeFrameRate {
  numerator: number;
  denominator: number;
}

export interface RustBackendVideoDecodeStartPayload {
  jobId: string;
  source: string;
  slotCount: number;
  width: number;
  height: number;
  sourceRate: RustBackendVideoDecodeFrameRate;
  format: RustBackendDecodedVideoFrameFormat;
  colour: RustBackendVideoDecodeColour;
}

export interface RustBackendVideoDecodeFramePayload {
  jobId: string;
  requestId: number;
  frameIndex: number;
  mode: 'latestWins';
}

export interface RustBackendVideoDecodeReleaseFramePayload {
  jobId: string;
  slotIndex: number;
  generation: number;
  copyOutState: RustBackendVideoDecodeCopyOutState;
}

export interface RustBackendVideoDecodeStopPayload {
  jobId: string;
}

export interface RustBackendVideoFrameDescriptor {
  memoryId: string;
  slotIndex: number;
  generation: number;
  byteOffset: number;
  byteLen: number;
  width: number;
  height: number;
  strideBytes: number;
  format: RustBackendDecodedVideoFrameFormat;
  colour: RustBackendVideoDecodeColour;
}

export interface RustBackendSharedVideoFrame {
  descriptor: RustBackendVideoFrameDescriptor;
  ptsFrame: number;
}

export interface RustBackendInlineDecodedVideoFrame extends RustBackendSharedVideoFrame {
  rgbaBytes: Uint8Array | number[] | string;
}

export interface RustBackendVideoFrameChecksum {
  algorithm: 'crc32';
  valueHex: string;
  byteLen: number;
}

export interface RustBackendVideoFrameVerification {
  frameIndex: number;
  checksum: RustBackendVideoFrameChecksum;
  status: 'withinTolerance' | 'mismatch' | 'verificationFailed';
}

export interface RustBackendVideoDecodeFrameResult {
  accepted: boolean;
  jobId: string;
  requestId: number;
  frameIndex: number;
  mode: 'latestWins';
  frame?: RustBackendSharedVideoFrame;
  verification?: RustBackendVideoFrameVerification;
  decodeInvocationCount?: number;
  // Diagnostic: why the streaming ffmpeg process was (or was not) restarted for
  // this frame. Surfaced by the Rust backend to measure restart-driven jank.
  // 'sequential' | 'firstFrame' | 'backwardSeek' | 'forwardGapExceeded' | 'byteLenMismatch'.
  streamRestartReason?: string;
  streamRestarted?: boolean;
  streamSkippedFrameCount?: number;
}

export interface RustBackendResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
}

export interface RustBackendVideoDecodeBridge {
  startVideoDecode: (
    payload: RustBackendVideoDecodeStartPayload
  ) => Promise<RustBackendResult>;
  requestVideoDecodeFrame: (
    payload: RustBackendVideoDecodeFramePayload
  ) => Promise<RustBackendResult<unknown>>;
  requestVideoDecodeFrameInline?: (
    payload: RustBackendVideoDecodeFramePayload
  ) => Promise<RustBackendResult<unknown>>;
  stopVideoDecode: (
    payload: RustBackendVideoDecodeStopPayload
  ) => Promise<RustBackendResult>;
  releaseVideoDecodeFrame: (
    payload: RustBackendVideoDecodeReleaseFramePayload
  ) => Promise<RustBackendResult>;
}

export const startRustBackendVideoDecode = (
  payload: RustBackendVideoDecodeStartPayload,
  bridge: RustBackendVideoDecodeBridge = window.rustBackend
): Promise<RustBackendResult> =>
  bridge.startVideoDecode(payload);

export const requestRustBackendVideoDecodeFrame = (
  payload: RustBackendVideoDecodeFramePayload,
  bridge: RustBackendVideoDecodeBridge = window.rustBackend
): Promise<RustBackendResult<unknown>> =>
  bridge.requestVideoDecodeFrame(payload);

export const stopRustBackendVideoDecode = (
  payload: RustBackendVideoDecodeStopPayload,
  bridge: RustBackendVideoDecodeBridge = window.rustBackend
): Promise<RustBackendResult> =>
  bridge.stopVideoDecode(payload);

export const releaseRustBackendVideoDecodeFrame = (
  payload: RustBackendVideoDecodeReleaseFramePayload,
  bridge: RustBackendVideoDecodeBridge = window.rustBackend
): Promise<RustBackendResult> =>
  bridge.releaseVideoDecodeFrame(payload);

export const isRustBackendDecodedVideoFrameAvailable = (
  response: RustBackendResult<unknown>
): response is RustBackendResult<RustBackendVideoDecodeFrameResult> & {
  success: true;
  result: RustBackendVideoDecodeFrameResult & {
    frame: RustBackendSharedVideoFrame;
    verification: RustBackendVideoFrameVerification;
  };
} => {
  if (response.success !== true || !isRecord(response.result)) return false;

  const result = response.result;
  if (result.accepted !== true || result.mode !== 'latestWins') return false;
  if (containsJsonFramePayload(result)) return false;
  if (!isRecord(result.frame) || !isRecord(result.verification)) return false;
  if (result.verification.status !== 'withinTolerance') return false;

  const descriptor = isRecord(result.frame.descriptor) ? result.frame.descriptor : null;
  const colour = descriptor && isRecord(descriptor.colour) ? descriptor.colour : null;
  const checksum = isRecord(result.verification.checksum) ? result.verification.checksum : null;

  return Boolean(
    descriptor
    && colour
    && checksum
    && typeof result.jobId === 'string'
    && result.jobId.trim().length > 0
    && isNonNegativeInteger(result.requestId)
    && isNonNegativeInteger(result.frameIndex)
    && isValidSharedFrameDescriptor(descriptor)
    && descriptor.format === 'rgba8Srgb'
    && colour.primaries === 'bt709'
    && colour.transfer === 'srgb'
    && colour.matrix === 'rgb'
    && colour.range === 'full'
    && checksum.algorithm === 'crc32'
    && typeof checksum.valueHex === 'string'
    && typeof checksum.byteLen === 'number'
    && checksum.byteLen === descriptor.byteLen
    && isNonNegativeInteger(result.verification.frameIndex)
    && result.verification.frameIndex === result.frameIndex
    && isNonNegativeInteger(result.frame.ptsFrame)
    && result.frame.ptsFrame === result.frameIndex
  );
};

const GPU_COPY_BYTES_PER_ROW_ALIGNMENT = 256;

const isValidSharedFrameDescriptor = (
  descriptor: Record<string, unknown>,
): boolean => {
  if (typeof descriptor.memoryId !== 'string' || descriptor.memoryId.trim().length === 0) {
    return false;
  }

  if (
    !isNonNegativeInteger(descriptor.slotIndex)
    || !isNonNegativeInteger(descriptor.generation)
    || !isNonNegativeInteger(descriptor.byteOffset)
    || !isPositiveInteger(descriptor.byteLen)
    || !isPositiveInteger(descriptor.width)
    || !isPositiveInteger(descriptor.height)
    || !isPositiveInteger(descriptor.strideBytes)
  ) {
    return false;
  }

  const unpaddedRowBytes = descriptor.width * 4;
  const expectedByteOffset = descriptor.byteLen * descriptor.slotIndex;
  return descriptor.strideBytes >= unpaddedRowBytes
    && descriptor.strideBytes % GPU_COPY_BYTES_PER_ROW_ALIGNMENT === 0
    && descriptor.byteLen === descriptor.strideBytes * descriptor.height
    && descriptor.byteOffset === expectedByteOffset;
};

const forbiddenJsonFramePayloadKeys = new Set([
  'bytes',
  'pixels',
  'frameBase64',
  'rgbaBytes',
]);

const containsJsonFramePayload = (
  value: unknown,
  visited = new WeakSet<object>(),
): boolean => {
  if (!isRecord(value)) return false;
  if (visited.has(value)) return false;
  visited.add(value);

  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenJsonFramePayloadKeys.has(key)) return true;
    if (containsJsonFramePayload(nested, visited)) return true;
  }

  return false;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isPositiveInteger = (value: unknown): value is number =>
  isNonNegativeInteger(value) && value > 0;
