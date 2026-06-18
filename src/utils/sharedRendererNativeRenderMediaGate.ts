import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';
import { isSharedRendererNativeMediaReferenceSupported } from './sharedRendererNativeMediaSupport';

export const resolveMixedNativeRenderUnsupportedMedia = ({
  snapshot,
  media,
}: {
  snapshot: RustSceneSnapshot;
  media: readonly RustSceneMediaReference[];
}): string | null => {
  const mediaById = new Map(media.map((reference) => [reference.id, reference]));
  for (const clip of snapshot.clips) {
    const reference = mediaById.get(clip.media_id);
    if (!reference || reference.kind === 'Video') continue;
    if (!isSharedRendererNativeMediaReferenceSupported(reference)) {
      return `Rust native render does not support ${reference.kind} media '${reference.id}' from '${reference.source}'.`;
    }
  }
  return null;
};
