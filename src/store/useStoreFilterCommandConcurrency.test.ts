import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShapeObject } from '../types';
import type { Command } from '../generated/rustCore/Command';
import type { SceneData } from '../generated/rustCore/SceneData';
import type { RustBackendApplyCommandResult } from '../utils/rustBackendCommandBridge';
import { setCommandBridgeForTests } from '../utils/rustBackendCommandBridge';
import { useStore } from './useStore';

const shape = (id: string): ShapeObject => ({
  id,
  type: 'shape',
  name: id,
  layer: 0,
  startTime: 0,
  duration: 5,
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
  fill: '#ffffff',
});

const cloneScene = (scene: SceneData): SceneData => JSON.parse(JSON.stringify(scene)) as SceneData;

const applyFilterCommandInFakeRust = (scene: SceneData, command: Command): SceneData => {
  const nextScene = cloneScene(scene);
  const object = nextScene.objects.find((entry) => entry.id === (command as { objectId?: string }).objectId);
  if (!object) return nextScene;
  if (command.kind === 'addFilter') {
    object.filters = [...(object.filters ?? []), command.filter];
  } else if (command.kind === 'toggleFilterEnabled') {
    const filter = object.filters?.find((entry) => entry.id === command.filterId);
    if (filter) filter.enabled = !filter.enabled;
  } else if (command.kind === 'updateFilterParams') {
    const filter = object.filters?.find((entry) => entry.id === command.filterId);
    if (filter) {
      filter.params = {
        ...(filter.params as Record<string, unknown>),
        ...(command.next as Record<string, unknown>),
      } as typeof filter.params;
    }
  }
  return nextScene;
};

type PendingCall = {
  scene: SceneData;
  command: Command;
  resolve: (result: RustBackendApplyCommandResult) => void;
};

describe('filter command forward path concurrency', () => {
  beforeEach(() => {
    useStore.getState().initializeProject({ width: 1920, height: 1080, fps: 60, sampleRate: 48_000 });
  });

  afterEach(() => setCommandBridgeForTests(null));

  it('応答中の別オブジェクト追加と対象オブジェクトの別プロパティ編集を保持する', async () => {
    const pending: PendingCall[] = [];
    setCommandBridgeForTests({
      applyCommand: ({ scene, command }) => new Promise((resolve) => {
        pending.push({ scene, command, resolve });
      }),
    });
    useStore.getState().addObject(shape('A'));
    useStore.setState((state) => ({
      objects: state.objects.map((object) => object.id === 'A' ? { ...object, x: 99 } : object),
      pastCommands: [],
    }));

    const request = useStore.getState().addObjectFilter('A', 'blur');
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    expect(pending).toHaveLength(1);
    expect(pending[0].scene.objects).toHaveLength(1);
    expect(pending[0].scene.layers).toHaveLength(0);

    useStore.setState((state) => ({ objects: [...state.objects, shape('B')] }));
    pending[0].resolve({
      success: true,
      result: { scene: applyFilterCommandInFakeRust(pending[0].scene, pending[0].command) },
    });
    await request;

    expect(useStore.getState().objects.map((object) => object.id)).toEqual(['A', 'B']);
    expect(useStore.getState().objects.find((object) => object.id === 'A')?.x).toBe(99);
    expect(useStore.getState().objects.find((object) => object.id === 'A')?.filters).toHaveLength(1);
  });

  it('同一オブジェクトのパラメータ応答を直列化し、最終値を反映する', async () => {
    const pending: PendingCall[] = [];
    useStore.getState().addObject(shape('A'));
    setCommandBridgeForTests({
      applyCommand: async ({ scene, command }) => ({
        success: true,
        result: { scene: applyFilterCommandInFakeRust(scene, command) },
      }),
    });
    await useStore.getState().addObjectFilter('A', 'blur');
    setCommandBridgeForTests({
      applyCommand: ({ scene, command }) => new Promise((resolve) => {
        pending.push({ scene, command, resolve });
      }),
    });
    useStore.setState({ pastCommands: [] });
    const filterId = useStore.getState().objects[0].filters![0].id;

    const first = useStore.getState().updateObjectFilterParams('A', filterId, { strength: 3 });
    const latest = useStore.getState().updateObjectFilterParams('A', filterId, { strength: 9 });
    await vi.waitFor(() => expect(pending).toHaveLength(1));

    pending[0].resolve({
      success: true,
      result: { scene: applyFilterCommandInFakeRust(pending[0].scene, pending[0].command) },
    });
    await vi.waitFor(() => expect(pending).toHaveLength(2));

    pending[1].resolve({
      success: true,
      result: { scene: applyFilterCommandInFakeRust(pending[1].scene, pending[1].command) },
    });
    await Promise.all([first, latest]);
    const filter = useStore.getState().objects[0].filters![0];
    if (filter.type === 'blur') expect(filter.params.strength).toBe(9);
  });

  it('連続したslider入力では開始済みの結果を反映し、待機中の中間入力をcoalesceする', async () => {
    const pending: PendingCall[] = [];
    useStore.getState().addObject(shape('drag-target'));
    setCommandBridgeForTests({
      applyCommand: async ({ scene, command }) => ({
        success: true,
        result: { scene: applyFilterCommandInFakeRust(scene, command) },
      }),
    });
    await useStore.getState().addObjectFilter('drag-target', 'blur');
    const filterId = useStore.getState().objects.find((object) => object.id === 'drag-target')!.filters![0].id;
    setCommandBridgeForTests({
      applyCommand: ({ scene, command }) => new Promise((resolve) => {
        pending.push({ scene, command, resolve });
      }),
    });

    const requests = Array.from({ length: 10 }, (_, index) =>
      useStore.getState().updateObjectFilterParams('drag-target', filterId, { strength: index + 1 }),
    );
    await vi.waitFor(() => expect(pending).toHaveLength(1));

    pending[0].resolve({
      success: true,
      result: { scene: applyFilterCommandInFakeRust(pending[0].scene, pending[0].command) },
    });
    await vi.waitFor(() => expect(pending).toHaveLength(2));

    const firstFilter = useStore.getState().objects.find((object) => object.id === 'drag-target')!.filters![0];
    if (firstFilter.type === 'blur') expect(firstFilter.params.strength).toBe(1);
    expect(pending[1].command).toMatchObject({
      kind: 'updateFilterParams',
      next: { strength: 10 },
    });

    pending[1].resolve({
      success: true,
      result: { scene: applyFilterCommandInFakeRust(pending[1].scene, pending[1].command) },
    });
    await Promise.all(requests);

    const finalFilter = useStore.getState().objects.find((object) => object.id === 'drag-target')!.filters![0];
    if (finalFilter.type === 'blur') expect(finalFilter.params.strength).toBe(10);
    expect(pending.length).toBeLessThanOrEqual(3);
  });

  it('異なるオブジェクトの応答が逆順でも互いの更新を上書きしない', async () => {
    const pending: PendingCall[] = [];
    setCommandBridgeForTests({
      applyCommand: ({ scene, command }) => new Promise((resolve) => {
        pending.push({ scene, command, resolve });
      }),
    });
    useStore.getState().addObject(shape('A'));
    useStore.getState().addObject(shape('B'));
    useStore.setState({ pastCommands: [] });

    const first = useStore.getState().addObjectFilter('A', 'blur');
    const second = useStore.getState().addObjectFilter('B', 'fade');
    await vi.waitFor(() => expect(pending).toHaveLength(2));

    pending[1].resolve({
      success: true,
      result: { scene: applyFilterCommandInFakeRust(pending[1].scene, pending[1].command) },
    });
    await second;
    pending[0].resolve({
      success: true,
      result: { scene: applyFilterCommandInFakeRust(pending[0].scene, pending[0].command) },
    });
    await first;

    expect(useStore.getState().objects.find((object) => object.id === 'A')?.filters).toHaveLength(1);
    expect(useStore.getState().objects.find((object) => object.id === 'B')?.filters).toHaveLength(1);
  });

  it('要求中に削除された対象やロックされたレイヤーへ応答を適用しない', async () => {
    const pending: PendingCall[] = [];
    setCommandBridgeForTests({
      applyCommand: ({ scene, command }) => new Promise((resolve) => {
        pending.push({ scene, command, resolve });
      }),
    });
    useStore.getState().addObject(shape('deleted'));
    useStore.setState({ pastCommands: [] });
    const deletedRequest = useStore.getState().addObjectFilter('deleted', 'blur');
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    useStore.setState({ objects: [] });
    pending[0].resolve({ success: true, result: { scene: applyFilterCommandInFakeRust(pending[0].scene, pending[0].command) } });
    await deletedRequest;
    expect(useStore.getState().objects).toEqual([]);

    useStore.getState().addObject(shape('locked'));
    useStore.setState({ pastCommands: [] });
    const lockedRequest = useStore.getState().addObjectFilter('locked', 'blur');
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    useStore.setState((state) => ({ layers: state.layers.map((layer, index) => index === 0 ? { ...layer, locked: true } : layer) }));
    pending[1].resolve({ success: true, result: { scene: applyFilterCommandInFakeRust(pending[1].scene, pending[1].command) } });
    await lockedRequest;
    expect(useStore.getState().objects.find((object) => object.id === 'locked')?.filters).toHaveLength(0);
  });
});
