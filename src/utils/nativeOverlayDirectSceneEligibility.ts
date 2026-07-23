import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';

const isDirectOverlaySourceSupported = (kind: string, source: string): boolean => {
  if (kind === 'Video') return true;
  if (kind === 'Psd' || kind === 'GeneratedAudioWaveform' || kind === 'GeneratedAudioSphere') {
    return false;
  }
  if (kind === 'Image') {
    return /\.png(?:[?#].*)?$/i.test(source);
  }
  return true;
};

export const isNativeOverlayDirectSceneSession = (
  session: SharedRendererPreviewSession
): boolean => {
  if (!session.surfaceGate.ok || session.surfaceGate.snapshot.clips.length === 0) {
    return false;
  }

  const mediaById = new Map(
    session.surfaceGate.media.map((reference) => [reference.id, reference])
  );
  let visibleVideoClipCount = 0;
  for (const clip of session.surfaceGate.snapshot.clips) {
    const reference = mediaById.get(clip.media_id);
    if (!reference || !isDirectOverlaySourceSupported(reference.kind, reference.source)) {
      return false;
    }
    if (reference.kind === 'Video') {
      visibleVideoClipCount += 1;
      if (visibleVideoClipCount > 1) return false;
    }
  }
  return true;
};
