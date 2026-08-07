import type {
  NativeOverlayResponse,
  NativeOverlayScenePayload,
} from './nativeOverlayMainBridge';
import { isNativeOverlayDirectMediaSourceSupported } from '../src/utils/nativeOverlayDirectMediaSupport';

export interface RustScenePlaybackStartPayload {
  windowId: number;
  sceneId: string;
  revision: number;
  fps: number;
  startTimeSeconds: number;
  durationSeconds: number;
}

export interface RustScenePlaybackEvaluation {
  sceneId: string;
  revision: number;
  frameIndex: number;
  canvas: {
    width: number;
    height: number;
  };
  snapshot: {
    frame_index: number;
    colour: {
      profile: string;
      working_space: string;
      alpha: string;
    };
    clips: Array<{
      clip_id: string;
      track_id: string;
      media_id: string;
      source_frame: number;
      z_index: number;
      transform: {
        translation_x: number;
        translation_y: number;
        scale_x: number;
        scale_y: number;
        rotation_degrees: number;
        sampling: string;
      };
      opacity: number;
      effects: unknown[];
    }>;
  };
  media: Array<{
    id: string;
    kind: string;
    source: string;
    width: number;
    height: number;
    source_rate?: {
      numerator: number;
      denominator: number;
    };
    active_layer_ids?: string[];
  }>;
}

export interface RustScenePlaybackUiState {
  status: 'started' | 'playing' | 'paused' | 'stopped' | 'ended' | 'failed';
  currentTimeSeconds: number;
  frameIndex: number;
  isPlaying: boolean;
  reason?: string;
  diagnostics: RustScenePlaybackDiagnostics;
}

export interface RustScenePlaybackDiagnostics {
  requestedFrames: number;
  presentedFrames: number;
  skippedFrames: number;
  failedFrames: number;
  uiNotifications: number;
}

/**
 * 計測専用: `startScenePlayback`往復（renderer観測で~370ms、native native再生
 * クロックのengage遅延を支配する区間）の内訳。制御フローには一切関与しない。
 * evaluateScene/presentSceneが未計測（呼ばれる前に失敗した等）の場合は
 * null。isFirstStartSinceLaunchはコントローラ生成後最初のstart()呼び出しか
 * どうか（surface作成・decoder初期化・shader/pipelineコンパイルのような
 * ほぼ一定コストの冷却経路を切り分ける仮説の検証用）。
 */
export interface RustScenePlaybackStartTimingDiagnostics {
  totalMs: number;
  evaluateSceneMs: number | null;
  presentSceneMs: number | null;
  otherMs: number | null;
  isFirstStartSinceLaunch: boolean;
}

/**
 * 純粋関数: 生の区間計測値からotherMs（evaluate/present以外に費やされた
 * 時間）を導出する。壁時計へは触れないのでユニットテストで直接固定できる。
 */
export const computeRustScenePlaybackStartTimingDiagnostics = ({
  totalMs,
  evaluateSceneMs,
  presentSceneMs,
  isFirstStartSinceLaunch,
}: {
  totalMs: number;
  evaluateSceneMs: number | undefined;
  presentSceneMs: number | undefined;
  isFirstStartSinceLaunch: boolean;
}): RustScenePlaybackStartTimingDiagnostics => ({
  totalMs,
  evaluateSceneMs: evaluateSceneMs ?? null,
  presentSceneMs: presentSceneMs ?? null,
  otherMs: evaluateSceneMs !== undefined && presentSceneMs !== undefined
    ? Math.max(0, totalMs - evaluateSceneMs - presentSceneMs)
    : null,
  isFirstStartSinceLaunch,
});

export type RustScenePlaybackStartResult =
  | {
      active: true;
      frameIndex: number;
      startTimingDiagnostics: RustScenePlaybackStartTimingDiagnostics;
    }
  | {
      active: false;
      reason: 'invalidRequest' | 'unsupportedDirectMedia' | 'evaluationFailed' | 'presentFailed';
      detail?: string;
    };

export interface RustScenePlaybackController {
  start: (payload: RustScenePlaybackStartPayload) => Promise<RustScenePlaybackStartResult>;
  pause: () => RustScenePlaybackUiState | null;
  stop: () => RustScenePlaybackUiState | null;
  readonly diagnostics: Readonly<RustScenePlaybackDiagnostics>;
}

type TimerHandle = ReturnType<typeof setTimeout>;

const isDirectOverlayMediaSupported = (
  kind: string,
  source: string,
  sourceRate?: { numerator: number; denominator: number },
): boolean => {
  if (!isNativeOverlayDirectMediaSourceSupported(kind, source)) return false;
  if (kind === 'Video') {
    return Number.isSafeInteger(sourceRate?.numerator)
      && (sourceRate?.numerator ?? 0) > 0
      && Number.isSafeInteger(sourceRate?.denominator)
      && (sourceRate?.denominator ?? 0) > 0;
  }
  return true;
};

const SINGLE_SOURCE_FRAME_MEDIA_KINDS = new Set([
  'Video',
  'GeneratedAudioWaveform',
  'GeneratedAudioSphere',
  'GeneratedParticle',
  'GeneratedFocusLinesPlus',
  'GeneratedShakingPolygon',
  'GeneratedShatteredSphere',
]);

const resolveDirectOverlaySourceFrameConflict = (
  evaluation: RustScenePlaybackEvaluation,
): string | null => {
  const mediaIds = new Set<string>();
  for (const media of evaluation.media) {
    if (mediaIds.has(media.id)) {
      return `Native overlay scene contains duplicate media ID ${media.id}.`;
    }
    mediaIds.add(media.id);
  }
  const mediaKindsById = new Map(
    evaluation.media.map((media) => [media.id, media.kind]),
  );
  const sourceFramesByMediaId = new Map<string, number>();
  for (const clip of evaluation.snapshot.clips) {
    const mediaKind = mediaKindsById.get(clip.media_id);
    if (!mediaKind || !SINGLE_SOURCE_FRAME_MEDIA_KINDS.has(mediaKind)) {
      continue;
    }
    const previousSourceFrame = sourceFramesByMediaId.get(clip.media_id);
    if (
      previousSourceFrame !== undefined
      && previousSourceFrame !== clip.source_frame
    ) {
      return `Native overlay media ${clip.media_id} is requested at multiple source frames (${previousSourceFrame} and ${clip.source_frame}).`;
    }
    sourceFramesByMediaId.set(clip.media_id, clip.source_frame);
  }
  return null;
};

const copyDiagnostics = (
  diagnostics: RustScenePlaybackDiagnostics,
): RustScenePlaybackDiagnostics => ({ ...diagnostics });

const toNativeOverlayPlaybackSnapshot = (
  snapshot: RustScenePlaybackEvaluation['snapshot'],
  canvas: RustScenePlaybackEvaluation['canvas'],
) => ({
  frameIndex: snapshot.frame_index,
  colour: {
    profile: snapshot.colour.profile,
    workingSpace: snapshot.colour.working_space,
    alpha: snapshot.colour.alpha,
  },
  clips: snapshot.clips.map((clip) => ({
    clipId: clip.clip_id,
    trackId: clip.track_id,
    mediaId: clip.media_id,
    sourceFrame: clip.source_frame,
    zIndex: clip.z_index,
    transform: {
      translationX: clip.transform.translation_x,
      translationY: clip.transform.translation_y,
      scaleX: clip.transform.scale_x,
      scaleY: clip.transform.scale_y,
      rotationDegrees: clip.transform.rotation_degrees,
      sampling: clip.transform.sampling,
    },
    opacity: clip.opacity,
    effectsJson: JSON.stringify(clip.effects),
  })),
  canvasWidth: canvas.width,
  canvasHeight: canvas.height,
});

export const createRustScenePlaybackController = ({
  evaluateScene,
  presentScene,
  emit,
  nowMs = () => performance.now(),
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancel = (handle) => clearTimeout(handle),
  uiIntervalMs = 200,
}: {
  evaluateScene: (payload: {
    sceneId: string;
    revision: number;
    frameIndex: number;
  }) => Promise<RustScenePlaybackEvaluation>;
  presentScene: (payload: NativeOverlayScenePayload) => Promise<NativeOverlayResponse>;
  emit: (payload: RustScenePlaybackUiState) => void;
  nowMs?: () => number;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle | number;
  cancel?: (handle: TimerHandle | number) => void;
  uiIntervalMs?: number;
}): RustScenePlaybackController => {
  const diagnostics: RustScenePlaybackDiagnostics = {
    requestedFrames: 0,
    presentedFrames: 0,
    skippedFrames: 0,
    failedFrames: 0,
    uiNotifications: 0,
  };
  let generation = 0;
  let timer: TimerHandle | number | null = null;
  let active: RustScenePlaybackStartPayload | null = null;
  let clockStartedAtMs = 0;
  let lastPresentedFrame = -1;
  let lastUiNotificationAtMs = 0;
  // 計測専用: このコントローラ生成（≒アプリ起動）後、最初のstart()呼び出し
  // かどうか。surface作成・decoder初期化・shader/pipelineコンパイルのような
  // 冷却経路の仮説を切り分けるためのフラグで、成否に関わらず最初の呼び出し
  // で一度だけfalseへ倒す。
  let hasStartedOnceSinceLaunch = false;

  const cancelTimer = () => {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
  };

  const currentTimeSeconds = (atMs = nowMs()): number => {
    if (!active) return 0;
    return Math.min(
      active.durationSeconds,
      active.startTimeSeconds + Math.max(0, atMs - clockStartedAtMs) / 1_000,
    );
  };

  const emitState = (
    status: RustScenePlaybackUiState['status'],
    timeSeconds: number,
    isPlaying: boolean,
    reason?: string,
  ): RustScenePlaybackUiState => {
    const state: RustScenePlaybackUiState = {
      status,
      currentTimeSeconds: timeSeconds,
      frameIndex: active
        ? Math.min(
          Math.max(0, Math.ceil(active.durationSeconds * active.fps) - 1),
          Math.max(0, Math.floor(timeSeconds * active.fps)),
        )
        : Math.max(0, lastPresentedFrame),
      isPlaying,
      ...(reason ? { reason } : {}),
      diagnostics: copyDiagnostics(diagnostics),
    };
    diagnostics.uiNotifications += 1;
    state.diagnostics.uiNotifications = diagnostics.uiNotifications;
    emit(state);
    return state;
  };

  const scheduleNext = (runGeneration: number) => {
    if (!active || generation !== runGeneration) return;
    const frameDurationMs = 1_000 / active.fps;
    const elapsedFrames = Math.floor(
      (currentTimeSeconds() - active.startTimeSeconds) * active.fps,
    );
    const nextFrameTimeMs = clockStartedAtMs + (elapsedFrames + 1) * frameDurationMs;
    timer = schedule(() => {
      timer = null;
      void tick(runGeneration);
    }, Math.max(0, nextFrameTimeMs - nowMs()));
  };

  const renderFrame = async (
    runGeneration: number,
    frameIndex: number,
    verifyEligibility: boolean,
    // 計測専用: start()からの初回callのみ渡される。設定されている場合、
    // evaluateScene/presentSceneそれぞれの区間をnowMsで計測して書き込む。
    // 制御フロー・awaitの順序には一切影響しない（読むだけの副作用）。
    timingSink?: { evaluateSceneMs?: number; presentSceneMs?: number },
  ): Promise<
    | { active: true; frameIndex: number }
    | {
        active: false;
        reason: 'invalidRequest' | 'unsupportedDirectMedia' | 'evaluationFailed' | 'presentFailed';
        detail?: string;
      }
  > => {
    const request = active;
    if (!request || generation !== runGeneration) {
      return { active: false, reason: 'evaluationFailed' };
    }
    diagnostics.requestedFrames += 1;
    let evaluation: RustScenePlaybackEvaluation;
    const evaluateStartedAtMs = timingSink ? nowMs() : 0;
    try {
      evaluation = await evaluateScene({
        sceneId: request.sceneId,
        revision: request.revision,
        frameIndex,
      });
    } catch (error) {
      diagnostics.failedFrames += 1;
      return {
        active: false,
        reason: 'evaluationFailed',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    if (timingSink) {
      timingSink.evaluateSceneMs = nowMs() - evaluateStartedAtMs;
    }
    if (!active || generation !== runGeneration) {
      return { active: false, reason: 'evaluationFailed' };
    }
    if (
      verifyEligibility
      && !evaluation.media.every((media) =>
        isDirectOverlayMediaSupported(media.kind, media.source, media.source_rate))
    ) {
      return { active: false, reason: 'unsupportedDirectMedia' };
    }
    const sourceFrameConflict = resolveDirectOverlaySourceFrameConflict(evaluation);
    if (sourceFrameConflict) {
      return {
        active: false,
        reason: 'unsupportedDirectMedia',
        detail: sourceFrameConflict,
      };
    }
    let response: NativeOverlayResponse;
    const presentStartedAtMs = timingSink ? nowMs() : 0;
    try {
      response = await presentScene({
        windowId: request.windowId,
        snapshot: toNativeOverlayPlaybackSnapshot(evaluation.snapshot, evaluation.canvas),
        media: evaluation.media.map((media) => ({
          id: media.id,
          kind: media.kind,
          source: media.source,
          width: media.width,
          height: media.height,
          ...(media.source_rate
            ? {
                sourceRate: {
                  numerator: media.source_rate.numerator,
                  denominator: media.source_rate.denominator,
                },
              }
            : {}),
          ...(media.active_layer_ids?.length
            ? { activeLayerIds: [...media.active_layer_ids] }
            : {}),
        })),
      });
    } catch (error) {
      diagnostics.failedFrames += 1;
      return {
        active: false,
        reason: 'presentFailed',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    if (timingSink) {
      timingSink.presentSceneMs = nowMs() - presentStartedAtMs;
    }
    if (!active || generation !== runGeneration) {
      return { active: false, reason: 'presentFailed' };
    }
    if (!response.success) {
      diagnostics.failedFrames += 1;
      return {
        active: false,
        reason: 'presentFailed',
        ...(response.reason ? { detail: response.reason } : {}),
      };
    }
    if (lastPresentedFrame >= 0 && frameIndex > lastPresentedFrame + 1) {
      diagnostics.skippedFrames += frameIndex - lastPresentedFrame - 1;
    }
    lastPresentedFrame = frameIndex;
    diagnostics.presentedFrames += 1;
    return { active: true, frameIndex };
  };

  const finish = (
    status: 'ended' | 'failed',
    reason?: string,
  ): RustScenePlaybackUiState | null => {
    if (!active) return null;
    const time = status === 'ended' ? active.durationSeconds : currentTimeSeconds();
    cancelTimer();
    const state = emitState(status, time, false, reason);
    active = null;
    generation += 1;
    return state;
  };

  async function tick(runGeneration: number): Promise<void> {
    if (!active || generation !== runGeneration) return;
    const atMs = nowMs();
    const timeSeconds = currentTimeSeconds(atMs);
    if (timeSeconds >= active.durationSeconds) {
      finish('ended');
      return;
    }
    const frameIndex = Math.floor(timeSeconds * active.fps);
    if (frameIndex !== lastPresentedFrame) {
      const result = await renderFrame(runGeneration, frameIndex, false);
      if (!result.active) {
        finish('failed', result.detail ?? result.reason);
        return;
      }
    }
    if (!active || generation !== runGeneration) return;
    if (atMs - lastUiNotificationAtMs >= uiIntervalMs) {
      lastUiNotificationAtMs = atMs;
      emitState('playing', timeSeconds, true);
    }
    scheduleNext(runGeneration);
  }

  return {
    start: async (payload) => {
      // 計測専用: engage遅延（~370ms観測）の内訳切り分け用。renderer側は
      // このRPC全体を1個のブラックボックスとしてしか観測できないので、
      // start()内部でevaluateScene/presentSceneそれぞれの区間と合計を計測
      // する。制御フロー・awaitの順序は変更しない（読むだけの計測）。
      const totalStartedAtMs = nowMs();
      const isFirstStartSinceLaunch = !hasStartedOnceSinceLaunch;
      hasStartedOnceSinceLaunch = true;
      const timingSink: { evaluateSceneMs?: number; presentSceneMs?: number } = {};

      cancelTimer();
      generation += 1;
      active = null;
      if (
        !Number.isSafeInteger(payload.windowId)
        || payload.windowId < 0
        || !Number.isSafeInteger(payload.revision)
        || payload.revision < 0
        || !Number.isFinite(payload.fps)
        || payload.fps <= 0
        || !Number.isFinite(payload.startTimeSeconds)
        || payload.startTimeSeconds < 0
        || !Number.isFinite(payload.durationSeconds)
        || payload.durationSeconds <= payload.startTimeSeconds
      ) {
        return { active: false, reason: 'invalidRequest' };
      }
      active = payload;
      clockStartedAtMs = nowMs();
      lastUiNotificationAtMs = clockStartedAtMs;
      lastPresentedFrame = -1;
      const runGeneration = generation;
      const frameIndex = Math.floor(payload.startTimeSeconds * payload.fps);
      const result = await renderFrame(runGeneration, frameIndex, true, timingSink);
      if (!result.active) {
        active = null;
        generation += 1;
        return result;
      }
      emitState('started', payload.startTimeSeconds, true);
      scheduleNext(runGeneration);
      return {
        ...result,
        startTimingDiagnostics: computeRustScenePlaybackStartTimingDiagnostics({
          totalMs: nowMs() - totalStartedAtMs,
          evaluateSceneMs: timingSink.evaluateSceneMs,
          presentSceneMs: timingSink.presentSceneMs,
          isFirstStartSinceLaunch,
        }),
      };
    },
    pause: () => {
      if (!active) return null;
      const time = currentTimeSeconds();
      cancelTimer();
      const state = emitState('paused', time, false);
      active = null;
      generation += 1;
      return state;
    },
    stop: () => {
      if (!active) return null;
      const time = currentTimeSeconds();
      cancelTimer();
      const state = emitState('stopped', time, false);
      active = null;
      generation += 1;
      return state;
    },
    get diagnostics() {
      return diagnostics;
    },
  };
};
