import type {
  SharedRendererPreviewSurfaceBlockedReason,
  SharedRendererPreviewSurfaceGate,
} from './sharedRendererPreviewSurface';

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
    fallback: 'pixi';
    staleSharedFrameAllowed: false;
  };
}

export type SharedRendererFrameLockValidation =
  | { ok: true }
  | {
      ok: false;
      reason: 'frameIndexSkew';
      detail: string;
    };

export interface SharedRendererFrameLockInput {
  snapshotFrameIndex: number;
  pixiFrameIndex: number;
  candidateFrameIndex: number;
}

export interface SharedRendererPreviewFramePartitionInput {
  frameIndex: number;
  surfaceGate: SharedRendererPreviewSurfaceGate;
}

export interface SharedRendererPreviewFramePartition {
  comparableFrameIndices: number[];
  pixiOnlyFrames: {
    frameIndex: number;
    reason: SharedRendererPreviewSurfaceBlockedReason;
    detail: string;
  }[];
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
    fallback: 'pixi',
    staleSharedFrameAllowed: false,
  },
});

export const validateSharedRendererFrameLock = ({
  snapshotFrameIndex,
  pixiFrameIndex,
  candidateFrameIndex,
}: SharedRendererFrameLockInput): SharedRendererFrameLockValidation => {
  if (snapshotFrameIndex === pixiFrameIndex && snapshotFrameIndex === candidateFrameIndex) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: 'frameIndexSkew',
    detail: 'Pixi, shared renderer, and SceneSnapshot must compare the same frozen frame index.',
  };
};

export const partitionSharedRendererPreviewFrames = (
  frames: SharedRendererPreviewFramePartitionInput[]
): SharedRendererPreviewFramePartition => {
  const comparableFrameIndices: number[] = [];
  const pixiOnlyFrames: SharedRendererPreviewFramePartition['pixiOnlyFrames'] = [];

  frames.forEach(({ frameIndex, surfaceGate }) => {
    if (surfaceGate.ok) {
      comparableFrameIndices.push(frameIndex);
      return;
    }

    pixiOnlyFrames.push({
      frameIndex,
      reason: surfaceGate.reason,
      detail: surfaceGate.detail,
    });
  });

  return {
    comparableFrameIndices,
    pixiOnlyFrames,
  };
};
