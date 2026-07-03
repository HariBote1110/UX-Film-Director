import type { PositionKeyframe, TimelineObject, VideoObject } from '../types';
import { evaluateObjectPositionAtTime } from './keyframes';
import { getGroupTransforms } from './sceneTransforms';
import {
  localTopLeftPointToWorld,
  visionNormBoundingBoxCentreToLocalTopLeft,
  type VisionNormBoundingBox
} from './visionTrackingGeometry';

export type VisionTrackSample = {
  tSec: number;
  boundingBox: VisionNormBoundingBox;
};

export type BuildOverlayKeyframesParams = {
  samples: VisionTrackSample[];
  video: VideoObject;
  overlay: TimelineObject;
  allObjects: TimelineObject[];
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const videoTransformAtTimelineTime = (video: VideoObject, timelineSec: number): {
  x: number;
  y: number;
  rotationDeg: number;
  scaleX: number;
  scaleY: number;
} => {
  const p = evaluateObjectPositionAtTime(video, timelineSec);
  return {
    x: p.x,
    y: p.y,
    rotationDeg: video.rotation ?? 0,
    scaleX: video.scaleX ?? 1,
    scaleY: video.scaleY ?? 1
  };
};

const overlayWorldTopLeftAtTime = (overlay: TimelineObject, timelineSec: number, allObjects: TimelineObject[]) => {
  const base = evaluateObjectPositionAtTime(overlay, timelineSec);
  const ge = getGroupTransforms(overlay, timelineSec, allObjects);
  return { x: base.x + ge.x, y: base.y + ge.y };
};

const trackedCentreWorld = (sample: VisionTrackSample, video: VideoObject, timelineSec: number) => {
  const local = visionNormBoundingBoxCentreToLocalTopLeft(
    sample.boundingBox,
    video.width,
    video.height
  );
  const vt = videoTransformAtTimelineTime(video, timelineSec);
  return localTopLeftPointToWorld(local, vt);
};

/**
 * Vision トラッキングサンプル（メディア秒・Vision 正規化 bbox）から、オーバーレイの位置キーフレームを生成する。
 * 第 1 サンプル時点の「追従点（bbox 中心のワールド座標）」とオーバーレイ左上のワールド座標の差分を保つ。
 */
export const buildOverlayPositionKeyframesFromVisionTrack = (
  params: BuildOverlayKeyframesParams
): PositionKeyframe[] => {
  const { samples, video, overlay, allObjects } = params;
  if (!Array.isArray(samples) || samples.length === 0) return [];

  const offsetSec = video.offset ?? 0;
  const clipStart = video.startTime;
  const clipEnd = video.startTime + video.duration;

  const toTimelineSec = (mediaSec: number) => clipStart + (mediaSec - offsetSec);

  const first = samples[0];
  const t0 = clamp(toTimelineSec(first.tSec), clipStart, clipEnd);
  const w0 = trackedCentreWorld(first, video, t0);
  const o0 = overlayWorldTopLeftAtTime(overlay, t0, allObjects);
  const deltaX = o0.x - w0.x;
  const deltaY = o0.y - w0.y;

  const keyframes: PositionKeyframe[] = [];

  for (const sample of samples) {
    const timelineSec = clamp(toTimelineSec(sample.tSec), clipStart, clipEnd);
    const w = trackedCentreWorld(sample, video, timelineSec);
    const ge = getGroupTransforms(overlay, timelineSec, allObjects);
    const x = w.x + deltaX - ge.x;
    const y = w.y + deltaY - ge.y;
    keyframes.push({
      id: crypto.randomUUID(),
      time: timelineSec,
      x,
      y,
      easing: overlay.easing ?? 'linear'
    });
  }

  return keyframes;
};
