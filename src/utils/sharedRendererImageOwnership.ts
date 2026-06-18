export type SharedRendererImageOwner = 'pixi' | 'sharedRenderer';

export type SharedRendererImageCutoverReason =
  | 'noImageScene'
  | 'nativeRenderFrameUnavailable'
  | 'nativeRenderFrameReady';

export interface SharedRendererImageOwnership {
  owner: SharedRendererImageOwner;
  reason: SharedRendererImageCutoverReason;
  imageObjectIds: string[];
}

export const buildSharedRendererImageOwnership = ({
  hasImageScene,
  nativeRenderFrameReady,
  imageObjectIds,
}: {
  hasImageScene: boolean;
  nativeRenderFrameReady: boolean;
  imageObjectIds: string[];
}): SharedRendererImageOwnership => {
  if (!hasImageScene) {
    return pixiOwnership('noImageScene');
  }
  if (!nativeRenderFrameReady) {
    return pixiOwnership('nativeRenderFrameUnavailable');
  }

  return {
    owner: 'sharedRenderer',
    reason: 'nativeRenderFrameReady',
    imageObjectIds,
  };
};

const pixiOwnership = (reason: SharedRendererImageCutoverReason): SharedRendererImageOwnership => ({
  owner: 'pixi',
  reason,
  imageObjectIds: [],
});
