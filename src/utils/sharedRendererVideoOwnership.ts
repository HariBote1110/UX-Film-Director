import type { SharedRendererVideoFrameDecodeRequestResult } from './sharedRendererVideoDecodeRequest';

export type SharedRendererVideoOwner = 'pixi' | 'sharedRenderer';

export type SharedRendererVideoCutoverReason =
  | 'cutoverDisabled'
  | 'noVideoScene'
  | 'rustDecodeRequestUnavailable'
  | 'invalidVideoDecodeRequest'
  | 'noVideoDecodeRequests'
  | 'videoFrameUploadUnavailable'
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
}

export const buildSharedRendererVideoOwnership = ({
  cutoverEnabled,
  hasVideoScene,
  videoDecodeRequestSource,
  videoDecodeRequestResult,
  videoFrameUploadReady,
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

  return {
    owner: 'sharedRenderer',
    reason: 'rustDecodedFrameUploadReady',
    videoObjectIds: [...new Set(videoDecodeRequestResult.requests.map((request) => request.clipId))],
  };
};

const pixiOwnership = (reason: SharedRendererVideoCutoverReason): SharedRendererVideoOwnership => ({
  owner: 'pixi',
  reason,
  videoObjectIds: [],
});
