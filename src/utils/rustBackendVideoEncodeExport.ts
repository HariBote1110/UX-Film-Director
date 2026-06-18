import {
  finishRustBackendVideoEncode,
  startRustBackendVideoEncode,
  writeRustBackendVideoEncodeFrame,
  type RustBackendVideoEncodeBridge,
  type RustBackendVideoEncodeWriteFramePayload,
} from './rustBackendVideoEncodeControl';

export interface RustBackendVideoEncodeRenderedFrame {
  timestamp: number;
  bitmap: ImageBitmap;
}

export interface RustBackendVideoEncodeSharedFramePayloadFrame {
  timestamp: number;
  sharedFramePayload: RustBackendVideoEncodeWriteFramePayload;
}

export type RustBackendVideoEncodeFrame =
  | RustBackendVideoEncodeRenderedFrame
  | RustBackendVideoEncodeSharedFramePayloadFrame;

export interface RunRustBackendVideoEncodeExportInput {
  filePath: string;
  audioPath?: string | null;
  width: number;
  height: number;
  fps: number;
  frames: AsyncIterable<RustBackendVideoEncodeFrame>;
  sessionId?: string;
  encoderBridge?: RustBackendVideoEncodeBridge;
}

export interface RunRustBackendVideoEncodeExportResult {
  frameCount: number;
  sessionId: string;
  filePath: string;
}

const createDefaultSessionId = (): string =>
  `uxfd-export-${Date.now().toString(36)}`;

const assertBridgeSuccess = (
  success: boolean,
  error: string | undefined,
  fallbackMessage: string
): void => {
  if (!success) {
    throw new Error(error ?? fallbackMessage);
  }
};

export const runRustBackendVideoEncodeExport = async ({
  filePath,
  audioPath = null,
  width,
  height,
  fps,
  frames,
  sessionId = createDefaultSessionId(),
  encoderBridge = window.rustVideoEncoder,
}: RunRustBackendVideoEncodeExportInput): Promise<RunRustBackendVideoEncodeExportResult> => {
  const startResponse = await startRustBackendVideoEncode({
    sessionId,
    filePath,
    ...(audioPath ? { audioPath } : {}),
    width,
    height,
    fps,
    pixelFormat: 'rgba8Srgb',
    colour: {
      primaries: 'bt709',
      transfer: 'srgb',
      matrix: 'rgb',
      range: 'full',
    },
  }, encoderBridge);
  assertBridgeSuccess(startResponse.success, startResponse.error, 'Rust backend video encode start failed.');

  let frameCount = 0;
  for await (const frame of frames) {
    if (!isSharedFramePayloadFrame(frame)) {
      throw new Error('Rust backend video encode export requires shared-frame payloads.');
    }

    const writeResponse = await writeRustBackendVideoEncodeFrame(frame.sharedFramePayload, encoderBridge);
    assertBridgeSuccess(
      writeResponse.success,
      writeResponse.error,
      'Rust backend video encode frame write failed.'
    );
    frameCount += 1;
  }

  const finishResponse = await finishRustBackendVideoEncode({ sessionId }, encoderBridge);
  assertBridgeSuccess(finishResponse.success, finishResponse.error, 'Rust backend video encode finish failed.');

  return {
    frameCount,
    sessionId,
    filePath,
  };
};

const isSharedFramePayloadFrame = (
  frame: RustBackendVideoEncodeFrame
): frame is RustBackendVideoEncodeSharedFramePayloadFrame =>
  'sharedFramePayload' in frame;
