// engage遅延（native再生クロックが実際に動き出すまでの時間）の内訳を
// 切り分けるための計測専用コレクタ。rendererReactProfileTrace.ts と同じ
// パターン（record/reset/snapshot、URLパラメータでのgate、window globalでの
// 露出）に従う。本番挙動には一切影響しない（enabled=falseならrecordは
// performance.now()すら呼ばない早期returnのみ）。

export type RendererSceneRpcOperation = 'replace' | 'evaluate' | 'startPlayback';

// 計測専用: electron/rustScenePlaybackController.tsのstart()が計測した
// engage遅延内訳（evaluateScene区間・presentScene区間・合計）。rendererは
// この値を生成せず、IPC往復結果をそのまま素通しするだけ。'startPlayback'
// 以外のoperationでは付与されない。
export type RendererSceneRpcStartTimingDiagnostics = {
  totalMs: number;
  evaluateSceneMs: number | null;
  presentSceneMs: number | null;
  otherMs: number | null;
  isFirstStartSinceLaunch: boolean;
};

export type RendererSceneRpcSample = {
  operation: RendererSceneRpcOperation;
  sceneId?: string;
  revision?: number;
  frameIndex?: number;
  startedAtMs: number;
  durationMs: number;
  ok: boolean;
  reason?: string;
  detail?: string;
  startTimingDiagnostics?: RendererSceneRpcStartTimingDiagnostics;
};

export type RendererSceneRpcOperationSummary = {
  operation: RendererSceneRpcOperation;
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
  meanDurationMs: number;
  failedCount: number;
};

export type RendererSceneRpcSnapshot = {
  enabled: boolean;
  sampleCount: number;
  droppedSampleCount: number;
  operations: RendererSceneRpcOperationSummary[];
  samples: RendererSceneRpcSample[];
};

export type RendererSceneRpcCollector = {
  enabled: boolean;
  record: (sample: RendererSceneRpcSample) => void;
  reset: () => void;
  snapshot: () => RendererSceneRpcSnapshot;
};

export const createRendererSceneRpcCollector = ({
  enabled,
  maxSamples,
}: {
  enabled: boolean;
  maxSamples: number;
}): RendererSceneRpcCollector => {
  const sampleLimit = Math.max(1, Math.trunc(maxSamples));
  const samples: RendererSceneRpcSample[] = [];
  let droppedSampleCount = 0;

  return {
    enabled,
    record: (sample) => {
      if (!enabled) return;
      if (samples.length >= sampleLimit) {
        samples.shift();
        droppedSampleCount += 1;
      }
      samples.push({ ...sample });
    },
    reset: () => {
      samples.splice(0, samples.length);
      droppedSampleCount = 0;
    },
    snapshot: () => {
      const operations = new Map<RendererSceneRpcOperation, {
        operation: RendererSceneRpcOperation;
        count: number;
        totalDurationMs: number;
        maxDurationMs: number;
        failedCount: number;
      }>();
      for (const sample of samples) {
        const aggregate = operations.get(sample.operation) ?? {
          operation: sample.operation,
          count: 0,
          totalDurationMs: 0,
          maxDurationMs: 0,
          failedCount: 0,
        };
        aggregate.count += 1;
        aggregate.totalDurationMs += sample.durationMs;
        aggregate.maxDurationMs = Math.max(aggregate.maxDurationMs, sample.durationMs);
        if (!sample.ok) aggregate.failedCount += 1;
        operations.set(sample.operation, aggregate);
      }
      return {
        enabled,
        sampleCount: samples.length,
        droppedSampleCount,
        operations: [...operations.values()].map((aggregate) => ({
          ...aggregate,
          meanDurationMs: aggregate.count > 0
            ? aggregate.totalDurationMs / aggregate.count
            : 0,
        })),
        samples: samples.map((sample) => ({ ...sample })),
      };
    },
  };
};

const traceEnabled = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('realisticHeavyEditE2e') === '1';

export const rendererSceneRpcCollector = createRendererSceneRpcCollector({
  enabled: traceEnabled,
  maxSamples: 4_096,
});

declare global {
  interface Window {
    __UXFD_SCENE_RPC_TRACE__?: Pick<
      RendererSceneRpcCollector,
      'reset' | 'snapshot'
    >;
  }
}

if (typeof window !== 'undefined' && traceEnabled) {
  window.__UXFD_SCENE_RPC_TRACE__ = {
    reset: rendererSceneRpcCollector.reset,
    snapshot: rendererSceneRpcCollector.snapshot,
  };
}
