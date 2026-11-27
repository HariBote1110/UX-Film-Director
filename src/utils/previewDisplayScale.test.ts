import { describe, expect, it } from 'vitest';
import { computePreviewDisplayScale, fallbackAutoFitScale } from './previewDisplayScale';

describe('computePreviewDisplayScale', () => {
  it('returns 1 for pixel-perfect mode regardless of panel size', () => {
    expect(computePreviewDisplayScale('pixelPerfect', 1920, 1080, 400, 300)).toBe(1);
    expect(computePreviewDisplayScale('pixelPerfect', 1280, 720, 2000, 1200)).toBe(1);
  });

  it('fits project into the panel for auto mode', () => {
    const s = computePreviewDisplayScale('autoFit', 1920, 1080, 960, 540);
    expect(s).toBeCloseTo(Math.min(960 / 1920, 540 / 1080) * 0.96, 5);
  });

  it('uses legacy-style fallback when the panel is not yet measured', () => {
    const s = computePreviewDisplayScale('autoFit', 1920, 1080, 0, 0);
    expect(s).toBe(fallbackAutoFitScale(1920, 1080));
    expect(s).toBeCloseTo(Math.min(0.7, 800 / 1920), 5);
  });

  it('clamps a tiny fit scale to a minimum', () => {
    const s = computePreviewDisplayScale('autoFit', 4000, 4000, 80, 80);
    expect(s).toBeGreaterThanOrEqual(0.05);
  });
});

describe('fallbackAutoFitScale', () => {
  it('caps at 0.7 for small projects', () => {
    expect(fallbackAutoFitScale(640, 480)).toBe(0.7);
  });
});
