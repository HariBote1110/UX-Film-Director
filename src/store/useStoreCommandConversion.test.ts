import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ShapeObject } from '../types';
import type { Command } from '../generated/rustCore/Command';
import type { SceneData } from '../generated/rustCore/SceneData';
import { setCommandBridgeForTests } from '../utils/rustBackendCommandBridge';
import { useStore } from './useStore';

/**
 * R4-8 group c: `useStore.ts` の 17 箇所を `pushHistoryCommand` へ変換した
 * ことのテスト。実際に bridge へ IPC を投げる undo/redo の正しさは
 * group b の `historySlice.test.ts` で別途固定済みなので、ここでは
 * 「各アクションが `pastCommands` へ正しい形の `Command` を積むか」
 * （単一 Command / Batch の構造・降順 index・zero-target guard）に絞る。
 */
const shape = (id: string, layer: number, startTime: number, duration: number): ShapeObject => ({
  id,
  type: 'shape',
  name: id,
  layer,
  startTime,
  duration,
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
  width: 120,
  height: 80,
  fill: '#ffffff',
});

describe('useStore の pushHistoryCommand 変換(R4-8 group c)', () => {
  beforeEach(() => {
    useStore.getState().initializeProject({
      width: 1920,
      height: 1080,
      fps: 60,
      sampleRate: 48_000,
    });
    useStore.setState({ pastCommands: [], futureCommands: [] });
    setCommandBridgeForTests({
      applyCommand: async ({ scene, command }): Promise<{ success: true; result: { scene: SceneData } }> => {
        const nextScene = JSON.parse(JSON.stringify(scene)) as SceneData;
        const object = nextScene.objects.find((entry) => entry.id === (command as { objectId?: string }).objectId);
        if (object && command.kind === 'addFilter') {
          object.filters = [...(object.filters ?? []), command.filter];
        }
        if (object && command.kind === 'toggleFilterEnabled') {
          const filter = object.filters?.find((entry) => entry.id === command.filterId);
          if (filter) filter.enabled = !filter.enabled;
        }
        if (object && command.kind === 'removeFilter') {
          object.filters = (object.filters ?? []).filter((entry) => entry.id !== command.filterId);
        }
        if (object && command.kind === 'updateFilterParams') {
          const filter = object.filters?.find((entry) => entry.id === command.filterId) as
            | { params: Record<string, unknown> }
            | undefined;
          if (filter) filter.params = { ...filter.params, ...(command.next as Record<string, unknown>) };
        }
        return { success: true, result: { scene: nextScene } };
      },
    });
  });

  afterEach(() => setCommandBridgeForTests(null));

  it('addObject: addObject Commandを1件積む(indexは追加前のobjects.length)', () => {
    useStore.getState().addObject(shape('A', 0, 0, 5));
    const commands = useStore.getState().pastCommands;
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ kind: 'addObject', index: 0 });

    useStore.setState({ pastCommands: [] });
    useStore.getState().addObject(shape('B', 0, 5, 5));
    expect(useStore.getState().pastCommands[0]).toMatchObject({ kind: 'addObject', index: 1 });
  });

  it('deleteObject: removeObject Commandを1件積む', () => {
    useStore.getState().addObject(shape('A', 0, 0, 5));
    useStore.setState({ pastCommands: [] });

    useStore.getState().deleteObject('A');

    const commands = useStore.getState().pastCommands;
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ kind: 'removeObject', objectId: 'A', index: 0 });
  });

  it('addObjectFilter/toggleObjectFilter/removeObjectFilter: フィルタ系Commandを積む', async () => {
    useStore.getState().addObject(shape('A', 0, 0, 5));
    useStore.setState({ pastCommands: [] });

    await useStore.getState().addObjectFilter('A', 'blur');
    expect(useStore.getState().pastCommands[0]).toMatchObject({ kind: 'addFilter', objectId: 'A', index: 0 });

    const filterId = useStore.getState().objects[0].filters![0].id;
    useStore.setState({ pastCommands: [] });

    await useStore.getState().toggleObjectFilter('A', filterId);
    expect(useStore.getState().pastCommands[0]).toMatchObject({ kind: 'toggleFilterEnabled', objectId: 'A', filterId });

    useStore.setState({ pastCommands: [] });
    await useStore.getState().removeObjectFilter('A', filterId);
    expect(useStore.getState().pastCommands[0]).toMatchObject({ kind: 'removeFilter', objectId: 'A', filterId, index: 0 });
  });

  it('存在しないfilterIdへのtoggle/removeはCommandを積まない(guard)', async () => {
    useStore.getState().addObject(shape('A', 0, 0, 5));
    useStore.setState({ pastCommands: [] });

    await useStore.getState().toggleObjectFilter('A', 'no-such-filter');
    expect(useStore.getState().pastCommands).toEqual([]);

    await useStore.getState().removeObjectFilter('A', 'no-such-filter');
    expect(useStore.getState().pastCommands).toEqual([]);
  });

  it('updateObjectFilterParams: Rustの適用結果を反映し、履歴は増やさない', async () => {
    useStore.getState().addObject(shape('A', 0, 0, 5));
    useStore.setState({ pastCommands: [] });
    await useStore.getState().addObjectFilter('A', 'blur');
    useStore.setState({ pastCommands: [] });

    const filterId = useStore.getState().objects[0].filters![0].id;
    await useStore.getState().updateObjectFilterParams('A', filterId, { strength: 12 });

    const filter = useStore.getState().objects[0].filters![0];
    expect(filter.type).toBe('blur');
    if (filter.type === 'blur') expect(filter.params.strength).toBe(12);
    expect(useStore.getState().pastCommands).toEqual([]);
  });

  it('deleteSelectedObjects: 複数RemoveObjectを降順indexでBatchに積む', () => {
    useStore.getState().addObject(shape('A', 0, 0, 5));
    useStore.getState().addObject(shape('B', 0, 5, 5));
    useStore.getState().addObject(shape('C', 0, 10, 5));
    useStore.getState().selectObjects(['A', 'C']);
    useStore.setState({ pastCommands: [] });

    useStore.getState().deleteSelectedObjects();

    const commands = useStore.getState().pastCommands;
    expect(commands).toHaveLength(1);
    const batch = commands[0];
    expect(batch.kind).toBe('batch');
    if (batch.kind !== 'batch') throw new Error('expected batch');
    expect(batch.commands.map((c) => (c as { objectId?: string }).objectId)).toEqual(['C', 'A']);
  });

  it('対象0件のdeleteSelectedObjectsはCommandを積まない(zero-target guard)', () => {
    useStore.getState().selectObjects([]);
    useStore.getState().deleteSelectedObjects();
    expect(useStore.getState().pastCommands).toEqual([]);
  });

  it('rippleDeleteObject: RemoveObject + 後続のsetObjectField(startTime)をBatchに積む', () => {
    useStore.getState().addObject(shape('A', 0, 0, 5));
    useStore.getState().addObject(shape('B', 0, 5, 5));
    useStore.getState().addObject(shape('C', 0, 12, 3));
    useStore.setState({ pastCommands: [] });

    useStore.getState().rippleDeleteObject('B');

    const commands = useStore.getState().pastCommands;
    expect(commands).toHaveLength(1);
    const batch = commands[0];
    expect(batch.kind).toBe('batch');
    if (batch.kind !== 'batch') throw new Error('expected batch');
    expect(batch.commands[0]).toMatchObject({ kind: 'removeObject', objectId: 'B' });
    const shiftCommand = batch.commands.find((c) => c.kind === 'setObjectField');
    expect(shiftCommand).toMatchObject({ kind: 'setObjectField', objectId: 'C', field: 'startTime', previous: 12, next: 7 });
  });

  it('splitObject: RemoveObject + AddObject×2をBatchに積む', () => {
    useStore.getState().addObject(shape('A', 0, 0, 10));
    useStore.getState().selectObjects(['A']);
    useStore.getState().setTime(4);
    useStore.setState({ pastCommands: [] });

    useStore.getState().splitObject();

    const commands = useStore.getState().pastCommands;
    expect(commands).toHaveLength(1);
    const batch = commands[0];
    expect(batch.kind).toBe('batch');
    if (batch.kind !== 'batch') throw new Error('expected batch');
    expect(batch.commands).toHaveLength(3);
    expect(batch.commands[0]).toMatchObject({ kind: 'removeObject', objectId: 'A', index: 0 });
    expect(batch.commands[1]).toMatchObject({ kind: 'addObject', index: 0 });
    expect(batch.commands[2]).toMatchObject({ kind: 'addObject', index: 1 });
  });

  it('groupSelectedObjects: 変更されたオブジェクトぶんのsetObjectFieldをBatchに積む', () => {
    useStore.getState().addObject(shape('A', 0, 0, 5));
    useStore.getState().addObject(shape('B', 1, 0, 5));
    useStore.getState().selectObjects(['A', 'B']);
    useStore.setState({ pastCommands: [] });

    useStore.getState().groupSelectedObjects();

    const commands = useStore.getState().pastCommands;
    expect(commands).toHaveLength(1);
    const batch = commands[0];
    expect(batch.kind).toBe('batch');
    if (batch.kind !== 'batch') throw new Error('expected batch');
    const objectIds = new Set(batch.commands.map((c) => (c as { objectId?: string }).objectId));
    expect(objectIds).toEqual(new Set(['A', 'B']));
    batch.commands.forEach((c) => {
      expect(c).toMatchObject({ kind: 'setObjectField', field: 'groupId' });
    });
  });
});
