import { describe, expect, it } from 'vitest';
import { shouldSkipPixiImageForSharedRenderer } from './pixiImageCutover';

describe('pixiImageCutover', () => {
  it('skips Pixi image rendering only for shared renderer owned preview image clips', () => {
    const sharedRendererImageObjectIds = new Set(['image-1']);

    expect(shouldSkipPixiImageForSharedRenderer({
      objectId: 'image-1',
      objectType: 'image',
      isExporting: false,
      sharedRendererImageObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiImageForSharedRenderer({
      objectId: 'image-1',
      objectType: 'image',
      isExporting: true,
      sharedRendererImageObjectIds,
    })).toBe(false);
    expect(shouldSkipPixiImageForSharedRenderer({
      objectId: 'shape-1',
      objectType: 'shape',
      isExporting: false,
      sharedRendererImageObjectIds,
    })).toBe(false);
  });
});
