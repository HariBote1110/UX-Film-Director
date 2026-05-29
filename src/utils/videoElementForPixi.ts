import type { VideoSource } from 'pixi.js';

/** PixiJS `RendererType`: `webgl` = 1, `webgpu` = 2 */
export const useCanvasVideoUploadForPixiPreview = (rendererType: number): boolean => rendererType === 2;

/**
 * Align the element's width/height *attributes* (defaults 300×150) with intrinsic
 * video dimensions. Pixi {@link import('pixi.js').TextureSource} `resourceWidth` /
 * `resourceHeight` fall back to `width` / `height` when `videoWidth` is 0; keeping
 * them in sync avoids WebGPU `copyExternalImageToTexture` rect / surface mismatches.
 */
export const applyIntrinsicSizeToVideoElement = (video: HTMLVideoElement): void => {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (w > 0 && h > 0) {
    video.width = w;
    video.height = h;
  }
};

/**
 * {@link import('pixi.js').VideoSource.destroy} sets `src` to "" and reloads. When the
 * same `HTMLVideoElement` is kept for a clip, the play URL must be restored or later
 * `VideoSource` / texture uploads see an empty or wrong-sized surface.
 */
export const destroyVideoSourcePreservingPlayUrl = (video: HTMLVideoElement, videoSource: VideoSource): void => {
  const playUrl = video.currentSrc || video.src;
  videoSource.destroy();
  if (!playUrl) return;
  video.src = playUrl;
  void video.load();
};
