import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore, withObjectHistoryBatch } from './useStore';
import { setCommandBridgeForTests } from '../utils/rustBackendCommandBridge';
import type {
  RustBackendApplyCommandResult,
  RustBackendCommandBridge,
} from '../utils/rustBackendCommandBridge';
import type { Command } from '../generated/rustCore/Command';
import type { SceneData } from '../generated/rustCore/SceneData';
import type { ShapeObject, TimelineObject } from '../types';

const shape = (id: string, x: number, y: number): ShapeObject => ({
  id,
  type: 'shape',
  name: id,
  layer: 0,
  startTime: 0,
  duration: 5,
  x,
  y,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: x,
  endY: y,
  easing: 'linear',
  shapeType: 'rect',
  width: 80,
  height: 60,
  fill: '#ffffff',
});

const pastCommands = () => useStore.getState().pastCommands;
const getObject = (id: string) =>
  useStore.getState().objects.find((object) => object.id === id);

describe('updateObject の履歴記録（Phase 1: 差分コマンド化）', () => {
  beforeEach(() => {
    useStore.getState().initializeProject({
      width: 1920,
      height: 1080,
      fps: 30,
      sampleRate: 48000,
    });
    useStore.setState({ pastCommands: [], futureCommands: [], isCommandHistoryPending: false });
    setCommandBridgeForTests(null);
  });

  afterEach(() => {
    setCommandBridgeForTests(null);
    vi.restoreAllMocks();
  });

  it('record（既定）: 変更が setObjectField として積まれ redo が消える', () => {
    useStore.getState().addObject(shape('a', 100, 120));
    useStore.setState({
      pastCommands: [],
      futureCommands: [
        { kind: 'setObjectField', objectId: 'a', field: 'x', previous: 0, next: 1 },
      ],
    });

    useStore.getState().updateObject('a', { x: 150 });

    expect(getObject('a')?.x).toBe(150);
    expect(pastCommands()).toHaveLength(1);
    expect(pastCommands()[0]).toEqual({
      kind: 'setObjectField',
      objectId: 'a',
      field: 'x',
      previous: 100,
      next: 150,
    });
    expect(useStore.getState().futureCommands).toEqual([]);
  });

  it('実質無変更では何も積まない', () => {
    useStore.getState().addObject(shape('a', 100, 120));
    useStore.setState({ pastCommands: [], futureCommands: [] });

    useStore.getState().updateObject('a', { x: 100 });

    expect(pastCommands()).toHaveLength(0);
  });

  it('派生変更（キーフレームの追随シフト）も差分に含まれる', () => {
    const keyframed = {
      ...shape('a', 100, 120),
      keyframes: [{ id: 'k1', time: 1, x: 100, y: 120, easing: 'linear' as const }],
    };
    useStore.getState().addObject(keyframed);
    useStore.setState({ pastCommands: [], futureCommands: [] });

    useStore.getState().updateObject('a', { x: 150 });

    expect(pastCommands()).toHaveLength(1);
    const command = pastCommands()[0];
    const fields = command.kind === 'batch'
      ? command.commands.map((entry) => (entry.kind === 'setObjectField' ? entry.field : ''))
      : [command.kind === 'setObjectField' ? command.field : ''];
    expect(fields).toContain('keyframes');
  });

  it('連続編集は合体し、時間窓を過ぎると別ステップになる', () => {
    useStore.getState().addObject(shape('a', 100, 120));
    useStore.setState({ pastCommands: [], futureCommands: [] });
    const nowSpy = vi.spyOn(Date, 'now');
    const t0 = 1_000_000;
    nowSpy.mockReturnValue(t0);

    useStore.getState().updateObject('a', { x: 110 });
    nowSpy.mockReturnValue(t0 + 500);
    useStore.getState().updateObject('a', { x: 130 });

    expect(pastCommands()).toHaveLength(1);
    expect(pastCommands()[0]).toEqual({
      kind: 'setObjectField',
      objectId: 'a',
      field: 'x',
      previous: 100,
      next: 130,
    });

    nowSpy.mockReturnValue(t0 + 500 + 1500);
    useStore.getState().updateObject('a', { x: 140 });
    expect(pastCommands()).toHaveLength(2);
  });

  it('合体した編集が打ち消し合うと履歴ごと消える', () => {
    useStore.getState().addObject(shape('a', 100, 120));
    useStore.setState({ pastCommands: [], futureCommands: [] });
    const nowSpy = vi.spyOn(Date, 'now');
    const t0 = 2_000_000;
    nowSpy.mockReturnValue(t0);

    useStore.getState().updateObject('a', { x: 110 });
    nowSpy.mockReturnValue(t0 + 100);
    useStore.getState().updateObject('a', { x: 100 });

    expect(pastCommands()).toHaveLength(0);
  });

  it('defer / skip では積まれないが redo は無効化される', () => {
    useStore.getState().addObject(shape('a', 100, 120));
    const staleRedo: Command = {
      kind: 'setObjectField', objectId: 'a', field: 'x', previous: 0, next: 1,
    };
    useStore.setState({ pastCommands: [], futureCommands: [staleRedo] });

    useStore.getState().updateObject('a', { x: 150 }, { history: 'defer' });
    expect(getObject('a')?.x).toBe(150);
    expect(pastCommands()).toHaveLength(0);
    expect(useStore.getState().futureCommands).toEqual([]);

    useStore.setState({ futureCommands: [staleRedo] });
    useStore.getState().updateObject('a', { x: 160 }, { history: 'skip' });
    expect(getObject('a')?.x).toBe(160);
    expect(pastCommands()).toHaveLength(0);
    expect(useStore.getState().futureCommands).toEqual([]);
  });

  it('スキーマ外フィールドを含む差分は記録されない（値は適用される）', () => {
    useStore.getState().addObject(shape('a', 100, 120));
    useStore.setState({ pastCommands: [], futureCommands: [] });

    useStore.getState().updateObject(
      'a',
      { runtimeOnlyField: 42 } as unknown as Partial<TimelineObject>,
    );

    expect(
      (getObject('a') as unknown as Record<string, unknown>)?.runtimeOnlyField,
    ).toBe(42);
    expect(pastCommands()).toHaveLength(0);
  });

  it('withObjectHistoryBatch: 複数オブジェクトの編集が1バッチになる', () => {
    useStore.getState().addObject(shape('a', 100, 120));
    useStore.getState().addObject(shape('b', 200, 220));
    useStore.setState({ pastCommands: [], futureCommands: [] });

    withObjectHistoryBatch(() => {
      useStore.getState().updateObject('a', { x: 101 });
      useStore.getState().updateObject('b', { x: 201 });
    });

    expect(pastCommands()).toHaveLength(1);
    const command = pastCommands()[0];
    expect(command.kind).toBe('batch');
    if (command.kind === 'batch') {
      const objectIds = command.commands.map((entry) =>
        entry.kind === 'setObjectField' ? entry.objectId : '',
      );
      expect(objectIds).toEqual(['a', 'b']);
    }
  });

  it('記録した編集が undo / redo で往復する', async () => {
    useStore.getState().addObject(shape('a', 100, 120));
    useStore.setState({ pastCommands: [], futureCommands: [] });

    // Rust 側の模擬: 渡されたコマンドの next をシーンへ適用して返す。
    const applyToScene = (scene: SceneData, command: Command): SceneData => {
      const nextScene = JSON.parse(JSON.stringify(scene)) as SceneData;
      const applyOne = (entry: Command) => {
        if (entry.kind === 'batch') {
          entry.commands.forEach(applyOne);
          return;
        }
        if (entry.kind === 'setObjectField') {
          const target = nextScene.objects.find((object) => object.id === entry.objectId);
          if (target) {
            (target as unknown as Record<string, unknown>)[entry.field] = entry.next;
          }
        }
      };
      applyOne(command);
      return nextScene;
    };
    const bridge: RustBackendCommandBridge = {
      applyCommand: vi.fn(
        async ({ scene, command }: { scene: SceneData; command: Command }):
        Promise<RustBackendApplyCommandResult> => ({
          success: true,
          result: { scene: applyToScene(scene, command) },
        }),
      ),
    };
    setCommandBridgeForTests(bridge);

    useStore.getState().updateObject('a', { x: 150 });
    expect(getObject('a')?.x).toBe(150);

    await useStore.getState().undoCommand();
    expect(getObject('a')?.x).toBe(100);

    await useStore.getState().redoCommand();
    expect(getObject('a')?.x).toBe(150);
  });
});
