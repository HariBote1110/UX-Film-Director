import type { StoreApi } from 'zustand';
import type { AppState } from '../storeTypes';

type PlaybackSlice = Pick<
  AppState,
  | 'currentTime'
  | 'duration'
  | 'isPlaying'
  | 'setTime'
  | 'setDuration'
  | 'advanceTime'
  | 'togglePlay'
  | 'setIsPlaying'
>;

type SetState = StoreApi<AppState>['setState'];
type GetState = StoreApi<AppState>['getState'];

export const createPlaybackSlice = (set: SetState, get: GetState): PlaybackSlice => ({
  currentTime: 0,
  duration: 30,
  isPlaying: false,

  setTime: (time) => set((state) => {
    const nextTime = Math.max(0, time);
    if (Math.abs(state.currentTime - nextTime) < 0.0001) return {};
    return { currentTime: nextTime };
  }),

  setDuration: (duration) => set((state) => {
    const nextDuration = Math.max(1, duration);
    if (Math.abs(state.duration - nextDuration) < 0.0001) return {};
    return { duration: nextDuration };
  }),

  advanceTime: (deltaTime) => {
    const { currentTime, duration, isPlaying } = get();
    if (!isPlaying) return;
    let nextTime = currentTime + deltaTime;
    if (nextTime < 0) nextTime = 0;
    if (nextTime >= duration) {
      nextTime = duration;
      set({ isPlaying: false });
    }
    if (Math.abs(nextTime - currentTime) >= 0.0001) {
      set({ currentTime: nextTime });
    }
  },

  togglePlay: () => set((state) => {
    if (!state.isPlaying && state.currentTime >= state.duration) {
      return { isPlaying: true, currentTime: 0 };
    }
    return { isPlaying: !state.isPlaying };
  }),

  setIsPlaying: (isPlaying) => set({ isPlaying }),
});
