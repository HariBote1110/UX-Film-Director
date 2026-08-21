import { describe, expect, it } from 'vitest';
import type { ShapeObject } from '../types';
import {
  buildEndpointKeyframes,
  evaluateKeyframesPositionAtTime,
  evaluateObjectPositionAtTime,
  normaliseKeyframesForObject,
  shiftKeyframesForObject
} from './keyframes';

const baseShape = (): Pick<
  ShapeObject,
  | 'startTime'
  | 'duration'
  | 'x'
  | 'y'
  | 'endX'
  | 'endY'
  | 'easing'
  | 'keyframes'
  | 'enableAnimation'
> => ({
  startTime: 0,
  duration: 10,
  x: 0,
  y: 0,
  endX: 100,
  endY: 50,
  easing: 'linear',
  keyframes: undefined,
  enableAnimation: false
});

describe('normaliseKeyframesForObject', () => {
  it('returns empty array for missing or empty keyframes', () => {
    const object = baseShape();
    expect(normaliseKeyframesForObject(object, undefined)).toEqual([]);
    expect(normaliseKeyframesForObject(object, [])).toEqual([]);
  });

  it('clamps keyframe times to object range and sorts by time', () => {
    const object = { ...baseShape(), startTime: 5, duration: 4 };
    const keyframes = normaliseKeyframesForObject(object, [
      { id: 'b', time: 20, x: 1, y: 2, easing: 'linear' },
      { id: 'a', time: 4, x: 3, y: 4, easing: 'linear' }
    ]);
    expect(keyframes.map((k) => k.time)).toEqual([5, 9]);
    expect(keyframes[0].id).toBe('a');
    expect(keyframes[1].id).toBe('b');
  });

  it('fills missing easing from object default', () => {
    const object = { ...baseShape(), easing: 'easeInQuad' as const };
    const keyframes = normaliseKeyframesForObject(object, [
      { id: 'k1', time: 0, x: 0, y: 0 },
      { id: 'k2', time: 10, x: 10, y: 10 }
    ]);
    expect(keyframes[0].easing).toBe('easeInQuad');
    expect(keyframes[1].easing).toBe('easeInQuad');
  });
});

describe('evaluateKeyframesPositionAtTime', () => {
  it('returns null when fewer than two keyframes', () => {
    expect(evaluateKeyframesPositionAtTime([], 0)).toBeNull();
    expect(evaluateKeyframesPositionAtTime([{ id: 'a', time: 0, x: 0, y: 0 }], 0)).toBeNull();
  });

  it('returns endpoints outside the span', () => {
    const keyframes = [
      { id: 'a', time: 0, x: 0, y: 0, easing: 'linear' as const },
      { id: 'b', time: 10, x: 100, y: 200, easing: 'linear' as const }
    ];
    expect(evaluateKeyframesPositionAtTime(keyframes, -1)).toEqual({ x: 0, y: 0 });
    expect(evaluateKeyframesPositionAtTime(keyframes, 11)).toEqual({ x: 100, y: 200 });
  });

  it('linearly interpolates between two keyframes at midpoint', () => {
    const keyframes = [
      { id: 'a', time: 0, x: 0, y: 0, easing: 'linear' as const },
      { id: 'b', time: 10, x: 100, y: -50, easing: 'linear' as const }
    ];
    expect(evaluateKeyframesPositionAtTime(keyframes, 5)).toEqual({ x: 50, y: -25 });
  });

  it('accepts keyframes that are not yet sorted by time', () => {
    const keyframes = [
      { id: 'late', time: 10, x: 100, y: 200, easing: 'linear' as const },
      { id: 'early', time: 0, x: 0, y: 0, easing: 'linear' as const }
    ];
    expect(evaluateKeyframesPositionAtTime(keyframes, 5)).toEqual({ x: 50, y: 100 });
  });
});

describe('evaluateObjectPositionAtTime', () => {
  it('uses keyframes when present', () => {
    const object = {
      ...baseShape(),
      keyframes: [
        { id: 'a', time: 0, x: 0, y: 0, easing: 'linear' as const },
        { id: 'b', time: 10, x: 20, y: 40, easing: 'linear' as const }
      ]
    };
    expect(evaluateObjectPositionAtTime(object, 5)).toEqual({ x: 10, y: 20 });
  });

  it('animates between x/y and end when animation enabled', () => {
    const object = {
      ...baseShape(),
      enableAnimation: true,
      startTime: 0,
      duration: 10,
      x: 0,
      y: 0,
      endX: 100,
      endY: 0,
      easing: 'linear' as const
    };
    expect(evaluateObjectPositionAtTime(object, 5)).toEqual({ x: 50, y: 0 });
    expect(evaluateObjectPositionAtTime(object, 0)).toEqual({ x: 0, y: 0 });
    expect(evaluateObjectPositionAtTime(object, 10)).toEqual({ x: 100, y: 0 });
  });

  it('returns static position when no keyframes and animation disabled', () => {
    const object = { ...baseShape(), x: 3, y: 7 };
    expect(evaluateObjectPositionAtTime(object, 999)).toEqual({ x: 3, y: 7 });
  });

  it('clamps keyframe times beyond the clip range, matching path A (normaliseKeyframesForObject)', () => {
    // 回帰テスト: path A（editableRustScene.ts の positionKeyframesForObject）は
    // normaliseKeyframesForObject 経由で keyframe.time を [startTime, startTime+duration] に
    // clamp するが、修正前の path B（evaluateKeyframesPositionAtTime）は生の時刻をそのまま
    // 使っていたため、範囲外 keyframe を持つオブジェクトで最大 19.2px の描画ずれが出ていた
    // （progress/rust-source-of-truth-evaluation-diff.md の keyframe-clamp を参照）。
    const object = {
      ...baseShape(),
      startTime: 4,
      duration: 16, // clamp 後の範囲は [4, 20]
      keyframes: [
        { id: 'k0', time: 4, x: 0, y: 0, easing: 'linear' as const },
        { id: 'k1', time: 16, x: 24, y: 12, easing: 'linear' as const },
        { id: 'k2', time: 28, x: 0, y: 0, easing: 'linear' as const } // 範囲外(> 20)
      ]
    };
    const time = 19.633; // clamp 後の [16, 20] 区間の中

    // path A が使う clamp 規約を、同じ共有関数で明示的に再現する。
    const clamped = normaliseKeyframesForObject(object, object.keyframes);
    const expected = evaluateKeyframesPositionAtTime(clamped, time, object.easing);

    const actual = evaluateObjectPositionAtTime(object, time);
    expect(actual).toEqual(expected);

    // clamp しない生時刻での補間（修正前の path B の挙動）とは一致しないことも確認する。
    const naive = evaluateKeyframesPositionAtTime(object.keyframes, time, object.easing);
    expect(actual).not.toEqual(naive);
  });
});

describe('shiftKeyframesForObject', () => {
  it('returns empty when no keyframes', () => {
    expect(shiftKeyframesForObject(baseShape(), undefined, 1, 2, 3)).toEqual([]);
  });

  it('applies delta time and position then re-normalises', () => {
    const object = baseShape();
    const shifted = shiftKeyframesForObject(
      object,
      [
        { id: 'a', time: 0, x: 0, y: 0, easing: 'linear' as const },
        { id: 'b', time: 10, x: 10, y: 10, easing: 'linear' as const }
      ],
      5,
      1,
      -1
    );
    expect(shifted.map((k) => k.time)).toEqual([5, 10]);
    expect(shifted[0].x).toBe(1);
    expect(shifted[0].y).toBe(-1);
  });
});

describe('buildEndpointKeyframes', () => {
  it('builds start and end keyframes from object endpoints', () => {
    const object = {
      ...baseShape(),
      startTime: 2,
      duration: 8,
      x: 1,
      y: 2,
      endX: 9,
      endY: 8,
      easing: 'easeOutCubic' as const
    };
    const keyframes = buildEndpointKeyframes(object);
    expect(keyframes).toHaveLength(2);
    expect(keyframes[0].time).toBe(2);
    expect(keyframes[1].time).toBe(10);
    expect(keyframes[0].x).toBe(1);
    expect(keyframes[1].x).toBe(9);
    expect(keyframes[0].easing).toBe('easeOutCubic');
  });
});
