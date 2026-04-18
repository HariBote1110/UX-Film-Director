import { useStore } from '../store/useStore';
import type { ShapeObject } from '../types';
import { isPerfAgentMode } from './perfEnv';
import type { PerfHarnessAgentPayload } from './perfAgentPayload';
import {
  buildPerformanceCsvHeader,
  formatPerformanceCsvRow,
  summariseRafDeltas,
  type PerformanceHarnessRow,
} from './performanceReport';

const waitForNextFrame = () => new Promise<void>((resolve) => {
  requestAnimationFrame(() => resolve());
});

const waitForReactPaint = async () => {
  await waitForNextFrame();
  await waitForNextFrame();
};

type LongTaskObserver = {
  snapshot: () => number;
  stop: () => void;
};

const createLongTaskObserver = (): LongTaskObserver => {
  let count = 0;
  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      count += list.getEntries().length;
    });
    observer.observe({ type: 'longtask', buffered: true } as PerformanceObserverInit);
  } catch {
    try {
      observer = new PerformanceObserver((list) => {
        count += list.getEntries().length;
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      observer = null;
    }
  }

  return {
    snapshot: () => count,
    stop: () => {
      observer?.disconnect();
    },
  };
};

const collectRafDeltas = async (durationMs: number, perFrame: () => void): Promise<number[]> => {
  const deltas: number[] = [];
  let last = performance.now();
  const deadline = last + durationMs;

  await new Promise<void>((resolve) => {
    const tick = () => {
      const now = performance.now();
      deltas.push(now - last);
      last = now;
      perFrame();
      if (now >= deadline) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  return deltas.length > 1 ? deltas.slice(1) : deltas;
};

const buildSeedShape = (index: number): ShapeObject => {
  const layer = index % 8;
  const x = 32 + (index % 12) * 48;
  const y = 32 + (index % 9) * 44;
  return {
    id: crypto.randomUUID(),
    type: 'shape',
    shapeType: 'rect',
    name: `Perf shape ${index}`,
    layer,
    startTime: index * 0.08,
    duration: 4,
    x,
    y,
    width: 100,
    height: 72,
    fill: '#cc4455',
    enableAnimation: false,
    endX: x,
    endY: y,
    easing: 'linear',
    offset: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
  };
};

const seedTimelineObjects = (count: number) => {
  const { addObject } = useStore.getState();
  for (let index = 0; index < count; index += 1) {
    addObject(buildSeedShape(index));
  }
};

const timestampUtc = () => new Date().toISOString();

const persistHarnessRows = async (rows: PerformanceHarnessRow[]): Promise<string> => {
  const chunk = rows.map((row) => formatPerformanceCsvRow(row)).join('');
  const hasElectronIpc = typeof window !== 'undefined'
    && typeof window.ipcRenderer?.invoke === 'function';

  if (hasElectronIpc) {
    const result = await window.ipcRenderer.invoke('append-performance-csv', {
      fileName: 'harness-runs.csv',
      lines: chunk,
    }) as { success?: boolean; filePath?: string; error?: string };

    if (!result?.success) {
      throw new Error(result?.error || 'append-performance-csv failed');
    }

    console.info(`[perf] Appended ${rows.length} row(s) to ${result.filePath ?? 'harness-runs.csv'}`);
    return result.filePath ?? '';
  }

  const blob = new Blob([buildPerformanceCsvHeader() + chunk], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `uxfd-perf-${Date.now()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
  console.info('[perf] Downloaded CSV (no Electron IPC).');
  return '';
};

const notifyPerfAgentIfNeeded = async (payload: PerfHarnessAgentPayload) => {
  if (!isPerfAgentMode()) {
    return;
  }

  const hasElectronIpc = typeof window !== 'undefined'
    && typeof window.ipcRenderer?.invoke === 'function';

  if (!hasElectronIpc) {
    console.warn('[perf] Agent mode requires Electron IPC; skipping perf-harness-agent-done.');
    return;
  }

  try {
    await window.ipcRenderer.invoke('perf-harness-agent-done', payload);
  } catch (error) {
    console.error('[perf] perf-harness-agent-done failed:', error);
  }
};

const runScenarioPlayheadScrubSync = (runId: string): PerformanceHarnessRow => {
  const longTasks = createLongTaskObserver();
  const before = useStore.getState().objects.length;
  const startedAt = performance.now();

  for (let index = 0; index < 520; index += 1) {
    const state = useStore.getState();
    const duration = Math.max(state.duration, 0.001);
    state.setTime(((index * 0.018) % duration + duration) % duration);
  }

  const durationMs = performance.now() - startedAt;
  const longTaskCount = longTasks.snapshot();
  longTasks.stop();

  return {
    timestampUtc: timestampUtc(),
    runId,
    scenario: 'playhead_scrub_sync',
    durationMs,
    objectCountBefore: before,
    objectCountAfter: useStore.getState().objects.length,
    rafMeanMs: 0,
    rafP95Ms: 0,
    rafMaxMs: 0,
    longTaskCount,
    notes: 'setTime_only_no_raf',
  };
};

const runScenarioRafPlayhead = async (runId: string): Promise<PerformanceHarnessRow> => {
  const longTasks = createLongTaskObserver();
  const before = useStore.getState().objects.length;
  let frame = 0;
  const startedAt = performance.now();

  const deltas = await collectRafDeltas(2200, () => {
    const state = useStore.getState();
    const duration = Math.max(state.duration, 0.001);
    state.setTime(((frame * 0.016) % duration + duration) % duration);
    frame += 1;
  });

  const wallMs = performance.now() - startedAt;
  const stats = summariseRafDeltas(deltas);
  const longTaskCount = longTasks.snapshot();
  longTasks.stop();

  return {
    timestampUtc: timestampUtc(),
    runId,
    scenario: 'raf_playhead_scrub',
    durationMs: wallMs,
    objectCountBefore: before,
    objectCountAfter: useStore.getState().objects.length,
    rafMeanMs: Number(stats.mean.toFixed(3)),
    rafP95Ms: Number(stats.p95.toFixed(3)),
    rafMaxMs: Number(stats.max.toFixed(3)),
    longTaskCount,
    notes: 'requestAnimationFrame_plus_setTime_each_frame',
  };
};

const runScenarioUpdateObjectThrash = (runId: string): PerformanceHarnessRow => {
  const longTasks = createLongTaskObserver();
  const snapshot = useStore.getState().objects;
  const before = snapshot.length;
  if (before === 0) {
    longTasks.stop();
    return {
      timestampUtc: timestampUtc(),
      runId,
      scenario: 'update_object_thrash',
      durationMs: 0,
      objectCountBefore: 0,
      objectCountAfter: 0,
      rafMeanMs: 0,
      rafP95Ms: 0,
      rafMaxMs: 0,
      longTaskCount: 0,
      notes: 'skipped_no_objects',
    };
  }

  const stableIds = snapshot.map((object) => object.id);
  const startedAt = performance.now();

  for (let index = 0; index < 1100; index += 1) {
    const id = stableIds[index % stableIds.length];
    const jitter = (index % 240) + 8;
    useStore.getState().updateObject(id, { x: jitter });
  }

  const durationMs = performance.now() - startedAt;
  const longTaskCount = longTasks.snapshot();
  longTasks.stop();

  return {
    timestampUtc: timestampUtc(),
    runId,
    scenario: 'update_object_thrash',
    durationMs,
    objectCountBefore: before,
    objectCountAfter: useStore.getState().objects.length,
    rafMeanMs: 0,
    rafP95Ms: 0,
    rafMaxMs: 0,
    longTaskCount,
    notes: 'updateObject_many_iterations',
  };
};

export const runPerformanceHarness = async (): Promise<PerfHarnessAgentPayload> => {
  const runId = crypto.randomUUID();
  const rows: PerformanceHarnessRow[] = [];

  const finish = async (partial: Omit<PerfHarnessAgentPayload, 'finishedAtUtc'>): Promise<PerfHarnessAgentPayload> => {
    const payload: PerfHarnessAgentPayload = {
      ...partial,
      finishedAtUtc: new Date().toISOString(),
    };
    await notifyPerfAgentIfNeeded(payload);
    return payload;
  };

  try {
    const store = useStore.getState();
    if (!store.isProjectLoaded) {
      store.initializeProject({
        width: 1280,
        height: 720,
        fps: 60,
        sampleRate: 44100,
      });
    }

    await waitForReactPaint();

    const countBeforeSeed = useStore.getState().objects.length;
    if (countBeforeSeed < 6) {
      seedTimelineObjects(6 - countBeforeSeed);
      await waitForReactPaint();
    }

    rows.push(runScenarioPlayheadScrubSync(runId));
    await waitForReactPaint();

    rows.push(await runScenarioRafPlayhead(runId));
    await waitForReactPaint();

    rows.push(runScenarioUpdateObjectThrash(runId));

    const csvFilePath = await persistHarnessRows(rows);
    return await finish({
      success: true,
      runId,
      csvFilePath,
      rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[perf] Harness error:', error);
    return await finish({
      success: false,
      runId,
      csvFilePath: '',
      rows,
      errorMessage: message,
    });
  }
};

declare global {
  interface Window {
    /** DevTools: await window.__UXFD_RUN_PERF_HARNESS__() */
    __UXFD_RUN_PERF_HARNESS__?: () => Promise<PerfHarnessAgentPayload>;
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__UXFD_RUN_PERF_HARNESS__ = runPerformanceHarness;
}
