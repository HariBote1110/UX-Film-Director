import { describe, expect, it } from 'vitest';
import { resolveRealisticHeavyEditSecondPlaybackStart } from './realisticHeavyEditSecondPlaybackStart';
import type { RendererSceneRpcSample } from '../perf/rendererSceneRpcTrace';

// 背景: startScenePlayback（≒presentSceneMs）が「起動時1回限りのコールド
// コスト」か「再生開始毎の恒常コスト」かは、同一セッション内で2回以上
// startPlayback を記録して比較しないと判別できない。この純関数は
// rendererSceneRpcTrace の samples から2回目の startPlayback を取り出す。
describe('resolveRealisticHeavyEditSecondPlaybackStart', () => {
  const sample = (overrides: Partial<RendererSceneRpcSample>): RendererSceneRpcSample => ({
    operation: 'startPlayback',
    startedAtMs: 0,
    durationMs: 0,
    ok: true,
    ...overrides,
  });

  it('startPlaybackサンプルが1件だけなら observed: false を返す', () => {
    const result = resolveRealisticHeavyEditSecondPlaybackStart([
      sample({
        durationMs: 250,
        startTimingDiagnostics: {
          totalMs: 250,
          evaluateSceneMs: 2,
          presentSceneMs: 248,
          otherMs: 0,
          isFirstStartSinceLaunch: true,
        },
      }),
    ]);
    expect(result).toEqual({
      observed: false,
      totalMs: null,
      presentSceneMs: null,
      isFirstStartSinceLaunch: null,
    });
  });

  it('samplesがnull/undefined/空配列なら observed: false を返す', () => {
    expect(resolveRealisticHeavyEditSecondPlaybackStart(null).observed).toBe(false);
    expect(resolveRealisticHeavyEditSecondPlaybackStart(undefined).observed).toBe(false);
    expect(resolveRealisticHeavyEditSecondPlaybackStart([]).observed).toBe(false);
  });

  it('startPlaybackサンプルが2件あれば2番目のdiagnosticsを要約して返す', () => {
    const result = resolveRealisticHeavyEditSecondPlaybackStart([
      sample({
        durationMs: 250,
        startTimingDiagnostics: {
          totalMs: 250,
          evaluateSceneMs: 2,
          presentSceneMs: 248,
          otherMs: 0,
          isFirstStartSinceLaunch: true,
        },
      }),
      sample({
        durationMs: 40,
        startTimingDiagnostics: {
          totalMs: 38,
          evaluateSceneMs: 1,
          presentSceneMs: 36,
          otherMs: 1,
          isFirstStartSinceLaunch: false,
        },
      }),
    ]);
    expect(result).toEqual({
      observed: true,
      totalMs: 38,
      presentSceneMs: 36,
      isFirstStartSinceLaunch: false,
    });
  });

  it('operationがstartPlayback以外のサンプルは数えない', () => {
    const result = resolveRealisticHeavyEditSecondPlaybackStart([
      sample({ operation: 'replace', durationMs: 5, ok: true }),
      sample({ operation: 'evaluate', durationMs: 3, ok: true }),
      sample({
        operation: 'startPlayback',
        durationMs: 250,
        startTimingDiagnostics: {
          totalMs: 250,
          evaluateSceneMs: 2,
          presentSceneMs: 248,
          otherMs: 0,
          isFirstStartSinceLaunch: true,
        },
      }),
    ]);
    expect(result.observed).toBe(false);
  });

  it('2回目が失敗（diagnosticsなし）でもobserved: trueとし、totalMsはRPC往復時間(durationMs)で代替しpresentSceneMs等はnullにする', () => {
    const result = resolveRealisticHeavyEditSecondPlaybackStart([
      sample({
        durationMs: 250,
        startTimingDiagnostics: {
          totalMs: 250,
          evaluateSceneMs: 2,
          presentSceneMs: 248,
          otherMs: 0,
          isFirstStartSinceLaunch: true,
        },
      }),
      sample({ durationMs: 12, ok: false, reason: 'stale-revision' }),
    ]);
    expect(result.observed).toBe(true);
    expect(result.totalMs).toBe(12);
    expect(result.presentSceneMs).toBeNull();
    expect(result.isFirstStartSinceLaunch).toBeNull();
  });
});
