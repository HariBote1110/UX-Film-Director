import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './useStore';

// Bug E（Native_Overlay_Bug_E_Plan.md §3・Phase E1）— preview pane の上に
// HTML 駆動 UI（context menu / popover / tooltip / modal / dropdown）が開いた
// ことを一箇所で明示的に記録する zustand store action。これを正本にし、
// MutationObserver（previewObstructionDetector.ts）は補足漏れ対策の補助として
// 並走させる。
describe('previewObstructed state', () => {
  beforeEach(() => {
    useStore.getState().clearPreviewObstructed('context-menu');
    useStore.getState().clearPreviewObstructed('inspector-color-picker');
  });

  it('starts unobstructed', () => {
    expect(useStore.getState().previewObstructed).toEqual({
      obstructed: false,
      reason: null,
      rect: null,
    });
  });

  it('setPreviewObstructed records the reason and rect and flips obstructed to true', () => {
    useStore.getState().setPreviewObstructed('context-menu', { x: 10, y: 20, w: 100, h: 50 });

    expect(useStore.getState().previewObstructed).toEqual({
      obstructed: true,
      reason: 'context-menu',
      rect: { x: 10, y: 20, w: 100, h: 50 },
    });
  });

  it('setPreviewObstructed accepts a null rect (obstruction without a known overlap rect)', () => {
    useStore.getState().setPreviewObstructed('export-modal', null);

    expect(useStore.getState().previewObstructed).toEqual({
      obstructed: true,
      reason: 'export-modal',
      rect: null,
    });
  });

  it('clearPreviewObstructed with the matching reason clears obstruction', () => {
    useStore.getState().setPreviewObstructed('context-menu', null);
    useStore.getState().clearPreviewObstructed('context-menu');

    expect(useStore.getState().previewObstructed).toEqual({
      obstructed: false,
      reason: null,
      rect: null,
    });
  });

  it('clearPreviewObstructed with a non-matching reason is a no-op (avoids racing close/open of a different UI)', () => {
    useStore.getState().setPreviewObstructed('context-menu', null);
    useStore.getState().clearPreviewObstructed('inspector-color-picker');

    expect(useStore.getState().previewObstructed).toEqual({
      obstructed: true,
      reason: 'context-menu',
      rect: null,
    });
  });
});
