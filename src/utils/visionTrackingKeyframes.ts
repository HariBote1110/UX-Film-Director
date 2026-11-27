import type { PositionKeyframe, TimelineObject, VideoObject } from '../types';
import type {
  RustBackendSceneObjectPosition,
  RustBackendScenePositionQuery,
} from './rustBackendSceneControl';
import {
  localTopLeftPointToWorld,
  visionNormBoundingBoxCentreToLocalTopLeft,
  type VisionNormBoundingBox
} from './visionTrackingGeometry';

export type VisionTrackSample = {
  tSec: number;
  boundingBox: VisionNormBoundingBox;
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

type VisionTrackPosition = RustBackendSceneObjectPosition;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Build deterministic raw-timeline-second requests for video and overlay positions. */
export const buildVisionTrackPositionQueryPlan = ({
  samples,
  video,
  overlay,
}: {
  samples: VisionTrackSample[];
  video: VideoObject;
  overlay: TimelineObject;
}): VisionTrackPositionQueryPlan => {
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
  const firstGroupTranslation = firstOverlay.groupTranslation;
  const deltaX = firstOverlay.localPosition.x + firstGroupTranslation.x - firstCentre.x;
  const deltaY = firstOverlay.localPosition.y + firstGroupTranslation.y - firstCentre.y;

  return plan.samples.map(({ sample, timeSeconds, videoRequestId, overlayRequestId }) => {
    const videoPosition = resolve(videoRequestId, video.id, timeSeconds);
    const overlayPosition = resolve(overlayRequestId, overlay.id, timeSeconds, true);
    const centre = trackedCentre(sample, videoPosition.localPosition);
    const groupTranslation = overlayPosition.groupTranslation;
    return {
      id: crypto.randomUUID(),
      time: timeSeconds,
      x: centre.x + deltaX - groupTranslation.x,
      y: centre.y + deltaY - groupTranslation.y,
      easing: overlay.easing ?? 'linear',
    };
  });
};
