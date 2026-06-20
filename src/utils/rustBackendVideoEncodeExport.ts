import {
  abortRustBackendVideoEncode,
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
  releaseAfterEncodeFailure?: {
    kind: 'nativeRenderOutput';
    memoryId: string;
  };
}

export type RustBackendNativeRenderOutputReleaseReason =
  | 'encodeWriteFailed';

export type RustBackendNativeRenderOutputReleaseEvent =
  | {
      status: 'released';
      memoryId: string;
      reason: RustBackendNativeRenderOutputReleaseReason;
    }
  | {
      status: 'missingBridge';
      memoryId: string;
      reason: RustBackendNativeRenderOutputReleaseReason;
    }
  | {
      status: 'failed';
      memoryId: string;
      reason: RustBackendNativeRenderOutputReleaseReason;
      error: string;
    }
  | {
      status: 'skipped';
      reason: RustBackendNativeRenderOutputReleaseReason;
    };

export type RustBackendVideoEncodeFrame =
  | RustBackendVideoEncodeRenderedFrame
  | RustBackendVideoEncodeSharedFramePayloadFrame;

export interface RunRustBackendVideoEncodeExportInput {
  filePath: string;
  audioPath?: string | null;
  width: number;
  height: number;
  fps: number;
  frames: AsyncIterable<RustBackendVideoEncodeSharedFramePayloadFrame>;
  sessionId?: string;
  encoderBridge?: RustBackendVideoEncodeBridge;
  nativeRenderBridge?: RustBackendNativeRenderOutputReleaseBridge;
  onNativeRenderOutputRelease?: (
    event: RustBackendNativeRenderOutputReleaseEvent
  ) => void;
}

interface RustBackendNativeRenderOutputReleaseBridge {
  releaseNativeSharedFrame: (
    payload: { memoryId: string }
  ) => Promise<{ success: boolean; result?: unknown; error?: string }>;
}

export interface RunRustBackendVideoEncodeExportResult {
  frameCount: number;
  sessionId: string;
  filePath: string;
}

interface RustBackendVideoEncodeFinishSummary {
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
  nativeRenderBridge,
  onNativeRenderOutputRelease,
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

  let finished = false;
  try {
    for await (const frame of frames) {
      if (!isSharedFramePayloadFrame(frame)) {
        throw new Error('Rust backend video encode export requires shared-frame payloads.');
      }

      let writeResponse;
      try {
        writeResponse = await writeRustBackendVideoEncodeFrame(frame.sharedFramePayload, encoderBridge);
      } catch (error) {
        await releaseNativeRenderOutputAfterEncodeFailure(
          frame,
          'encodeWriteFailed',
          nativeRenderBridge,
          onNativeRenderOutputRelease
        );
        throw error;
      }
      if (!writeResponse.success) {
        await releaseNativeRenderOutputAfterEncodeFailure(
          frame,
          'encodeWriteFailed',
          nativeRenderBridge,
          onNativeRenderOutputRelease
        );
      }
      assertBridgeSuccess(
        writeResponse.success,
        writeResponse.error,
        'Rust backend video encode frame write failed.'
      );
    }

    const finishResponse = await finishRustBackendVideoEncode({ sessionId }, encoderBridge);
    assertBridgeSuccess(finishResponse.success, finishResponse.error, 'Rust backend video encode finish failed.');
    finished = true;
    const finishSummary = parseRustBackendVideoEncodeFinishSummary(finishResponse.result);

    return {
      frameCount: finishSummary.frameCount,
      sessionId: finishSummary.sessionId,
      filePath: finishSummary.filePath,
    };
  } finally {
    if (!finished) {
      await abortRustBackendVideoEncode({ sessionId }, encoderBridge).catch(() => {});
    }
  }
};

const parseRustBackendVideoEncodeFinishSummary = (
  value: unknown
): RustBackendVideoEncodeFinishSummary => {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Rust backend video encode finish did not return a complete export summary.');
  }
  const result = value as {
    frameCount?: unknown;
    sessionId?: unknown;
    filePath?: unknown;
  };
  if (
    typeof result.frameCount !== 'number'
    || typeof result.sessionId !== 'string'
    || typeof result.filePath !== 'string'
  ) {
    throw new Error('Rust backend video encode finish did not return a complete export summary.');
  }

  return {
    frameCount: result.frameCount,
    sessionId: result.sessionId,
    filePath: result.filePath,
  };
};

const isSharedFramePayloadFrame = (
  frame: RustBackendVideoEncodeFrame
): frame is RustBackendVideoEncodeSharedFramePayloadFrame =>
  'sharedFramePayload' in frame;

const releaseNativeRenderOutputAfterEncodeFailure = async (
  frame: RustBackendVideoEncodeSharedFramePayloadFrame,
  reason: RustBackendNativeRenderOutputReleaseReason,
  bridge?: RustBackendNativeRenderOutputReleaseBridge,
  onNativeRenderOutputRelease?: (
    event: RustBackendNativeRenderOutputReleaseEvent
  ) => void
): Promise<void> => {
  if (frame.releaseAfterEncodeFailure?.kind !== 'nativeRenderOutput') {
    onNativeRenderOutputRelease?.({
      status: 'skipped',
      reason,
    });
    return;
  }
  const { memoryId } = frame.releaseAfterEncodeFailure;
  const releaseBridge = bridge ?? (typeof window !== 'undefined' ? window.rustBackend : undefined);
  if (!releaseBridge || typeof releaseBridge.releaseNativeSharedFrame !== 'function') {
    onNativeRenderOutputRelease?.({
      status: 'missingBridge',
      memoryId,
      reason,
    });
    return;
  }

  try {
    const releaseResult = await releaseBridge.releaseNativeSharedFrame({
      memoryId,
    });
    if (releaseResult?.success === false) {
      onNativeRenderOutputRelease?.({
        status: 'failed',
        memoryId,
        reason,
        error: releaseResult.error ?? 'Native render output release failed.',
      });
      return;
    }
  } catch (error) {
    onNativeRenderOutputRelease?.({
      status: 'failed',
      memoryId,
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  onNativeRenderOutputRelease?.({
    status: 'released',
    memoryId,
    reason,
  });
};
