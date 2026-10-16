import type { PositionKeyframe, TimelineObject, VideoObject } from '../types';
import type { RustBackendScenePositionQuery } from './rustBackendSceneControl';
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

export type VisionTrackPositionQuerySample = {
  sample: VisionTrackSample;
  timeSeconds: number;
  videoRequestId: string;
  overlayRequestId: string;
};

export type VisionTrackPositionQueryPlan = {
  queries: RustBackendScenePositionQuery[];
  samples: VisionTrackPositionQuerySample[];
};

type VisionTrackPosition = {
  requestId: string;
  objectId: string;
  timeSeconds: number;
  localPosition: { x: number; y: number };
  worldPosition: { x: number; y: number };
  groupTranslation?: { x: number; y: number };
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Build deterministic raw-timeline-second requests for video and overlay positions. */
export const buildVisionTrackPositionQueryPlan = ({
  samples,
  video,
  overlay,
}: Pick<BuildOverlayKeyframesParams, 'samples' | 'video' | 'overlay'>): VisionTrackPositionQueryPlan => {
  if (!Array.isArray(samples) || samples.length === 0) return { queries: [], samples: [] };

  const clipStart = video.startTime;
  const clipEnd = video.startTime + video.duration;
  const offsetSec = video.offset ?? 0;
  const plannedSamples = samples.map((sample, index) => {
    const timeSeconds = clamp(clipStart + (sample.tSec - offsetSec), clipStart, clipEnd);
    return {
      sample,
      timeSeconds,
      videoRequestId: `vision-${index}-video`,
      overlayRequestId: `vision-${index}-overlay`,
    };
  });

  return {
    samples: plannedSamples,
    queries: plannedSamples.flatMap(({ timeSeconds, videoRequestId, overlayRequestId }) => [
      { requestId: videoRequestId, objectId: video.id, timeSeconds },
      { requestId: overlayRequestId, objectId: overlay.id, timeSeconds },
    ]),
  };
};

/** Convert Rust position results into Vision keyframes while preserving legacy group-only semantics. */
export const buildOverlayPositionKeyframesFromPositionQuery = ({
  plan,
  video,
  overlay,
  positions,
}: {
  plan: VisionTrackPositionQueryPlan;
  video: VideoObject;
  overlay: TimelineObject;
  positions: readonly VisionTrackPosition[];
}): PositionKeyframe[] => {
  if (plan.samples.length === 0) return [];

  const byRequestId = new Map(positions.map((position) => [position.requestId, position]));
  const resolve = (
    requestId: string,
    objectId: string,
    timeSeconds: number,
    requireGroupTranslation = false,
  ): VisionTrackPosition => {
    const position = byRequestId.get(requestId);
    if (!position || position.objectId !== objectId || position.timeSeconds !== timeSeconds
      || !Number.isFinite(position.localPosition?.x) || !Number.isFinite(position.localPosition?.y)
      || !Number.isFinite(position.worldPosition?.x) || !Number.isFinite(position.worldPosition?.y)
      || (requireGroupTranslation && (!Number.isFinite(position.groupTranslation?.x)
        || !Number.isFinite(position.groupTranslation?.y)))) {
      throw new Error(`Rust position query returned an absent or mismatched position for ${requestId}.`);
    }
    return position;
  };

  const first = plan.samples[0];
  const firstVideo = resolve(first.videoRequestId, video.id, first.timeSeconds);
  const firstOverlay = resolve(first.overlayRequestId, overlay.id, first.timeSeconds, true);
  const trackedCentre = (sample: VisionTrackSample, localPosition: { x: number; y: number }) => {
    const local = visionNormBoundingBoxCentreToLocalTopLeft(sample.boundingBox, video.width, video.height);
    return localTopLeftPointToWorld(local, {
      x: localPosition.x,
      y: localPosition.y,
      rotationDeg: video.rotation ?? 0,
      scaleX: video.scaleX ?? 1,
      scaleY: video.scaleY ?? 1,
    });
  };
  const firstCentre = trackedCentre(first.sample, firstVideo.localPosition);
  const firstGroupTranslation = firstOverlay.groupTranslation!;
  const deltaX = firstOverlay.localPosition.x + firstGroupTranslation.x - firstCentre.x;
  const deltaY = firstOverlay.localPosition.y + firstGroupTranslation.y - firstCentre.y;

  return plan.samples.map(({ sample, timeSeconds, videoRequestId, overlayRequestId }) => {
    const videoPosition = resolve(videoRequestId, video.id, timeSeconds);
    const overlayPosition = resolve(overlayRequestId, overlay.id, timeSeconds, true);
    const centre = trackedCentre(sample, videoPosition.localPosition);
    const groupTranslation = overlayPosition.groupTranslation!;
    return {
      id: crypto.randomUUID(),
      time: timeSeconds,
      x: centre.x + deltaX - groupTranslation.x,
      y: centre.y + deltaY - groupTranslation.y,
      easing: overlay.easing ?? 'linear',
    };
  });
};

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
