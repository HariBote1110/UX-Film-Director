import { describe, expect, it } from 'vitest';
import {
  resolveSharedRendererNativeReuseReplayTime,
} from './sharedRendererNativeReuseCadence';

describe('sharedRendererNativeReuseCadence', () => {
  it('catches up to a pending native reuse replay far behind the catch-up threshold after a slow decode', () => {
    // 元は「常に1フレームずつ」だったが、この規模の遅延（2.25秒 = 135フレーム）を
    // 1フレームずつのクランプで追う設計だと Canvas が永遠にヘッドへ追いつけない
    // ため、閾値超過時は pendingTime へ直接ジャンプする契約へ変更した。
    const replayTime = resolveSharedRendererNativeReuseReplayTime({
      requestedTime: 1,
      pendingTime: 3.25,
      previewFps: 60,
    });

    expect(replayTime).toBe(3.25);
  });

  it('keeps a pending native reuse replay time when it is already near the decoded frame', () => {
    const replayTime = resolveSharedRendererNativeReuseReplayTime({
      requestedTime: 1,
      pendingTime: 1.016,
      previewFps: 60,
    });

    expect(replayTime).toBe(1.016);
  });

  it('still clamps to a single preview frame when the decode lag is below the catch-up threshold', () => {
    // 6 フレーム未満（60fps で 5/60 秒）の遅延は従来どおり 1 フレームずつ追いつく。
    const replayTime = resolveSharedRendererNativeReuseReplayTime({
      requestedTime: 1,
      pendingTime: 1 + (5 / 60),
      previewFps: 60,
    });

    expect(replayTime).toBeCloseTo(1 + (1 / 60), 6);
  });

  it('catches up immediately once the pending replay falls more than the catch-up frame threshold behind', () => {
    // 6 フレーム（60fps で 100ms）を超える遅延が続くと、1 フレームずつのクランプでは
    // 永遠に追いつけない（decode+present が毎 tick 16.7ms を超え続ける native reuse
    // 経路）。閾値を超えたら clamp を外し、要求された時刻へ一気に追いつく。
    const replayTime = resolveSharedRendererNativeReuseReplayTime({
      requestedTime: 1,
      pendingTime: 1 + (6.5 / 60),
      previewFps: 60,
    });

    expect(replayTime).toBe(1 + (6.5 / 60));
  });

  it('does not alter backward seeks (seek storm protection stays intact)', () => {
    // 後方シーク時は pendingTime がそのまま requestedTime を下回るため、
    // 閾値ロジックに関わらず従来どおり即座に反映される（クランプは前進方向のみ）。
    const replayTime = resolveSharedRendererNativeReuseReplayTime({
      requestedTime: 5,
      pendingTime: 0.5,
      previewFps: 60,
    });

    expect(replayTime).toBe(0.5);
  });
});
