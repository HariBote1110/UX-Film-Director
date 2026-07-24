import { useStore } from '../store/useStore';
import {
  buildProjectFileData,
  parseProjectPayloadV2,
  restoreProjectObjects,
} from '../utils/projectFile';
import {
  buildRealisticHeavyEditScenario,
  inspectRealisticHeavyEditScenario,
  type RealisticHeavyEditPaths,
} from './realisticHeavyEditScenario';

type HarnessResult = Record<string, unknown> & { ok: boolean };

type RealisticHeavyEditHarnessApi = {
  seed: (paths: RealisticHeavyEditPaths) => Promise<HarnessResult>;
  exercise: (options?: { scrubIterations?: number; playbackMs?: number }) => Promise<HarnessResult>;
  roundTrip: () => Promise<HarnessResult>;
  prepareShortExport: (durationSeconds?: number) => HarnessResult;
  serialiseProject: () => string;
  snapshot: () => HarnessResult;
};

declare global {
  interface Window {
    __UXFD_REALISTIC_HEAVY_EDIT_E2E__?: RealisticHeavyEditHarnessApi;
  }
}

const nextAnimationFrame = () => new Promise<void>((resolve) => {
  requestAnimationFrame(() => resolve());
});

const waitForPaint = async () => {
  await nextAnimationFrame();
  await nextAnimationFrame();
};

const waitForPresenterSettled = async (timeoutMs = 15_000) => {
  const startedAt = performance.now();
  let lastStatus = document.documentElement.dataset.uxfdSharedRendererPresenterStatus ?? 'unknown';
  while (performance.now() - startedAt < timeoutMs) {
    const status = document.documentElement.dataset.uxfdSharedRendererPresenterStatus;
    const rustTimelineStatus =
      document.documentElement.dataset.uxfdRustTimelineSceneRpcStatus;
    if (status) lastStatus = status;
    if (rustTimelineStatus === 'blocked') return rustTimelineStatus;
    if (rustTimelineStatus === 'ready' || status === 'ready') {
      return rustTimelineStatus ?? status;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
  }
  return lastStatus;
};

const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
};

const collectRafDeltas = async (durationMs: number): Promise<number[]> => {
  const deltas: number[] = [];
  let last = performance.now();
  const deadline = last + durationMs;
  await new Promise<void>((resolve) => {
    const tick = () => {
      const now = performance.now();
      deltas.push(now - last);
      last = now;
      if (now >= deadline) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return deltas.slice(1);
};

const activeProjectFile = () => {
  const state = useStore.getState();
  return buildProjectFileData({
    projectSettings: state.projectSettings,
    scenes: state.scenes,
    activeSceneId: state.activeSceneId,
    objects: state.objects,
    layers: state.layers,
    duration: state.duration,
    camera: state.camera,
    stageCamera3D: state.stageCamera3D,
  });
};

const projectFingerprint = (serialised: string): string => {
  const parsed = JSON.parse(serialised) as { savedAt?: string };
  delete parsed.savedAt;
  const text = JSON.stringify(parsed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const snapshot = (): HarnessResult => {
  const state = useStore.getState();
  const allObjects = state.scenes.flatMap((scene) => (
    scene.id === state.activeSceneId ? state.objects : scene.objects
  ));
  const timelineItemCount = document.querySelectorAll('[data-timeline-item="true"]').length;
  const bodyText = document.body.innerText;
  const presenterStatus = document.documentElement.dataset.uxfdSharedRendererPresenterStatus ?? null;
  const rustTimelineStatus =
    document.documentElement.dataset.uxfdRustTimelineSceneRpcStatus ?? null;
  return {
    ok: state.isProjectLoaded
      && state.objects.length > 0
      && rustTimelineStatus !== 'blocked'
      && (rustTimelineStatus === 'ready' || presenterStatus === 'ready'),
    activeSceneId: state.activeSceneId,
    activeObjectCount: state.objects.length,
    totalObjectCount: allObjects.length,
    sceneCount: state.scenes.length,
    selectedObjectCount: state.selectedIds.length,
    currentTime: state.currentTime,
    duration: state.duration,
    timelineItemCount,
    presenterStatus,
    presenterFailureReason:
      document.documentElement.dataset.uxfdSharedRendererPresenterFailureReason ?? null,
    rustTimelineStatus,
    rustTimelineDetail:
      document.documentElement.dataset.uxfdRustTimelineSceneRpcDetail ?? null,
    planMode: document.documentElement.dataset.uxfdSharedRendererPlanMode ?? null,
    surfaceGate: document.documentElement.dataset.uxfdSharedRendererSurfaceGate ?? null,
    nativeOverlayAttempt: document.documentElement.dataset.uxfdNativeOverlayAttempt ?? null,
    nativeOverlayFailureReason: document.documentElement.dataset.uxfdNativeOverlayFailureReason ?? null,
    hasMissingSourceText: bodyText.includes('MissingSource'),
  };
};

const seed = async (paths: RealisticHeavyEditPaths): Promise<HarnessResult> => {
  const scenario = buildRealisticHeavyEditScenario(paths);
  const inspection = inspectRealisticHeavyEditScenario(scenario);
  if (!inspection.ok) {
    return { ok: false, stage: 'inspect', inspection };
  }
  useStore.getState().loadProject(
    scenario.settings,
    scenario.scenes,
    scenario.activeSceneId,
  );
  useStore.getState().setTime(0);
  await waitForPaint();
  await waitForPresenterSettled();
  return {
    ok: true,
    stage: 'seeded',
    inspection,
    snapshot: snapshot(),
  };
};

const exercise = async (
  options: { scrubIterations?: number; playbackMs?: number } = {},
): Promise<HarnessResult> => {
  const scrubIterations = Math.max(60, Math.min(1_200, options.scrubIterations ?? 360));
  const playbackMs = Math.max(1_000, Math.min(10_000, options.playbackMs ?? 3_000));
  const before = snapshot();
  const initialState = useStore.getState();
  const mainSceneId = initialState.activeSceneId;
  const initialObjectCount = initialState.objects.length;
  const editableIds = initialState.objects
    .filter((object) => object.type === 'shape')
    .slice(0, 3)
    .map((object) => object.id);

  const scrubStartedAt = performance.now();
  for (let index = 0; index < scrubIterations; index += 1) {
    const state = useStore.getState();
    state.setTime((index * 0.137) % Math.max(0.1, state.duration));
    if (index % 12 === 0) await nextAnimationFrame();
  }
  const scrubDurationMs = performance.now() - scrubStartedAt;

  const stateAfterScrub = useStore.getState();
  stateAfterScrub.selectObjects(editableIds);
  stateAfterScrub.duplicateSelectedObjectsWithObjectCopyExt();
  const duplicatedObjectCount = useStore.getState().objects.length;
  useStore.getState().undo();
  const undoObjectCount = useStore.getState().objects.length;
  useStore.getState().redo();
  const redoObjectCount = useStore.getState().objects.length;

  const firstVideo = useStore.getState().objects.find((object) => object.type === 'video');
  if (firstVideo) {
    useStore.getState().pushHistory();
    useStore.getState().updateObject(firstVideo.id, {
      x: firstVideo.x + 18,
      y: firstVideo.y + 10,
      duration: Math.max(1, firstVideo.duration - 0.5),
      offset: (firstVideo.offset ?? 0) + 0.25,
    });
  }

  const otherScene = useStore.getState().scenes.find((scene) => scene.id !== mainSceneId);
  if (otherScene) {
    useStore.getState().switchScene(otherScene.id);
    await waitForPaint();
    useStore.getState().switchScene(mainSceneId);
    await waitForPaint();
  }

  const longTaskDurations: number[] = [];
  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTaskDurations.push(entry.duration);
    });
    observer.observe({ type: 'longtask', buffered: true } as PerformanceObserverInit);
  } catch {
    observer = null;
  }

  useStore.getState().setTime(0);
  useStore.getState().setIsPlaying(true);
  const rafDeltas = await collectRafDeltas(playbackMs);
  useStore.getState().setIsPlaying(false);
  observer?.disconnect();
  await waitForPaint();

  const after = snapshot();
  const idCount = new Set(useStore.getState().objects.map((object) => object.id)).size;
  const expectedDuplicatedCount = initialObjectCount + editableIds.length * 3;
  const errors = [
    duplicatedObjectCount !== expectedDuplicatedCount
      ? `複製後件数が不正です: ${duplicatedObjectCount} != ${expectedDuplicatedCount}`
      : null,
    undoObjectCount !== initialObjectCount
      ? `Undo後件数が不正です: ${undoObjectCount} != ${initialObjectCount}`
      : null,
    redoObjectCount !== expectedDuplicatedCount
      ? `Redo後件数が不正です: ${redoObjectCount} != ${expectedDuplicatedCount}`
      : null,
    idCount !== useStore.getState().objects.length ? '編集後にID重複があります。' : null,
    after.hasMissingSourceText === true ? 'MissingSourceがUIに表示されています。' : null,
  ].filter((value): value is string => typeof value === 'string');

  return {
    ok: errors.length === 0,
    errors,
    before,
    after,
    scrubIterations,
    scrubDurationMs,
    duplicatedObjectCount,
    undoObjectCount,
    redoObjectCount,
    playbackMs,
    rafSampleCount: rafDeltas.length,
    rafMeanMs: rafDeltas.length > 0
      ? rafDeltas.reduce((total, value) => total + value, 0) / rafDeltas.length
      : 0,
    rafP95Ms: percentile(rafDeltas, 0.95),
    rafMaxMs: Math.max(0, ...rafDeltas),
    longTaskCount: longTaskDurations.length,
    longTaskMaxMs: Math.max(0, ...longTaskDurations),
  };
};

const roundTrip = async (): Promise<HarnessResult> => {
  const serialisedBefore = JSON.stringify(activeProjectFile());
  const fingerprintBefore = projectFingerprint(serialisedBefore);
  const parsed = parseProjectPayloadV2(JSON.parse(serialisedBefore));
  const restoredScenes = await Promise.all(parsed.scenes.map(async (scene) => ({
    ...scene,
    objects: await restoreProjectObjects(scene.objects, parsed.projectSettings),
  })));
  useStore.getState().loadProject(parsed.projectSettings, restoredScenes, parsed.activeSceneId);
  await waitForPaint();
  await waitForPresenterSettled();
  const serialisedAfter = JSON.stringify(activeProjectFile());
  const fingerprintAfter = projectFingerprint(serialisedAfter);
  const allIds = useStore.getState().scenes.flatMap((scene) => scene.objects.map((object) => object.id));
  const uniqueIdCount = new Set(allIds).size;
  const stable = fingerprintBefore === fingerprintAfter;
  const restoredSnapshot = snapshot();
  return {
    ok: stable && uniqueIdCount === allIds.length && restoredSnapshot.ok,
    fingerprintBefore,
    fingerprintAfter,
    stable,
    objectCount: allIds.length,
    uniqueIdCount,
    snapshot: restoredSnapshot,
  };
};

const prepareShortExport = (durationSeconds = 2): HarnessResult => {
  const safeDuration = Math.max(0.5, Math.min(5, durationSeconds));
  const state = useStore.getState();
  const objects = state.objects.map((object, index) => ({
    ...object,
    startTime: Math.min(object.startTime, (index % 4) * 0.08),
    duration: safeDuration,
  }));
  useStore.setState({
    objects,
    duration: safeDuration,
    currentTime: 0,
    isPlaying: false,
    selectedId: null,
    selectedIds: [],
  });
  const expectedDurationSeconds = Math.max(
    safeDuration,
    ...objects.map((object) => object.startTime + object.duration),
  );
  const expectedFrameCount = Math.ceil(
    expectedDurationSeconds * state.projectSettings.fps,
  );
  return {
    ok: objects.length > 0,
    duration: safeDuration,
    objectCount: objects.length,
    videoCount: objects.filter((object) => object.type === 'video').length,
    expectedDurationSeconds,
    expectedFrameCount,
  };
};

export const installRealisticHeavyEditHarness = () => {
  window.__UXFD_REALISTIC_HEAVY_EDIT_E2E__ = {
    seed,
    exercise,
    roundTrip,
    prepareShortExport,
    serialiseProject: () => JSON.stringify(activeProjectFile(), null, 2),
    snapshot,
  };
};
