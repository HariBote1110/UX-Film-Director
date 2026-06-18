import {
  finishRustBackendVideoEncode,
  startRustBackendVideoEncode,
  writeRustBackendVideoEncodeFrame,
  type RustBackendVideoEncodeBridge,
  type RustBackendVideoEncodeWriteFramePayload,
} from './rustBackendVideoEncodeControl';
import {
  createRustBackendVideoEncodeSharedFrameWriter,
  type RustBackendVideoEncodeSharedFrameWritableBridge,
  type RustBackendVideoEncodeSharedFrameWriter,
} from './rustBackendVideoEncodeSharedFrameWriter';

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

export type RustBackendVideoEncodeBitmapToRgbaBytes = (
  bitmap: ImageBitmap,
  width: number,
  height: number
) => Promise<Uint8Array>;

export interface RunRustBackendVideoEncodeExportInput {
  filePath: string;
  audioPath?: string | null;
  width: number;
  height: number;
  fps: number;
  frames: AsyncIterable<RustBackendVideoEncodeFrame>;
  sessionId?: string;
  memoryId?: string;
  encoderBridge?: RustBackendVideoEncodeBridge;
  sharedFrameBridge?: RustBackendVideoEncodeSharedFrameWritableBridge;
  extractRgbaBytes?: RustBackendVideoEncodeBitmapToRgbaBytes;
}

export interface RunRustBackendVideoEncodeExportResult {
  frameCount: number;
  sessionId: string;
  filePath: string;
}

const createDefaultSessionId = (): string =>
  `uxfd-export-${Date.now().toString(36)}`;

const createDefaultMemoryId = (sessionId: string): string => {
  const safeSessionId = sessionId.replace(/[^A-Za-z0-9_-]/g, '-');
  return `/uxfd-export-${safeSessionId}`;
};

const assertBridgeSuccess = (
  success: boolean,
  error: string | undefined,
  fallbackMessage: string
): void => {
  if (!success) {
    throw new Error(error ?? fallbackMessage);
  }
};

export const extractImageBitmapRgbaBytes: RustBackendVideoEncodeBitmapToRgbaBytes = async (
  bitmap,
  width,
  height
) => {
  const canvas = createReadbackCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('2D canvas context is required for Rust encoder frame readback.');
  }

  context.drawImage(bitmap, 0, 0, width, height);
  return Uint8Array.from(context.getImageData(0, 0, width, height).data);
};

export const runRustBackendVideoEncodeExport = async ({
  filePath,
  audioPath = null,
  width,
  height,
  fps,
  frames,
  sessionId = createDefaultSessionId(),
  memoryId = createDefaultMemoryId(sessionId),
  encoderBridge = window.rustVideoEncoder,
  sharedFrameBridge = window.sharedVideoFrame,
  extractRgbaBytes = extractImageBitmapRgbaBytes,
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

  let writer: RustBackendVideoEncodeSharedFrameWriter | null = null;
  let writerClosed = false;
  let pendingError: unknown;

  try {
    let frameCount = 0;
    for await (const frame of frames) {
      let payload: RustBackendVideoEncodeWriteFramePayload;
      if (isSharedFramePayloadFrame(frame)) {
        payload = frame.sharedFramePayload;
      } else {
        if (!writer) {
          writer = await createRustBackendVideoEncodeSharedFrameWriter({
            sessionId,
            memoryId,
            width,
            height,
            fps,
            bridge: sharedFrameBridge,
          });
        }
        const rgbaBytes = await extractRgbaBytes(frame.bitmap, width, height);
        payload = await writer.writeFrame({
          frameIndex: frameCount,
          timestampUs: frame.timestamp,
          rgbaBytes,
        });
      }

      const writeResponse = await writeRustBackendVideoEncodeFrame(payload, encoderBridge);
      assertBridgeSuccess(
        writeResponse.success,
        writeResponse.error,
        'Rust backend video encode frame write failed.'
      );
      frameCount += 1;
    }

    if (writer) {
      await writer.close();
      writerClosed = true;
    }
    const finishResponse = await finishRustBackendVideoEncode({ sessionId }, encoderBridge);
    assertBridgeSuccess(finishResponse.success, finishResponse.error, 'Rust backend video encode finish failed.');

    return {
      frameCount,
      sessionId,
      filePath,
    };
  } catch (error) {
    pendingError = error;
    throw error;
  } finally {
    if (writer && !writerClosed) {
      try {
        await writer.close();
      } catch (closeError) {
        if (!pendingError) {
          throw closeError;
        }
      }
    }
  }
};

const isSharedFramePayloadFrame = (
  frame: RustBackendVideoEncodeFrame
): frame is RustBackendVideoEncodeSharedFramePayloadFrame =>
  'sharedFramePayload' in frame;

const createReadbackCanvas = (
  width: number,
  height: number
): OffscreenCanvas | HTMLCanvasElement => {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  throw new Error('Canvas readback is unavailable in this environment.');
};
