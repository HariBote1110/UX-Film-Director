export type ChromiumTraceEvent = {
  ph?: string;
  name?: string;
  cat?: string;
  pid?: number;
  tid?: number;
  ts?: number;
  dur?: number;
  args?: Record<string, unknown>;
};

export type ChromiumPerformanceMetric = {
  name: string;
  value: number;
};

export function diffChromiumPerformanceMetrics(
  before: ChromiumPerformanceMetric[],
  after: ChromiumPerformanceMetric[],
): {
  taskMs: number;
  scriptMs: number;
  layoutMs: number;
  recalcStyleMs: number;
  layoutCount: number;
  recalcStyleCount: number;
  jsHeapUsedBytesDelta: number;
  nodeCountDelta: number;
};

export function summariseChromiumRendererTrace(
  traceEvents: ChromiumTraceEvent[],
): {
  rendererMainThread: { pid: number; tid: number } | null;
  wallDurationMs: number;
  busyMs: number;
  busyRatio: number;
  categories: {
    scriptingMs: number;
    renderingMs: number;
    gcMs: number;
  };
  topEvents: Array<{
    name: string;
    totalMs: number;
    count: number;
    maxMs: number;
  }>;
  topFunctions: Array<{
    functionName: string;
    url: string;
    lineNumber: number | null;
    totalMs: number;
    callCount: number;
    maxMs: number;
  }>;
  userTimings: Array<{
    name: string;
    totalMs: number;
    count: number;
    maxMs: number;
  }>;
};
