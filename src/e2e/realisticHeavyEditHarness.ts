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
import { evaluateRealisticHeavyEditPlaybackClockHealth } from './realisticHeavyEditPlaybackClockHealth';
import { resolveRealisticHeavyEditPresenterRestarts } from './realisticHeavyEditPresenterRestarts';
import { resolveRealisticHeavyEditSecondPlaybackStart } from './realisticHeavyEditSecondPlaybackStart';

type HarnessResult = Record<string, unknown> & { ok: boolean };

type RealisticHeavyEditHarnessApi = {
  seed: (paths: RealisticHeavyEditPaths) => Promise<HarnessResult>;
  exercise: (options?: {
    scrubIterations?: number;
    playbackMs?: number;
    clearSelectionBeforePlayback?: boolean;
  }) => Promise<HarnessResult>;
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

// 2回目のnative再生開始計測用の定数。1回目の計測区間（rafDeltas等）が
// 完全に終わった後にのみ使う。1回目より短い窓で十分（起動タイミングの
// 数値だけが欲しく、rAFの分布までは要らないため）。
const SECOND_PLAYBACK_START_PAUSE_MS = 300;
const SECOND_PLAYBACK_START_WINDOW_MS = 1_000;

const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
};

type RafSampling = {
  deltas: number[];
  // 各rAFサンプルの瞬間に nativePlaybackActive がtrueだったかどうか。
  // shouldRunRendererPlaybackClock（isPlaying && !nativePlaybackActive）が
  // どちらのクロックに再生を委ねていたかをRunごとに再構成できるようにする。
  // 計測対象を乱さないよう、1サンプルあたりストア読み取り+boolean push のみを行う。
  nativePlaybackActiveFlags: boolean[];
};

const collectRafDeltas = async (durationMs: number): Promise<RafSampling> => {
  const deltas: number[] = [];
  const nativePlaybackActiveFlags: boolean[] = [];
  let last = performance.now();
  const deadline = last + durationMs;
  await new Promise<void>((resolve) => {
    const tick = () => {
      const now = performance.now();
      deltas.push(now - last);
      nativePlaybackActiveFlags.push(useStore.getState().nativePlaybackActive);
      last = now;
      if (now >= deadline) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return {
    deltas: deltas.slice(1),
    nativePlaybackActiveFlags: nativePlaybackActiveFlags.slice(1),
  };
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
    // nativePlaybackActive（ネイティブ再生クロック）がRunによって発火有無が
    // 分かれる問題を切り分けるための計測。rustPlaybackClockOwner/Status/Detailは
    // Viewport.tsxの再生クロック切替エフェクトが失敗時にのみ書き込むdataset。
    nativePlaybackActive: state.nativePlaybackActive,
    rustPlaybackClockOwner: document.documentElement.dataset.uxfdRustPlaybackClockOwner ?? null,
    rustPlaybackStatus: document.documentElement.dataset.uxfdRustPlaybackStatus ?? null,
    rustPlaybackDetail: document.documentElement.dataset.uxfdRustPlaybackDetail ?? null,
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
  options: {
    scrubIterations?: number;
    playbackMs?: number;
    clearSelectionBeforePlayback?: boolean;
  } = {},
): Promise<HarnessResult> => {
  window.__UXFD_REACT_PROFILE_TRACE__?.reset();
  window.__UXFD_SCENE_RPC_TRACE__?.reset();
  const scrubIterations = Math.max(60, Math.min(1_200, options.scrubIterations ?? 360));
  const playbackMs = Math.max(1_000, Math.min(10_000, options.playbackMs ?? 3_000));
  // 再生中のmojo IPC(Receive mojo reply)発生源を切り分けるための計測オプション。
  // trueの場合のみ再生計測区間へ入る直前に選択をクリアし、選択デコレーション
  // 送信経路とpresentフレーム本体経路のどちらが主因かを実験的に確定させる。
  const clearedSelectionBeforePlayback = options.clearSelectionBeforePlayback === true;
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
  if (clearedSelectionBeforePlayback) {
    useStore.getState().selectObjects([]);
  }
  // shared renderer presenter のフル再起動回数（約28ms/回）を再生計測区間の
  // 前後で差分計測する。詳細は realisticHeavyEditPresenterRestarts.ts を参照。
  const presenterStartCountBeforePlayback =
    document.documentElement.dataset.uxfdSharedRendererPresenterStartCount;
  useStore.getState().setIsPlaying(true);
  const { deltas: rafDeltas, nativePlaybackActiveFlags } = await collectRafDeltas(playbackMs);
  useStore.getState().setIsPlaying(false);
  observer?.disconnect();
  await waitForPaint();

  // --- 2回目のnative再生開始計測 ---
  // startScenePlayback（≒presentSceneMs、native-overlayアドオン呼び出し）が
  // 起動時1回限りのコールドコスト（サーフェス生成・シェーダー構築等）なのか、
  // 再生開始のたびに払う恒常コストなのかを切り分けるための計測。ここまでの
  // E2Eは常に isFirstStartSinceLaunch: true の1回目しか観測できていなかった。
  // 1回目の計測区間（rafDeltas/nativePlaybackActiveFlags、上のブロックで
  // 完全に完了済み）には一切触れず、それより後にのみ実行する。
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, SECOND_PLAYBACK_START_PAUSE_MS);
  });
  useStore.getState().setIsPlaying(true);
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, SECOND_PLAYBACK_START_WINDOW_MS);
  });
  useStore.getState().setIsPlaying(false);
  await waitForPaint();

  const after = snapshot();
  const reactProfile = window.__UXFD_REACT_PROFILE_TRACE__?.snapshot() ?? null;
  const sceneRpcTrace = window.__UXFD_SCENE_RPC_TRACE__?.snapshot() ?? null;
  const presenterStartCountAfterPlayback =
    document.documentElement.dataset.uxfdSharedRendererPresenterStartCount;
  const presenterRestarts = resolveRealisticHeavyEditPresenterRestarts(
    presenterStartCountBeforePlayback,
    presenterStartCountAfterPlayback,
  );
  // sceneRpcTrace.samplesは1回目・2回目の両方のstartPlaybackサンプルを
  // 含む（間でreset()していないため）。2回目が実際に記録されたかどうかは
  // 仮定せず、この純関数がsamplesを見て判定する。
  const secondPlaybackStart = resolveRealisticHeavyEditSecondPlaybackStart(
    sceneRpcTrace?.samples ?? null,
  );
  const rafSampleCount = rafDeltas.length;
  const rafMeanMs = rafDeltas.length > 0
    ? rafDeltas.reduce((total, value) => total + value, 0) / rafDeltas.length
    : 0;
  // nativePlaybackActive がRunによって発火有無が分かれる問題を切り分けるため、
  // 再生計測区間中のサンプルごとにネイティブ再生クロック稼働状況を集計する。
  const nativePlaybackFrameCount = nativePlaybackActiveFlags
    .filter((active) => active).length;
  const nativePlaybackFirstActiveFrameIndexRaw = nativePlaybackActiveFlags.indexOf(true);
  const nativePlaybackFirstActiveFrameIndex = nativePlaybackFirstActiveFrameIndexRaw === -1
    ? null
    : nativePlaybackFirstActiveFrameIndexRaw;
  const nativePlaybackActiveAtPlaybackStart = nativePlaybackActiveFlags[0] ?? false;
  const nativePlaybackActiveAtPlaybackEnd =
    nativePlaybackActiveFlags[nativePlaybackActiveFlags.length - 1] ?? false;
  // Electronウィンドウが他アプリに隠れる等でrAFがスロットリングされると、
  // 回数系の性能指標が桁違いに悪化するのに総合PASSしてしまう罠がある
  // （詳細はrealisticHeavyEditPlaybackClockHealth.tsのdocコメントを参照）。
  // ランナー側でこの計測区間を信頼してよいかを警告できるよう判定を含める。
  const playbackClockHealth = evaluateRealisticHeavyEditPlaybackClockHealth({
    rafSampleCount,
    rafMeanMs,
    playbackMs,
  });
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
    clearedSelectionBeforePlayback,
    duplicatedObjectCount,
    undoObjectCount,
    redoObjectCount,
    playbackMs,
    rafSampleCount,
    rafMeanMs,
    rafP95Ms: percentile(rafDeltas, 0.95),
    rafMaxMs: Math.max(0, ...rafDeltas),
    longTaskCount: longTaskDurations.length,
    longTaskMaxMs: Math.max(0, ...longTaskDurations),
    reactProfile,
    sceneRpcTrace,
    playbackClockHealth,
    presenterRestarts,
    secondPlaybackStart,
    nativePlaybackFrameCount,
    nativePlaybackFirstActiveFrameIndex,
    nativePlaybackActiveAtPlaybackStart,
    nativePlaybackActiveAtPlaybackEnd,
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
