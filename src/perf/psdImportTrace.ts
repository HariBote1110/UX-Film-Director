// PSDインポートのend-to-end計測専用コレクタ。rendererSceneRpcTrace.ts /
// rendererReactProfileTrace.ts と同じパターン(URLパラメータでのgate、
// window globalでの露出)に従う。本番挙動には一切影響しない
// (enabled=falseならmark()はnow()すら呼ばない早期returnのみ)。

export type PsdImportTraceMarkName =
  | 'input'
  | 'parsed'
  | 'objectAdded'
  | 'evaluateReady';

export type PsdImportTraceSnapshot = {
  enabled: boolean;
  marks: Partial<Record<PsdImportTraceMarkName, number>>;
};

export type PsdImportTraceCollector = {
  enabled: boolean;
  mark: (name: PsdImportTraceMarkName) => void;
  reset: () => void;
  snapshot: () => PsdImportTraceSnapshot;
};

export const createPsdImportTraceCollector = ({
  enabled,
  now,
}: {
  enabled: boolean;
  now: () => number;
}): PsdImportTraceCollector => {
  let firstMarkAtMs: number | null = null;
  let marks: Partial<Record<PsdImportTraceMarkName, number>> = {};

  return {
    enabled,
    mark: (name) => {
      if (!enabled) return;
      const timestampMs = now();
      if (firstMarkAtMs === null) firstMarkAtMs = timestampMs;
      marks[name] = timestampMs - firstMarkAtMs;
    },
    reset: () => {
      firstMarkAtMs = null;
      marks = {};
    },
    snapshot: () => ({
      enabled,
      marks: { ...marks },
    }),
  };
};

const traceEnabled = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('psdImportTrace') === '1';

export const psdImportTraceCollector = createPsdImportTraceCollector({
  enabled: traceEnabled,
  now: () => performance.now(),
});

declare global {
  interface Window {
    __UXFD_PSD_IMPORT_TRACE__?: Pick<
      PsdImportTraceCollector,
      'mark' | 'reset' | 'snapshot'
    >;
  }
}

if (typeof window !== 'undefined' && traceEnabled) {
  window.__UXFD_PSD_IMPORT_TRACE__ = {
    mark: psdImportTraceCollector.mark,
    reset: psdImportTraceCollector.reset,
    snapshot: psdImportTraceCollector.snapshot,
  };
}
