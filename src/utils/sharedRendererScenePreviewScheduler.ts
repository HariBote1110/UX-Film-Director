import type {
  RustBackendSceneEvaluatePayload,
  RustBackendSceneEvaluation,
  RustBackendSceneFailureReason,
  RustBackendSceneReplacePayload,
  RustBackendSceneReplaceResult,
  RustBackendSceneRpcResult,
} from './rustBackendSceneControl';
import { rendererSceneRpcCollector } from '../perf/rendererSceneRpcTrace';

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
  onRemoteReady,
}: {
  rpc: SharedRendererScenePreviewSchedulerRpc;
  onEvaluation: (evaluation: SharedRendererSceneEvaluation) => void;
  onFailure?: (failure: SharedRendererScenePreviewSchedulerFailure) => void;
  // scene.replaceが実際に反映され、かつそのrevisionが「現在の希望revision」と
  // 一致しているときだけ呼ばれる。supersededなrevisionが遅れて解決しても
  // reportされない。null は「常駐scene が現在の希望revisionと一致しない」状態
  // （新しいsubmitRevision・replace失敗・invalidate）を表す。
  onRemoteReady?: (ready: { sceneId: string; revision: number } | null) => void;
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
  let lastNotifiedRemoteReady: { sceneId: string; revision: number } | null = null;

  const notifyRemoteReady = (ready: { sceneId: string; revision: number } | null) => {
    if (!onRemoteReady) return;
    const same = ready === null
      ? lastNotifiedRemoteReady === null
      : lastNotifiedRemoteReady !== null
        && lastNotifiedRemoteReady.sceneId === ready.sceneId
        && lastNotifiedRemoteReady.revision === ready.revision;
    if (same) return;
    lastNotifiedRemoteReady = ready;
    onRemoteReady(ready);
  };

  const blockAfterFailure = (failure: SharedRendererScenePreviewSchedulerFailure) => {
    desiredRevision = null;
    remoteReadyRevision = null;
    pendingLatestFrame = null;
    lastRequestedFrame = null;
    failedRevisionKey = null;
    notifyRemoteReady(null);
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
      // 計測専用: engage遅延の内訳切り分け用にreplace RPCの往復時間を記録する。
      // enabled===falseなら performance.now() すら呼ばず制御フローも変えない。
      const replaceStartedAtMs = rendererSceneRpcCollector.enabled ? performance.now() : 0;
      void rpc.replaceScene(desired).then((result) => {
        replaceInFlight = false;
        if (rendererSceneRpcCollector.enabled) {
          rendererSceneRpcCollector.record({
            operation: 'replace',
            sceneId: desired.sceneId,
            revision: desired.revision,
            startedAtMs: replaceStartedAtMs,
            durationMs: performance.now() - replaceStartedAtMs,
            ok: result.ok,
            reason: result.ok ? undefined : result.reason,
            detail: result.ok ? undefined : result.detail,
          });
        }
        if (disposed) return;
        if (!result.ok) {
          diagnostics.failed += 1;
          blockAfterFailure({ operation: 'replace', ...result });
          return;
        }
        remoteReadyRevision = result.value;
        const isStillDesired = desiredRevision?.sceneId === result.value.sceneId
          && desiredRevision.revision === result.value.revision;
        if (isStillDesired) notifyRemoteReady(result.value);
        pump();
      }).catch(() => {
        replaceInFlight = false;
        if (rendererSceneRpcCollector.enabled) {
          rendererSceneRpcCollector.record({
            operation: 'replace',
            sceneId: desired.sceneId,
            revision: desired.revision,
            startedAtMs: replaceStartedAtMs,
            durationMs: performance.now() - replaceStartedAtMs,
            ok: false,
            reason: 'backendFailure',
            detail: 'Rust scene.replace rejected unexpectedly.',
          });
        }
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
    // 計測専用: engage遅延の内訳切り分け用にevaluate RPCの往復時間を記録する。
    // enabled===falseなら performance.now() すら呼ばず制御フローも変えない。
    const evaluateStartedAtMs = rendererSceneRpcCollector.enabled ? performance.now() : 0;
    void rpc.evaluateScene(requested).then((result) => {
      evaluateInFlight = false;
      if (rendererSceneRpcCollector.enabled) {
        rendererSceneRpcCollector.record({
          operation: 'evaluate',
          sceneId: requested.sceneId,
          revision: requested.revision,
          frameIndex: requested.frameIndex,
          startedAtMs: evaluateStartedAtMs,
          durationMs: performance.now() - evaluateStartedAtMs,
          ok: result.ok,
          reason: result.ok ? undefined : result.reason,
          detail: result.ok ? undefined : result.detail,
        });
      }
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
      if (rendererSceneRpcCollector.enabled) {
        rendererSceneRpcCollector.record({
          operation: 'evaluate',
          sceneId: requested.sceneId,
          revision: requested.revision,
          frameIndex: requested.frameIndex,
          startedAtMs: evaluateStartedAtMs,
          durationMs: performance.now() - evaluateStartedAtMs,
          ok: false,
          reason: 'backendFailure',
          detail: 'Rust scene.evaluate rejected unexpectedly.',
        });
      }
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
      notifyRemoteReady(null);
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
      notifyRemoteReady(null);
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
