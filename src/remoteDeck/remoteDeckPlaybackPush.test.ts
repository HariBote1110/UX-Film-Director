import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../store/useStore';
import { subscribeStoreToRemoteDeckPlayback } from './remoteDeckPlaybackPush';

describe('subscribeStoreToRemoteDeckPlayback', () => {
  let time = 0;
  const now = () => time;

  beforeEach(() => {
    time = 0;
    useStore.getState().initializeProject({
      width: 1920,
      height: 1080,
      fps: 60,
      sampleRate: 48_000,
    });
    useStore.getState().setIsPlaying(false);
    useStore.getState().setTime(0);
  });

  it('pushes the initial playback state immediately', () => {
    const send = vi.fn();
    const unsubscribe = subscribeStoreToRemoteDeckPlayback(useStore, send, { now });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('remote-deck:state', {
      kind: 'playback',
      isPlaying: false,
      timeSeconds: 0,
      fps: 60,
    });
    unsubscribe();
  });

  it('pushes play/pause transitions immediately regardless of throttle', () => {
    const send = vi.fn();
    const unsubscribe = subscribeStoreToRemoteDeckPlayback(useStore, send, {
      now,
      intervalMs: 200,
    });
    send.mockClear();

    time = 10; // interval 内でも isPlaying の変化は即時
    useStore.getState().setIsPlaying(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toMatchObject({ kind: 'playback', isPlaying: true });

    time = 20;
    useStore.getState().setIsPlaying(false);
    expect(send).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('throttles pure time updates to the given interval', () => {
    const send = vi.fn();
    const unsubscribe = subscribeStoreToRemoteDeckPlayback(useStore, send, {
      now,
      intervalMs: 200,
    });
    send.mockClear();

    time = 50;
    useStore.getState().setTime(0.1);
    expect(send).not.toHaveBeenCalled(); // interval 未満は抑制

    time = 250;
    useStore.getState().setTime(0.2);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toMatchObject({ timeSeconds: 0.2 });

    time = 300;
    useStore.getState().setTime(0.3);
    expect(send).toHaveBeenCalledTimes(1); // まだ 200ms 経っていない
    unsubscribe();
  });

  it('does not push when unrelated store state changes', () => {
    const send = vi.fn();
    const unsubscribe = subscribeStoreToRemoteDeckPlayback(useStore, send, { now });
    send.mockClear();

    useStore.setState({ selectedId: 'x', selectedIds: ['x'] });

    expect(send).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('stops pushing after unsubscribe', () => {
    const send = vi.fn();
    const unsubscribe = subscribeStoreToRemoteDeckPlayback(useStore, send, { now });
    unsubscribe();
    send.mockClear();

    useStore.getState().setIsPlaying(true);
    expect(send).not.toHaveBeenCalled();
  });
});
