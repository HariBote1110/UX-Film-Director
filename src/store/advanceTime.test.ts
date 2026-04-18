import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './useStore';

describe('advanceTime', () => {
  beforeEach(() => {
    useStore.getState().initializeProject({
      width: 1920,
      height: 1080,
      fps: 60,
      sampleRate: 48_000,
    });
  });

  it('clamps currentTime to zero when delta is strongly negative', () => {
    const { setTime, setIsPlaying, advanceTime } = useStore.getState();
    setTime(0.5);
    setIsPlaying(true);
    advanceTime(-10);
    expect(useStore.getState().currentTime).toBe(0);
  });

  it('still pauses at duration when approaching from below', () => {
    const { setTime, setIsPlaying, advanceTime, duration } = useStore.getState();
    setTime(duration - 0.01);
    setIsPlaying(true);
    advanceTime(1);
    expect(useStore.getState().currentTime).toBe(duration);
    expect(useStore.getState().isPlaying).toBe(false);
  });
});
