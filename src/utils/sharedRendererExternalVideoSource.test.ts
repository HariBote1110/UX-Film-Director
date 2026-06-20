import { describe, expect, it } from 'vitest';
import {
  createSharedRendererExternalVideoSource,
  loadExternalVideoSourceMetadata,
  type SharedRendererExternalVideoElementLike,
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
});
