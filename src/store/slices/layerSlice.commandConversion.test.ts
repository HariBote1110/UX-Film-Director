import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShapeObject } from '../../types';
import { setCommandBridgeForTests } from '../../utils/rustBackendCommandBridge';
import { useStore } from '../useStore';

/**
 * R4-8 group d: `layerSlice.ts` の3箇所(`swapLayerTracks`/
 * `insertLayerTrackAt`/`deleteLayerTrackAt`)を`pushHistoryCommand`へ
 * 変換したことのテスト。いずれも Rust が計算する専用 command を送り、
 * 成功応答後にだけ history へ積む。
 */
const shape = (id: string, layer: number): ShapeObject => ({
  id,
  type: 'shape',
  name: id,
  layer,
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
  width: 120,
  height: 80,
  fill: '#ffffff',
});

describe('layerSlice の pushHistoryCommand 変換(R4-8 group d)', () => {
  beforeEach(() => {
    useStore.getState().initializeProject({
      width: 1920,
      height: 1080,
      fps: 60,
      sampleRate: 48_000,
    });
    useStore.setState({ pastCommands: [], futureCommands: [] });
    setCommandBridgeForTests({
      applyCommand: async ({ scene }) => ({ success: true, result: { scene } }),
    });
  });

  afterEach(() => setCommandBridgeForTests(null));

  it('swapLayerTracks: Rust command を成功後に1件積む', async () => {
    useStore.getState().addObject(shape('A', 0));
    useStore.setState({ pastCommands: [] });

    useStore.getState().swapLayerTracks(0, 1);
    await vi.waitFor(() => expect(useStore.getState().pastCommands).toHaveLength(1));

    const commands = useStore.getState().pastCommands;
    expect(commands).toHaveLength(1);
    expect(commands[0].kind).toBe('swapLayerTracks');
  });

  it('insertLayerTrackAt: Rust command を成功後に1件積む', async () => {
    useStore.setState({ pastCommands: [] });
    useStore.getState().insertLayerTrackAt(0);
    await vi.waitFor(() => expect(useStore.getState().pastCommands).toHaveLength(1));

    const commands = useStore.getState().pastCommands;
    expect(commands).toHaveLength(1);
    expect(commands[0].kind).toBe('insertLayerTrack');
  });

  it('deleteLayerTrackAt: Rust command を成功後に1件積む', async () => {
    useStore.setState({ pastCommands: [] });
    useStore.getState().deleteLayerTrackAt(0);
    await vi.waitFor(() => expect(useStore.getState().pastCommands).toHaveLength(1));

    const commands = useStore.getState().pastCommands;
    expect(commands).toHaveLength(1);
    expect(commands[0].kind).toBe('deleteLayerTrack');
  });

  it('無効な引数(範囲外index)ではCommandを積まない(既存guardを踏襲)', () => {
    useStore.getState().swapLayerTracks(-1, 0);
    expect(useStore.getState().pastCommands).toEqual([]);
  });

  it('往復中の別編集がある場合は古い全体応答を適用も履歴化もしない', async () => {
    let resolveRequest: (() => void) | null = null;
    // 型だけに依存せず、実際に request された SceneData をそのまま返す。
    setCommandBridgeForTests({
      applyCommand: ({ scene }) => new Promise((resolve) => {
        resolveRequest = () => resolve({ success: true, result: { scene } });
      }),
    });
    useStore.getState().addObject(shape('A', 0));
    useStore.setState({ pastCommands: [] });

    useStore.getState().swapLayerTracks(0, 1);
    await vi.waitFor(() => expect(useStore.getState().isCommandHistoryPending).toBe(true));
    useStore.setState((state) => ({ objects: state.objects.map((object) => object.id === 'A' ? { ...object, x: 99 } : object) }));
    resolveRequest!();
    await vi.waitFor(() => expect(useStore.getState().isCommandHistoryPending).toBe(false));

    expect(useStore.getState().objects.find((object) => object.id === 'A')?.x).toBe(99);
    expect(useStore.getState().pastCommands).toEqual([]);
  });
});
