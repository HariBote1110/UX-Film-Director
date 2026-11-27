import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';

export interface SharedRendererPresenterSessionKeyOptions {
  includePlaybackFrame?: boolean;
  // When false, per-frame animated scene content (transform, opacity, effects,
  // z-order) is excluded from the key. The native render reuse path bakes these
  // into the Rust-composited frame it pushes onto the existing presenter, so
  // they must not churn the key — otherwise the presenter is torn down and
  // recreated every frame (flicker + decode restart storm).
  includeAnimatedSceneContent?: boolean;
}

export const buildSharedRendererPresenterSessionKey = (
  session: SharedRendererPreviewSession,
  {
    includePlaybackFrame = true,
    includeAnimatedSceneContent = true,
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
      zIndex: includeAnimatedSceneContent ? clip.z_index : undefined,
      transform: includeAnimatedSceneContent ? clip.transform : undefined,
      opacity: includeAnimatedSceneContent ? clip.opacity : undefined,
      effects: includeAnimatedSceneContent ? clip.effects : undefined,
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
