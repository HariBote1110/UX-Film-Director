import { describe, expect, it } from 'vitest';
import { shouldSkipPixiSolidColourForSharedRenderer } from './pixiSolidColourCutover';

describe('shouldSkipPixiSolidColourForSharedRenderer', () => {
  it('skips only preview shape objects owned by the shared renderer', () => {
    const sharedRendererSolidColourObjectIds = new Set(['shape-1']);

    expect(shouldSkipPixiSolidColourForSharedRenderer({
      objectId: 'shape-1',
      objectType: 'shape',
      isExporting: false,
      sharedRendererSolidColourObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiSolidColourForSharedRenderer({
      objectId: 'video-1',
      objectType: 'video',
      isExporting: false,
      sharedRendererSolidColourObjectIds,
    })).toBe(false);
    expect(shouldSkipPixiSolidColourForSharedRenderer({
      objectId: 'shape-2',
      objectType: 'shape',
      isExporting: false,
      sharedRendererSolidColourObjectIds,
    })).toBe(false);
  });

  it('keeps Pixi shape rendering during export until shared renderer export parity exists', () => {
    expect(shouldSkipPixiSolidColourForSharedRenderer({
      objectId: 'shape-1',
      objectType: 'shape',
      isExporting: true,
      sharedRendererSolidColourObjectIds: new Set(['shape-1']),
    })).toBe(false);
  });
});
