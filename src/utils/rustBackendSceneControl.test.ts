import { describe, expect, it } from 'vitest';
import {
  evaluateRustBackendScene,
  queryRustBackendSceneObjectPositions,
  replaceRustBackendScene,
  type RustBackendSceneBridge,
} from './rustBackendSceneControl';

const scene = {
  sceneId: 'preview:scene-1',
  revision: 7,
  project: { id: 'project-1' },
  media: [{ id: 'media-1', kind: 'SolidColour', source: '#112233' }],
};

describe('rustBackendSceneControl', () => {
  it('scene.replace を型付きpayloadでRust bridgeへ転送する', async () => {
    const calls: unknown[] = [];
    const bridge: RustBackendSceneBridge = {
      replaceScene: async (payload) => {
        calls.push(payload);
        return {
          success: true,
          result: { sceneId: payload.sceneId, revision: payload.revision, sceneSource: 'typescript', sceneFallbackReason: 'flagOff' },
        };
      },
      evaluateScene: async () => {
        throw new Error('evaluate must not run');
      },
      queryObjectPositions: async () => {
        throw new Error('position query must not run');
      },
    };

    await expect(replaceRustBackendScene(scene, bridge)).resolves.toEqual({
      ok: true,
      value: { sceneId: 'preview:scene-1', revision: 7, sceneSource: 'typescript', sceneFallbackReason: 'flagOff' },
    });
    expect(calls).toEqual([scene]);
  });

  it('scene.evaluate の評価済みsnapshotを型付き結果として返す', async () => {
    const calls: unknown[] = [];
    const bridge: RustBackendSceneBridge = {
      replaceScene: async () => {
        throw new Error('replace must not run');
      },
      evaluateScene: async (payload) => {
        calls.push(payload);
        return {
          success: true,
          result: {
            sceneId: payload.sceneId,
            revision: payload.revision,
            frameIndex: payload.frameIndex,
            snapshot: { frame_index: payload.frameIndex, clips: [] },
            media: [],
          },
        };
      },
      queryObjectPositions: async () => {
        throw new Error('position query must not run');
      },
    };

    await expect(evaluateRustBackendScene({
      sceneId: 'preview:scene-1',
      revision: 7,
      frameIndex: 42,
    }, bridge)).resolves.toEqual({
      ok: true,
      value: {
        sceneId: 'preview:scene-1',
        revision: 7,
        frameIndex: 42,
        snapshot: { frame_index: 42, clips: [] },
        media: [],
      },
    });
    expect(calls).toEqual([{ sceneId: 'preview:scene-1', revision: 7, frameIndex: 42 }]);
  });

  it('未量子化位置queryのidentityとlocal/world位置を検証して返す', async () => {
    const bridge: RustBackendSceneBridge = {
      replaceScene: async () => { throw new Error('replace must not run'); },
      evaluateScene: async () => { throw new Error('evaluate must not run'); },
      queryObjectPositions: async (payload) => ({
        success: true,
        result: {
          sceneId: payload.sceneId,
          revision: payload.revision,
          positions: payload.queries.map((query) => ({
            ...query,
            localPosition: { x: 40, y: 50 },
            groupTranslation: { x: 5, y: 5 },
            worldPosition: { x: 45, y: 55 },
            worldRotationDegrees: 0,
            worldScaleX: 1,
            worldScaleY: 1,
          })),
        },
      }),
    };

    await expect(queryRustBackendSceneObjectPositions({
      sceneId: 'viewport-rust-timeline',
      revision: 12,
      queries: [{ requestId: 'panel-1', objectId: 'object-1', timeSeconds: 0.5 }],
    }, bridge)).resolves.toMatchObject({
      ok: true,
      value: {
        revision: 12,
        positions: [{
          requestId: 'panel-1',
          objectId: 'object-1',
          timeSeconds: 0.5,
          localPosition: { x: 40, y: 50 },
          groupTranslation: { x: 5, y: 5 },
          worldPosition: { x: 45, y: 55 },
        }],
      },
    });
  });

  it('query response のrequest identityとf64時刻が一致しなければ拒否する', async () => {
    const bridge: RustBackendSceneBridge = {
      replaceScene: async () => { throw new Error('replace must not run'); },
      evaluateScene: async () => { throw new Error('evaluate must not run'); },
      queryObjectPositions: async (payload) => ({
        success: true,
        result: {
          sceneId: payload.sceneId,
          revision: payload.revision,
          positions: payload.queries.map((query) => ({
            ...query,
            timeSeconds: 0.3700000001,
            localPosition: { x: 1, y: 2 },
            groupTranslation: { x: 0, y: 0 },
            worldPosition: { x: 1, y: 2 },
            worldRotationDegrees: 0,
            worldScaleX: 1,
            worldScaleY: 1,
          })),
        },
      }),
    };

    await expect(queryRustBackendSceneObjectPositions({
      sceneId: 'viewport-rust-timeline',
      revision: 12,
      queries: [{ requestId: 'panel-1', objectId: 'object-1', timeSeconds: 0.37 }],
    }, bridge)).resolves.toMatchObject({ ok: false, reason: 'invalidResponse' });
  });

  it('groupTranslationを含まない旧query responseは拒否する', async () => {
    const bridge: RustBackendSceneBridge = {
      replaceScene: async () => { throw new Error('replace must not run'); },
      evaluateScene: async () => { throw new Error('evaluate must not run'); },
      queryObjectPositions: async (payload) => ({
        success: true,
        result: {
          sceneId: payload.sceneId,
          revision: payload.revision,
          positions: payload.queries.map((query) => ({
            ...query,
            localPosition: { x: 1, y: 2 },
            worldPosition: { x: 1, y: 2 },
            worldRotationDegrees: 0,
            worldScaleX: 1,
            worldScaleY: 1,
          })),
        },
      }),
    };

    await expect(queryRustBackendSceneObjectPositions({
      sceneId: 'viewport-rust-timeline',
      revision: 12,
      queries: [{ requestId: 'panel-1', objectId: 'object-1', timeSeconds: 0.5 }],
    }, bridge)).resolves.toMatchObject({ ok: false, reason: 'invalidResponse' });
  });

  it('重複requestIdをRustへ送らず拒否する', async () => {
    const bridge: RustBackendSceneBridge = {
      replaceScene: async () => { throw new Error('replace must not run'); },
      evaluateScene: async () => { throw new Error('evaluate must not run'); },
      queryObjectPositions: async () => { throw new Error('duplicate request must not run'); },
    };
    await expect(queryRustBackendSceneObjectPositions({
      sceneId: 'viewport-rust-timeline',
      revision: 12,
      queries: [
        { requestId: 'duplicate', objectId: 'object-1', timeSeconds: 0.37 },
        { requestId: 'duplicate', objectId: 'object-2', timeSeconds: 0.41 },
      ],
    }, bridge)).resolves.toMatchObject({ ok: false, reason: 'invalidResponse' });
  });

  it.each([
    [-32060, 'missingScene'],
    [-32061, 'staleRevision'],
    [-32062, 'revisionMismatch'],
    [-32065, 'unsupportedScene'],
  ] as const)('Rust error code %s を %s に分類する', async (errorCode, reason) => {
    const bridge: RustBackendSceneBridge = {
      replaceScene: async () => ({ success: false, errorCode, error: 'scene rpc failed' }),
      evaluateScene: async () => {
        throw new Error('evaluate must not run');
      },
      queryObjectPositions: async () => {
        throw new Error('position query must not run');
      },
    };

    await expect(replaceRustBackendScene(scene, bridge)).resolves.toEqual({
      ok: false,
      reason,
      detail: 'scene rpc failed',
      errorCode,
    });
  });
});
