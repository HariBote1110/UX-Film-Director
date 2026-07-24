import type {
  NativeOverlayResponse,
  NativeOverlayScenePayload,
} from './nativeOverlayMainBridge';

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
  snapshot: {
    frame_index: number;
    canvas_width: number;
    canvas_height: number;
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

export type RustScenePlaybackStartResult =
  | { active: true; frameIndex: number }
  | { active: false; reason: 'invalidRequest' | 'unsupportedDirectMedia' | 'evaluationFailed' | 'presentFailed' };

export interface RustScenePlaybackController {
  start: (payload: RustScenePlaybackStartPayload) => Promise<RustScenePlaybackStartResult>;
  pause: () => RustScenePlaybackUiState | null;
  stop: () => RustScenePlaybackUiState | null;
  readonly diagnostics: Readonly<RustScenePlaybackDiagnostics>;
}

type TimerHandle = ReturnType<typeof setTimeout>;

const isDirectOverlayMediaSupported = (kind: string, source: string): boolean => {
  if (
    kind === 'Video'
    || kind === 'Psd'
    || kind === 'GeneratedAudioWaveform'
    || kind === 'GeneratedAudioSphere'
  ) {
    return false;
  }
  return kind !== 'Image' || /\.png(?:[?#].*)?$/i.test(source);
};

const copyDiagnostics = (
  diagnostics: RustScenePlaybackDiagnostics,
): RustScenePlaybackDiagnostics => ({ ...diagnostics });

const toNativeOverlayPlaybackSnapshot = (
  snapshot: RustScenePlaybackEvaluation['snapshot'],
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
  canvasWidth: snapshot.canvas_width,
  canvasHeight: snapshot.canvas_height,
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
  ): Promise<RustScenePlaybackStartResult> => {
    const request = active;
    if (!request || generation !== runGeneration) {
      return { active: false, reason: 'evaluationFailed' };
    }
    diagnostics.requestedFrames += 1;
    let evaluation: RustScenePlaybackEvaluation;
    try {
      evaluation = await evaluateScene({
        sceneId: request.sceneId,
        revision: request.revision,
        frameIndex,
      });
    } catch {
      diagnostics.failedFrames += 1;
      return { active: false, reason: 'evaluationFailed' };
    }
    if (!active || generation !== runGeneration) {
      return { active: false, reason: 'evaluationFailed' };
    }
    if (
      verifyEligibility
      && !evaluation.media.every((media) =>
        isDirectOverlayMediaSupported(media.kind, media.source))
    ) {
      return { active: false, reason: 'unsupportedDirectMedia' };
    }
    let response: NativeOverlayResponse;
    try {
      response = await presentScene({
        windowId: request.windowId,
        snapshot: toNativeOverlayPlaybackSnapshot(evaluation.snapshot),
        media: evaluation.media,
      });
    } catch {
      diagnostics.failedFrames += 1;
      return { active: false, reason: 'presentFailed' };
    }
    if (!active || generation !== runGeneration) {
      return { active: false, reason: 'presentFailed' };
    }
    if (!response.success) {
      diagnostics.failedFrames += 1;
      return { active: false, reason: 'presentFailed' };
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
        finish('failed', result.reason);
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
      const result = await renderFrame(runGeneration, frameIndex, true);
      if (!result.active) {
        active = null;
        generation += 1;
        return result;
      }
      emitState('started', payload.startTimeSeconds, true);
      scheduleNext(runGeneration);
      return result;
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
