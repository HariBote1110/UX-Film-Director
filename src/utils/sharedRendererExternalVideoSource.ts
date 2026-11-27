export type SharedRendererExternalVideoElementLike = {
  src: string;
  preload: string;
  muted: boolean;
  volume?: number;
  loop: boolean;
  playsInline?: boolean;
  currentTime: number;
  duration?: number;
  videoWidth?: number;
  videoHeight?: number;
  readyState?: number;
  onloadedmetadata: (() => void) | null;
  onerror: (() => void) | null;
  play: () => Promise<void> | void;
  pause: () => void;
  load: () => void;
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

export type SharedRendererExternalVideoSource = {
  source: SharedRendererExternalVideoElementLike;
  seekTo: (timeSeconds: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  setAudioState: (state: SharedRendererExternalVideoAudioState) => void;
  // Registers a one-shot callback fired once the element holds a presentable
  // frame (e.g. after a paused seek finishes decoding). Returns an unregister
  // function. Used to re-present the shared renderer once a not-yet-ready
  // external video frame becomes available.
  notifyOnNextPresentableFrame: (callback: () => void) => () => void;
  dispose: () => void;
};

export type SharedRendererExternalVideoPlaybackState = {
  mode?: 'playing' | 'paused';
  seekCount?: number;
  suppressedSeekCount?: number;
  throttledSyncCount?: number;
  playCount?: number;
  pauseCount?: number;
  lastDriftSeconds?: number;
  lastSyncMonotonicMs?: number;
};

export type SharedRendererExternalVideoPlaybackSyncResult = {
  sought: boolean;
  played: boolean;
  paused: boolean;
  driftSeconds: number;
  throttled: boolean;
  // Set only at the play → pause transition: how far (seconds) the timeline head
  // should move to land on the frame the element is currently displaying, so the
  // preview does not jump when pausing. Positive means the head moves forward.
  pauseSnapTimelineDeltaSeconds?: number;
};

export type SharedRendererExternalVideoMetadata = {
  duration: number;
  width: number;
  height: number;
};

type ExternalVideoElementFactory = () => SharedRendererExternalVideoElementLike;
type SharedRendererExternalVideoAudioState = {
  muted: boolean;
  volume?: number;
};

const DEFAULT_DURATION_SECONDS = 10;
const DEFAULT_VIDEO_WIDTH = 1280;
const DEFAULT_VIDEO_HEIGHT = 720;

const isPositiveNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
);

const PLAYING_SEEK_DRIFT_TOLERANCE_SECONDS = 0.35;
const PAUSED_SEEK_DRIFT_TOLERANCE_SECONDS = 1 / 120;

const createDefaultExternalVideoElement = (): SharedRendererExternalVideoElementLike =>
  document.createElement('video') as unknown as SharedRendererExternalVideoElementLike;

const clampVolume = (volume: number | undefined): number => {
  if (typeof volume !== 'number' || !Number.isFinite(volume)) return 1;
  return Math.min(1, Math.max(0, volume ?? 1));
};

const applyExternalVideoAudioState = (
  source: SharedRendererExternalVideoElementLike,
  state: SharedRendererExternalVideoAudioState
) => {
  source.muted = state.muted;
  if ('volume' in source) {
    source.volume = clampVolume(state.volume);
  }
};

export const createSharedRendererExternalVideoSource = ({
  url,
  muted = true,
  volume = 1,
  loop = false,
  elementFactory = createDefaultExternalVideoElement,
}: {
  url: string;
  muted?: boolean;
  volume?: number;
  loop?: boolean;
  elementFactory?: ExternalVideoElementFactory;
}): SharedRendererExternalVideoSource => {
  const source = elementFactory();
  source.preload = 'auto';
  applyExternalVideoAudioState(source, { muted, volume });
  source.loop = loop;
  source.playsInline = true;
  source.src = url;

  return {
    source,
    seekTo: (timeSeconds) => {
      source.currentTime = Math.max(0, timeSeconds);
    },
    play: async () => {
      await source.play();
    },
    pause: () => {
      source.pause();
    },
    setAudioState: (state) => {
      applyExternalVideoAudioState(source, state);
    },
    notifyOnNextPresentableFrame: (callback) => {
      let fired = false;
      const fireOnce = () => {
        if (fired) return;
        fired = true;
        callback();
      };

      if (typeof source.requestVideoFrameCallback === 'function') {
        const handle = source.requestVideoFrameCallback(fireOnce);
        return () => {
          source.cancelVideoFrameCallback?.(handle);
        };
      }

      if (typeof source.addEventListener === 'function') {
        const eventNames = ['seeked', 'loadeddata', 'canplay'] as const;
        const removeListeners = () => {
          eventNames.forEach((eventName) => {
            source.removeEventListener?.(eventName, handleFrameReady);
          });
        };
        function handleFrameReady() {
          removeListeners();
          fireOnce();
        }
        eventNames.forEach((eventName) => {
          source.addEventListener?.(eventName, handleFrameReady);
        });
        return removeListeners;
      }

      return () => undefined;
    },
    dispose: () => {
      source.pause();
      source.onerror = null;
      source.onloadedmetadata = null;
      source.src = '';
      source.load();
    },
  };
};

export const syncSharedRendererExternalVideoPlayback = ({
  source,
  playbackState,
  targetTimeSeconds,
  isPlaying,
  playingSeekDriftToleranceSeconds = PLAYING_SEEK_DRIFT_TOLERANCE_SECONDS,
  pausedSeekDriftToleranceSeconds = PAUSED_SEEK_DRIFT_TOLERANCE_SECONDS,
  minimumPlayingSyncIntervalMs = 0,
  nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now(),
}: {
  source: SharedRendererExternalVideoSource;
  playbackState: SharedRendererExternalVideoPlaybackState;
  targetTimeSeconds: number;
  isPlaying: boolean;
  playingSeekDriftToleranceSeconds?: number;
  pausedSeekDriftToleranceSeconds?: number;
  minimumPlayingSyncIntervalMs?: number;
  nowMs?: number;
}): SharedRendererExternalVideoPlaybackSyncResult => {
  const safeTargetTimeSeconds = Math.max(0, Number.isFinite(targetTimeSeconds) ? targetTimeSeconds : 0);
  const currentTime = Number.isFinite(source.source.currentTime) ? source.source.currentTime : 0;
  const driftSeconds = safeTargetTimeSeconds - currentTime;
  const toleranceSeconds = isPlaying
    ? playingSeekDriftToleranceSeconds
    : pausedSeekDriftToleranceSeconds;
  // At the play → pause transition the element is mid-decode at its live media
  // position, which is what the viewer currently sees. Re-seeking it back to the
  // (drifted) timeline head would snap the picture; instead we keep the element
  // in place and report how far the head should snap onto the displayed frame.
  const isPlayToPauseTransition = !isPlaying && playbackState.mode === 'playing';
  const shouldSeek = !isPlayToPauseTransition
    && (playbackState.mode !== 'playing'
      || !isPlaying
      || Math.abs(driftSeconds) > toleranceSeconds);
  const elapsedSyncMs = Number.isFinite(playbackState.lastSyncMonotonicMs)
    ? nowMs - (playbackState.lastSyncMonotonicMs ?? 0)
    : Number.POSITIVE_INFINITY;
  const shouldThrottleSync = isPlaying
    && playbackState.mode === 'playing'
    && !shouldSeek
    && minimumPlayingSyncIntervalMs > 0
    && elapsedSyncMs >= 0
    && elapsedSyncMs < minimumPlayingSyncIntervalMs;
  let sought = false;
  let played = false;
  let paused = false;

  if (shouldThrottleSync) {
    playbackState.throttledSyncCount = (playbackState.throttledSyncCount ?? 0) + 1;
    return {
      sought: false,
      played: false,
      paused: false,
      driftSeconds,
      throttled: true,
    };
  }

  if (shouldSeek) {
    source.seekTo(safeTargetTimeSeconds);
    playbackState.seekCount = (playbackState.seekCount ?? 0) + 1;
    sought = true;
  } else {
    playbackState.suppressedSeekCount = (playbackState.suppressedSeekCount ?? 0) + 1;
  }

  if (isPlaying) {
    if (playbackState.mode !== 'playing') {
      void source.play().catch(() => undefined);
      playbackState.playCount = (playbackState.playCount ?? 0) + 1;
      played = true;
    }
    playbackState.mode = 'playing';
  } else {
    if (playbackState.mode !== 'paused') {
      source.pause();
      playbackState.pauseCount = (playbackState.pauseCount ?? 0) + 1;
      paused = true;
    }
    playbackState.mode = 'paused';
  }
  playbackState.lastDriftSeconds = driftSeconds;
  playbackState.lastSyncMonotonicMs = nowMs;

  return {
    sought,
    played,
    paused,
    driftSeconds,
    throttled: false,
    // element − target: head += this to land on the displayed frame (−driftSeconds).
    ...(isPlayToPauseTransition
      ? { pauseSnapTimelineDeltaSeconds: currentTime - safeTargetTimeSeconds }
      : {}),
  };
};

export const loadExternalVideoSourceMetadata = (
  url: string,
  elementFactory: ExternalVideoElementFactory = createDefaultExternalVideoElement
): Promise<SharedRendererExternalVideoMetadata> => new Promise((resolve, reject) => {
  const video = elementFactory();
  video.preload = 'metadata';
  video.onloadedmetadata = () => {
    resolve({
      duration: isPositiveNumber(video.duration) ? video.duration : DEFAULT_DURATION_SECONDS,
      width: isPositiveNumber(video.videoWidth) ? video.videoWidth : DEFAULT_VIDEO_WIDTH,
      height: isPositiveNumber(video.videoHeight) ? video.videoHeight : DEFAULT_VIDEO_HEIGHT,
    });
  };
  video.onerror = () => reject(new Error('Failed to load video metadata.'));
  video.src = url;
});
