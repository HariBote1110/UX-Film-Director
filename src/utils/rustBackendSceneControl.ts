export interface RustBackendSceneReplacePayload {
  sceneId: string;
  revision: number;
  project: unknown;
  media: readonly unknown[];
}

export interface RustBackendSceneEvaluatePayload {
  sceneId: string;
  revision: number;
  frameIndex: number;
}

export interface RustBackendSceneReplaceResult {
  sceneId: string;
  revision: number;
}

export interface RustBackendSceneEvaluation {
  sceneId: string;
  revision: number;
  frameIndex: number;
  snapshot: unknown;
  media: readonly unknown[];
}

export type RustBackendSceneFailureReason =
  | 'missingScene'
  | 'staleRevision'
  | 'revisionMismatch'
  | 'backendFailure'
  | 'invalidResponse';

export type RustBackendSceneRpcResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      reason: RustBackendSceneFailureReason;
      detail: string;
      errorCode?: number;
    };

export interface RustBackendSceneRawResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
  errorCode?: number;
}

export interface RustBackendSceneBridge {
  replaceScene: (
    payload: RustBackendSceneReplacePayload
  ) => Promise<RustBackendSceneRawResult<unknown>>;
  evaluateScene: (
    payload: RustBackendSceneEvaluatePayload
  ) => Promise<RustBackendSceneRawResult<unknown>>;
}

const defaultRustBackendSceneBridge = (): RustBackendSceneBridge => ({
  replaceScene: (payload) => window.rustBackend.replaceScene(payload),
  evaluateScene: (payload) => window.rustBackend.evaluateScene(payload),
});

const failureReasonForCode = (errorCode: number | undefined): RustBackendSceneFailureReason => {
  if (errorCode === -32060) return 'missingScene';
  if (errorCode === -32061) return 'staleRevision';
  if (errorCode === -32062) return 'revisionMismatch';
  return 'backendFailure';
};

const failureFromResponse = (response: RustBackendSceneRawResult<unknown>): RustBackendSceneRpcResult<never> => ({
  ok: false,
  reason: failureReasonForCode(response.errorCode),
  detail: response.error ?? 'Rust scene RPC failed.',
  ...(typeof response.errorCode === 'number' ? { errorCode: response.errorCode } : {}),
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object'
);

const isReplaceResult = (value: unknown): value is RustBackendSceneReplaceResult => (
  isRecord(value)
  && typeof value.sceneId === 'string'
  && typeof value.revision === 'number'
  && Number.isSafeInteger(value.revision)
);

const isEvaluation = (value: unknown): value is RustBackendSceneEvaluation => (
  isRecord(value)
  && typeof value.sceneId === 'string'
  && typeof value.revision === 'number'
  && Number.isSafeInteger(value.revision)
  && typeof value.frameIndex === 'number'
  && Number.isSafeInteger(value.frameIndex)
  && 'snapshot' in value
  && Array.isArray(value.media)
);

const invalidResponse = (operation: string): RustBackendSceneRpcResult<never> => ({
  ok: false,
  reason: 'invalidResponse',
  detail: `Rust ${operation} returned an invalid response.`,
});

export const replaceRustBackendScene = async (
  payload: RustBackendSceneReplacePayload,
  bridge: RustBackendSceneBridge = defaultRustBackendSceneBridge(),
): Promise<RustBackendSceneRpcResult<RustBackendSceneReplaceResult>> => {
  const response = await bridge.replaceScene(payload);
  if (!response.success) return failureFromResponse(response);
  if (!isReplaceResult(response.result)) return invalidResponse('scene.replace');
  return { ok: true, value: response.result };
};

export const evaluateRustBackendScene = async (
  payload: RustBackendSceneEvaluatePayload,
  bridge: RustBackendSceneBridge = defaultRustBackendSceneBridge(),
): Promise<RustBackendSceneRpcResult<RustBackendSceneEvaluation>> => {
  const response = await bridge.evaluateScene(payload);
  if (!response.success) return failureFromResponse(response);
  if (!isEvaluation(response.result)) return invalidResponse('scene.evaluate');
  return { ok: true, value: response.result };
};
