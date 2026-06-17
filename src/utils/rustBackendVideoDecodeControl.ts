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
  ) => Promise<RustBackendResult<RustBackendVideoDecodeFrameResult>>;
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
): Promise<RustBackendResult<RustBackendVideoDecodeFrameResult>> =>
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
  if (!isRecord(result.frame) || !isRecord(result.verification)) return false;
  if (result.verification.status !== 'withinTolerance') return false;

  const descriptor = isRecord(result.frame.descriptor) ? result.frame.descriptor : null;
  const colour = descriptor && isRecord(descriptor.colour) ? descriptor.colour : null;
  const checksum = isRecord(result.verification.checksum) ? result.verification.checksum : null;

  return Boolean(
    descriptor
    && colour
    && checksum
    && descriptor.format === 'rgba8Srgb'
    && colour.primaries === 'bt709'
    && colour.transfer === 'srgb'
    && colour.matrix === 'rgb'
    && colour.range === 'full'
    && checksum.algorithm === 'crc32'
    && typeof checksum.valueHex === 'string'
    && typeof checksum.byteLen === 'number'
    && checksum.byteLen === descriptor.byteLen
    && typeof result.frame.ptsFrame === 'number'
    && result.frame.ptsFrame === result.frameIndex
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
