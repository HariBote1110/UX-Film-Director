export type SharedRendererTextOwner = 'pixi' | 'sharedRenderer';

export type SharedRendererTextCutoverReason =
  | 'noTextScene'
  | 'nativeRenderFrameUnavailable'
  | 'nativeRenderFrameReady';

export interface SharedRendererTextOwnership {
  owner: SharedRendererTextOwner;
  reason: SharedRendererTextCutoverReason;
  textObjectIds: string[];
}

/**
 * テキストのRust所有権判定。Image/Psd（`sharedRendererImageOwnership.ts` /
 * `sharedRendererPsdOwnership.ts`）と同型で、専用cutoverフラグを持たず
 * `nativeRenderFrameReady`（native render frameのuploadに成功したかどうか）
 * のみで決まる二値判定にしている。呼び出し側（Viewport.tsx）は
 * `pixiTextCutover.ts` の`shouldSkipPixiTextForSharedRenderer`が既定OFFの
 * 間はこの所有権集合を渡さない設計にできるため、ここでは判定ロジックのみを
 * 提供し、cutoverのON/OFF自体はこのモジュールの責務にしない。
 */
export const buildSharedRendererTextOwnership = ({
  hasTextScene,
  nativeRenderFrameReady,
  textObjectIds,
}: {
  hasTextScene: boolean;
  nativeRenderFrameReady: boolean;
  textObjectIds: string[];
}): SharedRendererTextOwnership => {
  if (!hasTextScene) {
    return pixiOwnership('noTextScene');
  }
  if (!nativeRenderFrameReady) {
    return pixiOwnership('nativeRenderFrameUnavailable');
  }

  return {
    owner: 'sharedRenderer',
    reason: 'nativeRenderFrameReady',
    textObjectIds,
  };
};

const pixiOwnership = (reason: SharedRendererTextCutoverReason): SharedRendererTextOwnership => ({
  owner: 'pixi',
  reason,
  textObjectIds: [],
});
