export type SharedRendererExternalVideoElementLike = {
  src: string;
  preload: string;
  muted: boolean;
  loop: boolean;
  playsInline?: boolean;
  currentTime: number;
  duration?: number;
  videoWidth?: number;
  videoHeight?: number;
  onloadedmetadata: (() => void) | null;
  onerror: (() => void) | null;
  play: () => Promise<void> | void;
  pause: () => void;
  load: () => void;
};

export type SharedRendererExternalVideoSource = {
  source: SharedRendererExternalVideoElementLike;
  seekTo: (timeSeconds: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  dispose: () => void;
};

export type SharedRendererExternalVideoPlaybackState = {
  mode?: 'playing' | 'paused';
  seekCount?: number;
  suppressedSeekCount?: number;
  playCount?: number;
  pauseCount?: number;
  lastDriftSeconds?: number;
};

export type SharedRendererExternalVideoPlaybackSyncResult = {
  sought: boolean;
  played: boolean;
  paused: boolean;
  driftSeconds: number;
};

export type SharedRendererExternalVideoMetadata = {
  duration: number;
  width: number;
  height: number;
};

type ExternalVideoElementFactory = () => SharedRendererExternalVideoElementLike;

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

export const createSharedRendererExternalVideoSource = ({
  url,
  muted = true,
  loop = false,
  elementFactory = createDefaultExternalVideoElement,
}: {
  url: string;
  muted?: boolean;
  loop?: boolean;
  elementFactory?: ExternalVideoElementFactory;
}): SharedRendererExternalVideoSource => {
  const source = elementFactory();
  source.preload = 'auto';
  source.muted = muted;
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
}: {
  source: SharedRendererExternalVideoSource;
  playbackState: SharedRendererExternalVideoPlaybackState;
  targetTimeSeconds: number;
  isPlaying: boolean;
  playingSeekDriftToleranceSeconds?: number;
  pausedSeekDriftToleranceSeconds?: number;
}): SharedRendererExternalVideoPlaybackSyncResult => {
  const safeTargetTimeSeconds = Math.max(0, Number.isFinite(targetTimeSeconds) ? targetTimeSeconds : 0);
  const currentTime = Number.isFinite(source.source.currentTime) ? source.source.currentTime : 0;
  const driftSeconds = safeTargetTimeSeconds - currentTime;
  const toleranceSeconds = isPlaying
    ? playingSeekDriftToleranceSeconds
    : pausedSeekDriftToleranceSeconds;
  const shouldSeek = playbackState.mode !== 'playing'
    || !isPlaying
    || Math.abs(driftSeconds) > toleranceSeconds;
  let sought = false;
  let played = false;
  let paused = false;

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

  return {
    sought,
    played,
    paused,
    driftSeconds,
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
