import type { AudioObject, ImageObject, PsdObject, ShapeObject, TimelineObject, VideoObject } from '../types';
import { resolveVideoFsPath } from './resolveVideoFsPath';

export type ProjectExportVideoTranscodeOverlay =
  | {
      kind: 'solidColour';
      x: number;
      y: number;
      width: number;
      height: number;
      colour: string;
      opacity: number;
    }
  | {
      kind: 'image';
      path: string;
      x: number;
      y: number;
      width: number;
      height: number;
      opacity: number;
    }
  | {
      kind: 'psd';
      path: string;
      activeLayerIds: string[];
      x: number;
      y: number;
      width: number;
      height: number;
      opacity: number;
    };

export interface ProjectExportVideoTranscodeFastPath {
  inputPath: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  startSeconds: number;
  includeAudio: boolean;
  audioVolume: number;
  objectX: number;
  objectY: number;
  objectWidth: number;
  objectHeight: number;
  overlays?: ProjectExportVideoTranscodeOverlay[];
  requiresAudioMix?: boolean;
}

export const resolveProjectExportVideoTranscodeFastPath = ({
  objects,
  width,
  height,
  fps,
  durationSeconds,
}: {
  objects: readonly TimelineObject[];
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
}): ProjectExportVideoTranscodeFastPath | null => {
  const videos = objects.filter((object): object is VideoObject => object.type === 'video');
  if (videos.length !== 1) return null;
  const video = videos[0];
  const inputPath = resolveVideoFsPath(video);
  if (!inputPath) return null;
  if (!isSupportedVideoObject(video)) return null;
  const objectX = Math.round(video.x);
  const objectY = Math.round(video.y);
  const objectWidth = Math.round(video.width * video.scaleX);
  const objectHeight = Math.round(video.height * video.scaleY);
  const requiresAudioMix = objects.some((object): object is AudioObject =>
    object.type === 'audio' && !object.muted && (object.volume ?? 1) > 0
  );
  const audioVolume = requiresAudioMix ? 0 : video.muted ? 0 : Math.max(0, Math.min(4, video.volume ?? 1));
  if (objectWidth <= 0 || objectHeight <= 0) return null;
  if (objectX + objectWidth <= 0 || objectY + objectHeight <= 0) return null;
  if (objectX >= width || objectY >= height) return null;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  if (!Number.isFinite(fps) || fps <= 0) return null;
  const overlays: ProjectExportVideoTranscodeOverlay[] = [];
  for (const object of objects) {
    if (object.id === video.id) continue;
    if (object.type === 'audio') continue;
    const overlay = resolveStaticOverlay(object, durationSeconds);
    if (!overlay) return null;
    overlays.push(overlay);
  }

  return {
    inputPath,
    width,
    height,
    fps,
    durationSeconds,
    startSeconds: video.offset ?? 0,
    includeAudio: audioVolume > 0,
    audioVolume,
    objectX,
    objectY,
    objectWidth,
    objectHeight,
    ...(overlays.length > 0 ? { overlays } : {}),
    ...(requiresAudioMix ? { requiresAudioMix: true } : {}),
  };
};

const isSupportedVideoObject = (video: VideoObject): boolean => {
  if (video.startTime !== 0) return false;
  if ((video.offset ?? 0) < 0) return false;
  if (video.reversed) return false;
  if (video.subjectCropEnabled) return false;
  if (!isStaticObject(video)) return false;
  if (video.clipping || video.customClipping) return false;
  if (video.colorCorrection || video.vibration || video.shadow) return false;
  if (video.opacity !== 1) return false;
  if (video.rotation !== 0) return false;
  if (!Number.isFinite(video.scaleX) || !Number.isFinite(video.scaleY)) return false;
  if (video.scaleX <= 0 || video.scaleY <= 0) return false;
  if (!Number.isFinite(video.x) || !Number.isFinite(video.y)) return false;
  if (!Number.isFinite(video.width) || !Number.isFinite(video.height)) return false;
  return true;
};

const isStaticObject = (object: TimelineObject): boolean => {
  if (object.enableAnimation) return false;
  if (object.keyframes && object.keyframes.length > 0) return false;
  if (object.motionPath && object.motionPath.length > 0) return false;
  if (object.filters && object.filters.length > 0) return false;
  return true;
};

const resolveStaticOverlay = (
  object: TimelineObject,
  durationSeconds: number
): ProjectExportVideoTranscodeOverlay | null => {
  if (!isStaticObject(object)) return null;
  if (object.startTime !== 0) return null;
  if (object.duration + 0.0001 < durationSeconds) return null;
  if (object.rotation !== 0) return null;
  if (!Number.isFinite(object.x) || !Number.isFinite(object.y)) return null;
  if (!Number.isFinite(object.scaleX) || !Number.isFinite(object.scaleY)) return null;
  if (object.scaleX <= 0 || object.scaleY <= 0) return null;
  const opacity = Math.max(0, Math.min(1, object.opacity ?? 1));
  if (opacity <= 0) return null;

  if (object.type === 'shape') {
    return resolveShapeOverlay(object, opacity);
  }
  if (object.type === 'image') {
    return resolveImageOverlay(object, opacity);
  }
  if (object.type === 'psd') {
    return resolvePsdOverlay(object, opacity);
  }
  return null;
};

const resolveShapeOverlay = (
  shape: ShapeObject,
  opacity: number
): ProjectExportVideoTranscodeOverlay | null => {
  if (shape.shapeType !== 'rect') return null;
  if (shape.gradient?.enabled) return null;
  if (shape.cornerRadius && shape.cornerRadius > 0) return null;
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(shape.fill)) return null;
  const width = Math.round(shape.width * shape.scaleX);
  const height = Math.round(shape.height * shape.scaleY);
  if (width <= 0 || height <= 0) return null;
  return {
    kind: 'solidColour',
    x: Math.round(shape.x),
    y: Math.round(shape.y),
    width,
    height,
    colour: shape.fill,
    opacity,
  };
};

const resolvePsdOverlay = (
  psd: PsdObject,
  opacity: number
): ProjectExportVideoTranscodeOverlay | null => {
  const path = psd.filePath?.trim();
  if (!path || !/\.psd$/i.test(path)) return null;
  if (!Number.isFinite(psd.scale) || psd.scale <= 0) return null;
  if (psd.lipSync?.enabled) return null;
  if (psd.worldPlacement?.enabled) return null;
  const width = Math.round(psd.width * psd.scale * psd.scaleX);
  const height = Math.round(psd.height * psd.scale * psd.scaleY);
  if (width <= 0 || height <= 0) return null;
  const activeLayerIds = Object.entries(psd.activeLayerIds ?? {})
    .filter(([, enabled]) => enabled)
    .map(([layerId]) => layerId)
    .sort((left, right) => {
      if (left === 'root') return right === 'root' ? 0 : -1;
      if (right === 'root') return 1;
      return left.localeCompare(right);
    });
  return {
    kind: 'psd',
    path,
    activeLayerIds,
    x: Math.round(psd.x),
    y: Math.round(psd.y),
    width,
    height,
    opacity,
  };
};

const resolveImageOverlay = (
  image: ImageObject,
  opacity: number
): ProjectExportVideoTranscodeOverlay | null => {
  const path = image.filePath?.trim();
  if (!path || !/\.(png|jpe?g)$/i.test(path)) return null;
  const width = Math.round(image.width * image.scaleX);
  const height = Math.round(image.height * image.scaleY);
  if (width <= 0 || height <= 0) return null;
  return {
    kind: 'image',
    path,
    x: Math.round(image.x),
    y: Math.round(image.y),
    width,
    height,
    opacity,
  };
};
