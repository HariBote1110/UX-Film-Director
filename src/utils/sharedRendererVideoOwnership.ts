import type { SharedRendererVideoFrameDecodeRequestResult } from './sharedRendererVideoDecodeRequest';

export type SharedRendererVideoOwner = 'pixi' | 'sharedRenderer';

export type SharedRendererVideoCutoverReason =
  | 'cutoverDisabled'
  | 'noVideoScene'
  | 'rustDecodeRequestUnavailable'
  | 'invalidVideoDecodeRequest'
  | 'noVideoDecodeRequests'
  | 'videoFrameUploadUnavailable'
  | 'pixiOnlyObjectAboveVideo'
  | 'rustDecodedFrameUploadReady';

export interface SharedRendererVideoOwnership {
  owner: SharedRendererVideoOwner;
  reason: SharedRendererVideoCutoverReason;
  videoObjectIds: string[];
}

export interface BuildSharedRendererVideoOwnershipInput {
  cutoverEnabled: boolean;
  hasVideoScene: boolean;
  videoDecodeRequestSource?: 'rust-wasm' | 'typescript';
  videoDecodeRequestResult?: SharedRendererVideoFrameDecodeRequestResult | null;
  videoFrameUploadReady: boolean;
  stackSafeVideoObjectIds?: ReadonlySet<string>;
}

export const buildSharedRendererVideoOwnership = ({
  cutoverEnabled,
  hasVideoScene,
  videoDecodeRequestSource,
  videoDecodeRequestResult,
  videoFrameUploadReady,
  stackSafeVideoObjectIds,
}: BuildSharedRendererVideoOwnershipInput): SharedRendererVideoOwnership => {
  if (!cutoverEnabled) {
    return pixiOwnership('cutoverDisabled');
  }
  if (!hasVideoScene) {
    return pixiOwnership('noVideoScene');
  }
  if (videoDecodeRequestSource !== 'rust-wasm' || !videoDecodeRequestResult) {
    return pixiOwnership('rustDecodeRequestUnavailable');
  }
  if (!videoDecodeRequestResult.ok) {
    return pixiOwnership('invalidVideoDecodeRequest');
  }
  if (videoDecodeRequestResult.requests.length === 0) {
    return pixiOwnership('noVideoDecodeRequests');
  }
  if (!videoFrameUploadReady) {
    return pixiOwnership('videoFrameUploadUnavailable');
  }

  const decodedVideoObjectIds = [...new Set(videoDecodeRequestResult.requests.map((request) => request.clipId))];
  const ownedVideoObjectIds = stackSafeVideoObjectIds
    ? decodedVideoObjectIds.filter((videoObjectId) => stackSafeVideoObjectIds.has(videoObjectId))
    : decodedVideoObjectIds;

  if (ownedVideoObjectIds.length === 0) {
    return pixiOwnership('pixiOnlyObjectAboveVideo');
  }

  return {
    owner: 'sharedRenderer',
    reason: 'rustDecodedFrameUploadReady',
    videoObjectIds: ownedVideoObjectIds,
  };
};

const pixiOwnership = (reason: SharedRendererVideoCutoverReason): SharedRendererVideoOwnership => ({
  owner: 'pixi',
  reason,
  videoObjectIds: [],
});
