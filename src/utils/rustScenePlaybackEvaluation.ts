import { secondsToFrameIndex } from './rustSceneFrameRate';
import {
  rustScenePositionQueryTargetMatchesGraph,
  type RustScenePositionQueryTarget,
} from './rustScenePositionQueryRevision';

export interface RustScenePlaybackEvaluationIdentity {
  sceneId: string;
  revision: number;
  frameIndex: number;
}

export const getRustSceneGeometryFrameIndexForTime = ({
  timeSeconds,
  fps,
  nativePlaybackActive,
  isPlaying,
}: {
  timeSeconds: number;
  fps: number;
  nativePlaybackActive: boolean;
  isPlaying: boolean;
}): number => {
  if (!nativePlaybackActive || !isPlaying) return secondsToFrameIndex(timeSeconds, fps);
  const safeSeconds = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 60;
  return Math.max(0, Math.floor(safeSeconds * safeFps));
};

export const isRustScenePlaybackEvaluationCurrent = ({
  evaluation,
  frameIndex,
  status,
  currentTimeSeconds,
  fps,
  target,
  projectSettings,
  layers,
  objects,
}: {
  evaluation: RustScenePlaybackEvaluationIdentity | null | undefined;
  frameIndex: number;
  status: string;
  currentTimeSeconds: number;
  fps: number;
  target: RustScenePositionQueryTarget | null;
  projectSettings: object;
  layers: readonly unknown[];
  objects: readonly unknown[];
}): boolean => Boolean(
  status !== 'failed'
  && status !== 'ended'
  && evaluation
  && evaluation.sceneId === 'viewport-rust-timeline'
  && Number.isSafeInteger(evaluation.revision)
  && Number.isSafeInteger(evaluation.frameIndex)
  && Number.isSafeInteger(frameIndex)
  && evaluation.frameIndex === frameIndex
  && target?.revision === evaluation.revision
  && rustScenePositionQueryTargetMatchesGraph(target, {
    sceneId: evaluation.sceneId,
    revision: evaluation.revision,
    projectSettings,
    layers,
    objects,
  })
  && Number.isFinite(currentTimeSeconds)
  && Number.isFinite(fps)
  && fps > 0
  // Native controller computes `floor(time * fps)`. The renderer's scrub path
  // keeps secondsToFrameIndex's existing round semantics separately.
  && frameIndex === Math.max(0, Math.floor(currentTimeSeconds * fps)),
);
