import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../useStore';
import { setCommandBridgeForTests } from '../../utils/rustBackendCommandBridge';
import type { RustBackendCommandBridge, RustBackendApplyCommandResult } from '../../utils/rustBackendCommandBridge';
import type { Command } from '../../generated/rustCore/Command';
import type { SceneData } from '../../generated/rustCore/SceneData';

/**
 * R4-8 group b: `historySlice.ts` の新 command stack API
 * (`pushHistoryCommand`/`undoCommand`/`redoCommand`) のテスト。
 * 旧スナップショット API (`pushHistory`/`undo`/`redo`) は 34 箇所の呼び出し
 * 側が group c 以降で移行するまで変更しないため、ここでは対象外
 * (既存の store テストが引き続きカバーする)。
 */
describe('historySlice command stack (R4-8 group b)', () => {
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

  const opacityCommand = (previous: number, next: number): Command => ({
    kind: 'setObjectField',
    objectId: 'obj-1',
    field: 'opacity',
    previous,
    next,
  });

  it('pushHistoryCommand appends to pastCommands and clears futureCommands', () => {
    useStore.setState({ futureCommands: [opacityCommand(1, 0.5)] });
    const cmd = opacityCommand(1, 0.8);

    useStore.getState().pushHistoryCommand(cmd);

    expect(useStore.getState().pastCommands).toEqual([cmd]);
    expect(useStore.getState().futureCommands).toEqual([]);
  });

  it('undoCommand is a no-op when no bridge is injected (null bridge signal)', async () => {
    const cmd = opacityCommand(1, 0.5);
    useStore.getState().pushHistoryCommand(cmd);
    const before = useStore.getState();

    await useStore.getState().undoCommand();

    const after = useStore.getState();
    expect(after.pastCommands).toEqual([cmd]);
    expect(after.futureCommands).toEqual([]);
    expect(after.objects).toBe(before.objects);
  });

  it('undoCommand sends the inverted command to the bridge, applies the result, and moves the command to futureCommands', async () => {
    const cmd = opacityCommand(1, 0.5);
    useStore.getState().pushHistoryCommand(cmd);

    const activeSceneId = useStore.getState().activeSceneId;
    const resultScene: SceneData = {
      id: activeSceneId,
      name: 'restored',
      duration: 30,
      layers: useStore.getState().layers,
      objects: [{ id: 'obj-1', opacity: 1 } as unknown as SceneData['objects'][number]],
      camera: useStore.getState().camera,
      stageCamera3D: useStore.getState().stageCamera3D,
    };

    let receivedCommand: Command | null = null;
    const applyCommand = vi.fn(async ({ command }: { scene: SceneData; command: Command }): Promise<RustBackendApplyCommandResult> => {
      receivedCommand = command;
      return { success: true, result: { scene: resultScene } };
    });
    const bridge: RustBackendCommandBridge = { applyCommand };
    setCommandBridgeForTests(bridge);

    await useStore.getState().undoCommand();

    // invert(setObjectField) swaps next/previous
    expect(receivedCommand).toEqual({
      kind: 'setObjectField',
      objectId: 'obj-1',
      field: 'opacity',
      previous: 0.5,
      next: 1,
    });
    expect(applyCommand).toHaveBeenCalledTimes(1);

    const after = useStore.getState();
    expect(after.objects).toEqual(resultScene.objects);
    expect(after.pastCommands).toEqual([]);
    expect(after.futureCommands).toEqual([cmd]);
    expect(after.isCommandHistoryPending).toBe(false);
  });

  it('redoCommand re-applies the original command and moves it back to pastCommands', async () => {
    const cmd = opacityCommand(1, 0.5);
    useStore.setState({ pastCommands: [], futureCommands: [cmd] });

    const activeSceneId = useStore.getState().activeSceneId;
    const resultScene: SceneData = {
      id: activeSceneId,
      name: 'redone',
      duration: 30,
      layers: useStore.getState().layers,
      objects: [{ id: 'obj-1', opacity: 0.5 } as unknown as SceneData['objects'][number]],
      camera: useStore.getState().camera,
      stageCamera3D: useStore.getState().stageCamera3D,
    };

    let receivedCommand: Command | null = null;
    const applyCommand = vi.fn(async ({ command }: { scene: SceneData; command: Command }): Promise<RustBackendApplyCommandResult> => {
      receivedCommand = command;
      return { success: true, result: { scene: resultScene } };
    });
    setCommandBridgeForTests({ applyCommand });

    await useStore.getState().redoCommand();

    expect(receivedCommand).toEqual(cmd);
    const after = useStore.getState();
    expect(after.objects).toEqual(resultScene.objects);
    expect(after.pastCommands).toEqual([cmd]);
    expect(after.futureCommands).toEqual([]);
  });

  it('apply error: no state change, console.error is called, and pending flag is cleared', async () => {
    const cmd = opacityCommand(1, 0.5);
    useStore.getState().pushHistoryCommand(cmd);
    const before = useStore.getState();

    const applyCommand = vi.fn(async (): Promise<RustBackendApplyCommandResult> => ({
      success: false,
      error: 'InvalidFieldPatch',
      errorCode: 32630,
    }));
    setCommandBridgeForTests({ applyCommand });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await useStore.getState().undoCommand();

    const after = useStore.getState();
    expect(after.objects).toBe(before.objects);
    expect(after.pastCommands).toEqual([cmd]);
    expect(after.futureCommands).toEqual([]);
    expect(after.isCommandHistoryPending).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('ignore-while-pending: a second undoCommand call while one is in flight is ignored, not queued', async () => {
    const cmd1 = opacityCommand(1, 0.5);
    const cmd2 = opacityCommand(0.5, 0.2);
    useStore.getState().pushHistoryCommand(cmd1);
    useStore.getState().pushHistoryCommand(cmd2);

    const activeSceneId = useStore.getState().activeSceneId;
    let resolveApply: (value: RustBackendApplyCommandResult) => void = () => {};
    const applyCommand = vi.fn(() => new Promise<RustBackendApplyCommandResult>((resolve) => {
      resolveApply = resolve;
    }));
    setCommandBridgeForTests({ applyCommand });

    const firstCall = useStore.getState().undoCommand();
    // Second call issued while the first is still in flight — must be ignored (no queueing).
    const secondCall = useStore.getState().undoCommand();

    expect(useStore.getState().isCommandHistoryPending).toBe(true);

    resolveApply({
      success: true,
      result: {
        scene: {
          id: activeSceneId,
          name: 'x',
          duration: 30,
          layers: useStore.getState().layers,
          objects: [],
          camera: useStore.getState().camera,
          stageCamera3D: useStore.getState().stageCamera3D,
        },
      },
    });

    await Promise.all([firstCall, secondCall]);

    // Only the first undoCommand's apply call went through.
    expect(applyCommand).toHaveBeenCalledTimes(1);
    // Only cmd2 was popped (the second, ignored call never touched the stack).
    expect(useStore.getState().pastCommands).toEqual([cmd1]);
    expect(useStore.getState().futureCommands).toEqual([cmd2]);
    expect(useStore.getState().isCommandHistoryPending).toBe(false);
  });
});
