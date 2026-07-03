import { describe, expect, it } from 'vitest';
import {
  computeDragUpdate,
  normaliseRecordedMotionPath,
  resolvePointerSelectionIntent,
} from './sceneInteractionLogic';
import type { ShapeObject } from '../types';

const baseObj = (overrides: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 'obj-1',
  type: 'shape',
  name: 'Shape',
  layer: 0,
  startTime: 0,
  duration: 10,
  x: 100,
  y: 50,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  shapeType: 'rect',
  width: 50,
  height: 40,
  fill: '#fff',
  ...overrides,
});

describe('resolvePointerSelectionIntent', () => {
  it('metaKey / ctrlKey は toggle を返す', () => {
    expect(resolvePointerSelectionIntent({ metaKey: true, shiftKey: false, ctrlKey: false })).toBe('toggle');
    expect(resolvePointerSelectionIntent({ metaKey: false, shiftKey: false, ctrlKey: true })).toBe('toggle');
  });

  it('shiftKey は range を返す（metaKey/ctrlKeyが無い場合）', () => {
    expect(resolvePointerSelectionIntent({ metaKey: false, shiftKey: true, ctrlKey: false })).toBe('range');
  });

  it('修飾キーが無い場合は single を返す', () => {
    expect(resolvePointerSelectionIntent({ metaKey: false, shiftKey: false, ctrlKey: false })).toBe('single');
  });

  it('metaKeyがshiftKeyより優先される', () => {
    expect(resolvePointerSelectionIntent({ metaKey: true, shiftKey: true, ctrlKey: false })).toBe('toggle');
  });
});

describe('computeDragUpdate', () => {
  it('ワールド座標の差分をそのままx/yへ加算する（enableAnimation無効時）', () => {
    const initial = baseObj({ x: 100, y: 50 });
    const result = computeDragUpdate(initial, { x: 10, y: -5 });
    expect(result).toEqual({ x: 110, y: 45 });
  });

  it('enableAnimation有効時はendX/endYも同じ差分で更新する', () => {
    const initial = baseObj({ x: 100, y: 50, enableAnimation: true, endX: 200, endY: 150 });
    const result = computeDragUpdate(initial, { x: 10, y: -5 });
    expect(result).toEqual({ x: 110, y: 45, endX: 210, endY: 145 });
  });

  it('結果は整数に丸める', () => {
    const initial = baseObj({ x: 100, y: 50 });
    const result = computeDragUpdate(initial, { x: 10.6, y: -5.4 });
    expect(result).toEqual({ x: 111, y: 45 });
  });
});

describe('normaliseRecordedMotionPath', () => {
  it('サンプル1点以下は空配列を返す', () => {
    expect(normaliseRecordedMotionPath([])).toEqual([]);
    expect(normaliseRecordedMotionPath([{ time: 0, x: 1, y: 2 }])).toEqual([]);
  });

  it('複数サンプルをtime 0..1へ正規化する', () => {
    const result = normaliseRecordedMotionPath([
      { time: 0, x: 0, y: 0 },
      { time: 0, x: 10, y: 20 },
      { time: 0, x: 30, y: 40 },
    ]);
    expect(result).toEqual([
      { time: 0, x: 0, y: 0 },
      { time: 0.5, x: 10, y: 20 },
      { time: 1, x: 30, y: 40 },
    ]);
  });
});
