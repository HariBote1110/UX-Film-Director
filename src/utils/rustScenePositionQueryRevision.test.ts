import { afterEach, describe, expect, it } from 'vitest';
import {
  clearRustScenePositionQueryRevision,
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
  });
});
