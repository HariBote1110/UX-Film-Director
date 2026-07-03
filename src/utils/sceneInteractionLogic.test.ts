import { describe, expect, it, vi } from 'vitest';
import {
  computeDragUpdate,
  createStablePointerSubscription,
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

describe('createStablePointerSubscription', () => {
  /**
   * ドラッグ中の毎 pointermove ごとに Viewport.tsx が再レンダーされ、
   * useSceneInteraction の返す onPointerMove/onPointerUp 等の関数参照が
   * 変わることで、window レベルの addEventListener/removeEventListener が
   * 毎フレーム走ってしまう回帰（ドラッグ中に選択枠が消える／リアルタイムに
   * 追従しない）を防ぐための購読ヘルパー。
   *
   * target への addEventListener/removeEventListener は「一度きり」であるべきで、
   * ハンドラの中身は getHandlers() を呼ぶたびに最新のものを参照する
   * （React 側は毎レンダーで getHandlers だけ更新すればよく、
   * target への再登録は不要になる）。
   */
  const createFakeTarget = () => {
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    return {
      addEventListener: vi.fn((type: string, handler: (e: unknown) => void) => {
        listeners[type] = [...(listeners[type] ?? []), handler];
      }),
      removeEventListener: vi.fn((type: string, handler: (e: unknown) => void) => {
        listeners[type] = (listeners[type] ?? []).filter((h) => h !== handler);
      }),
      dispatch: (type: string, event: unknown) => {
        (listeners[type] ?? []).forEach((h) => h(event));
      },
    };
  };

  it('target への addEventListener は pointermove/pointerup それぞれ1回だけ行われる', () => {
    const target = createFakeTarget();
    const getHandlers = () => ({ onPointerMove: vi.fn(), onPointerUp: vi.fn() });

    const unsubscribe = createStablePointerSubscription(target, getHandlers);

    expect(target.addEventListener).toHaveBeenCalledTimes(2);
    expect(target.addEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(target.addEventListener).toHaveBeenCalledWith('pointerup', expect.any(Function));

    unsubscribe();
    expect(target.removeEventListener).toHaveBeenCalledTimes(2);
  });

  it('getHandlers が毎回新しい関数を返しても再登録されず、常に最新のハンドラが呼ばれる', () => {
    const target = createFakeTarget();
    let latestOnPointerMove = vi.fn();
    const getHandlers = () => ({ onPointerMove: latestOnPointerMove, onPointerUp: vi.fn() });

    createStablePointerSubscription(target, getHandlers);
    expect(target.addEventListener).toHaveBeenCalledTimes(2);

    const firstEvent = { x: 1 };
    target.dispatch('pointermove', firstEvent);
    expect(latestOnPointerMove).toHaveBeenCalledWith(firstEvent);

    // ドラッグ中に「再レンダーされて新しい関数参照になった」状況を模す。
    latestOnPointerMove = vi.fn();
    const secondEvent = { x: 2 };
    target.dispatch('pointermove', secondEvent);

    // target への addEventListener は増えない（re-subscribe しない）。
    expect(target.addEventListener).toHaveBeenCalledTimes(2);
    // それでも最新の（差し替え後の）ハンドラが呼ばれる。
    expect(latestOnPointerMove).toHaveBeenCalledWith(secondEvent);
  });

  it('unsubscribe 後はイベントを配送してもハンドラが呼ばれない', () => {
    const target = createFakeTarget();
    const onPointerUp = vi.fn();
    const getHandlers = () => ({ onPointerMove: vi.fn(), onPointerUp });

    const unsubscribe = createStablePointerSubscription(target, getHandlers);
    unsubscribe();

    target.dispatch('pointerup', {});
    expect(onPointerUp).not.toHaveBeenCalled();
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
