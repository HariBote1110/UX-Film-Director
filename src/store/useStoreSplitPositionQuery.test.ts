import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShapeObject } from '../types';
import type { SceneData } from '../generated/rustCore/SceneData';
import type {
  RustBackendSceneBridge,
  RustBackendSceneObjectPositionsPayload,
} from '../utils/rustBackendSceneControl';
import {
  clearRustScenePositionQueryRevision,
  publishRustScenePositionQueryResident,
  publishRustScenePositionQueryTarget,
} from '../utils/rustScenePositionQueryRevision';
import { setCommandBridgeForTests } from '../utils/rustBackendCommandBridge';
import { useStore } from './useStore';

const shape = (): ShapeObject => ({
  id: 'split-target',
  type: 'shape',
  name: 'Split target',
  layer: 0,
  startTime: 0,
  duration: 10,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  shapeType: 'rect',
  width: 100,
  height: 80,
  fill: '#fff',
});

const publishCurrentResident = () => {
  const state = useStore.getState();
  const target = {
    sceneId: 'viewport-rust-timeline',
    revision: 9,
    projectSettings: state.projectSettings,
    layers: state.layers,
    objects: state.objects,
  };
  publishRustScenePositionQueryTarget(target);
  publishRustScenePositionQueryResident({ sceneId: target.sceneId, revision: target.revision });
};

const installCommandBridge = () => setCommandBridgeForTests({
  applyCommand: async ({ scene }): Promise<{ success: true; result: { scene: SceneData } }> => ({
    success: true,
    result: { scene: JSON.parse(JSON.stringify(scene)) as SceneData },
  }),
});

const makeSceneBridge = (queryObjectPositions: RustBackendSceneBridge['queryObjectPositions']): RustBackendSceneBridge => ({
  replaceScene: async () => { throw new Error('replaceScene must not run'); },
  evaluateScene: async () => { throw new Error('evaluateScene must not run'); },
  queryObjectPositions,
});

describe('splitObject のRust位置query移行', () => {
  beforeEach(() => {
    useStore.getState().initializeProject({ width: 1920, height: 1080, fps: 60, sampleRate: 48_000 });
    useStore.getState().addObject(shape());
    useStore.getState().selectObjects(['split-target']);
    useStore.getState().setTime(4);
    useStore.setState({ pastCommands: [], futureCommands: [] });
    vi.stubEnv('VITE_UXFD_RUST_EDIT_POSITION_QUERY', '1');
    installCommandBridge();
  });

  afterEach(() => {
    clearRustScenePositionQueryRevision('test cleanup');
    setCommandBridgeForTests(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('raw-second Rust localPositionで分割し、Undo履歴は1 Batchにまとめる', async () => {
    const queryObjectPositions: RustBackendSceneBridge['queryObjectPositions'] = vi.fn(async (payload: RustBackendSceneObjectPositionsPayload) => ({
      success: true as const,
      result: {
        sceneId: payload.sceneId,
        revision: payload.revision,
        positions: payload.queries.map((query) => ({
          ...query,
          localPosition: { x: 41, y: 52 },
          worldPosition: { x: 41, y: 52 },
          groupTranslation: { x: 0, y: 0 },
          worldRotationDegrees: 0,
          worldScaleX: 1,
          worldScaleY: 1,
        })),
      },
    }));
    vi.stubGlobal('window', { rustBackend: makeSceneBridge(queryObjectPositions), alert: vi.fn() });
    publishCurrentResident();

    const result = useStore.getState().splitObject();
    expect(result).toBeInstanceOf(Promise);
    await result;

    expect(queryObjectPositions).toHaveBeenCalledWith(expect.objectContaining({
      sceneId: 'viewport-rust-timeline',
      revision: 9,
      queries: [{ requestId: expect.any(String), objectId: 'split-target', timeSeconds: 4 }],
    }));
    expect(useStore.getState().objects).toMatchObject([
      { id: 'split-target', duration: 4, endX: 41, endY: 52 },
      { startTime: 4, duration: 6, x: 41, y: 52, offset: 4 },
    ]);
    expect(useStore.getState().pastCommands).toHaveLength(1);
    const [batch] = useStore.getState().pastCommands;
    expect(batch).toMatchObject({ kind: 'batch', commands: expect.any(Array) });
    if (batch.kind !== 'batch') throw new Error('expected a single batch command');
    expect(batch.commands).toHaveLength(3);
  });

  it.each(['time', 'selection', 'scene', 'objects', 'lock'] as const)(
    'query中に%sが変わった場合は遅延応答を適用しない', async (changed) => {
      let requestPayload: Parameters<RustBackendSceneBridge['queryObjectPositions']>[0] | undefined;
      let resolveQuery: ((value: Awaited<ReturnType<RustBackendSceneBridge['queryObjectPositions']>>) => void) | undefined;
      const queryObjectPositions: RustBackendSceneBridge['queryObjectPositions'] = vi.fn((payload) => {
        requestPayload = payload;
        return new Promise<Awaited<ReturnType<RustBackendSceneBridge['queryObjectPositions']>>>((resolve) => {
          resolveQuery = resolve;
        });
      });
      vi.stubGlobal('window', { rustBackend: makeSceneBridge(queryObjectPositions) });
      publishCurrentResident();

      const pending = useStore.getState().splitObject();
      await vi.waitFor(() => expect(queryObjectPositions).toHaveBeenCalled());
      if (changed === 'time') useStore.getState().setTime(5);
      if (changed === 'selection') useStore.setState({ selectedId: 'other-object', selectedIds: ['other-object'] });
      if (changed === 'scene') useStore.setState({ activeSceneId: 'other-scene' });
      if (changed === 'objects') useStore.setState({ objects: useStore.getState().objects.slice() });
      if (changed === 'lock') {
        useStore.setState({ layers: useStore.getState().layers.map((layer, index) => (
          index === 0 ? { ...layer, locked: true } : layer
        )) });
      }
      resolveQuery?.({
        success: true,
        result: {
          sceneId: 'viewport-rust-timeline',
          revision: 9,
          positions: requestPayload!.queries.map((query) => ({
            ...query,
            localPosition: { x: 41, y: 52 },
            worldPosition: { x: 41, y: 52 },
            groupTranslation: { x: 0, y: 0 },
            worldRotationDegrees: 0,
            worldScaleX: 1,
            worldScaleY: 1,
          })),
        },
      });
      await pending;

      expect(useStore.getState().objects).toHaveLength(1);
      expect(useStore.getState().objects[0]).toMatchObject({ id: 'split-target', duration: 10 });
      expect(useStore.getState().pastCommands).toEqual([]);
    },
  );

  it('locked layerはqueryもsplitも行わない', async () => {
    const queryObjectPositions = vi.fn();
    vi.stubGlobal('window', { rustBackend: makeSceneBridge(queryObjectPositions) });
    useStore.setState({ layers: [{ name: 'Locked', visible: true, locked: true }] });

    const result = useStore.getState().splitObject();
    await result;

    expect(queryObjectPositions).not.toHaveBeenCalled();
    expect(useStore.getState().objects).toHaveLength(1);
    expect(useStore.getState().pastCommands).toEqual([]);
  });

  it('Rust query失敗時はTS位置へfallbackせずsplitしない', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const queryObjectPositions: RustBackendSceneBridge['queryObjectPositions'] = vi.fn(async () => ({
      success: false as const,
      error: 'unsupported scene',
      errorCode: -32065,
    }));
    vi.stubGlobal('window', { rustBackend: makeSceneBridge(queryObjectPositions), alert: vi.fn() });
    publishCurrentResident();

    await useStore.getState().splitObject();

    expect(useStore.getState().objects).toHaveLength(1);
    expect(useStore.getState().objects[0]).toMatchObject({ id: 'split-target', duration: 10 });
    expect(useStore.getState().pastCommands).toEqual([]);
  });
});
