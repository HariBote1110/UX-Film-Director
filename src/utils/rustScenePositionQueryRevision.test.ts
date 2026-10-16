import { afterEach, describe, expect, it } from 'vitest';
import {
  clearRustScenePositionQueryRevision,
  isRustScenePositionQueryActionCurrent,
  publishRustScenePositionQueryFailure,
  publishRustScenePositionQueryResident,
  publishRustScenePositionQueryTarget,
  waitForRustScenePositionQueryRevision,
} from './rustScenePositionQueryRevision';

const graph = {
  sceneId: 'viewport-rust-timeline',
  revision: 4,
  projectSettings: {},
  layers: [] as unknown[],
  objects: [] as unknown[],
};

afterEach(() => clearRustScenePositionQueryRevision('test cleanup'));

describe('rustScenePositionQueryRevision', () => {
  it('async keyframe action はselection/time/scene/graphが一致する場合だけ現行扱いする', () => {
    const action = {
      activeSceneId: 'scene-1',
      selectedObjectId: 'object-1',
      timeSeconds: 0.37,
      projectSettings: {},
      layers: [] as unknown[],
      objects: [] as unknown[],
    };
    expect(isRustScenePositionQueryActionCurrent(action, { ...action })).toBe(true);
    expect(isRustScenePositionQueryActionCurrent(action, { ...action, timeSeconds: 0.38 })).toBe(false);
    expect(isRustScenePositionQueryActionCurrent(action, { ...action, selectedObjectId: 'object-2' })).toBe(false);
    expect(isRustScenePositionQueryActionCurrent(action, { ...action, activeSceneId: 'scene-2' })).toBe(false);
    expect(isRustScenePositionQueryActionCurrent(action, { ...action, objects: [] })).toBe(false);
  });

  it('同一graphのresident ackまで待ち、ack revisionを返す', async () => {
    publishRustScenePositionQueryTarget(graph);
    const waiting = waitForRustScenePositionQueryRevision(graph);
    publishRustScenePositionQueryResident({ sceneId: graph.sceneId, revision: graph.revision });
    await expect(waiting).resolves.toBe(4);
  });

  it('graph切替・scene失敗・disposeで待機をrejectする', async () => {
    publishRustScenePositionQueryTarget(graph);
    const waitingForOldGraph = waitForRustScenePositionQueryRevision(graph);
    publishRustScenePositionQueryTarget({ ...graph, revision: 5, objects: [] });
    await expect(waitingForOldGraph).rejects.toThrow('superseded');

    const waitingForFailure = waitForRustScenePositionQueryRevision({ ...graph, revision: 5, objects: [] });
    publishRustScenePositionQueryFailure(graph.sceneId, 'replace failed');
    await expect(waitingForFailure).rejects.toThrow('replace failed');
    await expect(waitForRustScenePositionQueryRevision({ ...graph, revision: 5, objects: [] }))
      .rejects.toThrow('replace failed');
  });

  it('同graphの新revisionは旧waiterをrejectし、遅着ack/failureは無視する', async () => {
    publishRustScenePositionQueryTarget(graph);
    const oldWaiter = waitForRustScenePositionQueryRevision(graph);
    publishRustScenePositionQueryTarget({ ...graph, revision: 5 });
    await expect(oldWaiter).rejects.toThrow('superseded');

    const nextWaiter = waitForRustScenePositionQueryRevision(graph);
    publishRustScenePositionQueryFailure(graph.sceneId, 'late old replace failure', 4);
    publishRustScenePositionQueryResident({ sceneId: graph.sceneId, revision: 4 });
    let settled = false;
    void nextWaiter.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    publishRustScenePositionQueryResident({ sceneId: graph.sceneId, revision: 5 });
    await expect(nextWaiter).resolves.toBe(5);
  });
});
