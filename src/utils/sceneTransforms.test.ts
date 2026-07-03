import { describe, expect, it } from 'vitest';
import { getGroupTransforms, getVibrationOffset } from './sceneTransforms';
import type { GroupControlObject, ShapeObject, TimelineObject } from '../types';

const baseShape = (overrides: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 'shape-1',
  type: 'shape',
  name: 'Shape',
  layer: 2,
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
  width: 80,
  height: 60,
  fill: '#ffffff',
  ...overrides,
});

const baseGroup = (overrides: Partial<GroupControlObject> = {}): GroupControlObject => ({
  id: 'group-1',
  type: 'group_control',
  name: 'Group',
  layer: 0,
  startTime: 0,
  duration: 10,
  x: 10,
  y: 20,
  rotation: 15,
  scaleX: 2,
  scaleY: 1.5,
  opacity: 0.5,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  targetLayerCount: 0,
  ...overrides,
});

describe('getGroupTransforms', () => {
  it('管理対象オブジェクトが無い場合は恒等変換を返す', () => {
    const shape = baseShape();
    const result = getGroupTransforms(shape, 0, [shape]);
    expect(result).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, alpha: 1 });
  });

  it('自分より上のレイヤーにある group_control で、時間内・対象レイヤー範囲内なら変換を積算する', () => {
    const group = baseGroup();
    const shape = baseShape({ layer: 2 });
    const objects: TimelineObject[] = [group, shape];

    const result = getGroupTransforms(shape, 5, objects);

    expect(result.x).toBeCloseTo(10);
    expect(result.y).toBeCloseTo(20);
    expect(result.rotation).toBeCloseTo(15);
    expect(result.scaleX).toBeCloseTo(2);
    expect(result.scaleY).toBeCloseTo(1.5);
    expect(result.alpha).toBeCloseTo(0.5);
  });

  it('targetLayerCount を超えるレイヤーのオブジェクトには適用しない', () => {
    const group = baseGroup({ layer: 0, targetLayerCount: 1 });
    const shape = baseShape({ layer: 3 });
    const objects: TimelineObject[] = [group, shape];

    const result = getGroupTransforms(shape, 5, objects);
    expect(result).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, alpha: 1 });
  });

  it('group の時間範囲外では適用しない', () => {
    const group = baseGroup({ startTime: 100, duration: 5 });
    const shape = baseShape({ layer: 2 });
    const objects: TimelineObject[] = [group, shape];

    const result = getGroupTransforms(shape, 5, objects);
    expect(result).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, alpha: 1 });
  });

  it('自分と同レイヤー以下（数値が大きい方が下）の group は無視する', () => {
    const group = baseGroup({ layer: 5 });
    const shape = baseShape({ layer: 2 });
    const objects: TimelineObject[] = [group, shape];

    const result = getGroupTransforms(shape, 5, objects);
    expect(result).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, alpha: 1 });
  });
});

describe('getVibrationOffset', () => {
  it('vibration フィルタが無い場合は (0,0) を返す', () => {
    const shape = baseShape();
    expect(getVibrationOffset(shape, 1)).toEqual({ x: 0, y: 0 });
  });

  it('strength が 0 のフィルタは寄与しない', () => {
    const shape = baseShape({
      filters: [{ type: 'vibration', enabled: true, params: { strength: 0, speed: 1 } } as any],
    });
    expect(getVibrationOffset(shape, 1)).toEqual({ x: 0, y: 0 });
  });

  it('strength が非ゼロなら決定的なオフセットを返す（同一入力で同一出力）', () => {
    const shape = baseShape({
      filters: [{ type: 'vibration', enabled: true, params: { strength: 5, speed: 2 } } as any],
    });
    const a = getVibrationOffset(shape, 1.23);
    const b = getVibrationOffset(shape, 1.23);
    expect(a).toEqual(b);
    expect(a.x !== 0 || a.y !== 0).toBe(true);
  });
});
