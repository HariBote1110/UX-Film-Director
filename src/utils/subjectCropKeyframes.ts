import type { SubjectCropNormKeyframe, VideoObject } from '../types';
import { visionNormBoundingBoxToPixiNormRect } from './visionTrackingGeometry';
import type { VisionTrackSample } from './visionTrackingKeyframes';

const EPSILON = 0.0001;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const clampNormRect = (r: { x: number; y: number; width: number; height: number }) => {
  const x = clamp(r.x, 0, 1);
  const y = clamp(r.y, 0, 1);
  const width = clamp(r.width, 0, 1);
  const height = clamp(r.height, 0, 1);
  const x2 = Math.min(1, x + width);
  const y2 = Math.min(1, y + height);
  return {
    x,
    y,
    width: Math.max(0, x2 - x),
    height: Math.max(0, y2 - y)
  };
};

export const normaliseSubjectCropKeyframesForVideo = (
  video: Pick<VideoObject, 'startTime' | 'duration'>,
  keyframes: SubjectCropNormKeyframe[] | null | undefined
): SubjectCropNormKeyframe[] => {
  if (!Array.isArray(keyframes) || keyframes.length === 0) return [];

  const start = video.startTime;
  const end = video.startTime + video.duration;

  const normalised = keyframes.map((kf) => {
    const id = typeof kf.id === 'string' && kf.id.trim() !== '' ? kf.id : crypto.randomUUID();
    const time = clamp(typeof kf.time === 'number' && Number.isFinite(kf.time) ? kf.time : start, start, end);
    const rect = clampNormRect({
      x: kf.x,
      y: kf.y,
      width: kf.width,
      height: kf.height
    });
    return { id, time, ...rect };
  });

  normalised.sort((a, b) => {
    if (Math.abs(a.time - b.time) > EPSILON) return a.time - b.time;
    return a.id.localeCompare(b.id);
  });

  return normalised;
};

export const shiftSubjectCropKeyframesForObject = (
  keyframes: SubjectCropNormKeyframe[],
  deltaTime: number,
  nextStartTime: number,
  nextDuration: number
): SubjectCropNormKeyframe[] => {
  const shifted = keyframes.map((k) => ({ ...k, time: k.time + deltaTime }));
  return normaliseSubjectCropKeyframesForVideo(
    { startTime: nextStartTime, duration: nextDuration },
    shifted
  );
};

export const buildSubjectCropKeyframesFromVisionTrackSamples = (
  samples: VisionTrackSample[],
  video: VideoObject
): SubjectCropNormKeyframe[] => {
  if (!Array.isArray(samples) || samples.length === 0) return [];

  const offsetSec = video.offset ?? 0;
  const clipStart = video.startTime;
  const clipEnd = video.startTime + video.duration;

  const toTimelineSec = (mediaSec: number) => clipStart + (mediaSec - offsetSec);

  return samples.map((sample) => {
    const timelineSec = clamp(toTimelineSec(sample.tSec), clipStart, clipEnd);
    const norm = clampNormRect(visionNormBoundingBoxToPixiNormRect(sample.boundingBox));
    return {
      id: crypto.randomUUID(),
      time: timelineSec,
      ...norm
    };
  });
};
