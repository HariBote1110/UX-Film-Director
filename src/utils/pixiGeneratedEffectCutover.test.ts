import { describe, expect, it } from 'vitest';
import { shouldSkipPixiGeneratedEffectForSharedRenderer } from './pixiGeneratedEffectCutover';

describe('pixiGeneratedEffectCutover', () => {
  it('skips Pixi generated effect rendering when the Rust native frame owns it', () => {
    const sharedRendererGeneratedEffectObjectIds = new Set(['waveform-1', 'particle-1', 'barcode-1', 'puzzle-1', 'colour-wheel-1', 'gourd-1']);

    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'waveform-1',
      objectType: 'audio_visualization',
      isExporting: false,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'particle-1',
      objectType: 'particle',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'barcode-1',
      objectType: 'barcode',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'puzzle-1',
      objectType: 'puzzle_piece',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'colour-wheel-1',
      objectType: 'colour_wheel',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'gourd-1',
      objectType: 'gourd',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'text-1',
      objectType: 'text',
      isExporting: false,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(false);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'waveform-2',
      objectType: 'audio_visualization',
      isExporting: false,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(false);
  });
});
