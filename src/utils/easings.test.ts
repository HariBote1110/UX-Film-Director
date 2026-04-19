import { describe, expect, it } from 'vitest';
import { easingFunctions, easingNames, EasingType } from './easings';

const ALL_EASING_TYPES = Object.keys(easingFunctions) as EasingType[];

describe('easingFunctions', () => {
  it.each(ALL_EASING_TYPES)('%s returns 0 at t=0 and 1 at t=1 (within tolerance)', (name) => {
    const fn = easingFunctions[name];
    const atZero = fn(0);
    const atOne = fn(1);
    expect(atZero).toBeGreaterThanOrEqual(-0.0001);
    expect(atZero).toBeLessThanOrEqual(0.0001);
    expect(atOne).toBeGreaterThanOrEqual(1 - 0.0001);
    expect(atOne).toBeLessThanOrEqual(1 + 0.0001);
  });

  it('linear interpolates midpoints', () => {
    expect(easingFunctions.linear(0.25)).toBeCloseTo(0.25, 5);
    expect(easingFunctions.linear(0.75)).toBeCloseTo(0.75, 5);
  });

  it('easeOutQuad is slower than linear at early t', () => {
    const t = 0.25;
    expect(easingFunctions.easeOutQuad(t)).toBeGreaterThan(t);
  });

  it('easeInQuad is slower than linear at late t', () => {
    const t = 0.75;
    expect(easingFunctions.easeInQuad(t)).toBeLessThan(t);
  });
});

describe('easingNames', () => {
  it('has a label for every easing function key', () => {
    ALL_EASING_TYPES.forEach((key) => {
      expect(typeof easingNames[key]).toBe('string');
      expect(easingNames[key].length).toBeGreaterThan(0);
    });
  });

  it('does not declare labels without implementations', () => {
    const nameKeys = Object.keys(easingNames) as EasingType[];
    nameKeys.forEach((key) => {
      expect(easingFunctions[key]).toBeTypeOf('function');
    });
  });
});
