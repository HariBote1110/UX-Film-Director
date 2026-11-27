import { beforeEach, describe, expect, it } from 'vitest';
import type { ShapeObject } from '../types';
import { useStore } from './useStore';

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

const startTimes = () => Object.fromEntries(
  useStore.getState().objects.map((object) => [object.id, object.startTime] as const)
);

describe('リップル削除（削除して左寄せ）', () => {
  beforeEach(() => {
    useStore.getState().initializeProject({
      width: 1920,
      height: 1080,
      fps: 60,
      sampleRate: 48_000,
    });
  });

  it('同一レイヤーの後続クリップを削除した尺ぶん左へ詰める', () => {
    // A[0-5] B[5-10] C[12-15]（B と C の間にギャップ）
    useStore.getState().addObject(shape('A', 1, 0, 5));
    useStore.getState().addObject(shape('B', 1, 5, 5));
    useStore.getState().addObject(shape('C', 1, 12, 3));

    useStore.getState().rippleDeleteObject('B');

    const times = startTimes();
    expect('B' in times).toBe(false);
    expect(times.A).toBe(0); // 前のクリップは動かない
    expect(times.C).toBe(7); // 12 - 5（B の尺）。相対ギャップは保持される
  });

  it('他レイヤーのクリップは影響を受けない', () => {
    useStore.getState().addObject(shape('A', 1, 0, 5));
    useStore.getState().addObject(shape('B', 1, 5, 5));
    useStore.getState().addObject(shape('other', 2, 8, 3));

    useStore.getState().rippleDeleteObject('A');

    const times = startTimes();
    expect(times.B).toBe(0); // 5 - 5
    expect(times.other).toBe(8); // 別レイヤーなので不変
  });

  it('左寄せでマイナスにならないよう 0 でクランプする', () => {
    useStore.getState().addObject(shape('A', 1, 0, 5));
    useStore.getState().addObject(shape('B', 1, 2, 3)); // 重なり気味でも 0 未満にしない

    useStore.getState().rippleDeleteObject('A');

    expect(startTimes().B).toBe(0);
  });

  it('複数選択をまとめて削除しても後続を正しく詰める', () => {
    // A[0-5] B[5-10] C[10-15] D[15-20]、B と C を削除
    useStore.getState().addObject(shape('A', 1, 0, 5));
    useStore.getState().addObject(shape('B', 1, 5, 5));
    useStore.getState().addObject(shape('C', 1, 10, 5));
    useStore.getState().addObject(shape('D', 1, 15, 5));

    useStore.getState().selectObjects(['B', 'C']);
    useStore.getState().rippleDeleteSelectedObjects();

    const times = startTimes();
    expect('B' in times).toBe(false);
    expect('C' in times).toBe(false);
    expect(times.A).toBe(0);
    expect(times.D).toBe(5); // 15 - (5 + 5)
    expect(useStore.getState().selectedIds).toEqual([]);
  });

  it('ロックされたレイヤーのクリップは削除しない', () => {
    useStore.getState().addObject(shape('A', 1, 0, 5));
    useStore.getState().toggleLayerLock(1);

    useStore.getState().rippleDeleteObject('A');

    expect('A' in startTimes()).toBe(true);
  });
});
