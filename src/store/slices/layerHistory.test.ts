import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../useStore';
import { setCommandBridgeForTests } from '../../utils/rustBackendCommandBridge';
import type {
  RustBackendApplyCommandResult,
  RustBackendCommandBridge,
} from '../../utils/rustBackendCommandBridge';
import type { Command } from '../../generated/rustCore/Command';
import type { SceneData } from '../../generated/rustCore/SceneData';

describe('レイヤーメタ編集の履歴記録（Phase 2: setLayerState 配線）', () => {
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
  });

  const pastCommands = () => useStore.getState().pastCommands;
  const layerAt = (index: number) => useStore.getState().layers[index];

  it('setLayerName が setLayerState コマンドを積む', () => {
    const before = layerAt(0);
    useStore.getState().setLayerName(0, '  メイン  ');

    expect(layerAt(0).name).toBe('メイン');
    expect(pastCommands()).toHaveLength(1);
    expect(pastCommands()[0]).toEqual({
      kind: 'setLayerState',
      index: 0,
      previous: before,
      next: { ...before, name: 'メイン' },
    });
  });

  it('同名への rename では積まない', () => {
    const before = layerAt(0);
    useStore.getState().setLayerName(0, before.name);
    expect(pastCommands()).toHaveLength(0);
  });

  it('toggleLayerVisibility / toggleLayerLock がコマンドを積む', () => {
    const before = layerAt(1);
    useStore.getState().toggleLayerVisibility(1);
    useStore.getState().toggleLayerLock(1);

    expect(layerAt(1).visible).toBe(!before.visible);
    expect(layerAt(1).locked).toBe(!before.locked);
    expect(pastCommands()).toHaveLength(2);
    expect(pastCommands()[0]).toEqual({
      kind: 'setLayerState',
      index: 1,
      previous: before,
      next: { ...before, visible: !before.visible },
    });
    expect(pastCommands()[1]).toEqual({
      kind: 'setLayerState',
      index: 1,
      previous: { ...before, visible: !before.visible },
      next: { ...before, visible: !before.visible, locked: !before.locked },
    });
  });

  it('範囲外インデックスでは何もしない', () => {
    useStore.getState().setLayerName(999, 'x');
    useStore.getState().toggleLayerVisibility(-1);
    expect(pastCommands()).toHaveLength(0);
  });

  it('undo / redo で往復し、LIFO の順序を守る', async () => {
    const applyToScene = (scene: SceneData, command: Command): SceneData => {
      const nextScene = JSON.parse(JSON.stringify(scene)) as SceneData;
      if (command.kind === 'setLayerState') {
        nextScene.layers[command.index] = JSON.parse(
          JSON.stringify(command.next),
        ) as SceneData['layers'][number];
      }
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

    const originalName = layerAt(0).name;
    const originalVisible = layerAt(0).visible;
    useStore.getState().setLayerName(0, '新しい名前');
    useStore.getState().toggleLayerVisibility(0);

    await useStore.getState().undoCommand();
    // 直近の toggle だけが戻り、rename は残る（LIFO）。
    expect(layerAt(0).visible).toBe(originalVisible);
    expect(layerAt(0).name).toBe('新しい名前');

    await useStore.getState().undoCommand();
    expect(layerAt(0).name).toBe(originalName);

    await useStore.getState().redoCommand();
    expect(layerAt(0).name).toBe('新しい名前');
    expect(layerAt(0).visible).toBe(originalVisible);
  });
});
