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

export interface RustScenePlaybackUiStateIdentity {
  sessionId: number;
  sceneId: string;
  revision: number;
  status: string;
}

export const shouldRequestRustScenePlaybackPause = ({
  sessionId,
  nativePlaybackActive,
}: {
  sessionId: number | null;
  nativePlaybackActive: boolean;
}): boolean => sessionId !== null || nativePlaybackActive;

export const shouldRebaseRustScenePlaybackForScrub = ({
  nativePlaybackActive,
  isPlaying,
  applyingNativePlaybackTime,
}: {
  nativePlaybackActive: boolean;
  isPlaying: boolean;
  applyingNativePlaybackTime: boolean;
}): boolean => nativePlaybackActive && isPlaying && !applyingNativePlaybackTime;

export const resolveRustScenePlaybackStartTimeAfterPause = ({
  currentTimeSeconds,
  pausedTimeSeconds,
  pauseResultCurrent,
  isScrubRebase,
}: {
  currentTimeSeconds: number;
  pausedTimeSeconds: number | null;
  pauseResultCurrent: boolean;
  isScrubRebase: boolean;
}): number => pauseResultCurrent
  && !isScrubRebase
  && pausedTimeSeconds !== null
  && Number.isFinite(pausedTimeSeconds)
  ? pausedTimeSeconds
  : currentTimeSeconds;

export const isRustScenePlaybackUiStateOwner = ({
  state,
  currentSessionId,
  target,
  expectedRevision,
  projectSettings,
  layers,
  objects,
}: {
  state: RustScenePlaybackUiStateIdentity;
  currentSessionId: number | null;
  target: RustScenePositionQueryTarget | null;
  expectedRevision: number | null;
  projectSettings: object;
  layers: readonly unknown[];
  objects: readonly unknown[];
}): boolean => Number.isSafeInteger(state.sessionId)
  && currentSessionId !== null
  && state.sessionId === currentSessionId
  && state.sceneId === 'viewport-rust-timeline'
  && Number.isSafeInteger(state.revision)
  && state.revision === expectedRevision
  && target?.revision === state.revision
  && rustScenePositionQueryTargetMatchesGraph(target, {
    sceneId: state.sceneId,
    revision: state.revision,
    projectSettings,
    layers,
    objects,
  });

export const isRustScenePlaybackPauseResultCurrent = ({
  requestGeneration,
  currentGeneration,
  requestedTimeSeconds,
  currentTimeSeconds,
  requestedSceneId,
  requestedRevision,
  target,
  expectedRevision,
  projectSettings,
  layers,
  objects,
}: {
  requestGeneration: number;
  currentGeneration: number;
  requestedTimeSeconds: number;
  currentTimeSeconds: number;
  requestedSceneId: string;
  requestedRevision: number;
  target: RustScenePositionQueryTarget | null;
  expectedRevision: number | null;
  projectSettings: object;
  layers: readonly unknown[];
  objects: readonly unknown[];
}): boolean => requestGeneration === currentGeneration
  && Number.isFinite(requestedTimeSeconds)
  && requestedTimeSeconds === currentTimeSeconds
  && target?.sceneId === requestedSceneId
  && target.revision === requestedRevision
  && target.revision === expectedRevision
  && rustScenePositionQueryTargetMatchesGraph(target, {
    sceneId: requestedSceneId,
    revision: requestedRevision,
    projectSettings,
    layers,
    objects,
  });

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
