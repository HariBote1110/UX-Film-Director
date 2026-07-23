import type {
  RustBackendSceneEvaluatePayload,
  RustBackendSceneEvaluation,
  RustBackendSceneFailureReason,
  RustBackendSceneReplacePayload,
  RustBackendSceneReplaceResult,
  RustBackendSceneRpcResult,
} from './rustBackendSceneControl';

export type SharedRendererSceneEvaluation = RustBackendSceneEvaluation;

export interface SharedRendererScenePreviewSchedulerRpc {
  replaceScene: (
    payload: RustBackendSceneReplacePayload
  ) => Promise<RustBackendSceneRpcResult<RustBackendSceneReplaceResult>>;
  evaluateScene: (
    payload: RustBackendSceneEvaluatePayload
  ) => Promise<RustBackendSceneRpcResult<SharedRendererSceneEvaluation>>;
}

export interface SharedRendererScenePreviewSchedulerDiagnostics {
  requested: number;
  resolved: number;
  stale: number;
  coalesced: number;
  failed: number;
}

export interface SharedRendererScenePreviewScheduler {
  submitRevision: (payload: RustBackendSceneReplacePayload) => void;
  requestFrame: (frameIndex: number) => void;
  invalidate: () => void;
  dispose: () => void;
  readonly diagnostics: Readonly<SharedRendererScenePreviewSchedulerDiagnostics>;
}

export interface SharedRendererScenePreviewSchedulerFailure {
  operation: 'replace' | 'evaluate';
  reason: RustBackendSceneFailureReason;
  detail: string;
  errorCode?: number;
}

export const createSharedRendererScenePreviewScheduler = ({
  rpc,
  onEvaluation,
  onFailure,
}: {
  rpc: SharedRendererScenePreviewSchedulerRpc;
  onEvaluation: (evaluation: SharedRendererSceneEvaluation) => void;
  onFailure?: (failure: SharedRendererScenePreviewSchedulerFailure) => void;
}): SharedRendererScenePreviewScheduler => {
  const diagnostics: SharedRendererScenePreviewSchedulerDiagnostics = {
    requested: 0,
    resolved: 0,
    stale: 0,
    coalesced: 0,
    failed: 0,
  };
  let disposed = false;
  let desiredRevision: RustBackendSceneReplacePayload | null = null;
  let remoteReadyRevision: { sceneId: string; revision: number } | null = null;
  let replaceInFlight = false;
  let evaluateInFlight = false;
  let pendingLatestFrame: number | null = null;
  let lastRequestedFrame: number | null = null;
  let failedRevisionKey: string | null = null;

  const blockAfterFailure = (failure: SharedRendererScenePreviewSchedulerFailure) => {
    desiredRevision = null;
    remoteReadyRevision = null;
    pendingLatestFrame = null;
    lastRequestedFrame = null;
    failedRevisionKey = null;
    onFailure?.(failure);
  };

  const currentRevisionKey = () => desiredRevision
    ? `${desiredRevision.sceneId}:${desiredRevision.revision}`
    : null;

  const queueLatestFrame = (frameIndex: number) => {
    if (pendingLatestFrame !== null && pendingLatestFrame !== frameIndex) {
      diagnostics.coalesced += 1;
    }
    pendingLatestFrame = frameIndex;
  };

  const pump = () => {
    if (disposed || !desiredRevision) return;

    const desired = desiredRevision;
    const desiredKey = currentRevisionKey();
    const isRemoteReady = remoteReadyRevision?.sceneId === desired.sceneId
      && remoteReadyRevision.revision === desired.revision;
    if (!isRemoteReady) {
      if (replaceInFlight || failedRevisionKey === desiredKey) return;
      replaceInFlight = true;
      void rpc.replaceScene(desired).then((result) => {
        replaceInFlight = false;
        if (disposed) return;
        if (!result.ok) {
          diagnostics.failed += 1;
          blockAfterFailure({ operation: 'replace', ...result });
          return;
        }
        remoteReadyRevision = result.value;
        pump();
      }).catch(() => {
        replaceInFlight = false;
        if (disposed) return;
        diagnostics.failed += 1;
        blockAfterFailure({
          operation: 'replace',
          reason: 'backendFailure',
          detail: 'Rust scene.replace rejected unexpectedly.',
        });
      });
      return;
    }

    if (evaluateInFlight || pendingLatestFrame === null) return;
    const frameIndex = pendingLatestFrame;
    pendingLatestFrame = null;
    evaluateInFlight = true;
    diagnostics.requested += 1;
    const requested = {
      sceneId: desired.sceneId,
      revision: desired.revision,
      frameIndex,
    };
    void rpc.evaluateScene(requested).then((result) => {
      evaluateInFlight = false;
      if (disposed) return;
      if (!result.ok) {
        diagnostics.failed += 1;
        blockAfterFailure({ operation: 'evaluate', ...result });
        return;
      }
      diagnostics.resolved += 1;
      const stillCurrent = desiredRevision?.sceneId === requested.sceneId
        && desiredRevision.revision === requested.revision
        && pendingLatestFrame === null
        && result.value.sceneId === requested.sceneId
        && result.value.revision === requested.revision
        && result.value.frameIndex === requested.frameIndex;
      if (!stillCurrent) {
        diagnostics.stale += 1;
      } else {
        onEvaluation(result.value);
      }
      pump();
    }).catch(() => {
      evaluateInFlight = false;
      if (disposed) return;
      diagnostics.failed += 1;
      blockAfterFailure({
        operation: 'evaluate',
        reason: 'backendFailure',
        detail: 'Rust scene.evaluate rejected unexpectedly.',
      });
    });
  };

  return {
    submitRevision: (payload) => {
      if (disposed) return;
      const previous = desiredRevision;
      const isNewerRevision = previous === null
        || previous.sceneId !== payload.sceneId
        || payload.revision > previous.revision;
      if (!isNewerRevision) return;
      desiredRevision = payload;
      failedRevisionKey = null;
      if (lastRequestedFrame !== null) queueLatestFrame(lastRequestedFrame);
      pump();
    },
    requestFrame: (frameIndex) => {
      if (disposed || !Number.isSafeInteger(frameIndex) || frameIndex < 0) return;
      lastRequestedFrame = frameIndex;
      queueLatestFrame(frameIndex);
      pump();
    },
    invalidate: () => {
      if (disposed) return;
      desiredRevision = null;
      remoteReadyRevision = null;
      pendingLatestFrame = null;
      lastRequestedFrame = null;
      failedRevisionKey = null;
    },
    dispose: () => {
      disposed = true;
      pendingLatestFrame = null;
    },
    get diagnostics() {
      return diagnostics;
    },
  };
};
