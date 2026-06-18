import type {
  RustSceneMediaReference,
  RustSceneSnapshot,
} from './rustSceneSnapshot';

export type SharedRendererSolidColourOwner = 'pixi' | 'sharedRenderer';

export type SharedRendererSolidColourCutoverReason =
  | 'cutoverDisabled'
  | 'noSolidColourScene'
  | 'rustGeometryUnavailable'
  | 'noSolidColourObjects'
  | 'pixiOnlyObjectAboveSolidColour'
  | 'rustSolidColourReady'
  | 'nativeRenderFrameReady';

export interface SharedRendererSolidColourOwnership {
  owner: SharedRendererSolidColourOwner;
  reason: SharedRendererSolidColourCutoverReason;
  solidColourObjectIds: string[];
}

export interface BuildSharedRendererSolidColourOwnershipInput {
  cutoverEnabled: boolean;
  hasSolidColourScene: boolean;
  geometrySource?: 'rust-wasm' | 'typescript';
  solidColourObjectIds: string[];
  stackSafeSolidColourObjectIds?: ReadonlySet<string>;
}

export interface SharedRendererSolidColourStackBlock {
  solidColourObjectId: string;
  blockingObjectId: string;
  blockingKind: RustSceneMediaReference['kind'] | 'MissingMedia';
  reason: 'pixiOnlyObjectAboveSolidColour';
}

export interface SharedRendererSolidColourStackSafety {
  safeSolidColourObjectIds: string[];
  blockedSolidColourObjectIds: SharedRendererSolidColourStackBlock[];
}

export interface BuildSharedRendererSolidColourStackSafetyInput {
  snapshot: RustSceneSnapshot;
  media: RustSceneMediaReference[];
  candidateSolidColourObjectIds: string[];
  sharedRendererVideoObjectIds: string[];
}

export const buildSharedRendererSolidColourOwnership = ({
  cutoverEnabled,
  hasSolidColourScene,
  geometrySource,
  solidColourObjectIds,
  stackSafeSolidColourObjectIds,
}: BuildSharedRendererSolidColourOwnershipInput): SharedRendererSolidColourOwnership => {
  if (!cutoverEnabled) {
    return pixiOwnership('cutoverDisabled');
  }
  if (!hasSolidColourScene) {
    return pixiOwnership('noSolidColourScene');
  }
  if (geometrySource !== 'rust-wasm') {
    return pixiOwnership('rustGeometryUnavailable');
  }
  if (solidColourObjectIds.length === 0) {
    return pixiOwnership('noSolidColourObjects');
  }

  const ownedSolidColourObjectIds = stackSafeSolidColourObjectIds
    ? solidColourObjectIds.filter((objectId) => stackSafeSolidColourObjectIds.has(objectId))
    : solidColourObjectIds;
  if (ownedSolidColourObjectIds.length === 0) {
    return pixiOwnership('pixiOnlyObjectAboveSolidColour');
  }

  return {
    owner: 'sharedRenderer',
    reason: 'rustSolidColourReady',
    solidColourObjectIds: ownedSolidColourObjectIds,
  };
};

export const buildSharedRendererSolidColourStackSafety = ({
  snapshot,
  media,
  candidateSolidColourObjectIds,
  sharedRendererVideoObjectIds,
}: BuildSharedRendererSolidColourStackSafetyInput): SharedRendererSolidColourStackSafety => {
  const candidateSet = new Set(candidateSolidColourObjectIds);
  const sharedVideoSet = new Set(sharedRendererVideoObjectIds);
  const mediaKindById = new Map(media.map((reference) => [reference.id, reference.kind]));
  const clipsById = new Map(snapshot.clips.map((clip) => [clip.clip_id, clip]));
  const safeSolidColourObjectIds: string[] = [];
  const blockedSolidColourObjectIds: SharedRendererSolidColourStackBlock[] = [];

  candidateSolidColourObjectIds.forEach((solidColourObjectId) => {
    const solidClip = clipsById.get(solidColourObjectId);
    if (!solidClip) return;

    const blocker = snapshot.clips
      .filter((clip) => clip.z_index > solidClip.z_index)
      .sort((left, right) => left.z_index - right.z_index)
      .find((clip) => !isSharedRendererOwnedAboveSolidColour({
        clipId: clip.clip_id,
        mediaKind: mediaKindById.get(clip.media_id),
        candidateSolidColourObjectIds: candidateSet,
        sharedRendererVideoObjectIds: sharedVideoSet,
      }));

    if (blocker) {
      blockedSolidColourObjectIds.push({
        solidColourObjectId,
        blockingObjectId: blocker.clip_id,
        blockingKind: mediaKindById.get(blocker.media_id) ?? 'MissingMedia',
        reason: 'pixiOnlyObjectAboveSolidColour',
      });
      return;
    }

    safeSolidColourObjectIds.push(solidColourObjectId);
  });

  return {
    safeSolidColourObjectIds,
    blockedSolidColourObjectIds,
  };
};

const isSharedRendererOwnedAboveSolidColour = ({
  clipId,
  mediaKind,
  candidateSolidColourObjectIds,
  sharedRendererVideoObjectIds,
}: {
  clipId: string;
  mediaKind: RustSceneMediaReference['kind'] | undefined;
  candidateSolidColourObjectIds: ReadonlySet<string>;
  sharedRendererVideoObjectIds: ReadonlySet<string>;
}): boolean => {
  if (mediaKind === 'SolidColour') return candidateSolidColourObjectIds.has(clipId);
  if (mediaKind === 'Video') return sharedRendererVideoObjectIds.has(clipId);
  return false;
};

const pixiOwnership = (reason: SharedRendererSolidColourCutoverReason): SharedRendererSolidColourOwnership => ({
  owner: 'pixi',
  reason,
  solidColourObjectIds: [],
});
