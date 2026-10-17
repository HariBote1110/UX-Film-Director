import { describe, expect, it } from 'vitest';
import {
  getRustSceneGeometryFrameIndexForTime,
  isRustScenePlaybackEvaluationCurrent,
  isRustScenePlaybackPauseResultCurrent,
  isRustScenePlaybackUiStateOwner,
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

describe('isRustScenePlaybackUiStateOwner', () => {
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
  const state = {
    sessionId: 22,
    sceneId: target.sceneId,
    revision: 4,
    status: 'paused',
  };
  const base = {
    state,
    currentSessionId: 22,
    target,
    expectedRevision: 4,
    ...graph,
  };

  it('同じscene/revisionで再startした後、旧pause eventを拒否する', () => {
    expect(isRustScenePlaybackUiStateOwner({
      ...base,
      state: { ...state, sessionId: 21 },
    })).toBe(false);
  });

  it.each([
    ['scrubでownerを無効化', { currentSessionId: null }],
    ['別revisionへgraph replace', { target: { ...target, revision: 5 }, expectedRevision: 5 }],
    ['objects変更後の古いevent', { objects: [{}] }],
    ['stop eventの旧session', { state: { ...state, status: 'stopped', sessionId: 21 } }],
  ])('%sを拒否する', (_label, override) => {
    expect(isRustScenePlaybackUiStateOwner({ ...base, ...override })).toBe(false);
  });

  it.each(['failed', 'ended'])('%sも現在sessionのowner guardを通す', (status) => {
    expect(isRustScenePlaybackUiStateOwner({
      ...base,
      state: { ...state, status },
    })).toBe(true);
  });
});

describe('isRustScenePlaybackPauseResultCurrent', () => {
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
  const base = {
    requestGeneration: 10,
    currentGeneration: 10,
    requestedTimeSeconds: 2.5,
    currentTimeSeconds: 2.5,
    requestedSceneId: target.sceneId,
    requestedRevision: target.revision,
    target,
    expectedRevision: 4,
    ...graph,
  };

  it('pauseのidentity・timeが変わらなければ結果を適用できる', () => {
    expect(isRustScenePlaybackPauseResultCurrent(base)).toBe(true);
  });

  it.each([
    ['pause後のscrub', { currentTimeSeconds: 3 }],
    ['pause後の再start', { currentGeneration: 11 }],
    ['新scene/revision', { target: { ...target, revision: 5 }, expectedRevision: 5 }],
    ['graph変更', { objects: [{}] }],
  ])('%sの遅着pause結果を拒否する', (_label, override) => {
    expect(isRustScenePlaybackPauseResultCurrent({ ...base, ...override })).toBe(false);
  });
});
