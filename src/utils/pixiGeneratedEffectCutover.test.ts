import { describe, expect, it } from 'vitest';
import { shouldSkipPixiGeneratedEffectForSharedRenderer } from './pixiGeneratedEffectCutover';

describe('pixiGeneratedEffectCutover', () => {
  it('skips Pixi generated effect rendering when the Rust native frame owns it', () => {
    const sharedRendererGeneratedEffectObjectIds = new Set(['waveform-1', 'particle-1', 'barcode-1', 'puzzle-1', 'colour-wheel-1', 'gourd-1', 'gear-1', 'track-bar-1', 'pie-chart-1', 'histogram-1', 'sunburst-1', 'circular-arrow-1']);

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
      objectId: 'gear-1',
      objectType: 'gear',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'track-bar-1',
      objectType: 'track_bar',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'pie-chart-1',
      objectType: 'pie_chart',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'histogram-1',
      objectType: 'histogram',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'sunburst-1',
      objectType: 'sunburst',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'circular-arrow-1',
      objectType: 'circular_arrow',
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
