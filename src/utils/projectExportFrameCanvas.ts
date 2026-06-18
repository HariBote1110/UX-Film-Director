import type { TimelineObject } from '../types';

export type ProjectExportFrameCanvasSource =
  | 'explicitExportCanvas'
  | 'pixiCanvas';

export interface ProjectExportRustFrameRequest {
  frameIndex: number;
  timestampUs: number;
  time: number;
  width: number;
  height: number;
  objects: readonly TimelineObject[];
}

export interface ProjectExportRustFrameSource {
  renderFrame: (request: ProjectExportRustFrameRequest) => Promise<ImageBitmap>;
  close?: () => Promise<void> | void;
}

export interface ProjectExportRustFrameSourceContext {
  objects: TimelineObject[];
  time: number;
}

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

export type ProjectExportFrameSourcePlanResult =
  | {
      ok: true;
      source: 'sharedRendererRustFrameSource';
      frameSource: ProjectExportRustFrameSource;
      captureCanvas: false;
      requiresRenderScene: false;
      requiresLegacyBrowserVideoProviders: false;
      requiresHtmlVideoElementSeekFallback: false;
      usesExportFrameOverrides: false;
    }
  | {
      ok: true;
      source: ProjectExportFrameCanvasSource;
      canvas: HTMLCanvasElement;
      captureCanvas: true;
      requiresRenderScene: true;
      requiresLegacyBrowserVideoProviders: true;
      requiresHtmlVideoElementSeekFallback: true;
      usesExportFrameOverrides: true;
    }
  | {
      ok: false;
      reason: 'exportFrameSourceUnavailable';
      detail: string;
    };

export type ProjectExportRuntimeFrameSource =
  | 'sharedRendererRustFrameSource'
  | 'legacyCanvasAfterRustBlocked'
  | ProjectExportFrameCanvasSource;

export interface ProjectExportFrameRuntimePlan {
  source: ProjectExportRuntimeFrameSource;
  captureCanvas: boolean;
  requiresRenderScene: boolean;
  usesExportFrameOverrides: boolean;
  requiresHtmlVideoElementSeekFallback: boolean;
  shouldCloseRustFrameSource: boolean;
}

export interface BuildProjectExportFrameSourcePlanInput extends ResolveProjectExportFrameCanvasInput {
  rustFrameSource?: ProjectExportRustFrameSource | null;
}

export interface ResolveProjectExportFrameRuntimePlanInput {
  frameSourcePlan: Extract<ProjectExportFrameSourcePlanResult, { ok: true }>;
  rustFrameSourceBlocked: boolean;
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

export const buildProjectExportFrameSourcePlan = ({
  rustFrameSource = null,
  getExportCanvas,
  pixiCanvas = null,
}: BuildProjectExportFrameSourcePlanInput): ProjectExportFrameSourcePlanResult => {
  if (rustFrameSource) {
    return {
      ok: true,
      source: 'sharedRendererRustFrameSource',
      frameSource: rustFrameSource,
      captureCanvas: false,
      requiresRenderScene: false,
      requiresLegacyBrowserVideoProviders: false,
      requiresHtmlVideoElementSeekFallback: false,
      usesExportFrameOverrides: false,
    };
  }

  const canvas = resolveProjectExportFrameCanvas({
    getExportCanvas,
    pixiCanvas,
  });
  if (canvas.ok) {
    return {
      ok: true,
      source: canvas.source,
      canvas: canvas.canvas,
      captureCanvas: true,
      requiresRenderScene: true,
      requiresLegacyBrowserVideoProviders: true,
      requiresHtmlVideoElementSeekFallback: true,
      usesExportFrameOverrides: true,
    };
  }

  return {
    ok: false,
    reason: 'exportFrameSourceUnavailable',
    detail: 'Export requires a Rust frame source, shared renderer export canvas, or legacy Pixi canvas.',
  };
};

export const resolveProjectExportFrameRuntimePlan = ({
  frameSourcePlan,
  rustFrameSourceBlocked,
}: ResolveProjectExportFrameRuntimePlanInput): ProjectExportFrameRuntimePlan => {
  if (frameSourcePlan.source === 'sharedRendererRustFrameSource') {
    if (!rustFrameSourceBlocked) {
      return {
        source: 'sharedRendererRustFrameSource',
        captureCanvas: false,
        requiresRenderScene: false,
        usesExportFrameOverrides: false,
        requiresHtmlVideoElementSeekFallback: false,
        shouldCloseRustFrameSource: false,
      };
    }

    return {
      source: 'legacyCanvasAfterRustBlocked',
      captureCanvas: true,
      requiresRenderScene: true,
      usesExportFrameOverrides: false,
      requiresHtmlVideoElementSeekFallback: true,
      shouldCloseRustFrameSource: true,
    };
  }

  return {
    source: frameSourcePlan.source,
    captureCanvas: true,
    requiresRenderScene: true,
    usesExportFrameOverrides: frameSourcePlan.usesExportFrameOverrides,
    requiresHtmlVideoElementSeekFallback: frameSourcePlan.requiresHtmlVideoElementSeekFallback,
    shouldCloseRustFrameSource: false,
  };
};
