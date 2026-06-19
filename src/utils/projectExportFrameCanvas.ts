import type { TimelineObject } from '../types';
import type { ProjectExportEncodeEngine } from './projectExportEncodePlan';
import type { RustBackendVideoEncodeFrame } from './rustBackendVideoEncodeExport';
import type { SharedRendererPresentedFrameSharedFrameTaker } from './sharedRendererWebGpuPresenter';

export type ProjectExportFrameCanvasSource =
  | 'explicitExportCanvas'
  | 'legacyCanvas';

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
  renderFrame?: (request: ProjectExportRustFrameRequest) => Promise<ImageBitmap>;
  renderEncodeFrame?: (request: ProjectExportRustEncodeFrameRequest) => Promise<RustBackendVideoEncodeFrame>;
  close?: () => Promise<void> | void;
}

export interface ProjectExportRustFrameSourceContext {
  objects: TimelineObject[];
  hasVideoObjects: boolean;
  time: number;
  preferEncodeOnly?: boolean;
  presentedFrameSharedFrameTaker?: SharedRendererPresentedFrameSharedFrameTaker;
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
  legacyCanvas?: HTMLCanvasElement | null;
}

export type ProjectExportFrameSourcePlanResult =
  | {
      ok: true;
      source: 'sharedRendererRustFrameSource';
      frameSource: ProjectExportRustFrameSource;
      captureCanvas: false;
      requiresRenderScene: false;
      usesExportFrameOverrides: false;
      rustFrameSourceBlockedFallback: ProjectExportRustFrameSourceBlockedFallback;
    }
  | {
      ok: true;
      source: ProjectExportFrameCanvasSource;
      canvas: HTMLCanvasElement;
      captureCanvas: true;
      requiresRenderScene: true;
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
  shouldCloseRustFrameSource: boolean;
  shouldFailOnRustFrameSourceBlocked: boolean;
}

export interface BuildProjectExportFrameSourcePlanInput extends ResolveProjectExportFrameCanvasInput {
  rustFrameSource?: ProjectExportRustFrameSource | null;
  rustFrameSourcePolicy?: ProjectExportRustFrameSourcePolicy;
  rustFrameSourceBlockedFallback?: ProjectExportRustFrameSourceBlockedFallback;
  hasVideoObjects: boolean;
}

export interface ResolveProjectExportFrameRuntimePlanInput {
  frameSourcePlan: Extract<ProjectExportFrameSourcePlanResult, { ok: true }>;
  rustFrameSourceBlocked: boolean;
}

export interface ResolveProjectExportFrameSourcePolicyForEncodeInput {
  rustExportOnly: boolean;
  hasVideoObjects: boolean;
  encodeEngine: ProjectExportEncodeEngine;
}

export interface ProjectExportFrameSourcePolicyForEncode {
  rustFrameSourcePolicy: ProjectExportRustFrameSourcePolicy;
  rustFrameSourceBlockedFallback: ProjectExportRustFrameSourceBlockedFallback;
}

export interface ResolveProjectExportRustFrameSourceContextInput {
  objects: TimelineObject[];
  time: number;
  encodeEngine: ProjectExportEncodeEngine;
  presentedFrameSharedFrameTaker?: SharedRendererPresentedFrameSharedFrameTaker;
}

export const resolveProjectExportFrameCanvas = ({
  getExportCanvas,
  legacyCanvas = null,
}: ResolveProjectExportFrameCanvasInput): ResolveProjectExportFrameCanvasResult => {
  const explicitCanvas = getExportCanvas?.() ?? null;
  if (explicitCanvas) {
    return {
      ok: true,
      canvas: explicitCanvas,
      source: 'explicitExportCanvas',
    };
  }

  if (legacyCanvas) {
    return {
      ok: true,
      canvas: legacyCanvas,
      source: 'legacyCanvas',
    };
  }

  return {
    ok: false,
    reason: 'exportCanvasUnavailable',
    detail: 'Export requires a frame canvas from the shared renderer export path or the legacy canvas fallback.',
  };
};

export const buildProjectExportFrameSourcePlan = ({
  rustFrameSource = null,
  rustFrameSourcePolicy = 'allowLegacyCanvas',
  rustFrameSourceBlockedFallback = 'legacyCanvas',
  hasVideoObjects,
  getExportCanvas,
  legacyCanvas = null,
}: BuildProjectExportFrameSourcePlanInput): ProjectExportFrameSourcePlanResult => {
  if (rustFrameSource) {
    const effectiveRustFrameSourceBlockedFallback = hasVideoObjects
      ? 'failExport'
      : rustFrameSourceBlockedFallback;

    return {
      ok: true,
      source: 'sharedRendererRustFrameSource',
      frameSource: rustFrameSource,
      captureCanvas: false,
      requiresRenderScene: false,
      usesExportFrameOverrides: false,
      rustFrameSourceBlockedFallback: effectiveRustFrameSourceBlockedFallback,
    };
  }

  if (rustFrameSourcePolicy === 'requireRustFrameSource') {
    return {
      ok: false,
      reason: 'rustFrameSourceRequired',
      detail: 'Rust-only export requires a shared renderer Rust frame source.',
    };
  }

  if (hasVideoObjects) {
    return {
      ok: false,
      reason: 'rustFrameSourceRequired',
      detail: 'Video export requires a shared renderer Rust frame source.',
    };
  }

  const canvas = resolveProjectExportFrameCanvas({
    getExportCanvas,
    legacyCanvas,
  });
  if (canvas.ok) {
    return {
      ok: true,
      source: canvas.source,
      canvas: canvas.canvas,
      captureCanvas: true,
      requiresRenderScene: true,
      usesExportFrameOverrides: true,
    };
  }

  return {
    ok: false,
    reason: 'exportFrameSourceUnavailable',
    detail: 'Export requires a Rust frame source, shared renderer export canvas, or legacy canvas.',
  };
};

export const resolveProjectExportFrameSourcePolicyForEncode = ({
  rustExportOnly,
  hasVideoObjects,
  encodeEngine,
}: ResolveProjectExportFrameSourcePolicyForEncodeInput): ProjectExportFrameSourcePolicyForEncode => {
  const requiresRustFrameSource = rustExportOnly
    || encodeEngine === 'rustBackendVideoEncoder'
    || hasVideoObjects;

  return {
    rustFrameSourcePolicy: requiresRustFrameSource ? 'requireRustFrameSource' : 'allowLegacyCanvas',
    rustFrameSourceBlockedFallback: requiresRustFrameSource ? 'failExport' : 'legacyCanvas',
  };
};

export const resolveProjectExportRustFrameSourceContext = ({
  objects,
  time,
  encodeEngine,
  presentedFrameSharedFrameTaker,
}: ResolveProjectExportRustFrameSourceContextInput): ProjectExportRustFrameSourceContext => {
  const hasVideoObjects = objects.some((object) => object.type === 'video');

  return {
    objects,
    hasVideoObjects,
    time,
    preferEncodeOnly: encodeEngine === 'rustBackendVideoEncoder' || hasVideoObjects,
    presentedFrameSharedFrameTaker,
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
        shouldCloseRustFrameSource: true,
        shouldFailOnRustFrameSourceBlocked: true,
      };
    }

    return {
      source: 'legacyCanvasAfterRustBlocked',
      captureCanvas: true,
      requiresRenderScene: true,
      usesExportFrameOverrides: false,
      shouldCloseRustFrameSource: true,
      shouldFailOnRustFrameSourceBlocked: false,
    };
  }

  return {
    source: frameSourcePlan.source,
    captureCanvas: true,
    requiresRenderScene: true,
    usesExportFrameOverrides: frameSourcePlan.usesExportFrameOverrides,
    shouldCloseRustFrameSource: false,
    shouldFailOnRustFrameSourceBlocked: false,
  };
};

export const shouldSynchroniseTimelineForProjectExportFrame = (
  frameRuntimePlan: Pick<ProjectExportFrameRuntimePlan, 'requiresRenderScene'>
): boolean => frameRuntimePlan.requiresRenderScene;

export const createSingleUseProjectExportFrameSourceCloser = (
  frameSource: Pick<ProjectExportRustFrameSource, 'close'>
): (() => Promise<void>) => {
  let closePromise: Promise<void> | null = null;

  return () => {
    if (!closePromise) {
      closePromise = Promise.resolve(frameSource.close?.()).then(() => undefined);
    }
    return closePromise;
  };
};
