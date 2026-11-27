export type RendererReactProfileSample = {
  id: string;
  phase: 'mount' | 'update' | 'nested-update';
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
};

export type RendererReactProfileSnapshot = {
  enabled: boolean;
  sampleCount: number;
  droppedSampleCount: number;
  components: Array<{
    id: string;
    commitCount: number;
    totalActualDurationMs: number;
    maxActualDurationMs: number;
    meanActualDurationMs: number;
    totalBaseDurationMs: number;
  }>;
  samples: RendererReactProfileSample[];
};

export type RendererReactProfileCollector = {
  enabled: boolean;
  record: (sample: RendererReactProfileSample) => void;
  reset: () => void;
  snapshot: () => RendererReactProfileSnapshot;
};

export const createRendererReactProfileCollector = ({
  enabled,
  maxSamples,
}: {
  enabled: boolean;
  maxSamples: number;
}): RendererReactProfileCollector => {
  const sampleLimit = Math.max(1, Math.trunc(maxSamples));
  const samples: RendererReactProfileSample[] = [];
  let droppedSampleCount = 0;

  return {
    enabled,
    record: (sample) => {
      if (!enabled) return;
      if (samples.length >= sampleLimit) {
        samples.shift();
        droppedSampleCount += 1;
      }
      samples.push({ ...sample });
    },
    reset: () => {
      samples.splice(0, samples.length);
      droppedSampleCount = 0;
    },
    snapshot: () => {
      const components = new Map<string, {
        id: string;
        commitCount: number;
        totalActualDurationMs: number;
        maxActualDurationMs: number;
        totalBaseDurationMs: number;
      }>();
      for (const sample of samples) {
        const aggregate = components.get(sample.id) ?? {
          id: sample.id,
          commitCount: 0,
          totalActualDurationMs: 0,
          maxActualDurationMs: 0,
          totalBaseDurationMs: 0,
        };
        aggregate.commitCount += 1;
        aggregate.totalActualDurationMs += sample.actualDuration;
        aggregate.maxActualDurationMs = Math.max(
          aggregate.maxActualDurationMs,
          sample.actualDuration,
        );
        aggregate.totalBaseDurationMs += sample.baseDuration;
        components.set(sample.id, aggregate);
      }
      return {
        enabled,
        sampleCount: samples.length,
        droppedSampleCount,
        components: [...components.values()].map((component) => ({
          ...component,
          meanActualDurationMs: component.commitCount > 0
            ? component.totalActualDurationMs / component.commitCount
            : 0,
        })),
        samples: samples.map((sample) => ({ ...sample })),
      };
    },
  };
};

const traceEnabled = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('realisticHeavyEditE2e') === '1';

export const rendererReactProfileCollector = createRendererReactProfileCollector({
  enabled: traceEnabled,
  maxSamples: 4_096,
});

declare global {
  interface Window {
    __UXFD_REACT_PROFILE_TRACE__?: Pick<
      RendererReactProfileCollector,
      'reset' | 'snapshot'
    >;
  }
}

if (typeof window !== 'undefined' && traceEnabled) {
  window.__UXFD_REACT_PROFILE_TRACE__ = {
    reset: rendererReactProfileCollector.reset,
    snapshot: rendererReactProfileCollector.snapshot,
  };
}
