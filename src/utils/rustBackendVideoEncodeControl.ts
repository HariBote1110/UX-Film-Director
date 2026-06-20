import type {
  RustBackendDecodedVideoFrameFormat,
  RustBackendSharedVideoFrame,
  RustBackendVideoDecodeColour,
} from './rustBackendVideoDecodeControl';
import type {
  RustBackendNativeRenderSharedFrameSource,
} from './rustBackendNativeRenderControl';
import type {
  RustSceneMediaReference,
  RustSceneSnapshot,
} from './rustSceneSnapshot';

export interface RustBackendVideoEncodeStartPayload {
  sessionId: string;
  filePath: string;
  audioPath?: string | null;
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

export interface RustBackendVideoEncodeWriteNativeFramePayload {
  sessionId: string;
  renderId: string;
  frameIndex: number;
  timestampUs: number;
  width: number;
  height: number;
  snapshot: RustSceneSnapshot;
  media: RustSceneMediaReference[];
  sources: RustBackendNativeRenderSharedFrameSource[];
}

export interface RustBackendVideoTranscodePayload {
  inputPath: string;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  startSeconds?: number;
  objectX?: number;
  objectY?: number;
  objectWidth?: number;
  objectHeight?: number;
  audioPath?: string | null;
}

export interface RustBackendVideoEncodeFinishPayload {
  sessionId: string;
}

export interface RustBackendVideoEncodeAbortPayload {
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
  writeNativeEncodeFrame?: (
    payload: RustBackendVideoEncodeWriteNativeFramePayload
  ) => Promise<RustBackendVideoEncodeResult>;
  transcodeVideo?: (
    payload: RustBackendVideoTranscodePayload
  ) => Promise<RustBackendVideoEncodeResult>;
  finishVideoEncode: (
    payload: RustBackendVideoEncodeFinishPayload
  ) => Promise<RustBackendVideoEncodeResult>;
  abortVideoEncode?: (
    payload: RustBackendVideoEncodeAbortPayload
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

export const writeRustBackendVideoEncodeNativeFrame = (
  payload: RustBackendVideoEncodeWriteNativeFramePayload,
  bridge: RustBackendVideoEncodeBridge = window.rustVideoEncoder
): Promise<RustBackendVideoEncodeResult> => {
  if (typeof bridge.writeNativeEncodeFrame !== 'function') {
    return Promise.resolve({
      success: false,
      error: 'Rust backend native video encode frame bridge is unavailable.',
    });
  }
  return bridge.writeNativeEncodeFrame(payload);
};

export const transcodeRustBackendVideo = (
  payload: RustBackendVideoTranscodePayload,
  bridge: RustBackendVideoEncodeBridge = window.rustVideoEncoder
): Promise<RustBackendVideoEncodeResult> => {
  if (typeof bridge.transcodeVideo !== 'function') {
    return Promise.resolve({
      success: false,
      error: 'Rust backend video transcode bridge is unavailable.',
    });
  }
  return bridge.transcodeVideo(payload);
};

export const finishRustBackendVideoEncode = (
  payload: RustBackendVideoEncodeFinishPayload,
  bridge: RustBackendVideoEncodeBridge = window.rustVideoEncoder
): Promise<RustBackendVideoEncodeResult> =>
  bridge.finishVideoEncode(payload);

export const abortRustBackendVideoEncode = (
  payload: RustBackendVideoEncodeAbortPayload,
  bridge: RustBackendVideoEncodeBridge = window.rustVideoEncoder
): Promise<RustBackendVideoEncodeResult> => {
  if (typeof bridge.abortVideoEncode !== 'function') {
    return Promise.resolve({
      success: false,
      error: 'Rust backend video encode abort bridge is unavailable.',
    });
  }
  return bridge.abortVideoEncode(payload);
};
