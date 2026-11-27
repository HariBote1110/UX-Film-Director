import { describe, expect, it } from 'vitest';
import {
  computeRelativeDragValue,
  computeSliderValue,
  createSendThrottle,
} from '../../shared/remoteDeckSlider';

describe('computeSliderValue', () => {
  const base = { startValue: 0.5, trackWidth: 300, min: 0, max: 1, verticalOffset: 0 };

  it('maps a full-track horizontal swipe to the full range', () => {
    expect(computeSliderValue({ ...base, startValue: 0, deltaX: 300 })).toBe(1);
  });

  it('moves proportionally for partial swipes', () => {
    expect(computeSliderValue({ ...base, deltaX: 150 })).toBeCloseTo(1, 5);
    expect(computeSliderValue({ ...base, deltaX: -75 })).toBeCloseTo(0.25, 5);
  });

  it('clamps to min and max', () => {
    expect(computeSliderValue({ ...base, deltaX: 10_000 })).toBe(1);
    expect(computeSliderValue({ ...base, deltaX: -10_000 })).toBe(0);
  });

  it('reduces sensitivity with vertical offset for fine adjustment', () => {
    const coarse = computeSliderValue({ ...base, deltaX: 100 });
    const fine = computeSliderValue({ ...base, deltaX: 100, verticalOffset: 100 });
    expect(Math.abs(fine - base.startValue)).toBeLessThan(Math.abs(coarse - base.startValue));
    expect(fine).toBeGreaterThan(base.startValue);
  });

  it('quantises to the given step', () => {
    const value = computeSliderValue({ ...base, deltaX: 40, step: 0.1 });
    expect(Math.round(value * 10)).toBeCloseTo(value * 10, 10);
  });
});

describe('computeRelativeDragValue', () => {
  it('moves the value by deltaX times unitPerPx', () => {
    expect(computeRelativeDragValue({ startValue: 100, deltaX: 50, unitPerPx: 2 })).toBe(200);
    expect(computeRelativeDragValue({ startValue: 100, deltaX: -30, unitPerPx: 1 })).toBe(70);
  });

  it('applies vertical-offset fine adjustment like the slider', () => {
    const coarse = computeRelativeDragValue({ startValue: 0, deltaX: 100, unitPerPx: 1 });
    const fine = computeRelativeDragValue({
      startValue: 0,
      deltaX: 100,
      unitPerPx: 1,
      verticalOffset: 100,
    });
    expect(Math.abs(fine)).toBeLessThan(Math.abs(coarse));
    expect(fine).toBeGreaterThan(0);
  });

  it('clamps to optional min/max and quantises to step', () => {
    expect(
      computeRelativeDragValue({ startValue: 170, deltaX: 100, unitPerPx: 1, min: -180, max: 180 }),
    ).toBe(180);
    expect(
      computeRelativeDragValue({ startValue: 0, deltaX: 33, unitPerPx: 0.1, step: 1 }),
    ).toBe(3);
  });
});

describe('createSendThrottle', () => {
  it('emits the first value immediately', () => {
    let time = 0;
    const throttle = createSendThrottle({ intervalMs: 33, now: () => time });
    expect(throttle.offer(0.1)).toBe(0.1);
  });

  it('suppresses values inside the interval and emits after it elapses', () => {
    let time = 0;
    const throttle = createSendThrottle({ intervalMs: 33, now: () => time });
    throttle.offer(0.1);

    time = 10;
    expect(throttle.offer(0.2)).toBeNull();

    time = 40;
    expect(throttle.offer(0.3)).toBe(0.3);
  });

  it('flush returns the last suppressed value once', () => {
    let time = 0;
    const throttle = createSendThrottle({ intervalMs: 33, now: () => time });
    throttle.offer(0.1);
    time = 5;
    throttle.offer(0.2);

    expect(throttle.flush()).toBe(0.2);
    expect(throttle.flush()).toBeNull();
  });

  it('flush returns null when nothing was suppressed', () => {
    let time = 0;
    const throttle = createSendThrottle({ intervalMs: 33, now: () => time });
    throttle.offer(0.1);
    expect(throttle.flush()).toBeNull();
  });
});
