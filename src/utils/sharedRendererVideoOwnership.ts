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
  uploadedVideoObjectIds?: ReadonlySet<string>;
  stackSafeVideoObjectIds?: ReadonlySet<string>;
}

export const buildSharedRendererVideoOwnership = ({
  cutoverEnabled,
  hasVideoScene,
  videoDecodeRequestSource,
  videoDecodeRequestResult,
  videoFrameUploadReady,
  uploadedVideoObjectIds,
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
  const uploadedDecodedVideoObjectIds = uploadedVideoObjectIds
    ? decodedVideoObjectIds.filter((videoObjectId) => uploadedVideoObjectIds.has(videoObjectId))
    : decodedVideoObjectIds;

  if (uploadedDecodedVideoObjectIds.length === 0) {
    return pixiOwnership('videoFrameUploadUnavailable');
  }

  const ownedVideoObjectIds = stackSafeVideoObjectIds
    ? uploadedDecodedVideoObjectIds.filter((videoObjectId) => stackSafeVideoObjectIds.has(videoObjectId))
    : uploadedDecodedVideoObjectIds;

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
