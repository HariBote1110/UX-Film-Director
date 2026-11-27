import { describe, it, expect } from 'vitest';
import {
  cornerLocals,
  oppositeCorner,
  rotateVec,
  computeResize,
  type ResizeStartState,
} from './transformGeometry';

const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

describe('oppositeCorner', () => {
  it('returns the diagonal corner', () => {
    expect(oppositeCorner('top-left')).toBe('bottom-right');
    expect(oppositeCorner('bottom-right')).toBe('top-left');
    expect(oppositeCorner('top-right')).toBe('bottom-left');
    expect(oppositeCorner('bottom-left')).toBe('top-right');
  });
});

describe('cornerLocals', () => {
  it('maps the four corners of the local content box', () => {
    const c = cornerLocals({ bx: 0, by: 0, bw: 100, bh: 50 });
    expect(c['top-left']).toEqual({ x: 0, y: 0 });
    expect(c['top-right']).toEqual({ x: 100, y: 0 });
    expect(c['bottom-left']).toEqual({ x: 0, y: 50 });
    expect(c['bottom-right']).toEqual({ x: 100, y: 50 });
  });
});

describe('rotateVec', () => {
  it('rotates 90 degrees anti-clockwise in screen space', () => {
    const r = rotateVec({ x: 1, y: 0 }, Math.PI / 2);
    expect(approx(r.x, 0)).toBe(true);
    expect(approx(r.y, 1)).toBe(true);
  });
});

describe('computeResize (no rotation)', () => {
  // 箱: ローカル (0,0,100,100)、scale 1、回転なし、コンテナ位置 (10,20)。
  // 右下を掴むとき、アンカーは左上ローカル (0,0) → 親空間で (10,20)。
  const baseStart: ResizeStartState = {
    corner: 'bottom-right',
    bounds: { bx: 0, by: 0, bw: 100, bh: 100 },
    rotationRad: 0,
    anchorParent: { x: 10, y: 20 },
    minScale: 0.05,
  };

  it('doubles scale when dragging the bottom-right corner outward', () => {
    // 元の右下は親空間 (10+100, 20+100) = (110,120)。
    // ポインタを (210, 220) に → 幅高さ 200 → scale 2。
    const res = computeResize(baseStart, { x: 210, y: 220 });
    expect(approx(res.scaleX, 2)).toBe(true);
    expect(approx(res.scaleY, 2)).toBe(true);
    // 左上アンカー固定なので位置は変わらない。
    expect(approx(res.x, 10)).toBe(true);
    expect(approx(res.y, 20)).toBe(true);
  });

  it('keeps the opposite corner fixed when dragging the top-left corner', () => {
    // 右下アンカー = 親空間 (110,120)。
    const start: ResizeStartState = {
      ...baseStart,
      corner: 'top-left',
      anchorParent: { x: 110, y: 120 },
    };
    // ポインタを (60,70) に → 残り幅高さ = 50 → scale 0.5。
    const res = computeResize(start, { x: 60, y: 70 });
    expect(approx(res.scaleX, 0.5)).toBe(true);
    expect(approx(res.scaleY, 0.5)).toBe(true);
    // 新しい左上 = アンカー(110,120) - scale*box = (110-50, 120-50) = (60,70)。
    expect(approx(res.x, 60)).toBe(true);
    expect(approx(res.y, 70)).toBe(true);
  });

  it('clamps to the minimum scale instead of flipping', () => {
    const res = computeResize(baseStart, { x: 9, y: 19 });
    expect(res.scaleX).toBeGreaterThanOrEqual(baseStart.minScale);
    expect(res.scaleY).toBeGreaterThanOrEqual(baseStart.minScale);
  });

  it('locks the aspect ratio by default when dragging a resize handle', () => {
    const res = computeResize(baseStart, { x: 210, y: 170 });
    expect(approx(res.scaleX, 2)).toBe(true);
    expect(approx(res.scaleY, 2)).toBe(true);
  });

  it('allows freeform aspect changes when the resize asks to unlock the aspect ratio', () => {
    const res = computeResize({ ...baseStart, lockAspectRatio: false }, { x: 210, y: 170 });
    expect(approx(res.scaleX, 2)).toBe(true);
    expect(approx(res.scaleY, 1.5)).toBe(true);
  });
});

describe('computeResize (rotated 90deg)', () => {
  it('resizes along the rotated axes', () => {
    // 90度回転したコンテナ。アンカー（左上）を原点に固定して右下を掴む。
    // ローカル軸 x はスクリーン上で +y 方向、ローカル y はスクリーン上で -x 方向。
    const start: ResizeStartState = {
      corner: 'bottom-right',
      bounds: { bx: 0, by: 0, bw: 100, bh: 100 },
      rotationRad: Math.PI / 2,
      anchorParent: { x: 0, y: 0 },
      minScale: 0.05,
    };
    // ローカル(100,100) を 2 倍 = (200,200)。回転後の親空間 = R(90)*(200,200) = (-200,200)。
    const res = computeResize(start, { x: -200, y: 200 });
    expect(approx(res.scaleX, 2)).toBe(true);
    expect(approx(res.scaleY, 2)).toBe(true);
    // アンカーが原点なので位置は原点のまま。
    expect(approx(res.x, 0)).toBe(true);
    expect(approx(res.y, 0)).toBe(true);
  });
});
