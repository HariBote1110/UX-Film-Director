import { describe, expect, it } from 'vitest';
import {
  getRustSceneGeometryFrameIndexForTime,
  isRustScenePlaybackEvaluationCurrent,
} from './rustScenePlaybackEvaluation';
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
  const evaluation = { sceneId: target.sceneId, revision: 4, frameIndex: 12 };
  const base = {
    evaluation,
    frameIndex: 12,
    status: 'playing',
    currentTimeSeconds: 0.209,
    fps: 60,
    target,
    ...graph,
  };

  it('現在のgraph revisionと通知frameが一致する評価だけを受け入れる', () => {
    expect(isRustScenePlaybackEvaluationCurrent(base)).toBe(true);
  });

  it('native通知のfloor frameと時刻が一致し、React scrubは従来どおりroundする', () => {
    expect(getRustSceneGeometryFrameIndexForTime({
      timeSeconds: 0.209,
      fps: 60,
      nativePlaybackActive: true,
      isPlaying: true,
    })).toBe(12);
    expect(getRustSceneGeometryFrameIndexForTime({
      timeSeconds: 0.209,
      fps: 60,
      nativePlaybackActive: false,
      isPlaying: false,
    })).toBe(13);
  });

  it.each([
    ['native通知時刻からのround値', { evaluation: { ...evaluation, frameIndex: 13 }, frameIndex: 13 }],
    ['遅いpresentのframe', { evaluation: { ...evaluation, frameIndex: 11 }, frameIndex: 11 }],
    ['通知frameと評価frameの不一致', { frameIndex: 13 }],
    ['次revisionへの切替', { target: { ...target, revision: 5 } }],
    ['replace前に変更されたobjects', { objects: [{}] }],
    ['ended通知', { status: 'ended' }],
    ['failed通知', { status: 'failed' }],
  ])('%sを拒否する', (_label, override) => {
    expect(isRustScenePlaybackEvaluationCurrent({ ...base, ...override })).toBe(false);
  });
});
