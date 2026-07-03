import { describe, expect, it } from 'vitest';
import { shouldSkipPixiTextForSharedRenderer } from './pixiTextCutover';

describe('pixiTextCutover', () => {
  it('skips Pixi text rendering only when the object type is text and the Rust native frame owns it', () => {
    const sharedRendererTextObjectIds = new Set(['text-1']);

    expect(shouldSkipPixiTextForSharedRenderer({
      objectId: 'text-1',
      objectType: 'text',
      isExporting: false,
      sharedRendererTextObjectIds,
    })).toBe(true);

    expect(shouldSkipPixiTextForSharedRenderer({
      objectId: 'text-1',
      objectType: 'text',
      isExporting: true,
      sharedRendererTextObjectIds,
    })).toBe(true);
  });

  it('does not skip Pixi text rendering for object ids outside the shared renderer ownership set', () => {
    const sharedRendererTextObjectIds = new Set(['text-1']);

    expect(shouldSkipPixiTextForSharedRenderer({
      objectId: 'text-2',
      objectType: 'text',
      isExporting: false,
      sharedRendererTextObjectIds,
    })).toBe(false);
  });

  it('does not skip Pixi rendering for non-text object types even if the id is present', () => {
    const sharedRendererTextObjectIds = new Set(['shape-1']);

    expect(shouldSkipPixiTextForSharedRenderer({
      objectId: 'shape-1',
      objectType: 'shape',
      isExporting: false,
      sharedRendererTextObjectIds,
    })).toBe(false);
  });

  it('does not skip Pixi text rendering when no ownership set is provided', () => {
    expect(shouldSkipPixiTextForSharedRenderer({
      objectId: 'text-1',
      objectType: 'text',
      isExporting: false,
    })).toBe(false);
  });
});
