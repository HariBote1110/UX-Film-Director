/**
 * 重量E2E（realistic-heavy-edit-e2e）の再生計測区間で得た rAF 系指標を信頼して
 * よいかを判定する「有効性ゲート」。
 *
 * ## なぜこのゲートが必要か
 *
 * `npm run test:realistic-heavy-edit:e2e` は、Electronウィンドウが他アプリに
 * 隠される・バックグラウンドへ回るなどの理由でレンダラーの requestAnimationFrame
 * が強くスロットリングされることがある。このとき性能指標（rafSampleCount /
 * rafMeanMs / Viewportのコミット数 / layoutCount 等）は桁違いに悪化するにも
 * かかわらず、機能的な正しさ（複製件数・Undo/Redo・エクスポート等）は影響を
 * 受けないため総合PASSしてしまう。
 *
 * 実測例（同一環境・同一コード、実行タイミングだけが異なる）:
 *
 * | run          | rafSampleCount | rafMeanMs | Viewport commits | layoutCount | 判定   |
 * |--------------|---------------:|----------:|------------------:|------------:|--------|
 * | 正常な4回     | 178〜179       | 16.7〜16.8 | 191〜377          | 212〜213    | 有効   |
 * | スロットリング| 9              | 10161.6   | 15                | 44          | 無効   |
 *
 * スロットリングされた回のこれらの指標を「改善した」と誤読すると、実際には
 * 発生していない性能改善を記録してしまう（このリポジトリの過去のセッションで
 * 誤読しかけた実例がある）。`playbackMs` は要求値（現状3000固定）であり実測の
 * 壁時計時間ではないため、単体ではスロットリングの検出に使えない。
 *
 * このモジュールは、rAFコールバック数と平均間隔から計測区間が「健全だったか」
 * を判定する純関数を提供する。healthy が false のときは、回数系の性能指標
 * （rafSampleCount / rafMeanMs / Viewport commits / layoutCount 等）を比較や
 * 改善判定に使ってはならない。
 */

export interface RealisticHeavyEditPlaybackClockHealthInput {
  /** 再生計測区間で観測したrAFコールバック数。 */
  rafSampleCount: number;
  /** 観測したrAF間隔の平均ms。 */
  rafMeanMs: number;
  /** 再生計測区間の要求時間ms（現状3000固定）。 */
  playbackMs: number;
}

export interface RealisticHeavyEditPlaybackClockHealth {
  /** 性能指標を信頼してよいか。falseなら回数系指標は比較に使ってはいけない。 */
  healthy: boolean;
  /** healthyでないときの理由（英数字のkebab-case識別子）。 */
  reason?: 'rafStarved' | 'rafIntervalTooLong';
  /** 期待されるrAFコールバック数の下限（診断用）。 */
  expectedMinRafSampleCount: number;
}

/** rAF平均間隔がこれを超えたら20fps相当より遅いとみなす。 */
const MAX_HEALTHY_RAF_MEAN_MS = 50;

/** 30fps相当を期待する最低限のrAFコールバック頻度とする。 */
const EXPECTED_MIN_RAF_FPS = 30;

export const evaluateRealisticHeavyEditPlaybackClockHealth = (
  input: RealisticHeavyEditPlaybackClockHealthInput,
): RealisticHeavyEditPlaybackClockHealth => {
  const expectedMinRafSampleCount = Math.floor(
    (input.playbackMs / 1_000) * EXPECTED_MIN_RAF_FPS,
  );

  if (input.rafSampleCount < expectedMinRafSampleCount) {
    return { healthy: false, reason: 'rafStarved', expectedMinRafSampleCount };
  }

  if (input.rafMeanMs > MAX_HEALTHY_RAF_MEAN_MS) {
    return { healthy: false, reason: 'rafIntervalTooLong', expectedMinRafSampleCount };
  }

  return { healthy: true, expectedMinRafSampleCount };
};
