import { describe, expect, it } from 'vitest';
import { buildAspectLockedScalePatch } from './aspectRatioScale';

describe('buildAspectLockedScalePatch', () => {
  it('keeps scale X and scale Y together by default', () => {
    expect(buildAspectLockedScalePatch({
      currentScaleX: 2,
      currentScaleY: 1,
      changedAxis: 'scaleX',
      nextValue: 4,
      lockAspectRatio: true,
    })).toEqual({
      scaleX: 4,
      scaleY: 2,
    });
  });

  it('allows a single axis to change when aspect locking is disabled', () => {
    expect(buildAspectLockedScalePatch({
      currentScaleX: 2,
      currentScaleY: 1,
      changedAxis: 'scaleY',
      nextValue: 3,
      lockAspectRatio: false,
    })).toEqual({
      scaleY: 3,
    });
  });

  it('uses a neutral ratio when the previous scale is zero', () => {
    expect(buildAspectLockedScalePatch({
      currentScaleX: 0,
      currentScaleY: 2,
      changedAxis: 'scaleX',
      nextValue: 3,
      lockAspectRatio: true,
    })).toEqual({
      scaleX: 3,
      scaleY: 3,
    });
  });
});
