import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearRustSceneEvaluatedGeometryFrame,
  expectRustSceneEvaluatedGeometryRevision,
  getRustSceneEvaluatedGeometryFrame,
  publishRustSceneEvaluatedGeometryFrame,
  subscribeRustSceneEvaluatedGeometryFrame,
} from './rustSceneEvaluatedGeometryStore';

const evaluation = (revision: number, frameIndex: number) => ({
  sceneId: 'scene-a', revision, frameIndex,
  snapshot: { frame_index: frameIndex, colour: {}, clips: [] },
  media: [],
});

afterEach(() => {
  expectRustSceneEvaluatedGeometryRevision(null);
  clearRustSceneEvaluatedGeometryFrame();
});

describe('Rust evaluated geometry frame store', () => {
  it('publishes evaluated frames and ignores late older revision results', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRustSceneEvaluatedGeometryFrame(listener);
    publishRustSceneEvaluatedGeometryFrame(evaluation(4, 1));
    publishRustSceneEvaluatedGeometryFrame(evaluation(5, 2));
    publishRustSceneEvaluatedGeometryFrame(evaluation(4, 3));
    expect(getRustSceneEvaluatedGeometryFrame()).toMatchObject({ revision: 5, frameIndex: 2 });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('only clears the matching scene/revision and settles subscribers on clear', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRustSceneEvaluatedGeometryFrame(listener);
    publishRustSceneEvaluatedGeometryFrame(evaluation(5, 2));
    clearRustSceneEvaluatedGeometryFrame('scene-b');
    expect(getRustSceneEvaluatedGeometryFrame()).not.toBeNull();
    clearRustSceneEvaluatedGeometryFrame('scene-a', 4);
    expect(getRustSceneEvaluatedGeometryFrame()).not.toBeNull();
    clearRustSceneEvaluatedGeometryFrame('scene-a', 5);
    expect(getRustSceneEvaluatedGeometryFrame()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('does not let a late evaluation from the previous scene overwrite the expected revision', () => {
    expectRustSceneEvaluatedGeometryRevision({ sceneId: 'scene-b', revision: 2 });
    publishRustSceneEvaluatedGeometryFrame(evaluation(1, 12));
    publishRustSceneEvaluatedGeometryFrame({ ...evaluation(2, 13), sceneId: 'scene-b' });
    expect(getRustSceneEvaluatedGeometryFrame()).toMatchObject({ sceneId: 'scene-b', revision: 2, frameIndex: 13 });
    expectRustSceneEvaluatedGeometryRevision(null);
  });
});
