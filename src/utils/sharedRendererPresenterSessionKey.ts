import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';

export interface SharedRendererPresenterSessionKeyOptions {
  includePlaybackFrame?: boolean;
}

export const buildSharedRendererPresenterSessionKey = (
  session: SharedRendererPreviewSession,
  {
    includePlaybackFrame = true,
  }: SharedRendererPresenterSessionKeyOptions = {},
): string => {
  if (!session.surfaceGate.ok) {
    return `blocked:${session.surfaceGate.reason}`;
  }

  return JSON.stringify({
    status: 'ok',
    canvas: session.surfaceGate.canvas,
    presentation: session.presentationContract.canvas,
    frameIndex: includePlaybackFrame
      ? session.surfaceGate.snapshot.frame_index
      : undefined,
    clips: session.surfaceGate.snapshot.clips.map((clip) => ({
      clipId: clip.clip_id,
      mediaId: clip.media_id,
      sourceFrame: includePlaybackFrame
        ? clip.source_frame
        : undefined,
      zIndex: clip.z_index,
      transform: clip.transform,
      opacity: clip.opacity,
      effects: clip.effects,
    })),
    media: session.surfaceGate.media.map((reference) => ({
      id: reference.id,
      kind: reference.kind,
      source: reference.source,
      width: reference.width,
      height: reference.height,
    })),
  });
};
