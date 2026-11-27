export interface NativeOverlayBenchTimingSummary {
  count: number;
  maxMs: number;
  maxDetail: string;
}

export interface NativeOverlayBenchTraceSummary {
  decode: NativeOverlayBenchTimingSummary;
  present: NativeOverlayBenchTimingSummary;
  releaseGenerationViolationCount: number;
  pendingDecodeTrace: string;
  pendingPresentTrace: string;
  steadyTraceActive: boolean;
  steadyTraceMarkerSeen: boolean;
  skipNextSteadyDecode: boolean;
}

export interface NativeOverlayBenchTraceBudgetOptions {
  decodeMaxMs?: number;
  presentMaxMs?: number;
  minimumDecodeSamples?: number;
  minimumPresentSamples?: number;
}

export const createNativeOverlayBenchTraceSummary:
  () => NativeOverlayBenchTraceSummary;
export const ingestNativeOverlayBenchTraceText:
  (summary: NativeOverlayBenchTraceSummary, text: string) => void;
export const assertNativeOverlayBenchTraceBudgets:
  (
    summary: NativeOverlayBenchTraceSummary,
    options?: NativeOverlayBenchTraceBudgetOptions,
  ) => void;
