export type PerformanceHarnessRow = {
  timestampUtc: string;
  runId: string;
  scenario: string;
  durationMs: number;
  objectCountBefore: number;
  objectCountAfter: number;
  rafMeanMs: number;
  rafP95Ms: number;
  rafMaxMs: number;
  longTaskCount: number;
  notes: string;
};

const CSV_COLUMNS = [
  'timestamp_utc',
  'run_id',
  'scenario',
  'duration_ms',
  'object_count_before',
  'object_count_after',
  'raf_mean_ms',
  'raf_p95_ms',
  'raf_max_ms',
  'long_task_count',
  'notes',
] as const;

/** Main process appends this when the CSV file is first created (must match `formatPerformanceCsvRow`). */
export const PERFORMANCE_CSV_HEADER_LINE = `${CSV_COLUMNS.join(',')}\n`;

export const escapeCsvField = (value: string | number | boolean | null | undefined): string => {
  if (value === null || value === undefined) {
    return '';
  }
  const text = typeof value === 'string' ? value : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const buildPerformanceCsvHeader = (): string => PERFORMANCE_CSV_HEADER_LINE;

export const formatPerformanceCsvRow = (row: PerformanceHarnessRow): string => {
  const fields = [
    row.timestampUtc,
    row.runId,
    row.scenario,
    row.durationMs,
    row.objectCountBefore,
    row.objectCountAfter,
    row.rafMeanMs,
    row.rafP95Ms,
    row.rafMaxMs,
    row.longTaskCount,
    row.notes,
  ].map((field) => escapeCsvField(field));
  return `${fields.join(',')}\n`;
};

export const summariseRafDeltas = (deltasMs: number[]) => {
  if (deltasMs.length === 0) {
    return { mean: 0, p95: 0, max: 0 };
  }
  const sorted = [...deltasMs].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const mean = sum / sorted.length;
  const p95Index = Math.min(sorted.length - 1, Math.floor(0.95 * (sorted.length - 1)));
  const p95 = sorted[p95Index] ?? sorted[sorted.length - 1];
  const max = sorted[sorted.length - 1] ?? 0;
  return { mean, p95, max };
};
