import { describe, expect, it } from 'vitest';
import { evaluateRealisticHeavyEditPlaybackClockHealth } from './realisticHeavyEditPlaybackClockHealth';

// このゲートが必要な背景は realisticHeavyEditPlaybackClockHealth.ts の
// ファイル冒頭コメントを参照。要点: Electronウィンドウが他アプリに隠れる等で
// rAFがスロットリングされると、rafSampleCount/rafMeanMsが桁違いに悪化する
// のに総合PASSしてしまい、「改善した」と誤読しかねない実測事故が起きかけた。
describe('evaluateRealisticHeavyEditPlaybackClockHealth', () => {
  it('正常値（60fps相当）では healthy: true を返し reason を含まない', () => {
    const result = evaluateRealisticHeavyEditPlaybackClockHealth({
      rafSampleCount: 178,
      rafMeanMs: 16.8,
      playbackMs: 3_000,
    });
    expect(result.healthy).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('実測されたスロットリング値では healthy: false, reason: rafStarved を返す', () => {
    const result = evaluateRealisticHeavyEditPlaybackClockHealth({
      rafSampleCount: 9,
      rafMeanMs: 10_161.6,
      playbackMs: 3_000,
    });
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('rafStarved');
  });

  it('rafSampleCount が expectedMinRafSampleCount ちょうどのとき healthy: true', () => {
    const result = evaluateRealisticHeavyEditPlaybackClockHealth({
      rafSampleCount: 90,
      rafMeanMs: 16.8,
      playbackMs: 3_000,
    });
    expect(result.expectedMinRafSampleCount).toBe(90);
    expect(result.healthy).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('rafSampleCount が expectedMinRafSampleCount より1つ下のとき healthy: false, reason: rafStarved', () => {
    const result = evaluateRealisticHeavyEditPlaybackClockHealth({
      rafSampleCount: 89,
      rafMeanMs: 16.8,
      playbackMs: 3_000,
    });
    expect(result.expectedMinRafSampleCount).toBe(90);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('rafStarved');
  });

  it('rafSampleCount は十分だが rafMeanMs が51msのとき healthy: false, reason: rafIntervalTooLong', () => {
    const result = evaluateRealisticHeavyEditPlaybackClockHealth({
      rafSampleCount: 178,
      rafMeanMs: 51,
      playbackMs: 3_000,
    });
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('rafIntervalTooLong');
  });

  it('expectedMinRafSampleCount は playbackMs から30fps相当で導出される（1000msなら30）', () => {
    const result = evaluateRealisticHeavyEditPlaybackClockHealth({
      rafSampleCount: 60,
      rafMeanMs: 16.8,
      playbackMs: 1_000,
    });
    expect(result.expectedMinRafSampleCount).toBe(30);
  });

  it('rafStarved と rafIntervalTooLong の両方に該当する場合は rafStarved を優先する', () => {
    const result = evaluateRealisticHeavyEditPlaybackClockHealth({
      rafSampleCount: 9,
      rafMeanMs: 10_161.6,
      playbackMs: 3_000,
    });
    expect(result.reason).toBe('rafStarved');
  });
});
