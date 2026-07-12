import { remoteDeckIpcChannels } from '../../shared/remoteDeckProtocol';
import type { AppState } from '../store/storeTypes';

export interface RemoteDeckPlaybackState {
  kind: 'playback';
  isPlaying: boolean;
  timeSeconds: number;
  fps: number;
}

interface StoreLike {
  getState: () => AppState;
  subscribe: (listener: (state: AppState) => void) => () => void;
}

export interface SubscribePlaybackOptions {
  /** Minimum interval between pure time updates (default 200ms ≒ 5Hz). */
  intervalMs?: number;
  now?: () => number;
}

/**
 * Pushes playback state (play/pause + current time) to the deck (Phase 5).
 * Play/pause transitions are sent immediately; time-only updates are
 * throttled to intervalMs because advanceTime ticks every animation frame.
 */
export const subscribeStoreToRemoteDeckPlayback = (
  store: StoreLike,
  send: (channel: string, state: RemoteDeckPlaybackState) => void,
  options: SubscribePlaybackOptions = {},
): (() => void) => {
  const intervalMs = options.intervalMs ?? 200;
  const now = options.now ?? (() => Date.now());

  let lastIsPlaying: boolean | null = null;
  let lastTimeSeconds: number | null = null;
  let lastSentAt: number | null = null;

  const push = (state: AppState) => {
    const isPlaying = state.isPlaying;
    const timeSeconds = state.currentTime;
    const playStateChanged = isPlaying !== lastIsPlaying;
    const timeChanged = timeSeconds !== lastTimeSeconds;
    if (!playStateChanged && !timeChanged) return;

    const time = now();
    if (!playStateChanged) {
      // 時刻のみの更新は間引く（再生中は毎フレーム呼ばれるため）
      if (lastSentAt !== null && time - lastSentAt < intervalMs) return;
    }

    lastIsPlaying = isPlaying;
    lastTimeSeconds = timeSeconds;
    lastSentAt = time;
    send(remoteDeckIpcChannels.state, {
      kind: 'playback',
      isPlaying,
      timeSeconds,
      fps: state.projectSettings.fps,
    });
  };

  push(store.getState());
  return store.subscribe(push);
};
