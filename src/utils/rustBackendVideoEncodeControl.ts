import type {
  ProjectExportVideoTranscodeOverlay,
} from './projectExportVideoTranscodeFastPath';
import type {
  RustBackendDecodedVideoFrameFormat,
  RustBackendSharedVideoFrame,
  RustBackendVideoDecodeColour,
} from './rustBackendVideoDecodeControl';
import type {
  RustBackendNativeRenderAudioWaveform,
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
  iosurfaceEncode?: boolean;
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
  media: readonly RustSceneMediaReference[];
  sources: readonly RustBackendNativeRenderSharedFrameSource[];
  audioWaveforms?: readonly RustBackendNativeRenderAudioWaveform[];
}

export interface RustBackendVideoEncodeWriteResidentSceneFramePayload {
  sessionId: string;
  sceneId: string;
  revision: number;
  frameIndex: number;
  sources?: readonly RustBackendNativeRenderSharedFrameSource[];
  audioWaveforms?: readonly RustBackendNativeRenderAudioWaveform[];
}

export interface RustBackendVideoTranscodePayload {
  sessionId?: string;
  inputPath: string;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  startSeconds?: number;
  includeAudio?: boolean;
  audioVolume?: number;
  objectX?: number;
  objectY?: number;
  objectWidth?: number;
  objectHeight?: number;
  overlays?: ProjectExportVideoTranscodeOverlay[];
  audioPath?: string | null;
  qualityPreset?: string;
  videoBitrateKbps?: number;
}

export interface RustBackendVideoTranscodeProgressEvent {
  sessionId: string;
  completedFrames: number;
  totalFrames: number;
  percent: number;
  status?: string;
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
  writeResidentSceneEncodeFrame?: (
    payload: RustBackendVideoEncodeWriteResidentSceneFramePayload
  ) => Promise<RustBackendVideoEncodeResult>;
  transcodeVideo?: (
    payload: RustBackendVideoTranscodePayload
  ) => Promise<RustBackendVideoEncodeResult>;
  onTranscodeProgress?: (
    listener: (event: RustBackendVideoTranscodeProgressEvent) => void
  ) => (() => void);
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

export const writeResidentSceneEncodeFrame = (
  payload: RustBackendVideoEncodeWriteResidentSceneFramePayload,
  bridge: RustBackendVideoEncodeBridge = window.rustVideoEncoder
): Promise<RustBackendVideoEncodeResult> => {
  if (typeof bridge.writeResidentSceneEncodeFrame !== 'function') {
    return Promise.resolve({
      success: false,
      error: 'Rust backend resident scene video encode frame bridge is unavailable.',
    });
  }
  return bridge.writeResidentSceneEncodeFrame(payload);
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
