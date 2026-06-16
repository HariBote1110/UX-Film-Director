export type RustBackendDecodedVideoFrameFormat = 'rgba8Srgb';
export type RustBackendVideoDecodeCopyOutState = 'gpuUploadFenceSignalled';

export interface RustBackendVideoDecodeColour {
  primaries: 'bt709';
  transfer: 'srgb';
  matrix: 'rgb';
  range: 'full';
}

export interface RustBackendVideoDecodeStartPayload {
  jobId: string;
  source: string;
  slotCount: number;
  width: number;
  height: number;
  format: RustBackendDecodedVideoFrameFormat;
  colour: RustBackendVideoDecodeColour;
}

export interface RustBackendVideoDecodeFramePayload {
  jobId: string;
  frameIndex: number;
}

export interface RustBackendVideoDecodeReleaseFramePayload {
  jobId: string;
  slotIndex: number;
  generation: number;
  copyOutState: RustBackendVideoDecodeCopyOutState;
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
): Promise<RustBackendResult> =>
  bridge.requestVideoDecodeFrame(payload);

export const releaseRustBackendVideoDecodeFrame = (
  payload: RustBackendVideoDecodeReleaseFramePayload,
  bridge: RustBackendVideoDecodeBridge = window.rustBackend
): Promise<RustBackendResult> =>
  bridge.releaseVideoDecodeFrame(payload);
