import {
  abortRustBackendVideoEncode,
  finishRustBackendVideoEncode,
  startRustBackendVideoEncode,
  writeRustBackendVideoEncodeFrame,
  writeRustBackendVideoEncodeNativeFrame,
  type RustBackendVideoEncodeBridge,
  type RustBackendVideoEncodeWriteNativeFramePayload,
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
  releaseSharedFrameAfterEncodeSuccess?: () => Promise<void>;
  releaseSharedFrameAfterEncodeFailure?: () => Promise<void>;
}

export interface RustBackendVideoEncodeNativeFramePayloadFrame {
  timestamp: number;
  nativeEncodeFramePayload: RustBackendVideoEncodeWriteNativeFramePayload;
  releaseNativeEncodeSourcesAfterWrite?: {
    kind: 'nativeRenderSources';
    releaseAfterEncodeFailure: () => Promise<void>;
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
  | RustBackendVideoEncodeSharedFramePayloadFrame
  | RustBackendVideoEncodeNativeFramePayloadFrame;

export interface RunRustBackendVideoEncodeExportInput {
  filePath: string;
  audioPath?: string | null;
  width: number;
  height: number;
  fps: number;
  frames: AsyncIterable<RustBackendVideoEncodeSharedFramePayloadFrame | RustBackendVideoEncodeNativeFramePayloadFrame>;
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
    const frameIterator = frames[Symbol.asyncIterator]();
    let nextFrameResult = await frameIterator.next();
    while (!nextFrameResult.done) {
      const frame = nextFrameResult.value;
      if (!isSharedFramePayloadFrame(frame) && !isNativeEncodeFramePayloadFrame(frame)) {
        throw new Error('Rust backend video encode export requires shared-frame or native encode payloads.');
      }

      const writeFrameResult = writeFrameToRustBackend(
        frame,
        encoderBridge,
        nativeRenderBridge,
        onNativeRenderOutputRelease
      );
      const prefetchedFrameResult = frameIterator.next();
      try {
        await writeFrameResult;
      } catch (error) {
        await releasePrefetchedNativeRenderOutputAfterEncodeFailure(
          prefetchedFrameResult,
          nativeRenderBridge,
          onNativeRenderOutputRelease
        );
        throw error;
      }
      nextFrameResult = await prefetchedFrameResult;
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

const writeSharedFrameToRustBackend = async (
  frame: RustBackendVideoEncodeSharedFramePayloadFrame,
  encoderBridge: RustBackendVideoEncodeBridge,
  nativeRenderBridge?: RustBackendNativeRenderOutputReleaseBridge,
  onNativeRenderOutputRelease?: (
    event: RustBackendNativeRenderOutputReleaseEvent
  ) => void
): Promise<void> => {
  let writeResponse;
  try {
    writeResponse = await writeRustBackendVideoEncodeFrame(frame.sharedFramePayload, encoderBridge);
  } catch (error) {
    await releaseSharedFrameAfterEncodeFailure(
      frame,
      'encodeWriteFailed',
      nativeRenderBridge,
      onNativeRenderOutputRelease
    );
    throw error;
  }
  if (!writeResponse.success) {
    await releaseSharedFrameAfterEncodeFailure(
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
  await frame.releaseSharedFrameAfterEncodeSuccess?.();
};

const writeNativeFrameToRustBackend = async (
  frame: RustBackendVideoEncodeNativeFramePayloadFrame,
  encoderBridge: RustBackendVideoEncodeBridge
): Promise<void> => {
  let writeResponse;
  try {
    writeResponse = await writeRustBackendVideoEncodeNativeFrame(
      frame.nativeEncodeFramePayload,
      encoderBridge
    );
  } catch (error) {
    await frame.releaseNativeEncodeSourcesAfterWrite?.releaseAfterEncodeFailure();
    throw error;
  }
  if (!writeResponse.success) {
    await frame.releaseNativeEncodeSourcesAfterWrite?.releaseAfterEncodeFailure();
    assertBridgeSuccess(
      writeResponse.success,
      writeResponse.error,
      'Rust backend native video encode frame write failed.'
    );
    return;
  }
};

const writeFrameToRustBackend = async (
  frame: RustBackendVideoEncodeSharedFramePayloadFrame | RustBackendVideoEncodeNativeFramePayloadFrame,
  encoderBridge: RustBackendVideoEncodeBridge,
  nativeRenderBridge?: RustBackendNativeRenderOutputReleaseBridge,
  onNativeRenderOutputRelease?: (
    event: RustBackendNativeRenderOutputReleaseEvent
  ) => void
): Promise<void> => {
  if (isNativeEncodeFramePayloadFrame(frame)) {
    await writeNativeFrameToRustBackend(frame, encoderBridge);
    return;
  }
  await writeSharedFrameToRustBackend(
    frame,
    encoderBridge,
    nativeRenderBridge,
    onNativeRenderOutputRelease
  );
};

const releasePrefetchedNativeRenderOutputAfterEncodeFailure = async (
  frameResultPromise: Promise<IteratorResult<RustBackendVideoEncodeSharedFramePayloadFrame | RustBackendVideoEncodeNativeFramePayloadFrame>>,
  nativeRenderBridge?: RustBackendNativeRenderOutputReleaseBridge,
  onNativeRenderOutputRelease?: (
    event: RustBackendNativeRenderOutputReleaseEvent
  ) => void
): Promise<void> => {
  let frameResult: IteratorResult<RustBackendVideoEncodeSharedFramePayloadFrame | RustBackendVideoEncodeNativeFramePayloadFrame>;
  try {
    frameResult = await frameResultPromise;
  } catch {
    return;
  }
  if (frameResult.done || !isSharedFramePayloadFrame(frameResult.value)) {
    return;
  }
  await releaseNativeRenderOutputAfterEncodeFailure(
    frameResult.value,
    'encodeWriteFailed',
    nativeRenderBridge,
    onNativeRenderOutputRelease
  );
  await frameResult.value.releaseSharedFrameAfterEncodeFailure?.();
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

const isNativeEncodeFramePayloadFrame = (
  frame: RustBackendVideoEncodeFrame
): frame is RustBackendVideoEncodeNativeFramePayloadFrame =>
  'nativeEncodeFramePayload' in frame;

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

const releaseSharedFrameAfterEncodeFailure = async (
  frame: RustBackendVideoEncodeSharedFramePayloadFrame,
  reason: RustBackendNativeRenderOutputReleaseReason,
  bridge?: RustBackendNativeRenderOutputReleaseBridge,
  onNativeRenderOutputRelease?: (
    event: RustBackendNativeRenderOutputReleaseEvent
  ) => void
): Promise<void> => {
  await releaseNativeRenderOutputAfterEncodeFailure(
    frame,
    reason,
    bridge,
    onNativeRenderOutputRelease
  );
  await frame.releaseSharedFrameAfterEncodeFailure?.();
};
