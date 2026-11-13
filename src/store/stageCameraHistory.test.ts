import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  amendStageCameraHistoryNext,
  recordStageCameraHistory,
  useStore,
} from './useStore';
import { setCommandBridgeForTests } from '../utils/rustBackendCommandBridge';
import type {
  RustBackendApplyCommandResult,
  RustBackendCommandBridge,
} from '../utils/rustBackendCommandBridge';
import type { Command } from '../generated/rustCore/Command';
import type { SceneData } from '../generated/rustCore/SceneData';
import type { StageCamera3D } from '../types';

const cam = (px: number): StageCamera3D => ({
  position: { x: px, y: 10, z: 20 },
  target: { x: 0, y: 0, z: 0 },
});

describe('ステージカメラ履歴ヘルパー（Phase 3）', () => {
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

  const pastCommands = () => useStore.getState().pastCommands;

  it('record が setStageCamera3D を1件積む', () => {
    const command = recordStageCameraHistory(cam(0), cam(5));
    expect(command?.kind).toBe('setStageCamera3D');
    expect(pastCommands()).toHaveLength(1);
    expect(pastCommands()[0]).toEqual(command);
  });

  it('無変化では何も積まない', () => {
    expect(recordStageCameraHistory(cam(3), cam(3))).toBeNull();
    expect(pastCommands()).toHaveLength(0);
  });

  it('時間窓内の連続ジェスチャは合体し、過ぎると分かれる', () => {
    const nowSpy = vi.spyOn(Date, 'now');
    const t0 = 5_000_000;
    nowSpy.mockReturnValue(t0);
    recordStageCameraHistory(cam(0), cam(5));
    nowSpy.mockReturnValue(t0 + 400);
    const merged = recordStageCameraHistory(cam(5), cam(9));

    expect(pastCommands()).toHaveLength(1);
    expect(merged).toEqual({
      kind: 'setStageCamera3D',
      previous: cam(0),
      next: cam(9),
    });

    nowSpy.mockReturnValue(t0 + 400 + 2000);
    recordStageCameraHistory(cam(9), cam(12));
    expect(pastCommands()).toHaveLength(2);
  });

  it('合体の結果が開始位置に戻ったら履歴ごと消える', () => {
    const nowSpy = vi.spyOn(Date, 'now');
    const t0 = 6_000_000;
    nowSpy.mockReturnValue(t0);
    recordStageCameraHistory(cam(0), cam(5));
    nowSpy.mockReturnValue(t0 + 100);
    expect(recordStageCameraHistory(cam(5), cam(0))).toBeNull();
    expect(pastCommands()).toHaveLength(0);
  });

  it('amend は末尾にあるときだけ next を差し替える', () => {
    const command = recordStageCameraHistory(cam(0), cam(5));
    expect(command).not.toBeNull();

    const amended = amendStageCameraHistoryNext(command!, cam(7));
    expect(amended?.kind).toBe('setStageCamera3D');
    if (amended?.kind === 'setStageCamera3D') {
      expect(amended.next).toEqual(cam(7));
      expect(amended.previous).toEqual(cam(0));
    }
    expect(pastCommands()[0]).toEqual(amended);

    // 他のコマンドが上に積まれたら作用しない。
    useStore.getState().pushHistoryCommand({
      kind: 'setObjectField', objectId: 'x', field: 'x', previous: 0, next: 1,
    });
    expect(amendStageCameraHistoryNext(amended!, cam(9))).toBeNull();
    expect(pastCommands()).toHaveLength(2);
  });

  it('記録したカメラ移動が undo で戻る', async () => {
    const applyToScene = (scene: SceneData, command: Command): SceneData => {
      const nextScene = JSON.parse(JSON.stringify(scene)) as SceneData;
      if (command.kind === 'setStageCamera3D') {
        nextScene.stageCamera3D = JSON.parse(
          JSON.stringify(command.next),
        ) as SceneData['stageCamera3D'];
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

    const start = useStore.getState().stageCamera3D;
    const moved: StageCamera3D = {
      position: { x: start.position.x + 42, y: start.position.y, z: start.position.z },
      target: { ...start.target },
    };
    useStore.getState().setStageCamera3D(moved);
    recordStageCameraHistory(start, moved);
    expect(useStore.getState().stageCamera3D.position.x).toBe(start.position.x + 42);

    await useStore.getState().undoCommand();
    expect(useStore.getState().stageCamera3D.position.x).toBe(start.position.x);
  });
});
