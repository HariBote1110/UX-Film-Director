import type { TimelineObject, VideoObject } from '../types';
import { resolveVideoFsPath } from './resolveVideoFsPath';

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
  if (objects.length !== 1) return null;
  const object = objects[0];
  if (object.type !== 'video') return null;
  const video = object as VideoObject;
  const inputPath = resolveVideoFsPath(video);
  if (!inputPath) return null;
  if (video.startTime !== 0) return null;
  if ((video.offset ?? 0) < 0) return null;
  if (video.reversed) return null;
  if (video.subjectCropEnabled) return null;
  if (video.filters && video.filters.length > 0) return null;
  if (video.clipping || video.customClipping) return null;
  if (video.colorCorrection || video.vibration || video.shadow) return null;
  if (video.opacity !== 1) return null;
  if (video.rotation !== 0) return null;
  if (!Number.isFinite(video.scaleX) || !Number.isFinite(video.scaleY)) return null;
  if (video.scaleX <= 0 || video.scaleY <= 0) return null;
  if (!Number.isFinite(video.x) || !Number.isFinite(video.y)) return null;
  if (!Number.isFinite(video.width) || !Number.isFinite(video.height)) return null;
  const objectX = Math.round(video.x);
  const objectY = Math.round(video.y);
  const objectWidth = Math.round(video.width * video.scaleX);
  const objectHeight = Math.round(video.height * video.scaleY);
  const audioVolume = video.muted ? 0 : Math.max(0, Math.min(4, video.volume ?? 1));
  if (objectX < 0 || objectY < 0) return null;
  if (objectWidth <= 0 || objectHeight <= 0) return null;
  if (objectX + objectWidth > width || objectY + objectHeight > height) return null;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  if (!Number.isFinite(fps) || fps <= 0) return null;

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
  };
};
