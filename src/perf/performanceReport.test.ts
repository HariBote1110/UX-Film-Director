import { describe, expect, it } from 'vitest';
import { buildPerformanceCsvHeader, escapeCsvField, formatPerformanceCsvRow, summariseRafDeltas } from './performanceReport';
import type { PerformanceHarnessRow } from './performanceReport';

describe('escapeCsvField', () => {
  it('returns empty string for nullish values', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('returns plain digits for numbers', () => {
    expect(escapeCsvField(12.5)).toBe('12.5');
  });

  it('quotes fields containing commas', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
  });

  it('escapes double quotes inside quoted fields', () => {
    expect(escapeCsvField('say "hello"')).toBe('"say ""hello"""');
  });

  it('quotes fields containing newlines', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('buildPerformanceCsvHeader', () => {
  it('returns a stable header row', () => {
    expect(buildPerformanceCsvHeader()).toContain('timestamp_utc');
    expect(buildPerformanceCsvHeader()).toContain('scenario');
  });
});

describe('summariseRafDeltas', () => {
  it('returns zeros for an empty list', () => {
    expect(summariseRafDeltas([])).toEqual({ mean: 0, p95: 0, max: 0 });
  });

  it('computes mean and max', () => {
    const stats = summariseRafDeltas([10, 20, 30]);
    expect(stats.mean).toBeCloseTo(20);
    expect(stats.max).toBe(30);
  });
});

describe('formatPerformanceCsvRow', () => {
  it('formats a row with the same column order as the header', () => {
    const row: PerformanceHarnessRow = {
      timestampUtc: '2026-04-19T12:00:00.000Z',
      runId: 'run-1',
      scenario: 'demo',
      durationMs: 10.25,
      objectCountBefore: 1,
      objectCountAfter: 2,
      rafMeanMs: 16.7,
      rafP95Ms: 20,
      rafMaxMs: 33,
      longTaskCount: 0,
      notes: 'ok',
    };
    const line = formatPerformanceCsvRow(row);
    expect(line.startsWith('2026-04-19T12:00:00.000Z')).toBe(true);
    expect(line).toContain('run-1');
    expect(line).toContain('demo');
    expect(line).toContain('10.25');
    expect(line.endsWith('\n')).toBe(true);
  });
});
