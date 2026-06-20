export type RustBackendCaller = (
  method: string,
  params?: unknown,
  timeoutMs?: number
) => Promise<unknown>;

export interface RustVideoEncodeBackendBridgeResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

const START_ENCODE_TIMEOUT_MS = 120_000;
const WRITE_FRAME_TIMEOUT_MS = 20_000;
const WRITE_NATIVE_FRAME_TIMEOUT_MS = 20_000;
const TRANSCODE_VIDEO_TIMEOUT_MS = 300_000;
const FINISH_ENCODE_TIMEOUT_MS = 60_000;
const ABORT_ENCODE_TIMEOUT_MS = 10_000;

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const callRustVideoEncodeRpc = async (
  method: string,
  payload: unknown,
  callRustBackend: RustBackendCaller,
  timeoutMs: number
): Promise<RustVideoEncodeBackendBridgeResult> => {
  try {
    const result = await callRustBackend(method, payload, timeoutMs);
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error),
    };
  }
};

export const startRustVideoEncodeViaBackend = (
  payload: unknown,
  callRustBackend: RustBackendCaller
): Promise<RustVideoEncodeBackendBridgeResult> =>
  callRustVideoEncodeRpc('encode.start', payload, callRustBackend, START_ENCODE_TIMEOUT_MS);

export const writeRustVideoEncodeFrameViaBackend = (
  payload: unknown,
  callRustBackend: RustBackendCaller
): Promise<RustVideoEncodeBackendBridgeResult> =>
  callRustVideoEncodeRpc('encode.writeFrame', payload, callRustBackend, WRITE_FRAME_TIMEOUT_MS);

export const writeRustVideoEncodeNativeFrameViaBackend = (
  payload: unknown,
  callRustBackend: RustBackendCaller
): Promise<RustVideoEncodeBackendBridgeResult> =>
  callRustVideoEncodeRpc('encode.writeNativeFrame', payload, callRustBackend, WRITE_NATIVE_FRAME_TIMEOUT_MS);

export const transcodeRustVideoViaBackend = (
  payload: unknown,
  callRustBackend: RustBackendCaller
): Promise<RustVideoEncodeBackendBridgeResult> =>
  callRustVideoEncodeRpc('encode.transcodeVideo', payload, callRustBackend, TRANSCODE_VIDEO_TIMEOUT_MS);

export const finishRustVideoEncodeViaBackend = (
  payload: unknown,
  callRustBackend: RustBackendCaller
): Promise<RustVideoEncodeBackendBridgeResult> =>
  callRustVideoEncodeRpc('encode.finish', payload, callRustBackend, FINISH_ENCODE_TIMEOUT_MS);

export const abortRustVideoEncodeViaBackend = (
  payload: unknown,
  callRustBackend: RustBackendCaller
): Promise<RustVideoEncodeBackendBridgeResult> =>
  callRustVideoEncodeRpc('encode.abort', payload, callRustBackend, ABORT_ENCODE_TIMEOUT_MS);
