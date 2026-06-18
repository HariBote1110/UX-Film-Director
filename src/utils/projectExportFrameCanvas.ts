import type { TimelineObject } from '../types';
import type { ProjectExportEncodeEngine } from './projectExportEncodePlan';
import type { RustBackendVideoEncodeFrame } from './rustBackendVideoEncodeExport';

export type ProjectExportFrameCanvasSource =
  | 'explicitExportCanvas'
  | 'pixiCanvas';

export type ProjectExportRustFrameSourcePolicy =
  | 'allowLegacyCanvas'
  | 'requireRustFrameSource';

export type ProjectExportRustFrameSourceBlockedFallback =
  | 'legacyCanvas'
  | 'failExport';

export interface ProjectExportRustFrameRequest {
  frameIndex: number;
  timestampUs: number;
  time: number;
  width: number;
  height: number;
  objects: readonly TimelineObject[];
}

export interface ProjectExportRustEncodeFrameRequest extends ProjectExportRustFrameRequest {
  encodeSessionId: string;
}

export interface ProjectExportRustFrameSource {
  renderFrame: (request: ProjectExportRustFrameRequest) => Promise<ImageBitmap>;
  renderEncodeFrame?: (request: ProjectExportRustEncodeFrameRequest) => Promise<RustBackendVideoEncodeFrame>;
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
      rustFrameSourceBlockedFallback: ProjectExportRustFrameSourceBlockedFallback;
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
      reason: 'exportFrameSourceUnavailable' | 'rustFrameSourceRequired';
      detail: string;
    };

export type ProjectExportRuntimeFrameSource =
  | 'sharedRendererRustFrameSource'
  | 'sharedRendererRustFrameSourceBlocked'
  | 'legacyCanvasAfterRustBlocked'
  | ProjectExportFrameCanvasSource;

export interface ProjectExportFrameRuntimePlan {
  source: ProjectExportRuntimeFrameSource;
  captureCanvas: boolean;
  requiresRenderScene: boolean;
  usesExportFrameOverrides: boolean;
  requiresHtmlVideoElementSeekFallback: boolean;
  shouldCloseRustFrameSource: boolean;
  shouldFailOnRustFrameSourceBlocked: boolean;
}

export interface BuildProjectExportFrameSourcePlanInput extends ResolveProjectExportFrameCanvasInput {
  rustFrameSource?: ProjectExportRustFrameSource | null;
  rustFrameSourcePolicy?: ProjectExportRustFrameSourcePolicy;
  rustFrameSourceBlockedFallback?: ProjectExportRustFrameSourceBlockedFallback;
}

export interface ResolveProjectExportFrameRuntimePlanInput {
  frameSourcePlan: Extract<ProjectExportFrameSourcePlanResult, { ok: true }>;
  rustFrameSourceBlocked: boolean;
}

export interface ResolveProjectExportFrameSourcePolicyForEncodeInput {
  rustExportOnly: boolean;
  encodeEngine: ProjectExportEncodeEngine;
}

export interface ProjectExportFrameSourcePolicyForEncode {
  rustFrameSourcePolicy: ProjectExportRustFrameSourcePolicy;
  rustFrameSourceBlockedFallback: ProjectExportRustFrameSourceBlockedFallback;
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
  rustFrameSourcePolicy = 'allowLegacyCanvas',
  rustFrameSourceBlockedFallback = 'legacyCanvas',
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
      rustFrameSourceBlockedFallback,
    };
  }

  if (rustFrameSourcePolicy === 'requireRustFrameSource') {
    return {
      ok: false,
      reason: 'rustFrameSourceRequired',
      detail: 'Rust-only export requires a shared renderer Rust frame source.',
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

export const resolveProjectExportFrameSourcePolicyForEncode = ({
  rustExportOnly,
  encodeEngine,
}: ResolveProjectExportFrameSourcePolicyForEncodeInput): ProjectExportFrameSourcePolicyForEncode => {
  const requiresRustFrameSource = rustExportOnly || encodeEngine === 'rustBackendVideoEncoder';

  return {
    rustFrameSourcePolicy: requiresRustFrameSource ? 'requireRustFrameSource' : 'allowLegacyCanvas',
    rustFrameSourceBlockedFallback: requiresRustFrameSource ? 'failExport' : 'legacyCanvas',
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
        shouldFailOnRustFrameSourceBlocked: false,
      };
    }

    if (frameSourcePlan.rustFrameSourceBlockedFallback === 'failExport') {
      return {
        source: 'sharedRendererRustFrameSourceBlocked',
        captureCanvas: false,
        requiresRenderScene: false,
        usesExportFrameOverrides: false,
        requiresHtmlVideoElementSeekFallback: false,
        shouldCloseRustFrameSource: true,
        shouldFailOnRustFrameSourceBlocked: true,
      };
    }

    return {
      source: 'legacyCanvasAfterRustBlocked',
      captureCanvas: true,
      requiresRenderScene: true,
      usesExportFrameOverrides: false,
      requiresHtmlVideoElementSeekFallback: true,
      shouldCloseRustFrameSource: true,
      shouldFailOnRustFrameSourceBlocked: false,
    };
  }

  return {
    source: frameSourcePlan.source,
    captureCanvas: true,
    requiresRenderScene: true,
    usesExportFrameOverrides: frameSourcePlan.usesExportFrameOverrides,
    requiresHtmlVideoElementSeekFallback: frameSourcePlan.requiresHtmlVideoElementSeekFallback,
    shouldCloseRustFrameSource: false,
    shouldFailOnRustFrameSourceBlocked: false,
  };
};
