import { describe, expect, it } from 'vitest';
import {
  createSharedRendererExternalVideoSource,
  loadExternalVideoSourceMetadata,
  syncSharedRendererExternalVideoPlayback,
  type SharedRendererExternalVideoElementLike,
  type SharedRendererExternalVideoPlaybackState,
} from './sharedRendererExternalVideoSource';

const fakeVideoElement = (
  overrides: Partial<SharedRendererExternalVideoElementLike> = {}
): SharedRendererExternalVideoElementLike => ({
  src: '',
  preload: '',
  muted: false,
  loop: false,
  playsInline: false,
  currentTime: 0,
  duration: 12.5,
  videoWidth: 3840,
  videoHeight: 2160,
  onloadedmetadata: null,
  onerror: null,
  play: async () => undefined,
  pause: () => undefined,
  load: () => undefined,
  ...overrides,
});

describe('sharedRendererExternalVideoSource', () => {
  it('creates a presenter-owned external video source without exposing pixel bytes', async () => {
    const calls: string[] = [];
    const element = fakeVideoElement({
      play: async () => {
        calls.push('play');
      },
      pause: () => {
        calls.push('pause');
      },
      load: () => {
        calls.push('load');
      },
    });

    const source = createSharedRendererExternalVideoSource({
      url: 'file:///Volumes/ExtendSSD-W/GX020052.MP4',
      elementFactory: () => element,
    });

    expect(source.source).toBe(element);
    expect(element.src).toBe('file:///Volumes/ExtendSSD-W/GX020052.MP4');
    expect(element.preload).toBe('auto');
    expect(element.muted).toBe(true);
    expect(element.playsInline).toBe(true);

    source.seekTo(1.25);
    expect(element.currentTime).toBe(1.25);
    await source.play();
    source.pause();
    source.dispose();

    expect(calls).toEqual(['play', 'pause', 'pause', 'load']);
    expect(element.src).toBe('');
    expect(element.onloadedmetadata).toBeNull();
    expect(element.onerror).toBeNull();
  });

  it('loads metadata through the isolated external video element provider', async () => {
    const element = fakeVideoElement();
    const metadataPromise = loadExternalVideoSourceMetadata('blob:clip', () => element);

    expect(element.preload).toBe('metadata');
    expect(element.src).toBe('blob:clip');
    element.onloadedmetadata?.();

    await expect(metadataPromise).resolves.toEqual({
      duration: 12.5,
      width: 3840,
      height: 2160,
    });
  });

  it('avoids repeated timeline seeks while an external video source is already playing near the target time', async () => {
    const calls: string[] = [];
    const element = fakeVideoElement({
      play: async () => {
        calls.push('play');
      },
      pause: () => {
        calls.push('pause');
      },
    });
    const source = createSharedRendererExternalVideoSource({
      url: 'file:///Volumes/ExtendSSD-W/GX020052.MP4',
      elementFactory: () => element,
    });
    const playbackState: SharedRendererExternalVideoPlaybackState = {};

    syncSharedRendererExternalVideoPlayback({
      source,
      playbackState,
      targetTimeSeconds: 10,
      isPlaying: true,
    });
    expect(element.currentTime).toBe(10);
    expect(calls).toEqual(['play']);
    expect(playbackState.seekCount).toBe(1);
    expect(playbackState.playCount).toBe(1);

    element.currentTime = 10.12;
    syncSharedRendererExternalVideoPlayback({
      source,
      playbackState,
      targetTimeSeconds: 10.18,
      isPlaying: true,
    });
    expect(element.currentTime).toBe(10.12);
    expect(calls).toEqual(['play']);
    expect(playbackState.seekCount).toBe(1);
    expect(playbackState.suppressedSeekCount).toBe(1);
    expect(playbackState.lastDriftSeconds).toBeCloseTo(0.06);

    syncSharedRendererExternalVideoPlayback({
      source,
      playbackState,
      targetTimeSeconds: 11,
      isPlaying: false,
    });
    expect(element.currentTime).toBe(11);
    expect(calls).toEqual(['play', 'pause']);
    expect(playbackState.seekCount).toBe(2);
    expect(playbackState.pauseCount).toBe(1);
  });

  it('throttles near-target playback sync checks while the video element is already playing', async () => {
    const calls: string[] = [];
    const element = fakeVideoElement({
      play: async () => {
        calls.push('play');
      },
      pause: () => {
        calls.push('pause');
      },
    });
    const source = createSharedRendererExternalVideoSource({
      url: 'file:///Volumes/ExtendSSD-W/GX020052.MP4',
      elementFactory: () => element,
    });
    const playbackState: SharedRendererExternalVideoPlaybackState = {};

    syncSharedRendererExternalVideoPlayback({
      source,
      playbackState,
      targetTimeSeconds: 10,
      isPlaying: true,
      minimumPlayingSyncIntervalMs: 50,
      nowMs: 1000,
    });
    element.currentTime = 10.01;

    const throttled = syncSharedRendererExternalVideoPlayback({
      source,
      playbackState,
      targetTimeSeconds: 10.02,
      isPlaying: true,
      minimumPlayingSyncIntervalMs: 50,
      nowMs: 1020,
    });
    expect(throttled).toMatchObject({
      sought: false,
      played: false,
      paused: false,
      throttled: true,
    });
    expect(calls).toEqual(['play']);
    expect(playbackState.seekCount).toBe(1);
    expect(playbackState.suppressedSeekCount).toBeUndefined();
    expect(playbackState.throttledSyncCount).toBe(1);
    expect(playbackState.lastDriftSeconds).toBe(10);

    const counted = syncSharedRendererExternalVideoPlayback({
      source,
      playbackState,
      targetTimeSeconds: 10.08,
      isPlaying: true,
      minimumPlayingSyncIntervalMs: 50,
      nowMs: 1060,
    });
    expect(counted).toMatchObject({
      sought: false,
      throttled: false,
    });
    expect(playbackState.suppressedSeekCount).toBe(1);
  });

  it('notifies once via requestVideoFrameCallback when the next presentable frame is ready', () => {
    let registeredCallback: (() => void) | null = null;
    let cancelledHandle: number | null = null;
    const element = fakeVideoElement({
      readyState: 0,
      requestVideoFrameCallback: (callback: () => void) => {
        registeredCallback = callback;
        return 7;
      },
      cancelVideoFrameCallback: (handle: number) => {
        cancelledHandle = handle;
      },
    });
    const source = createSharedRendererExternalVideoSource({
      url: 'file:///clip.mp4',
      elementFactory: () => element,
    });

    let readyCount = 0;
    const unregister = source.notifyOnNextPresentableFrame(() => {
      readyCount += 1;
    });

    expect(registeredCallback).not.toBeNull();
    expect(readyCount).toBe(0);
    registeredCallback?.();
    expect(readyCount).toBe(1);

    unregister();
    expect(cancelledHandle).toBe(7);
  });

  it('falls back to a one-shot seeked listener when requestVideoFrameCallback is unavailable', () => {
    const listeners = new Map<string, Array<() => void>>();
    const element = fakeVideoElement({
      readyState: 0,
      addEventListener: (type: string, listener: () => void) => {
        const bucket = listeners.get(type) ?? [];
        bucket.push(listener);
        listeners.set(type, bucket);
      },
      removeEventListener: (type: string, listener: () => void) => {
        const bucket = listeners.get(type) ?? [];
        listeners.set(type, bucket.filter((entry) => entry !== listener));
      },
    });
    const source = createSharedRendererExternalVideoSource({
      url: 'file:///clip.mp4',
      elementFactory: () => element,
    });

    let readyCount = 0;
    const unregister = source.notifyOnNextPresentableFrame(() => {
      readyCount += 1;
    });

    expect((listeners.get('seeked') ?? []).length).toBe(1);
    listeners.get('seeked')?.[0]?.();
    expect(readyCount).toBe(1);

    // A second event must not fire the one-shot callback again.
    listeners.get('seeked')?.[0]?.();
    expect(readyCount).toBe(1);

    // All listeners are removed after firing / unregistering.
    unregister();
    const remaining = [...listeners.values()].reduce((total, bucket) => total + bucket.length, 0);
    expect(remaining).toBe(0);
  });
});
