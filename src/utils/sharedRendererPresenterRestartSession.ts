/**
 * presenter フル再起動時に present すべきセッションの選択（実機回帰
 * 「ポーズすると一番最初のフレームが表示される」の修正）。
 *
 * presenter 起動 effect は play⇄pause（依存配列の isPlaying）等でフル再実行
 * されるが、トリガーである state のセッションは presenterKey が変わったとき
 * （setSharedRendererPreviewSession 呼び出し時）にしか更新されない。
 * external-video reuse 経路の再生中 present は state を更新しないため、state は
 * 「presenter が最後に再起動した時点のセッション」（典型的にはクリップ
 * 読み込み直後＝先頭フレーム）のまま古びる。
 *
 * 従来は play→pause 縁の二重クロックドリフト（最大0.35秒）がほぼ必ず
 * pauseSnap（>4ms）の setTime → 再 publish を誘発し、stale な再起動 present を
 * 直後に上書きしていたため見えなかった。マスタークロック化（発見1対策）で
 * pause 縁の残差が4ms未満に収まり、このマスキングが外れて顕在化した。
 *
 * 本関数は「毎 publish で ref に保持される最新セッション」を優先して返し、
 * 再起動が stale セッションを present する経路自体を絶つ。state は presenterKey
 * 変化検知（再起動トリガー）としてのみ使われる。play 縁で一瞬先頭フレームが
 * 出る潜在問題（同根）も同時に解消する。
 */
export function resolveSharedRendererPresenterRestartSession<Session>(
  latestPublishedSession: Session | null,
  triggerSession: Session,
): Session;
export function resolveSharedRendererPresenterRestartSession<Session>(
  latestPublishedSession: Session | null,
  triggerSession: Session | null,
): Session | null;
export function resolveSharedRendererPresenterRestartSession<Session>(
  latestPublishedSession: Session | null,
  triggerSession: Session | null,
): Session | null {
  return latestPublishedSession ?? triggerSession;
}
