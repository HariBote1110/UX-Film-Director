import { describe, expect, it } from 'vitest';
import { fpsToFrameRate, secondsToFrameIndex } from './rustSceneFrameRate';

describe('secondsToFrameIndex', () => {
  it('maps t=0 to frame 0 for any positive fps', () => {
    expect(secondsToFrameIndex(0, 60)).toBe(0);
    expect(secondsToFrameIndex(0, 23.976)).toBe(0);
    expect(secondsToFrameIndex(0, 0.5)).toBe(0);
  });

  it('rounds to the nearest frame', () => {
    expect(secondsToFrameIndex(1, 60)).toBe(60);
    expect(secondsToFrameIndex(2.5, 60)).toBe(150);
    expect(secondsToFrameIndex(1 / 60, 60)).toBe(1);
  });

  it('rounds half up, matching Math.round', () => {
    expect(secondsToFrameIndex(0.5, 1)).toBe(1);
    expect(secondsToFrameIndex(0.049, 10)).toBe(0);
    expect(secondsToFrameIndex(0.05, 10)).toBe(1);
  });

  it('clamps negative times to frame 0', () => {
    expect(secondsToFrameIndex(-5, 60)).toBe(0);
    expect(secondsToFrameIndex(-0.0001, 60)).toBe(0);
  });

  it('treats non-finite seconds as zero', () => {
    expect(secondsToFrameIndex(Number.NaN, 60)).toBe(0);
    expect(secondsToFrameIndex(Number.POSITIVE_INFINITY, 60)).toBe(0);
  });

  it('falls back to 60 fps for non-positive or non-finite fps', () => {
    expect(secondsToFrameIndex(1, 0)).toBe(60);
    expect(secondsToFrameIndex(1, -30)).toBe(60);
    expect(secondsToFrameIndex(1, Number.NaN)).toBe(60);
    expect(secondsToFrameIndex(1, Number.POSITIVE_INFINITY)).toBe(60);
  });
});

describe('fpsToFrameRate', () => {
  it('expresses integer fps as an n/1 ratio', () => {
    expect(fpsToFrameRate(60)).toEqual({ numerator: 60, denominator: 1 });
    expect(fpsToFrameRate(24)).toEqual({ numerator: 24, denominator: 1 });
    expect(fpsToFrameRate(1)).toEqual({ numerator: 1, denominator: 1 });
  });

  it('falls back to 60/1 for invalid fps', () => {
    expect(fpsToFrameRate(0)).toEqual({ numerator: 60, denominator: 1 });
    expect(fpsToFrameRate(-24)).toEqual({ numerator: 60, denominator: 1 });
    expect(fpsToFrameRate(Number.NaN)).toEqual({ numerator: 60, denominator: 1 });
  });

  it('reduces fractional fps against a 1000 denominator', () => {
    expect(fpsToFrameRate(23.976)).toEqual({ numerator: 2997, denominator: 125 });
    expect(fpsToFrameRate(29.97)).toEqual({ numerator: 2997, denominator: 100 });
    expect(fpsToFrameRate(59.94)).toEqual({ numerator: 2997, denominator: 50 });
    expect(fpsToFrameRate(0.5)).toEqual({ numerator: 1, denominator: 2 });
  });

  it('keeps numerator and denominator positive and reduced', () => {
    const rate = fpsToFrameRate(23.976);
    expect(rate.numerator).toBeGreaterThan(0);
    expect(rate.denominator).toBeGreaterThan(0);
    let a = rate.numerator;
    let b = rate.denominator;
    while (b !== 0) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }
    expect(a).toBe(1);
  });

  it('snaps values within 1e-6 of an integer to n/1', () => {
    expect(fpsToFrameRate(60.0000001)).toEqual({ numerator: 60, denominator: 1 });
  });
});
