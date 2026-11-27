export type SharedRendererPsdOwner = 'pixi' | 'sharedRenderer';

export type SharedRendererPsdCutoverReason =
  | 'noPsdScene'
  | 'nativeRenderFrameUnavailable'
  | 'nativeRenderFrameReady';

export interface SharedRendererPsdOwnership {
  owner: SharedRendererPsdOwner;
  reason: SharedRendererPsdCutoverReason;
  psdObjectIds: string[];
}

export const buildSharedRendererPsdOwnership = ({
  hasPsdScene,
  nativeRenderFrameReady,
  psdObjectIds,
}: {
  hasPsdScene: boolean;
  nativeRenderFrameReady: boolean;
  psdObjectIds: string[];
}): SharedRendererPsdOwnership => {
  if (!hasPsdScene) {
    return pixiOwnership('noPsdScene');
  }
  if (!nativeRenderFrameReady) {
    return pixiOwnership('nativeRenderFrameUnavailable');
  }

  return {
    owner: 'sharedRenderer',
    reason: 'nativeRenderFrameReady',
    psdObjectIds,
  };
};

const pixiOwnership = (reason: SharedRendererPsdCutoverReason): SharedRendererPsdOwnership => ({
  owner: 'pixi',
  reason,
  psdObjectIds: [],
});
