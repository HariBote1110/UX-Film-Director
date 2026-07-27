import { describe, expect, it } from 'vitest';
import { resolveRealisticHeavyEditPresenterRestarts } from './realisticHeavyEditPresenterRestarts';

// この診断指標が必要な背景は realisticHeavyEditPresenterRestarts.ts の
// ファイル冒頭コメントを参照。要点: shared renderer presenter のフル再起動は
// 約28ms/回のコストがあり、Reactのコミット回数よりも実CPUコストに直結する。
describe('resolveRealisticHeavyEditPresenterRestarts', () => {
  it('正常値では before/after をそのまま数値化し duringPlayback を差分として返す', () => {
    const result = resolveRealisticHeavyEditPresenterRestarts('5', '108');
    expect(result.before).toBe(5);
    expect(result.after).toBe(108);
    expect(result.duringPlayback).toBe(103);
  });

  it('undefined はどちらも0として扱う', () => {
    const result = resolveRealisticHeavyEditPresenterRestarts(undefined, undefined);
    expect(result.before).toBe(0);
    expect(result.after).toBe(0);
    expect(result.duringPlayback).toBe(0);
  });

  it('空文字は0として扱う', () => {
    const result = resolveRealisticHeavyEditPresenterRestarts('', '');
    expect(result.before).toBe(0);
    expect(result.after).toBe(0);
    expect(result.duringPlayback).toBe(0);
  });

  it('非数値文字列（\'abc\'）は0として扱う', () => {
    const result = resolveRealisticHeavyEditPresenterRestarts('abc', 'abc');
    expect(result.before).toBe(0);
    expect(result.after).toBe(0);
    expect(result.duringPlayback).toBe(0);
  });

  // presenterがリセットされる等でafter < beforeとなっても、E2Eの診断指標として
  // 負の「再起動回数」は意味を持たない（再起動は減らない前提の計測区間である
  // ため、負値は必ず計測条件の異常を示す）。呼び出し側でE2Eを落とさないために
  // ここでは例外を投げず0にクランプする。
  it('after < before のとき duringPlayback は負にならず0にクランプされる', () => {
    const result = resolveRealisticHeavyEditPresenterRestarts('108', '5');
    expect(result.before).toBe(108);
    expect(result.after).toBe(5);
    expect(result.duringPlayback).toBe(0);
  });
});
