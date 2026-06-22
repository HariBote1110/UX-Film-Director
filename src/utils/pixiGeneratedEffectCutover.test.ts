import { describe, expect, it } from 'vitest';
import { shouldSkipPixiGeneratedEffectForSharedRenderer } from './pixiGeneratedEffectCutover';

describe('pixiGeneratedEffectCutover', () => {
  it('skips Pixi generated effect rendering when the Rust native frame owns it', () => {
    const sharedRendererGeneratedEffectObjectIds = new Set(['waveform-1', 'audio-sphere-1', 'particle-1', 'barcode-1', 'puzzle-1', 'colour-wheel-1', 'gourd-1', 'gear-1', 'track-bar-1', 'pie-chart-1', 'histogram-1', 'getcolor-dot-field-1', 'hksy-checker-grid-1', 'spherical-field-1', 'tone-curve-1', 'sunburst-1', 'circular-arrow-1', 'triangle-bracket-1', 'tartan-check-1', 'houndstooth-1', 'yagasuri-1', 'paper-airplane-1', 'asanoha-pattern-1', 'focus-lines-plus-1', 'random-line-ex-1', 'hologram-1', 'plain-effector-line-1', 'protractor-1', 'shaking-polygon-1']);

    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'waveform-1',
      objectType: 'audio_visualization',
      isExporting: false,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'audio-sphere-1',
      objectType: 'audio_sphere',
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
      objectId: 'tone-curve-1',
      objectType: 'tone_curve',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'getcolor-dot-field-1',
      objectType: 'getcolor_dot_field',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'hksy-checker-grid-1',
      objectType: 'hksy_checker_grid',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'spherical-field-1',
      objectType: 'spherical_field',
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
      objectId: 'triangle-bracket-1',
      objectType: 'triangle_bracket',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'tartan-check-1',
      objectType: 'tartan_check',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'houndstooth-1',
      objectType: 'houndstooth',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'yagasuri-1',
      objectType: 'yagasuri',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'paper-airplane-1',
      objectType: 'paper_airplane',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'asanoha-pattern-1',
      objectType: 'asanoha_pattern',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'focus-lines-plus-1',
      objectType: 'focus_lines_plus',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'random-line-ex-1',
      objectType: 'random_line_ex',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'hologram-1',
      objectType: 'hologram',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'plain-effector-line-1',
      objectType: 'plain_effector_line',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'protractor-1',
      objectType: 'protractor',
      isExporting: true,
      sharedRendererGeneratedEffectObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiGeneratedEffectForSharedRenderer({
      objectId: 'shaking-polygon-1',
      objectType: 'shaking_polygon',
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
