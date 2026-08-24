export interface SharedRendererPresenterCanvasVisibilityInput {
  editorMode: string;
  sharedRendererPreviewEnabled: boolean;
  nativeOverlayReady: boolean;
}

export type SharedRendererPresenterCanvasVisibility = 'visible' | 'hidden';

/**
 * shared renderer のプレゼンター用 HTML キャンバス
 * (`data-shared-renderer-preview-surface`) の可視性を決定する。
 *
 * hole-punch 方式のネイティブオーバーレイ子ウィンドウは、透明な
 * Electron ウィンドウの「下」に配置される。旧設計（オーバーレイが
 * プレビュー全体の上に載る構成）ではこの HTML キャンバスの残像
 * （ドラッグ中に描かれた古いオブジェクト位置）が隠れていたが、
 * hole-punch 化によりオーバーレイより上に居座るこのキャンバスの
 * 残像がそのまま見えてしまう（ゴースト/残像バグ）。
 *
 * そのため `nativeOverlayReady` が true の間は、オーバーレイ自身が
 * 唯一の表示サーフェスとなるべきであり、このキャンバスは常に隠す。
 * オーバーレイが未準備（フォールバックプレゼンター経路、例:
 * Windows の interim 経路や UXFD_NATIVE_OVERLAY=0）の場合のみ、
 * 既存の 2D プレビュー表示ルールを適用する。
 */
export function resolveSharedRendererPresenterCanvasVisibility({
  editorMode,
  sharedRendererPreviewEnabled,
  nativeOverlayReady,
}: SharedRendererPresenterCanvasVisibilityInput): SharedRendererPresenterCanvasVisibility {
  if (nativeOverlayReady) {
    return 'hidden';
  }
  return editorMode === '2d' && sharedRendererPreviewEnabled ? 'visible' : 'hidden';
}
