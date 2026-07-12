import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../store/useStore';
import { subscribeStoreToRemoteDeckState } from './remoteDeckStatePush';

describe('subscribeStoreToRemoteDeckState', () => {
  beforeEach(() => {
    useStore.getState().initializeProject({
      width: 1920,
      height: 1080,
      fps: 60,
      sampleRate: 48_000,
    });
  });

  it('pushes the initial context immediately', () => {
    const send = vi.fn();
    const unsubscribe = subscribeStoreToRemoteDeckState(useStore, send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      'remote-deck:state',
      expect.objectContaining({ objectId: null, objectType: null }),
    );
    unsubscribe();
  });

  it('pushes again when the selection changes', () => {
    const audio = {
      id: 'audio-1',
      type: 'audio',
      layer: 0,
      startTime: 0,
      duration: 5,
      volume: 0.5,
      muted: false,
    } as any;
    useStore.setState({ objects: [audio] });

    const send = vi.fn();
    const unsubscribe = subscribeStoreToRemoteDeckState(useStore, send);
    send.mockClear();

    useStore.setState({ selectedId: 'audio-1', selectedIds: ['audio-1'] });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toMatchObject({ objectId: 'audio-1', objectType: 'audio' });
    unsubscribe();
  });

  it('does not push when an unrelated part of the store changes', () => {
    const send = vi.fn();
    const unsubscribe = subscribeStoreToRemoteDeckState(useStore, send);
    send.mockClear();

    useStore.getState().setTime(3);

    expect(send).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('pushes when a property of the selected object changes', () => {
    const audio = {
      id: 'audio-1',
      type: 'audio',
      layer: 0,
      startTime: 0,
      duration: 5,
      volume: 0.5,
      muted: false,
    } as any;
    useStore.setState({ objects: [audio], selectedId: 'audio-1', selectedIds: ['audio-1'] });

    const send = vi.fn();
    const unsubscribe = subscribeStoreToRemoteDeckState(useStore, send);
    send.mockClear();

    useStore.getState().updateObject('audio-1', { volume: 0.9 } as any);

    expect(send).toHaveBeenCalledTimes(1);
    const context = send.mock.calls[0][1];
    expect(context.properties.find((p: any) => p.key === 'volume')?.value).toBe(0.9);
    unsubscribe();
  });

  it('stops pushing after unsubscribe', () => {
    const send = vi.fn();
    const unsubscribe = subscribeStoreToRemoteDeckState(useStore, send);
    unsubscribe();
    send.mockClear();

    useStore.setState({ selectedId: 'x', selectedIds: ['x'] });

    expect(send).not.toHaveBeenCalled();
  });
});
