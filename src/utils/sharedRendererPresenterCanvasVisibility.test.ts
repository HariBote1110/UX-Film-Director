import { describe, expect, it } from 'vitest';
import { resolveSharedRendererPresenterCanvasVisibility } from './sharedRendererPresenterCanvasVisibility';

describe('resolveSharedRendererPresenterCanvasVisibility', () => {
  it('hides the HTML presenter canvas whenever the native overlay is ready (hole-punch: overlay is the presentation surface)', () => {
    expect(
      resolveSharedRendererPresenterCanvasVisibility({
        editorMode: '2d',
        sharedRendererPreviewEnabled: true,
        nativeOverlayReady: true,
      }),
    ).toBe('hidden');
  });

  it('hides the canvas when the overlay is ready even outside 2d edit mode', () => {
    expect(
      resolveSharedRendererPresenterCanvasVisibility({
        editorMode: '3d_stage',
        sharedRendererPreviewEnabled: true,
        nativeOverlayReady: true,
      }),
    ).toBe('hidden');
  });

  it('shows the canvas when the overlay is not ready and the existing 2d-preview rule allows it (fallback presenter)', () => {
    expect(
      resolveSharedRendererPresenterCanvasVisibility({
        editorMode: '2d',
        sharedRendererPreviewEnabled: true,
        nativeOverlayReady: false,
      }),
    ).toBe('visible');
  });

  it('hides the canvas when the overlay is not ready but editorMode is not 2d', () => {
    expect(
      resolveSharedRendererPresenterCanvasVisibility({
        editorMode: '3d_stage',
        sharedRendererPreviewEnabled: true,
        nativeOverlayReady: false,
      }),
    ).toBe('hidden');
  });

  it('hides the canvas when the overlay is not ready and shared renderer preview is disabled', () => {
    expect(
      resolveSharedRendererPresenterCanvasVisibility({
        editorMode: '2d',
        sharedRendererPreviewEnabled: false,
        nativeOverlayReady: false,
      }),
    ).toBe('hidden');
  });
});
