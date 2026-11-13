import { describe, expect, it } from 'vitest';

import {
  diffEvaluationParityFixtureValues,
  floatUlpDistance,
  MAX_FIXTURE_ULP_DISTANCE,
} from './evaluationParityFixtureCompare';

describe('floatUlpDistance', () => {
  it('同一値は 0', () => {
    expect(floatUlpDistance(1.5, 1.5)).toBe(0);
    expect(floatUlpDistance(0, -0)).toBeLessThanOrEqual(MAX_FIXTURE_ULP_DISTANCE);
  });

  it('隣の f64 は 1', () => {
    expect(floatUlpDistance(1, 1 + Number.EPSILON)).toBe(1);
  });

  it('整数の隣は桁違いに大きい（許容に絶対入らない）', () => {
    expect(floatUlpDistance(133, 134)).toBeGreaterThan(1e12);
  });
});

describe('diffEvaluationParityFixtureValues', () => {
  it('完全一致なら差分なし', () => {
    const value = { frames: [{ transform: { translation_y: 80.5 } }], name: 'main' };
    expect(diffEvaluationParityFixtureValues(value, structuredClone(value))).toEqual([]);
  });

  it('実測した 1 ulp の drift（main の translation_y）は許容する', () => {
    const committed = { transform: { translation_y: 80.71356368757303 } };
    const generated = { transform: { translation_y: 80.71356368757304 } };
    expect(floatUlpDistance(80.71356368757303, 80.71356368757304))
      .toBeLessThanOrEqual(MAX_FIXTURE_ULP_DISTANCE);
    expect(diffEvaluationParityFixtureValues(committed, generated)).toEqual([]);
  });

  it('許容を超える数値差はパスつきで報告する', () => {
    const committed = { frames: [{ transform: { translation_y: 80.71 } }] };
    const generated = { frames: [{ transform: { translation_y: 80.72 } }] };
    const differences = diffEvaluationParityFixtureValues(committed, generated);
    expect(differences).toHaveLength(1);
    expect(differences[0].path).toBe('$.frames[0].transform.translation_y');
    expect(differences[0].ulpDistance).toBeGreaterThan(MAX_FIXTURE_ULP_DISTANCE);
  });

  it('整数の変化は報告する', () => {
    const differences = diffEvaluationParityFixtureValues(
      { source_frame: 133 },
      { source_frame: 134 },
    );
    expect(differences).toHaveLength(1);
    expect(differences[0].path).toBe('$.source_frame');
  });

  it('文字列・キーの有無・配列長は厳密に見る', () => {
    expect(diffEvaluationParityFixtureValues({ a: 'x' }, { a: 'y' })).toHaveLength(1);
    expect(diffEvaluationParityFixtureValues({ a: 1 }, { a: 1, b: 2 })).toHaveLength(1);
    expect(diffEvaluationParityFixtureValues({ a: 1, b: 2 }, { a: 1 })).toHaveLength(1);
    expect(diffEvaluationParityFixtureValues([1, 2], [1, 2, 3])).toHaveLength(1);
    expect(diffEvaluationParityFixtureValues({ a: true }, { a: false })).toHaveLength(1);
    expect(diffEvaluationParityFixtureValues({ a: null }, { a: 0 })).toHaveLength(1);
  });
});
