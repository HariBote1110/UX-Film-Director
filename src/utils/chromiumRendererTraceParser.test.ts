import { describe, expect, it } from 'vitest';

describe('Chromium renderer trace parser', () => {
  it('separates main-thread scripting, rendering, GC, tasks, and UXFD user timings', async () => {
    const { summariseChromiumRendererTrace } = await import(
      '../../scripts/lib/chromium-renderer-trace.mjs'
    );
    const traceEvents = [
      {
        ph: 'M',
        name: 'thread_name',
        pid: 10,
        tid: 20,
        args: { name: 'CrRendererMain' },
      },
      {
        ph: 'X',
        name: 'RunTask',
        cat: 'toplevel',
        pid: 10,
        tid: 20,
        ts: 1_000,
        dur: 8_000,
      },
      {
        ph: 'X',
        name: 'FunctionCall',
        cat: 'devtools.timeline',
        pid: 10,
        tid: 20,
        ts: 1_500,
        dur: 3_000,
        args: {
          data: {
            functionName: 'renderViewport',
            url: 'http://localhost/src/components/Viewport.tsx',
            lineNumber: 120,
          },
        },
      },
      {
        ph: 'X',
        name: 'Layout',
        cat: 'devtools.timeline',
        pid: 10,
        tid: 20,
        ts: 4_500,
        dur: 1_000,
      },
      {
        ph: 'X',
        name: 'Paint',
        cat: 'devtools.timeline',
        pid: 10,
        tid: 20,
        ts: 5_500,
        dur: 500,
      },
      {
        ph: 'X',
        name: 'MinorGC',
        cat: 'devtools.timeline,v8',
        pid: 10,
        tid: 20,
        ts: 6_500,
        dur: 750,
      },
      {
        ph: 'X',
        name: 'uxfd.scene.evaluate',
        cat: 'blink.user_timing',
        pid: 10,
        tid: 20,
        ts: 7_500,
        dur: 1_000,
      },
      {
        ph: 'X',
        name: 'FunctionCall',
        cat: 'devtools.timeline',
        pid: 10,
        tid: 99,
        ts: 1_000,
        dur: 50_000,
        args: { data: { functionName: 'workerOnly' } },
      },
    ];

    const summary = summariseChromiumRendererTrace(traceEvents);

    expect(summary.rendererMainThread).toEqual({ pid: 10, tid: 20 });
    expect(summary.wallDurationMs).toBe(8);
    expect(summary.busyMs).toBe(8);
    expect(summary.categories).toEqual({
      scriptingMs: 3,
      renderingMs: 1.5,
      gcMs: 0.75,
    });
    expect(summary.topFunctions[0]).toEqual(expect.objectContaining({
      functionName: 'renderViewport',
      totalMs: 3,
      callCount: 1,
    }));
    expect(summary.userTimings).toEqual([
      { name: 'uxfd.scene.evaluate', totalMs: 1, count: 1, maxMs: 1 },
    ]);
    expect(summary.topFunctions.some(
      (entry: { functionName: string }) => entry.functionName === 'workerOnly',
    )).toBe(false);
  });

  it('unions overlapping task intervals instead of double-counting nested tasks', async () => {
    const { summariseChromiumRendererTrace } = await import(
      '../../scripts/lib/chromium-renderer-trace.mjs'
    );
    const summary = summariseChromiumRendererTrace([
      {
        ph: 'M',
        name: 'thread_name',
        pid: 1,
        tid: 2,
        args: { name: 'CrRendererMain' },
      },
      { ph: 'X', name: 'RunTask', pid: 1, tid: 2, ts: 0, dur: 10_000 },
      {
        ph: 'X',
        name: 'ThreadControllerImpl::RunTask',
        pid: 1,
        tid: 2,
        ts: 2_000,
        dur: 4_000,
      },
      { ph: 'X', name: 'RunTask', pid: 1, tid: 2, ts: 12_000, dur: 3_000 },
    ]);

    expect(summary.busyMs).toBe(13);
    expect(summary.wallDurationMs).toBe(15);
    expect(summary.busyRatio).toBeCloseTo(13 / 15);
  });
});
