import { describe, expect, it } from 'vitest';
import { shouldSkipPixiVideoForSharedRenderer } from './pixiVideoCutover';

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
});
