import { describe, expect, it } from 'vitest';
import { resolvePreviewPaneBackground } from './previewPaneBackground';

// hole-punch 設計: native overlay が attach 済み（'overlay' state）のときは
// preview 要素を透明にして、下にある native child NSWindow の映像を
// そのまま透過させる。attach 前/フォールバック時は presenter 用の
// 暗い背景を維持する。
describe('resolvePreviewPaneBackground', () => {
  it('returns transparent when the native overlay is attached', () => {
    expect(resolvePreviewPaneBackground(true)).toBe('transparent');
  });

  it('keeps the app background when the native overlay is not attached (presenter fallback)', () => {
    expect(resolvePreviewPaneBackground(false)).toBe('var(--bg-app)');
  });
});
