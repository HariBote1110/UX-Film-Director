/** PixiJS `RendererType`: `webgl` = 1, `webgpu` = 2 */
export const useCanvasVideoUploadForPixiPreview = (rendererType: number): boolean => rendererType === 2;

export interface PixiTextureForVideoCleanup {
  destroy: (destroyBase?: boolean) => void;
}

export interface PixiVideoSourceForCleanup {
  destroy: () => void;
}

export type PixiVideoFrameTextureForCleanup =
  | {
      uploadMode: 'video-source';
      texture: PixiTextureForVideoCleanup;
      videoSource: PixiVideoSourceForCleanup;
    }
  | {
      uploadMode: 'canvas';
      texture: PixiTextureForVideoCleanup;
    };

export interface PixiExportOverlayForCleanup {
  texture: PixiTextureForVideoCleanup;
}

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
export interface PixiVideoElementSourceForCleanup {
  currentSrc?: string;
  src: string;
  load: () => void;
}

export const destroyVideoSourcePreservingPlayUrl = (
  video: PixiVideoElementSourceForCleanup,
  videoSource: PixiVideoSourceForCleanup
): void => {
  const playUrl = video.currentSrc || video.src;
  videoSource.destroy();
  if (!playUrl) return;
  video.src = playUrl;
  void video.load();
};

export const destroyVideoFrameTextureState = (
  state: PixiVideoFrameTextureForCleanup,
  video?: PixiVideoElementSourceForCleanup | null
): void => {
  if (state.uploadMode === 'video-source') {
    if (video) {
      destroyVideoSourcePreservingPlayUrl(video, state.videoSource);
    } else {
      state.videoSource.destroy();
    }
    state.texture.destroy(false);
    return;
  }

  state.texture.destroy(true);
};

export const destroyExportOverlayCanvases = (
  overlays: Map<string, PixiExportOverlayForCleanup>
): void => {
  overlays.forEach((overlay) => {
    overlay.texture.destroy(true);
  });
  overlays.clear();
};

export const shouldReplacePixiVideoElementSource = (
  video: Pick<HTMLVideoElement, 'src'> & { currentSrc?: string },
  playSrc: string
): boolean => {
  const activeSrc = video.currentSrc || video.src;
  return activeSrc !== playSrc;
};
