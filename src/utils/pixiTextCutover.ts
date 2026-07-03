export interface ShouldSkipPixiTextForSharedRendererInput {
  objectId: string;
  objectType: string;
  isExporting: boolean;
  sharedRendererTextObjectIds?: ReadonlySet<string>;
}

/**
 * Pixi 排除計画 Phase2 の cutover 述語。テキストの Rust 描画（rust-backend
 * のcosmic-textラスタライザ＋native-wgpu-rendererのテクスチャ合成）が
 * 実機で parity 検証されるまでは、呼び出し側が sharedRendererTextObjectIds
 * を渡さない限り常に false（Pixi描画を継続）になる。所有権移転を
 * 有効化するかどうかは呼び出し側（統合後に親セッションが判断）に委ねる。
 */
export const shouldSkipPixiTextForSharedRenderer = ({
  objectId,
  objectType,
  sharedRendererTextObjectIds,
}: ShouldSkipPixiTextForSharedRendererInput): boolean =>
  objectType === 'text'
  && sharedRendererTextObjectIds?.has(objectId) === true;
