import type {
  RustSceneMediaReference,
  RustSceneSnapshot,
} from './rustSceneSnapshot';
import { isSharedRendererNativeMediaReferenceSupported } from './sharedRendererNativeMediaSupport';

export interface SharedRendererVideoCutoverStackBlock {
  videoObjectId: string;
  blockingObjectId: string;
  blockingKind: RustSceneMediaReference['kind'] | 'MissingMedia';
  reason: 'pixiOnlyObjectAboveVideo';
}

export interface SharedRendererVideoCutoverStackSafety {
  safeVideoObjectIds: string[];
  blockedVideoObjectIds: SharedRendererVideoCutoverStackBlock[];
}

export interface BuildSharedRendererVideoCutoverStackSafetyInput {
  snapshot: RustSceneSnapshot;
  media: RustSceneMediaReference[];
  candidateVideoObjectIds: string[];
}

export const buildSharedRendererVideoCutoverStackSafety = ({
  snapshot,
  media,
  candidateVideoObjectIds,
}: BuildSharedRendererVideoCutoverStackSafetyInput): SharedRendererVideoCutoverStackSafety => {
  const candidateSet = new Set(candidateVideoObjectIds);
  const mediaById = new Map(media.map((reference) => [reference.id, reference]));
  const clipsById = new Map(snapshot.clips.map((clip) => [clip.clip_id, clip]));
  const safeVideoObjectIds: string[] = [];
  const blockedVideoObjectIds: SharedRendererVideoCutoverStackBlock[] = [];

  candidateVideoObjectIds.forEach((videoObjectId) => {
    const videoClip = clipsById.get(videoObjectId);
    if (!videoClip) return;

    const blocker = snapshot.clips
      .filter((clip) => clip.z_index > videoClip.z_index)
      .sort((left, right) => left.z_index - right.z_index)
      .find((clip) => !isSharedRendererOwnedAboveVideo({
        clipId: clip.clip_id,
        media: mediaById.get(clip.media_id),
        candidateVideoObjectIds: candidateSet,
      }));

    if (blocker) {
      blockedVideoObjectIds.push({
        videoObjectId,
        blockingObjectId: blocker.clip_id,
        blockingKind: mediaById.get(blocker.media_id)?.kind ?? 'MissingMedia',
        reason: 'pixiOnlyObjectAboveVideo',
      });
      return;
    }

    safeVideoObjectIds.push(videoObjectId);
  });

  return {
    safeVideoObjectIds,
    blockedVideoObjectIds,
  };
};

const isSharedRendererOwnedAboveVideo = ({
  media,
  clipId,
  candidateVideoObjectIds,
}: {
  media: RustSceneMediaReference | undefined;
  clipId: string;
  candidateVideoObjectIds: ReadonlySet<string>;
}): boolean => {
  if (!media) return false;
  if (media.kind === 'Video') return candidateVideoObjectIds.has(clipId);
  return isSharedRendererNativeMediaReferenceSupported(media);
};
