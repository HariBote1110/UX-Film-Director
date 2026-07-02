export const SHARED_RENDERER_PLAYBACK_PREVIEW_FPS = 60;
// Preview decode resolution fallback. 320 was visibly blocky once upscaled to
// the canvas; 720 keeps the preview legible while staying cheap to decode on
// the release backend. Used only when the native overlay drawable size is not
// known yet (before the first attach) — otherwise the decode edge follows the
// drawable long edge so the presented pixels are decoded 1:1.
export const SHARED_RENDERER_PLAYBACK_DECODE_FALLBACK_EDGE = 720;
// Legibility floor for tiny panes: stays above the historically blocky 320.
export const SHARED_RENDERER_PLAYBACK_DECODE_MIN_EDGE = 360;
// Pipeline cap, matching MAX_VIEWPORT_VIDEO_DECODE_EDGE in the viewport decode
// job builder. Oversized drawables (e.g. full-screen 2588x1456 at dpr 2) never
// request more than this; the decode size is additionally clamped to the media
// declared resolution by resolveViewportVideoDecodeSize, so decode never
// upscales beyond the source.
export const SHARED_RENDERER_PLAYBACK_DECODE_EDGE_CAP = 1920;
export const SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT = 6;

export interface SharedRendererPlaybackDrawableSize {
  width: number;
  height: number;
}

// 固定 720 edge のままでは 720x405 のフレームを drawable（実測 1564x880、
// フルスクリーン相当 2588x1456）へ引き伸ばすことになり preview がボケる。
// decode edge は「そのときの preview drawable の長辺」に追従させ、
// media 宣言解像度とのminは resolveViewportVideoDecodeSize が担保する。
// decode job の解像度は job 生成時に固定される（jobId に寸法が含まれる）ため、
// 再生/停止の遷移ではデコーダが温存され、pane リサイズ時のみ job が作り直される。
export const resolveSharedRendererPlaybackDecodeMaxEdge = (
  drawable?: SharedRendererPlaybackDrawableSize | null
): number => {
  if (!drawable) return SHARED_RENDERER_PLAYBACK_DECODE_FALLBACK_EDGE;
  const longEdge = Math.max(drawable.width, drawable.height);
  if (!Number.isFinite(longEdge) || longEdge <= 0) {
    return SHARED_RENDERER_PLAYBACK_DECODE_FALLBACK_EDGE;
  }
  return Math.min(
    SHARED_RENDERER_PLAYBACK_DECODE_EDGE_CAP,
    Math.max(SHARED_RENDERER_PLAYBACK_DECODE_MIN_EDGE, Math.round(longEdge))
  );
};

export const quantiseSharedRendererPlaybackPreviewTime = (time: number): number => {
  if (!Number.isFinite(time) || time <= 0) return 0;

  return Math.floor(time * SHARED_RENDERER_PLAYBACK_PREVIEW_FPS)
    / SHARED_RENDERER_PLAYBACK_PREVIEW_FPS;
};
