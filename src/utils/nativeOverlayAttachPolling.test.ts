import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NATIVE_OVERLAY_ATTACH_POLL_INTERVAL_MS,
  buildNativeOverlayAttachKey,
  shouldPollNativeOverlayAttach,
} from './nativeOverlayAttachPolling';

describe('nativeOverlayAttachPolling', () => {
  describe('buildNativeOverlayAttachKey', () => {
    it('produces the same key for an unchanged rect (idempotent attach skip)', () => {
      const rect = { x: 100, y: 350, width: 800, height: 200, scaleFactor: 2 };

      expect(buildNativeOverlayAttachKey(rect)).toBe(buildNativeOverlayAttachKey({ ...rect }));
    });

    it('changes the key when the rect moves without resizing (layout shift detection)', () => {
      // ResizeObserver はサイズ不変の要素移動では発火しないため、
      // 位置だけの変化もポーリングの key 比較で検出できることが
      // overlay 置き去り解消の要点。
      const before = buildNativeOverlayAttachKey({ x: 100, y: 350, width: 800, height: 200, scaleFactor: 2 });
      const after = buildNativeOverlayAttachKey({ x: 140, y: 350, width: 800, height: 200, scaleFactor: 2 });

      expect(after).not.toBe(before);
    });

    it('changes the key when only the scale factor changes', () => {
      const before = buildNativeOverlayAttachKey({ x: 0, y: 0, width: 800, height: 200, scaleFactor: 1 });
      const after = buildNativeOverlayAttachKey({ x: 0, y: 0, width: 800, height: 200, scaleFactor: 2 });

      expect(after).not.toBe(before);
    });
  });

  describe('shouldPollNativeOverlayAttach', () => {
    it('polls while the document is visible', () => {
      expect(shouldPollNativeOverlayAttach(false)).toBe(true);
    });

    it('does not poll while the document is hidden', () => {
      expect(shouldPollNativeOverlayAttach(true)).toBe(false);
    });
  });

  it('keeps the poll interval low frequency (a coarse layout-shift safety net, not a per-frame check)', () => {
    expect(NATIVE_OVERLAY_ATTACH_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(250);
    expect(NATIVE_OVERLAY_ATTACH_POLL_INTERVAL_MS).toBeLessThanOrEqual(1000);
  });

  describe('Viewport wiring boundary', () => {
    const viewportSource = () =>
      readFileSync(new URL('../components/Viewport.tsx', import.meta.url), 'utf8');

    it('polls the attach recalculation for size-preserving layout shifts and stops while hidden', () => {
      const code = viewportSource();
      const start = code.indexOf('const attach = () => {');
      const end = code.indexOf('const updateSharedRendererSolidColourObjectIds', start);
      const attachEffectBlock = code.slice(start, end);

      expect(attachEffectBlock).toContain('NATIVE_OVERLAY_ATTACH_POLL_INTERVAL_MS');
      expect(attachEffectBlock).toContain('shouldPollNativeOverlayAttach(document.hidden)');
      expect(attachEffectBlock).toContain('setInterval(');
      expect(attachEffectBlock).toContain('clearInterval(');
    });

    it('shares the attach key builder between the event-driven path and the poll', () => {
      const code = viewportSource();
      const start = code.indexOf('const attach = () => {');
      const end = code.indexOf('const updateSharedRendererSolidColourObjectIds', start);
      const attachEffectBlock = code.slice(start, end);

      expect(attachEffectBlock).toContain('buildNativeOverlayAttachKey(');
    });
  });
});
