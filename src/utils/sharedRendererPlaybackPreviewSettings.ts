export const SHARED_RENDERER_PLAYBACK_PREVIEW_FPS = 12;
export const SHARED_RENDERER_PLAYBACK_DECODE_MAX_EDGE = 320;
export const SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT = 6;

export const quantiseSharedRendererPlaybackPreviewTime = (time: number): number => {
  if (!Number.isFinite(time) || time <= 0) return 0;

  return Math.floor(time * SHARED_RENDERER_PLAYBACK_PREVIEW_FPS)
    / SHARED_RENDERER_PLAYBACK_PREVIEW_FPS;
};
