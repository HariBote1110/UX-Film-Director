import { describe, expect, it } from 'vitest';
import { createRendererSceneRpcCollector } from './rendererSceneRpcTrace';

describe('Renderer scene RPC trace', () => {
  it('aggregates per-operation latency and keeps a bounded sample ring', () => {
    const collector = createRendererSceneRpcCollector({
      enabled: true,
      maxSamples: 3,
    });
    collector.record({
      operation: 'replace',
      sceneId: 'preview:main',
      revision: 1,
      startedAtMs: 0,
      durationMs: 12,
      ok: true,
    });
    collector.record({
      operation: 'evaluate',
      sceneId: 'preview:main',
      revision: 1,
      frameIndex: 0,
      startedAtMs: 12,
      durationMs: 5,
      ok: true,
    });
    collector.record({
      operation: 'replace',
      sceneId: 'preview:main',
      revision: 2,
      startedAtMs: 17,
      durationMs: 20,
      ok: true,
    });
    collector.record({
      operation: 'startPlayback',
      sceneId: 'viewport-rust-timeline',
      revision: 2,
      startedAtMs: 37,
      durationMs: 8,
      ok: false,
      reason: 'evaluationFailed',
      detail: 'revision mismatch',
    });

    expect(collector.snapshot()).toEqual({
      enabled: true,
      sampleCount: 3,
      droppedSampleCount: 1,
      operations: [
        {
          operation: 'evaluate',
          count: 1,
          totalDurationMs: 5,
          maxDurationMs: 5,
          meanDurationMs: 5,
          failedCount: 0,
        },
        {
          operation: 'replace',
          count: 1,
          totalDurationMs: 20,
          maxDurationMs: 20,
          meanDurationMs: 20,
          failedCount: 0,
        },
        {
          operation: 'startPlayback',
          count: 1,
          totalDurationMs: 8,
          maxDurationMs: 8,
          meanDurationMs: 8,
          failedCount: 1,
        },
      ],
      samples: expect.any(Array),
    });
  });

  it('is a no-op outside the diagnostic run and resets between runs', () => {
    const disabled = createRendererSceneRpcCollector({
      enabled: false,
      maxSamples: 4,
    });
    disabled.record({
      operation: 'replace',
      sceneId: 'preview:main',
      revision: 1,
      startedAtMs: 0,
      durationMs: 10,
      ok: true,
    });
    expect(disabled.snapshot()).toMatchObject({
      enabled: false,
      sampleCount: 0,
      droppedSampleCount: 0,
    });

    const enabled = createRendererSceneRpcCollector({
      enabled: true,
      maxSamples: 4,
    });
    enabled.record({
      operation: 'replace',
      sceneId: 'preview:main',
      revision: 1,
      startedAtMs: 0,
      durationMs: 10,
      ok: true,
    });
    enabled.reset();
    expect(enabled.snapshot()).toMatchObject({
      enabled: true,
      sampleCount: 0,
      droppedSampleCount: 0,
      operations: [],
      samples: [],
    });
  });
});
