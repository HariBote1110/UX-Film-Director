export type ProjectExportFrameCanvasSource =
  | 'explicitExportCanvas'
  | 'pixiCanvas';

export type ResolveProjectExportFrameCanvasResult =
  | {
      ok: true;
      canvas: HTMLCanvasElement;
      source: ProjectExportFrameCanvasSource;
    }
  | {
      ok: false;
      reason: 'exportCanvasUnavailable';
      detail: string;
    };

export interface ResolveProjectExportFrameCanvasInput {
  getExportCanvas?: () => HTMLCanvasElement | null;
  pixiCanvas?: HTMLCanvasElement | null;
}

export const resolveProjectExportFrameCanvas = ({
  getExportCanvas,
  pixiCanvas = null,
}: ResolveProjectExportFrameCanvasInput): ResolveProjectExportFrameCanvasResult => {
  const explicitCanvas = getExportCanvas?.() ?? null;
  if (explicitCanvas) {
    return {
      ok: true,
      canvas: explicitCanvas,
      source: 'explicitExportCanvas',
    };
  }

  if (pixiCanvas) {
    return {
      ok: true,
      canvas: pixiCanvas,
      source: 'pixiCanvas',
    };
  }

  return {
    ok: false,
    reason: 'exportCanvasUnavailable',
    detail: 'Export requires a frame canvas from the shared renderer export path or the legacy Pixi fallback.',
  };
};
