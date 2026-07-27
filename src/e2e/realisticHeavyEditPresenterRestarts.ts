/**
 * 重量E2E（realistic-heavy-edit-e2e）の再生計測区間で、shared renderer
 * presenter が何回フル再起動したかを測る「常設の診断指標」。
 *
 * ## なぜこの指標が必要か
 *
 * Viewport（src/components/Viewport.tsx）は presenter effect 内で presenter を
 * 起動するたびに `sharedRendererPresenterStartCountRef` を+1し、
 * `document.documentElement.dataset.uxfdSharedRendererPresenterStartCount` へ
 * 書き込んでいる。presenterのフル再起動にはコード中のコメントで約28ms/回の
 * コストがあると見積もられており、Reactのコミット回数よりも実CPUコストに
 * 直結する。
 *
 * 混在セッション（動画＋図形）は `VITE_UXFD_RUST_VIDEO_ONLY=1` のときだけ
 * presenter reuse の対象になるが、このフラグは `npm run dev` は設定するが
 * `npm run build`（本番ビルド）と重量E2Eは設定していない。そのため publish の
 * たびに presenter がフル再起動している疑いがあり、この差分を継続的に見張る
 * 必要がある。
 *
 * このモジュールは、再生計測区間の前後で読み取った累積起動回数（文字列）を
 * 数値化し、区間中の再起動回数を差分として算出する純関数を提供する。
 */

export interface RealisticHeavyEditPresenterRestarts {
  /** 再生計測区間の開始時点の累積起動回数。 */
  before: number;
  /** 終了時点の累積起動回数。 */
  after: number;
  /** 区間中の再起動回数（after - before）。 */
  duringPlayback: number;
}

/**
 * dataset の値（文字列）を安全に数値化する。未定義・空文字・非数値は
 * 0として扱い、E2Eの実行自体を落とさないようにする。
 */
const parseCount = (value: string | undefined): number => {
  if (value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const resolveRealisticHeavyEditPresenterRestarts = (
  before: string | undefined,
  after: string | undefined,
): RealisticHeavyEditPresenterRestarts => {
  const beforeCount = parseCount(before);
  const afterCount = parseCount(after);
  // presenterがリセットされる等でafter < beforeとなる場合、区間中の
  // 「再起動回数」が負になるのは意味を持たない（再起動は減らない前提の
  // 計測区間であるため、負値は必ず計測条件の異常を示す）。呼び出し側で
  // E2Eを落とさないよう、ここでは例外を投げず0にクランプする。
  const duringPlayback = Math.max(0, afterCount - beforeCount);
  return {
    before: beforeCount,
    after: afterCount,
    duringPlayback,
  };
};
