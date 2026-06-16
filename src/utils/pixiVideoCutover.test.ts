import { describe, expect, it } from 'vitest';
import {
  clearPixiVideoForSharedRenderer,
  shouldSkipPixiVideoForSharedRenderer,
} from './pixiVideoCutover';

describe('shouldSkipPixiVideoForSharedRenderer', () => {
  it('skips only preview video objects owned by the shared renderer', () => {
    const sharedRendererVideoObjectIds = new Set(['video-1']);

    expect(shouldSkipPixiVideoForSharedRenderer({
      objectId: 'video-1',
      objectType: 'video',
      isExporting: false,
      sharedRendererVideoObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiVideoForSharedRenderer({
      objectId: 'image-1',
      objectType: 'image',
      isExporting: false,
      sharedRendererVideoObjectIds,
    })).toBe(false);
    expect(shouldSkipPixiVideoForSharedRenderer({
      objectId: 'video-2',
      objectType: 'video',
      isExporting: false,
      sharedRendererVideoObjectIds,
    })).toBe(false);
  });

  it('keeps Pixi video rendering during export until shared renderer export parity exists', () => {
    expect(shouldSkipPixiVideoForSharedRenderer({
      objectId: 'video-1',
      objectType: 'video',
      isExporting: true,
      sharedRendererVideoObjectIds: new Set(['video-1']),
    })).toBe(false);
  });

  it('clears Pixi video children, HTML video, and frame textures on cutover', () => {
    const destroyedChildren: unknown[] = [];
    const child = {
      destroy: (options: unknown) => destroyedChildren.push(options),
    };
    const container = {
      removeChildren: () => [child],
    };
    const videoActions: string[] = [];
    const video = {
      pause: () => videoActions.push('pause'),
      src: 'file:///tmp/video.mp4',
      load: () => videoActions.push('load'),
    };
    const videoElements = new Map<string, unknown>([['video-1', video]]);
    const textureActions: unknown[] = [];
    const videoSourceActions: string[] = [];
    const videoFrameTextures = new Map<string, unknown>([
      ['video-1', {
        uploadMode: 'video-source',
        videoSource: {
          destroy: () => videoSourceActions.push('destroyVideoSource'),
        },
        texture: {
          destroy: (destroyBase: boolean) => textureActions.push(destroyBase),
        },
      }],
    ]);

    clearPixiVideoForSharedRenderer({
      objectId: 'video-1',
      container,
      videoElements,
      videoFrameTextures,
    });

    expect(destroyedChildren).toEqual([{ children: true, texture: false, context: true }]);
    expect(videoActions).toEqual(['pause', 'load']);
    expect(video).toMatchObject({ src: '' });
    expect(videoElements.has('video-1')).toBe(false);
    expect(videoSourceActions).toEqual(['destroyVideoSource']);
    expect(textureActions).toEqual([false]);
    expect(videoFrameTextures.has('video-1')).toBe(false);
  });
});
