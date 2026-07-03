import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { TimelineObject } from '../types';
import {
  buildSelectionDecorationQuads,
  createNativeOverlaySelectionDecorationSender,
} from './nativeOverlaySelectionDecoration';

const root = resolve(__dirname, '../..');

/**
 * 実機バグ: SceneSelectionOverlay（HTML/SVG）は child NSWindow 化された
 * native overlay より常に下にあり、オブジェクトが現在フレームに描画されて
 * いる間は選択枠が不透明ピクセルに隠れて見えない。修正は「枠・ハンドルの
 * 見た目を native overlay 側（Rust/wgpu）で描く」こと。ここでは renderer 側の
 * 送信条件ロジック（quad 構築・不変時は送らない dedupe）と、SVG を
 * 「不可視だが操作可能」なヒット領域として残すフォールバック配線を固定する。
 */

const imageObject = (overrides: Partial<Record<string, unknown>> = {}): TimelineObject => ({
  id: 'obj-1',
  type: 'image',
  name: 'obj-1',
  src: 'image.png',
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  layer: 0,
  startTime: 0,
  duration: 10,
  ...overrides,
} as unknown as TimelineObject);

describe('buildSelectionDecorationQuads', () => {
  it('returns world corner quads for selected objects using getObjectWorldCorners', () => {
    const objects = [imageObject()];

    const quads = buildSelectionDecorationQuads({
      selectedIds: ['obj-1'],
      objects,
      time: 1,
    });

    expect(quads).toEqual([{
      topLeftX: 10,
      topLeftY: 20,
      topRightX: 110,
      topRightY: 20,
      bottomRightX: 110,
      bottomRightY: 70,
      bottomLeftX: 10,
      bottomLeftY: 70,
    }]);
  });

  it('skips selected ids without a sized object and returns an empty list when nothing is selected', () => {
    const objects = [
      imageObject(),
      { id: 'group-1', type: 'group_control', layer: 1, startTime: 0, duration: 10 } as unknown as TimelineObject,
    ];

    expect(buildSelectionDecorationQuads({ selectedIds: [], objects, time: 1 })).toEqual([]);
    expect(buildSelectionDecorationQuads({ selectedIds: ['missing'], objects, time: 1 })).toEqual([]);
    expect(buildSelectionDecorationQuads({ selectedIds: ['group-1'], objects, time: 1 })).toEqual([]);
  });

  it('applies object rotation to the quad corners', () => {
    const objects = [imageObject({ x: 0, y: 0, rotation: 90 })];

    const quads = buildSelectionDecorationQuads({ selectedIds: ['obj-1'], objects, time: 1 });

    expect(quads).toHaveLength(1);
    expect(quads[0].topLeftX).toBeCloseTo(0, 5);
    expect(quads[0].topLeftY).toBeCloseTo(0, 5);
    expect(quads[0].topRightX).toBeCloseTo(0, 5);
    expect(quads[0].topRightY).toBeCloseTo(100, 5);
    expect(quads[0].bottomRightX).toBeCloseTo(-50, 5);
    expect(quads[0].bottomRightY).toBeCloseTo(100, 5);
  });
});

describe('createNativeOverlaySelectionDecorationSender', () => {
  const payload = {
    canvasWidth: 1920,
    canvasHeight: 1080,
    quads: [{
      topLeftX: 10, topLeftY: 20,
      topRightX: 110, topRightY: 20,
      bottomRightX: 110, bottomRightY: 70,
      bottomLeftX: 10, bottomLeftY: 70,
    }],
  };

  it('sends the payload once and skips identical payloads (drag moves without value change)', async () => {
    const send = vi.fn(async () => ({ success: true, attached: true }));
    const sender = createNativeOverlaySelectionDecorationSender(send);

    const first = sender.update(payload, 0);
    expect(first).not.toBeNull();
    await first;
    // ドラッグ中の毎 pointermove でも、quad の値が不変なら IPC を送らない契約。
    expect(sender.update({ ...payload, quads: [{ ...payload.quads[0] }] }, 0)).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('re-sends when the quad values change', async () => {
    const send = vi.fn(async () => ({ success: true, attached: true }));
    const sender = createNativeOverlaySelectionDecorationSender(send);

    await sender.update(payload, 0);
    const moved = {
      ...payload,
      quads: [{ ...payload.quads[0], topLeftX: 11, topRightX: 111, bottomRightX: 111, bottomLeftX: 11 }],
    };
    await sender.update(moved, 0);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(moved);
  });

  it('re-sends an identical payload when the resend key changes (native overlay re-attach)', async () => {
    // attach は resize 等で作り直され addon 側の state が失われ得るため、
    // attach 完了 tick を鍵に同値 payload でも再送する契約。
    const send = vi.fn(async () => ({ success: true, attached: true }));
    const sender = createNativeOverlaySelectionDecorationSender(send);

    await sender.update(payload, 0);
    await sender.update(payload, 1);

    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('scene selection overlay native decoration boundary', () => {
  it('keeps the SVG overlay as an invisible-but-interactive hit area when native decoration is active', () => {
    // SVG は削除しない: リサイズハンドルの pointer 操作（pointerEvents:'auto'）は
    // SVG 側に残す必要がある。native overlay がデコレーションを描いている間は
    // stroke/fill を透明化し、native overlay 不可用時は可視スタイルへ戻す。
    const overlay = readFileSync(resolve(root, 'src/components/SceneSelectionOverlay.tsx'), 'utf8');

    expect(overlay).toContain('visualsHidden');
    expect(overlay).toContain('transparent');
    expect(overlay).toContain("'#ffd700'");
  });

  it('wires Viewport selection changes to the native overlay selection decoration IPC with SVG fallback', () => {
    const viewport = readFileSync(resolve(root, 'src/components/Viewport.tsx'), 'utf8');

    expect(viewport).toContain('buildSelectionDecorationQuads');
    expect(viewport).toContain('createNativeOverlaySelectionDecorationSender');
    expect(viewport).toContain('setSelectionDecoration');
    expect(viewport).toContain('visualsHidden');
  });

  it('exposes setSelectionDecoration through preload and the renderer type surface', () => {
    const preload = readFileSync(resolve(root, 'electron/preload.ts'), 'utf8');
    const envTypes = readFileSync(resolve(root, 'src/vite-env.d.ts'), 'utf8');

    expect(preload).toContain('nativeOverlayIpcChannels.setSelectionDecoration');
    expect(envTypes).toContain('setSelectionDecoration: (payload: {');
  });
});
