/**
 * PixiJS 排除計画 Phase 4: shared renderer は唯一の presenter となったため、
 * Pixi 併走比較（frame lock 検証・frame partition）の API は撤去した。
 * deviceLost 時の fallback も Pixi へは戻れないため 'none'（次の presenter
 * 再起動まで presentation なし。native overlay は別プロセスのため影響しない）。
 */
export interface SharedRendererPresentationContract {
  canvas: {
    colorSpace: 'srgb';
    alphaMode: 'premultiplied';
  };
  comparisonReadback: {
    target: 'offscreenRenderTarget';
    includesPageCompositing: false;
  };
  frameTiming: {
    source: 'frozenSceneSnapshot';
  };
  deviceLost: {
    fallback: 'none';
    staleSharedFrameAllowed: false;
  };
}

export const buildSharedRendererPresentationContract = (): SharedRendererPresentationContract => ({
  canvas: {
    colorSpace: 'srgb',
    alphaMode: 'premultiplied',
  },
  comparisonReadback: {
    target: 'offscreenRenderTarget',
    includesPageCompositing: false,
  },
  frameTiming: {
    source: 'frozenSceneSnapshot',
  },
  deviceLost: {
    fallback: 'none',
    staleSharedFrameAllowed: false,
  },
});
