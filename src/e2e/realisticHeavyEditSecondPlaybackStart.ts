/**
 * 重量E2E（realistic-heavy-edit-e2e）で、同一アプリセッション内で2回目に
 * 開始したnative再生の起動タイミングを要約する純関数。
 *
 * ## なぜこの指標が必要か
 *
 * `startScenePlayback` は218〜326msかかり、そのほぼ全て（216〜324ms）が
 * `presentSceneMs`（native-overlayアドオン呼び出し）である一方、Rust側の
 * `scene.evaluate` 自体は0.4〜4msしかかからないことが実測で分かっている。
 * これまでの計測はすべて `isFirstStartSinceLaunch: true` の1回目再生のみを
 * 対象にしていたため、このコストが
 *
 * - (a) サーフェス生成やシェーダー構築など「アプリ起動後の初回のみ」払う
 *   一過性コストなのか、
 * - (b) 再生開始のたびに毎回払う恒常コストなのか
 *
 * を判別できていなかった。この関数は、同一セッション内で2回以上
 * `startPlayback` オペレーションのRPCサンプル（rendererSceneRpcTrace.ts）が
 * 記録された場合に、2回目のサンプルからタイミング内訳を取り出す。
 *
 * `startTimingDiagnostics` はmain側の `rustScenePlaybackController.ts` が
 * 生成し、rendererは素通しするだけの計測専用の値である。失敗した
 * `startPlayback`（result.active === false）ではdiagnosticsが付与されない
 * ため、その場合は `observed: true` としつつ数値系フィールドをnullにする。
 */

import type { RendererSceneRpcSample } from '../perf/rendererSceneRpcTrace';

export interface RealisticHeavyEditSecondPlaybackStart {
  /** 2回目の `startPlayback` サンプルが実際に記録されたかどうか。 */
  observed: boolean;
  /** main側start()の合計所要時間（ms）。診断値が無ければRPC往復時間で代替する。 */
  totalMs: number | null;
  /** native-overlayアドオン呼び出し区間（ms）。 */
  presentSceneMs: number | null;
  /** アプリ起動後、この呼び出しが最初のnative再生開始だったかどうか。 */
  isFirstStartSinceLaunch: boolean | null;
}

const NOT_OBSERVED: RealisticHeavyEditSecondPlaybackStart = {
  observed: false,
  totalMs: null,
  presentSceneMs: null,
  isFirstStartSinceLaunch: null,
};

/**
 * `rendererSceneRpcTrace` の samples 配列（1回目・2回目の再生開始を両方含む
 * 想定）から、operation === 'startPlayback' のサンプルを時系列順に抽出し、
 * 2番目（インデックス1）のサンプルを2回目の再生開始として要約する。
 * 2番目のサンプルが存在しない場合は `observed: false` を返し、
 * 2回目の再生が実際には開始・記録されなかったことを呼び出し側へ伝える。
 */
export const resolveRealisticHeavyEditSecondPlaybackStart = (
  sceneRpcSamples: readonly RendererSceneRpcSample[] | null | undefined,
): RealisticHeavyEditSecondPlaybackStart => {
  const startPlaybackSamples = (sceneRpcSamples ?? []).filter(
    (sample) => sample.operation === 'startPlayback',
  );
  const secondSample = startPlaybackSamples[1];
  if (!secondSample) return NOT_OBSERVED;

  const diagnostics = secondSample.startTimingDiagnostics;
  return {
    observed: true,
    totalMs: diagnostics?.totalMs ?? secondSample.durationMs,
    presentSceneMs: diagnostics?.presentSceneMs ?? null,
    isFirstStartSinceLaunch: diagnostics?.isFirstStartSinceLaunch ?? null,
  };
};
