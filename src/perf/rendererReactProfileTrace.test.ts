import { describe, expect, it } from 'vitest';
import { createRendererReactProfileCollector } from './rendererReactProfileTrace';

describe('Renderer React profile trace', () => {
  it('aggregates component commit durations and keeps a bounded sample ring', () => {
    const collector = createRendererReactProfileCollector({
      enabled: true,
      maxSamples: 3,
    });
    collector.record({
      id: 'Timeline',
      phase: 'update',
      actualDuration: 4,
      baseDuration: 8,
      startTime: 10,
      commitTime: 15,
    });
    collector.record({
      id: 'Viewport',
      phase: 'update',
      actualDuration: 7,
      baseDuration: 11,
      startTime: 16,
      commitTime: 24,
    });
    collector.record({
      id: 'Timeline',
      phase: 'update',
      actualDuration: 5,
      baseDuration: 8,
      startTime: 25,
      commitTime: 31,
    });
    collector.record({
      id: 'PropertyPanel',
      phase: 'nested-update',
      actualDuration: 2,
      baseDuration: 3,
      startTime: 32,
      commitTime: 35,
    });

    expect(collector.snapshot()).toEqual({
      enabled: true,
      sampleCount: 3,
      droppedSampleCount: 1,
      components: [
        {
          id: 'Viewport',
          commitCount: 1,
          totalActualDurationMs: 7,
          maxActualDurationMs: 7,
          meanActualDurationMs: 7,
          totalBaseDurationMs: 11,
        },
        {
          id: 'Timeline',
          commitCount: 1,
          totalActualDurationMs: 5,
          maxActualDurationMs: 5,
          meanActualDurationMs: 5,
          totalBaseDurationMs: 8,
        },
        {
          id: 'PropertyPanel',
          commitCount: 1,
          totalActualDurationMs: 2,
          maxActualDurationMs: 2,
          meanActualDurationMs: 2,
          totalBaseDurationMs: 3,
        },
      ],
      samples: expect.any(Array),
    });
  });

  it('is a no-op outside the diagnostic run and resets between phases', () => {
    const disabled = createRendererReactProfileCollector({
      enabled: false,
      maxSamples: 4,
    });
    disabled.record({
      id: 'Timeline',
      phase: 'mount',
      actualDuration: 10,
      baseDuration: 10,
      startTime: 0,
      commitTime: 10,
    });
    expect(disabled.snapshot()).toMatchObject({
      enabled: false,
      sampleCount: 0,
      droppedSampleCount: 0,
    });

    const enabled = createRendererReactProfileCollector({
      enabled: true,
      maxSamples: 4,
    });
    enabled.record({
      id: 'Timeline',
      phase: 'mount',
      actualDuration: 10,
      baseDuration: 10,
      startTime: 0,
      commitTime: 10,
    });
    enabled.reset();
    expect(enabled.snapshot()).toMatchObject({
      enabled: true,
      sampleCount: 0,
      droppedSampleCount: 0,
      components: [],
      samples: [],
    });
  });
});
