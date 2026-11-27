import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShapeObject } from '../types';
import type { Command } from '../generated/rustCore/Command';
import type { SceneData } from '../generated/rustCore/SceneData';
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

const applyFilterCommand = (scene: SceneData, command: Command): SceneData => {
  const next = JSON.parse(JSON.stringify(scene)) as SceneData;
  const object = next.objects.find((entry) => entry.id === (command as { objectId?: string }).objectId);
  if (object && command.kind === 'addFilter') object.filters = [...(object.filters ?? []), command.filter];
  if (object && command.kind === 'updateFilterParams') {
    const filter = object.filters?.find((entry) => entry.id === command.filterId);
    if (filter) filter.params = { ...(filter.params as Record<string, unknown>), ...(command.next as Record<string, unknown>) } as typeof filter.params;
  }
  return next;
};

describe('filter parameter edit sessions', () => {
  beforeEach(() => {
    useStore.getState().initializeProject({ width: 1920, height: 1080, fps: 60, sampleRate: 48_000 });
    setCommandBridgeForTests({
      applyCommand: async ({ scene, command }) => ({ success: true, result: { scene: applyFilterCommand(scene, command) } }),
    });
  });

  afterEach(() => setCommandBridgeForTests(null));

  const addBlur = async (id = 'A') => {
    useStore.getState().addObject(shape(id));
    await useStore.getState().addObjectFilter(id, 'blur');
    useStore.setState({ pastCommands: [], futureCommands: [] });
    return useStore.getState().objects.find((object) => object.id === id)!.filters![0].id;
  };

  it('複数入力を開始値から最終値までの1 Commandにまとめ、Rust適用・undo・redoを一致させる', async () => {
    const filterId = await addBlur();
    useStore.getState().beginObjectFilterParamsEdit('A', filterId);
    await useStore.getState().updateObjectFilterParams('A', filterId, { strength: 3 });
    await useStore.getState().updateObjectFilterParams('A', filterId, { strength: 8 });
    await useStore.getState().updateObjectFilterParams('A', filterId, { strength: 12 });
    await useStore.getState().commitObjectFilterParamsEdit('A', filterId);

    expect(useStore.getState().pastCommands).toHaveLength(1);
    expect(useStore.getState().pastCommands[0]).toMatchObject({
      kind: 'updateFilterParams', objectId: 'A', filterId,
      previous: { strength: 4 }, next: { strength: 12 },
    });
    await useStore.getState().undoCommand();
    expect(useStore.getState().objects[0].filters![0]).toMatchObject({ params: { strength: 4 } });
    await useStore.getState().redoCommand();
    expect(useStore.getState().objects[0].filters![0]).toMatchObject({ params: { strength: 12 } });
  });

  it('変更なし・削除済み・ロック済みのsessionは履歴を積まない', async () => {
    const filterId = await addBlur();
    useStore.getState().beginObjectFilterParamsEdit('A', filterId);
    await useStore.getState().commitObjectFilterParamsEdit('A', filterId);
    expect(useStore.getState().pastCommands).toEqual([]);

    useStore.getState().beginObjectFilterParamsEdit('A', filterId);
    await useStore.getState().updateObjectFilterParams('A', filterId, { strength: 7 });
    useStore.setState({ objects: [] });
    await useStore.getState().commitObjectFilterParamsEdit('A', filterId);
    expect(useStore.getState().pastCommands).toEqual([]);

    const lockedFilterId = await addBlur('locked');
    useStore.getState().beginObjectFilterParamsEdit('locked', lockedFilterId);
    await useStore.getState().updateObjectFilterParams('locked', lockedFilterId, { strength: 7 });
    useStore.setState((state) => ({ layers: state.layers.map((layer, index) => index === 0 ? { ...layer, locked: true } : layer) }));
    await useStore.getState().commitObjectFilterParamsEdit('locked', lockedFilterId);
    expect(useStore.getState().pastCommands).toEqual([]);
  });

  it('scene切替で編集中sessionを破棄し、旧sceneの履歴を新sceneへ持ち込まない', async () => {
    const filterId = await addBlur();
    const oldSceneId = useStore.getState().activeSceneId;
    const sessionId = useStore.getState().beginObjectFilterParamsEdit('A', filterId)!;
    await useStore.getState().updateObjectFilterParams('A', filterId, { strength: 15 });

    useStore.getState().addScene();
    await useStore.getState().commitObjectFilterParamsEdit('A', filterId, sessionId);

    expect(useStore.getState().activeSceneId).not.toBe(oldSceneId);
    expect(useStore.getState().objects).toEqual([]);
    expect(useStore.getState().pastCommands).toEqual([]);
  });

  it('遅れて届くblur commitはundo後のredo履歴を消さない', async () => {
    const filterId = await addBlur();
    useStore.getState().beginObjectFilterParamsEdit('A', filterId);
    await useStore.getState().updateObjectFilterParams('A', filterId, { strength: 9 });
    await useStore.getState().commitObjectFilterParamsEdit('A', filterId);
    await useStore.getState().undoCommand();
    const redoBeforeBlur = [...useStore.getState().futureCommands];

    await useStore.getState().commitObjectFilterParamsEdit('A', filterId);

    expect(useStore.getState().futureCommands).toEqual(redoBeforeBlur);
  });

  it('blur前にCtrl+Zが発火した場合も編集中の変更を確定してから一度戻す', async () => {
    const filterId = await addBlur();
    useStore.getState().beginObjectFilterParamsEdit('A', filterId);
    await useStore.getState().updateObjectFilterParams('A', filterId, { strength: 11 });

    await useStore.getState().undoCommand();

    expect(useStore.getState().objects[0].filters![0]).toMatchObject({ params: { strength: 4 } });
    expect(useStore.getState().pastCommands).toEqual([]);
    expect(useStore.getState().futureCommands).toHaveLength(1);
  });

  it('filter IPCをflush中の連続Undoをpending lockで直列化する', async () => {
    const filterId = await addBlur();
    const pending: Array<{
      scene: SceneData;
      command: Command;
      resolve: (result: { success: true; result: { scene: SceneData } }) => void;
    }> = [];
    setCommandBridgeForTests({
      applyCommand: ({ scene, command }) => new Promise((resolve) => pending.push({ scene, command, resolve })),
    });
    useStore.getState().beginObjectFilterParamsEdit('A', filterId);
    const update = useStore.getState().updateObjectFilterParams('A', filterId, { strength: 10 });
    await Promise.resolve();
    const firstUndo = useStore.getState().undoCommand();
    const secondUndo = useStore.getState().undoCommand();

    expect(useStore.getState().isCommandHistoryPending).toBe(true);
    expect(pending).toHaveLength(1);
    pending[0].resolve({ success: true, result: { scene: applyFilterCommand(pending[0].scene, pending[0].command) } });
    await update;
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1].resolve({ success: true, result: { scene: applyFilterCommand(pending[1].scene, pending[1].command) } });
    await Promise.all([firstUndo, secondUndo]);

    expect(useStore.getState().objects[0].filters![0]).toMatchObject({ params: { strength: 4 } });
    expect(useStore.getState().pastCommands).toEqual([]);
    expect(useStore.getState().futureCommands).toHaveLength(1);
  });

  it('前のIPC応答待ち中に次のgestureが始まっても、境界ごとの履歴を保持する', async () => {
    const filterId = await addBlur();
    const pending: Array<{
      scene: SceneData;
      command: Command;
      resolve: (result: { success: true; result: { scene: SceneData } }) => void;
    }> = [];
    setCommandBridgeForTests({
      applyCommand: ({ scene, command }) => new Promise((resolve) => pending.push({ scene, command, resolve })),
    });

    const firstSession = useStore.getState().beginObjectFilterParamsEdit('A', filterId)!;
    const firstUpdate = useStore.getState().updateObjectFilterParams('A', filterId, { strength: 6 });
    const firstCommit = useStore.getState().commitObjectFilterParamsEdit('A', filterId, firstSession);
    await Promise.resolve();
    expect(pending).toHaveLength(1);

    const secondSession = useStore.getState().beginObjectFilterParamsEdit('A', filterId)!;
    const secondUpdate = useStore.getState().updateObjectFilterParams('A', filterId, { strength: 13 });
    const secondCommit = useStore.getState().commitObjectFilterParamsEdit('A', filterId, secondSession);
    pending[0].resolve({ success: true, result: { scene: applyFilterCommand(pending[0].scene, pending[0].command) } });
    await firstCommit;
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1].resolve({ success: true, result: { scene: applyFilterCommand(pending[1].scene, pending[1].command) } });
    await Promise.all([firstUpdate, secondUpdate, secondCommit]);

    expect(useStore.getState().pastCommands).toHaveLength(2);
    expect(useStore.getState().pastCommands.map((command) => [command.kind, command.kind === 'updateFilterParams' && command.previous, command.kind === 'updateFilterParams' && command.next])).toEqual([
      ['updateFilterParams', { strength: 4 }, { strength: 6 }],
      ['updateFilterParams', { strength: 6 }, { strength: 13 }],
    ]);
    setCommandBridgeForTests({
      applyCommand: async ({ scene, command }) => ({ success: true, result: { scene: applyFilterCommand(scene, command) } }),
    });
    await useStore.getState().undoCommand();
    expect(useStore.getState().objects[0].filters![0]).toMatchObject({ params: { strength: 6 } });
    await useStore.getState().undoCommand();
    expect(useStore.getState().objects[0].filters![0]).toMatchObject({ params: { strength: 4 } });
  });
});
