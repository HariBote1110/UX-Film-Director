import type { PerformanceHarnessRow } from './performanceReport';

export type PerfHarnessAgentPayload = {
  success: boolean;
  runId: string;
  csvFilePath: string;
  rows: PerformanceHarnessRow[];
  errorMessage?: string;
  finishedAtUtc: string;
};

export const serialisePerfAgentPayload = (payload: PerfHarnessAgentPayload): string => (
  JSON.stringify(payload, null, 2)
);
