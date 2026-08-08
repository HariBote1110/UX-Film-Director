import { describe, expect, it } from 'vitest';
import { createPsdImportTraceCollector } from './psdImportTrace';

describe('PSD import trace', () => {
  it('records marks relative to the first mark and exposes them via snapshot()', () => {
    const collector = createPsdImportTraceCollector({
      enabled: true,
      now: (() => {
        let current = 1_000;
        return () => current;
      })(),
    });

    collector.mark('input');
    expect(collector.snapshot()).toEqual({
      enabled: true,
      marks: { input: 0 },
    });
  });

  it('accumulates multiple marks as elapsed milliseconds since the first mark', () => {
    const timestamps = [1_000, 1_120, 1_450, 1_900];
    let index = 0;
    const collector = createPsdImportTraceCollector({
      enabled: true,
      now: () => timestamps[index++],
    });

    collector.mark('input');
    collector.mark('parsed');
    collector.mark('objectAdded');
    collector.mark('evaluateReady');

    expect(collector.snapshot()).toEqual({
      enabled: true,
      marks: {
        input: 0,
        parsed: 120,
        objectAdded: 450,
        evaluateReady: 900,
      },
    });
  });

  it('is a no-op when disabled: mark() never calls now() and snapshot() reports empty marks', () => {
    let calls = 0;
    const collector = createPsdImportTraceCollector({
      enabled: false,
      now: () => {
        calls += 1;
        return 0;
      },
    });

    collector.mark('input');
    collector.mark('parsed');

    expect(calls).toBe(0);
    expect(collector.snapshot()).toEqual({
      enabled: false,
      marks: {},
    });
  });
});
