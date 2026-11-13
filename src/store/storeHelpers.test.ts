import { describe, expect, it } from 'vitest';

import type { TimelineObject } from '../types';
import { calculateAutoDuration, growDurationToFit } from './storeHelpers';

const obj = (startTime: number, duration: number): TimelineObject => (
  { startTime, duration } as TimelineObject
);

describe('calculateAutoDuration', () => {
  it('空なら 30、短い内容なら下限 10', () => {
    expect(calculateAutoDuration([])).toBe(30);
    expect(calculateAutoDuration([obj(0, 5)])).toBe(10);
    expect(calculateAutoDuration([obj(10, 32)])).toBe(42);
  });
});

describe('growDurationToFit', () => {
  it('明示設定した尺は内容が短くても縮まない', () => {
    expect(growDurationToFit(60, [])).toBe(60);
    expect(growDurationToFit(60, [obj(0, 20)])).toBe(60);
  });

  it('内容がはみ出すときだけ伸びる', () => {
    expect(growDurationToFit(10, [obj(0, 50)])).toBe(50);
    expect(growDurationToFit(30, [obj(40, 5)])).toBe(45);
  });

  it('現在の duration が不正なら自動計算にフォールバックする', () => {
    expect(growDurationToFit(Number.NaN, [])).toBe(30);
    expect(growDurationToFit(0, [obj(0, 12)])).toBe(12);
  });
});
