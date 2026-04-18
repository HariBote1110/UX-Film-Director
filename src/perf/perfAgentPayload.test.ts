import { describe, expect, it } from 'vitest';
import type { PerformanceHarnessRow } from './performanceReport';
import { serialisePerfAgentPayload } from './perfAgentPayload';

describe('serialisePerfAgentPayload', () => {
  it('produces stable JSON for IPC and disk', () => {
    const rows: PerformanceHarnessRow[] = [{
      timestampUtc: '2026-04-19T00:00:00.000Z',
      runId: 'rid',
      scenario: 'demo',
      durationMs: 1.5,
      objectCountBefore: 0,
      objectCountAfter: 1,
      rafMeanMs: 16,
      rafP95Ms: 20,
      rafMaxMs: 30,
      longTaskCount: 0,
      notes: 'ok',
    }];
    const text = serialisePerfAgentPayload({
      success: true,
      runId: 'rid',
      csvFilePath: '/tmp/harness-runs.csv',
      rows,
      finishedAtUtc: '2026-04-19T00:00:00.000Z',
    });
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.success).toBe(true);
    expect(parsed.rows).toHaveLength(1);
    expect((parsed.rows as PerformanceHarnessRow[])[0].scenario).toBe('demo');
  });
});
