import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';

export interface ShouldPresentSharedRendererEmptyScenePresentationInput {
  session: SharedRendererPreviewSession;
  nativeOverlayPreviewEnabled: boolean;
}

/**
 * WYSIWYG不変条件 — 「評価された全フレームはちょうど1回のpresentで終わる。
 * 空シーンは特別扱いのclearではなく透明フレームのpresentである」の判定部分。
 *
 * session.surfaceGate.ok かつ snapshot.clips.length === 0（＝現在時刻に
 * アクティブなクリップが存在しない）のとき、native overlay の透明clearを
 * 発行すべきと判定する。surfaceGate.ok === false のケース（他の理由で
 * ブロックされている経路）は、既存の別経路が扱うためここでは対象外とする。
 */
export const shouldPresentSharedRendererEmptyScenePresentation = ({
  session,
  nativeOverlayPreviewEnabled,
}: ShouldPresentSharedRendererEmptyScenePresentationInput): boolean => {
  if (!nativeOverlayPreviewEnabled) return false;
  if (!session.surfaceGate.ok) return false;
  return session.surfaceGate.snapshot.clips.length === 0;
};
