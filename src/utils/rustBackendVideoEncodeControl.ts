import type {
  RustBackendDecodedVideoFrameFormat,
  RustBackendSharedVideoFrame,
  RustBackendVideoDecodeColour,
} from './rustBackendVideoDecodeControl';

export interface RustBackendVideoEncodeStartPayload {
  sessionId: string;
  filePath: string;
  width: number;
  height: number;
  fps: number;
  pixelFormat: RustBackendDecodedVideoFrameFormat;
  colour: RustBackendVideoDecodeColour;
}

export interface RustBackendVideoEncodeWriteFramePayload {
  sessionId: string;
  frameIndex: number;
  timestampUs: number;
  slotCount: number;
  frame: RustBackendSharedVideoFrame;
}

export interface RustBackendVideoEncodeFinishPayload {
  sessionId: string;
}

export interface RustBackendVideoEncodeResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
}

export interface RustBackendVideoEncodeBridge {
  startVideoEncode: (
    payload: RustBackendVideoEncodeStartPayload
  ) => Promise<RustBackendVideoEncodeResult>;
  writeVideoEncodeFrame: (
    payload: RustBackendVideoEncodeWriteFramePayload
  ) => Promise<RustBackendVideoEncodeResult>;
  finishVideoEncode: (
    payload: RustBackendVideoEncodeFinishPayload
  ) => Promise<RustBackendVideoEncodeResult>;
}

export const isRustBackendVideoEncodeBridgeAvailable = (
  bridge: Partial<RustBackendVideoEncodeBridge> | null | undefined
): bridge is RustBackendVideoEncodeBridge =>
  typeof bridge?.startVideoEncode === 'function'
  && typeof bridge.writeVideoEncodeFrame === 'function'
  && typeof bridge.finishVideoEncode === 'function';

export const startRustBackendVideoEncode = (
  payload: RustBackendVideoEncodeStartPayload,
  bridge: RustBackendVideoEncodeBridge = window.rustVideoEncoder
): Promise<RustBackendVideoEncodeResult> =>
  bridge.startVideoEncode(payload);

export const writeRustBackendVideoEncodeFrame = (
  payload: RustBackendVideoEncodeWriteFramePayload,
  bridge: RustBackendVideoEncodeBridge = window.rustVideoEncoder
): Promise<RustBackendVideoEncodeResult> =>
  bridge.writeVideoEncodeFrame(payload);

export const finishRustBackendVideoEncode = (
  payload: RustBackendVideoEncodeFinishPayload,
  bridge: RustBackendVideoEncodeBridge = window.rustVideoEncoder
): Promise<RustBackendVideoEncodeResult> =>
  bridge.finishVideoEncode(payload);
