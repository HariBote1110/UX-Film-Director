import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../useStore';

describe('workspaceSlice: previewHoleRect (hole-punch backdrop)', () => {
  beforeEach(() => {
    useStore.setState({ previewHoleRect: null });
  });

  it('初期値はnull', () => {
    expect(useStore.getState().previewHoleRect).toBeNull();
  });

  it('setPreviewHoleRectで矩形をセットできる', () => {
    useStore.getState().setPreviewHoleRect({ x: 10, y: 20, width: 300, height: 200 });
    expect(useStore.getState().previewHoleRect).toEqual({ x: 10, y: 20, width: 300, height: 200 });
  });

  it('setPreviewHoleRect(null)でクリアできる', () => {
    useStore.getState().setPreviewHoleRect({ x: 10, y: 20, width: 300, height: 200 });
    useStore.getState().setPreviewHoleRect(null);
    expect(useStore.getState().previewHoleRect).toBeNull();
  });
});
