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

export const isRustScenePlaybackEvaluationCurrent = ({
  evaluation,
  status,
  currentTimeSeconds,
  fps,
  target,
  projectSettings,
  layers,
  objects,
}: {
  evaluation: RustScenePlaybackEvaluationIdentity | null | undefined;
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
  && evaluation.frameIndex === secondsToFrameIndex(currentTimeSeconds, fps),
);
