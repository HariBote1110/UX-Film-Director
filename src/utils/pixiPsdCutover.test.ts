import { describe, expect, it } from 'vitest';
import { shouldSkipPixiPsdForSharedRenderer } from './pixiPsdCutover';

describe('pixiPsdCutover', () => {
  it('skips Pixi PSD rendering only for shared renderer owned preview PSD clips', () => {
    const sharedRendererPsdObjectIds = new Set(['psd-1']);

    expect(shouldSkipPixiPsdForSharedRenderer({
      objectId: 'psd-1',
      objectType: 'psd',
      isExporting: false,
      sharedRendererPsdObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiPsdForSharedRenderer({
      objectId: 'psd-1',
      objectType: 'psd',
      isExporting: true,
      sharedRendererPsdObjectIds,
    })).toBe(false);
    expect(shouldSkipPixiPsdForSharedRenderer({
      objectId: 'image-1',
      objectType: 'image',
      isExporting: false,
      sharedRendererPsdObjectIds,
    })).toBe(false);
  });
});
