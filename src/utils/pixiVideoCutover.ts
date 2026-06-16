export interface ShouldSkipPixiVideoForSharedRendererInput {
  objectId: string;
  objectType: string;
  isExporting: boolean;
  sharedRendererVideoObjectIds?: ReadonlySet<string>;
}

export const shouldSkipPixiVideoForSharedRenderer = ({
  objectId,
  objectType,
  isExporting,
  sharedRendererVideoObjectIds,
}: ShouldSkipPixiVideoForSharedRendererInput): boolean =>
  objectType === 'video'
  && !isExporting
  && sharedRendererVideoObjectIds?.has(objectId) === true;

interface PixiVideoCutoverChild {
  destroy: (...args: any[]) => void;
}

interface PixiVideoCutoverContainer {
  removeChildren: () => PixiVideoCutoverChild[];
}

interface PixiVideoElementForCutover {
  pause: () => void;
  src: string;
  load: () => void;
}

interface PixiVideoFrameTextureForCutover {
  uploadMode: string;
  texture?: {
    destroy: (destroyBase?: boolean) => void;
  };
  videoSource?: {
    destroy: () => void;
  };
}

export interface ClearPixiVideoForSharedRendererInput {
  objectId: string;
  container: PixiVideoCutoverContainer;
  videoElements: {
    get: (key: string) => unknown;
    delete: (key: string) => boolean;
  };
  videoFrameTextures: {
    get: (key: string) => unknown;
    delete: (key: string) => boolean;
  };
}

export const clearPixiVideoForSharedRenderer = ({
  objectId,
  container,
  videoElements,
  videoFrameTextures,
}: ClearPixiVideoForSharedRendererInput): void => {
  const children = container.removeChildren();
  children.forEach((child) => {
    child.destroy({ children: true, texture: false, context: true });
  });

  const video = videoElements.get(objectId);
  if (isVideoElementForCutover(video)) {
    video.pause();
    video.src = '';
    video.load();
    videoElements.delete(objectId);
  }

  const frameTexture = videoFrameTextures.get(objectId);
  if (isVideoFrameTextureForCutover(frameTexture)) {
    if (frameTexture.uploadMode === 'video-source') {
      frameTexture.videoSource?.destroy();
    }
    frameTexture.texture?.destroy(false);
    videoFrameTextures.delete(objectId);
  }
};

const isVideoElementForCutover = (value: unknown): value is PixiVideoElementForCutover =>
  typeof value === 'object'
  && value !== null
  && typeof (value as PixiVideoElementForCutover).pause === 'function'
  && typeof (value as PixiVideoElementForCutover).load === 'function'
  && typeof (value as PixiVideoElementForCutover).src === 'string';

const isVideoFrameTextureForCutover = (value: unknown): value is PixiVideoFrameTextureForCutover =>
  typeof value === 'object'
  && value !== null
  && typeof (value as PixiVideoFrameTextureForCutover).uploadMode === 'string';
