export const SHARED_RENDERER_PLAYBACK_PREVIEW_FPS = 60;
// Preview decode resolution cap. 320 was visibly blocky once upscaled to the
// canvas; 720 keeps the preview legible while staying cheap to decode on the
// release backend. The GPU presenter samples this proxy up to the canvas size.
export const SHARED_RENDERER_PLAYBACK_DECODE_MAX_EDGE = 720;
export const SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT = 6;

export const quantiseSharedRendererPlaybackPreviewTime = (time: number): number => {
  if (!Number.isFinite(time) || time <= 0) return 0;

  return Math.floor(time * SHARED_RENDERER_PLAYBACK_PREVIEW_FPS)
    / SHARED_RENDERER_PLAYBACK_PREVIEW_FPS;
};
