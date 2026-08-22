import { beforeEach, describe, expect, it } from 'vitest';
import type { ShapeObject } from '../../types';
import { useStore } from '../useStore';

/**
 * R4-8 group d: `layerSlice.ts` の3箇所(`swapLayerTracks`/
 * `insertLayerTrackAt`/`deleteLayerTrackAt`)を`pushHistoryCommand`へ
 * 変換したことのテスト。いずれも`reorderLayers`(layers+objects丸ごと
 * 差し替え、R4-7の設計どおり)にマッピングする。
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
  });

  it('swapLayerTracks: reorderLayers Commandを1件積む', () => {
    useStore.getState().addObject(shape('A', 0));
    useStore.setState({ pastCommands: [] });

    useStore.getState().swapLayerTracks(0, 1);

    const commands = useStore.getState().pastCommands;
    expect(commands).toHaveLength(1);
    expect(commands[0].kind).toBe('reorderLayers');
  });

  it('insertLayerTrackAt: reorderLayers Commandを1件積む', () => {
    useStore.setState({ pastCommands: [] });
    useStore.getState().insertLayerTrackAt(0);

    const commands = useStore.getState().pastCommands;
    expect(commands).toHaveLength(1);
    expect(commands[0].kind).toBe('reorderLayers');
  });

  it('deleteLayerTrackAt: reorderLayers Commandを1件積む', () => {
    useStore.setState({ pastCommands: [] });
    useStore.getState().deleteLayerTrackAt(0);

    const commands = useStore.getState().pastCommands;
    expect(commands).toHaveLength(1);
    expect(commands[0].kind).toBe('reorderLayers');
  });

  it('無効な引数(範囲外index)ではCommandを積まない(既存guardを踏襲)', () => {
    useStore.getState().swapLayerTracks(-1, 0);
    expect(useStore.getState().pastCommands).toEqual([]);
  });
});
