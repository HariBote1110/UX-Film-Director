import { describe, expect, it } from 'vitest';
import {
  evaluateRustBackendScene,
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
          result: { sceneId: payload.sceneId, revision: payload.revision },
        };
      },
      evaluateScene: async () => {
        throw new Error('evaluate must not run');
      },
    };

    await expect(replaceRustBackendScene(scene, bridge)).resolves.toEqual({
      ok: true,
      value: { sceneId: 'preview:scene-1', revision: 7 },
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

  it.each([
    [-32060, 'missingScene'],
    [-32061, 'staleRevision'],
    [-32062, 'revisionMismatch'],
  ] as const)('Rust error code %s を %s に分類する', async (errorCode, reason) => {
    const bridge: RustBackendSceneBridge = {
      replaceScene: async () => ({ success: false, errorCode, error: 'scene rpc failed' }),
      evaluateScene: async () => {
        throw new Error('evaluate must not run');
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
