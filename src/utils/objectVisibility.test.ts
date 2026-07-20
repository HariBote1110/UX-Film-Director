import { describe, expect, it } from 'vitest';
import { isObjectVisibleAtTime } from './objectVisibility';
import type { LayerState, ShapeObject } from '../types';

/**
 * 時間帯・レイヤー可視性判定の唯一の実装。
 *
 * 実機バグA（ゴースト選択枠）: `getObjectWorldCorners`（sceneHitTest.ts）に
 * 時間帯チェックが無く、`sceneHitTest.ts` の `isVisible` と
 * `rustSceneSnapshot.ts` の `collectVisibleObjects` に同じ判定ロジックが
 * 重複していた。ここで唯一の実装として固定し、双方をこれに委譲させる。
 */

const shape = (overrides: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 'shape-1',
  type: 'shape',
  name: 'Shape',
  layer: 0,
  startTime: 0,
  duration: 10,
  x: 100,
  y: 100,
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

describe('isObjectVisibleAtTime: 時間帯判定', () => {
  it('startTime <= time < startTime+duration の範囲内なら true', () => {
    const obj = shape({ startTime: 5, duration: 10 });
    expect(isObjectVisibleAtTime(obj, 5, undefined)).toBe(true);
    expect(isObjectVisibleAtTime(obj, 10, undefined)).toBe(true);
    expect(isObjectVisibleAtTime(obj, 14.999, undefined)).toBe(true);
  });

  it('startTime未満は false', () => {
    const obj = shape({ startTime: 5, duration: 10 });
    expect(isObjectVisibleAtTime(obj, 4.999, undefined)).toBe(false);
  });

  it('startTime+duration以上は false（終端は排他的）', () => {
    const obj = shape({ startTime: 5, duration: 10 });
    expect(isObjectVisibleAtTime(obj, 15, undefined)).toBe(false);
  });

  it('layers引数を省略した場合はレイヤー可視性を無視する', () => {
    const obj = shape({ layer: 0 });
    expect(isObjectVisibleAtTime(obj, 0)).toBe(true);
  });
});

describe('isObjectVisibleAtTime: レイヤー可視性判定', () => {
  it('layersが渡され対象レイヤーが非表示なら false', () => {
    const obj = shape({ layer: 0, startTime: 0, duration: 10 });
    const layers: LayerState[] = [{ name: 'L0', visible: false, locked: false }];
    expect(isObjectVisibleAtTime(obj, 0, layers)).toBe(false);
  });

  it('layersが渡され対象レイヤーが表示なら時間帯判定に従う', () => {
    const obj = shape({ layer: 0, startTime: 0, duration: 10 });
    const layers: LayerState[] = [{ name: 'L0', visible: true, locked: false }];
    expect(isObjectVisibleAtTime(obj, 0, layers)).toBe(true);
    expect(isObjectVisibleAtTime(obj, 20, layers)).toBe(false);
  });

  it('ロックされたレイヤーは可視性に影響しない', () => {
    const obj = shape({ layer: 0, startTime: 0, duration: 10 });
    const layers: LayerState[] = [{ name: 'L0', visible: true, locked: true }];
    expect(isObjectVisibleAtTime(obj, 0, layers)).toBe(true);
  });
});
