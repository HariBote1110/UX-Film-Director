import { describe, expect, it } from 'vitest';
import { isRustScenePlaybackEvaluationCurrent } from './rustScenePlaybackEvaluation';
import type { RustScenePositionQueryTarget } from './rustScenePositionQueryRevision';

describe('isRustScenePlaybackEvaluationCurrent', () => {
  const graph = {
    projectSettings: {},
    layers: [] as readonly unknown[],
    objects: [] as readonly unknown[],
  };
  const target: RustScenePositionQueryTarget = {
    sceneId: 'viewport-rust-timeline',
    revision: 4,
    ...graph,
  };
  const evaluation = { sceneId: target.sceneId, revision: 4, frameIndex: 30 };
  const base = {
    evaluation,
    status: 'playing',
    currentTimeSeconds: 1,
    fps: 30,
    target,
    ...graph,
  };

  it('現在のgraph revisionと通知frameが一致する評価だけを受け入れる', () => {
    expect(isRustScenePlaybackEvaluationCurrent(base)).toBe(true);
  });

  it.each([
    ['遅いpresentのframe', { evaluation: { ...evaluation, frameIndex: 29 } }],
    ['次revisionへの切替', { target: { ...target, revision: 5 } }],
    ['replace前に変更されたobjects', { objects: [{}] }],
    ['ended通知', { status: 'ended' }],
    ['failed通知', { status: 'failed' }],
  ])('%sを拒否する', (_label, override) => {
    expect(isRustScenePlaybackEvaluationCurrent({ ...base, ...override })).toBe(false);
  });
});
