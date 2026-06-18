import { describe, expect, it } from 'vitest';
import { resolveProjectExportFrameCanvas } from './projectExportFrameCanvas';

describe('resolveProjectExportFrameCanvas', () => {
  it('uses the explicit export canvas without requiring a Pixi canvas', () => {
    const sharedRendererCanvas = { id: 'shared-renderer-export' } as unknown as HTMLCanvasElement;

    expect(resolveProjectExportFrameCanvas({
      getExportCanvas: () => sharedRendererCanvas,
      pixiCanvas: null,
    })).toEqual({
      ok: true,
      canvas: sharedRendererCanvas,
      source: 'explicitExportCanvas',
    });
  });

  it('falls back to the Pixi canvas while export is still migrating', () => {
    const pixiCanvas = { id: 'pixi-export' } as unknown as HTMLCanvasElement;

    expect(resolveProjectExportFrameCanvas({
      pixiCanvas,
    })).toEqual({
      ok: true,
      canvas: pixiCanvas,
      source: 'pixiCanvas',
    });
  });

  it('fails loud when no export frame canvas is available', () => {
    expect(resolveProjectExportFrameCanvas({
      getExportCanvas: () => null,
      pixiCanvas: null,
    })).toEqual({
      ok: false,
      reason: 'exportCanvasUnavailable',
      detail: 'Export requires a frame canvas from the shared renderer export path or the legacy Pixi fallback.',
    });
  });
});
