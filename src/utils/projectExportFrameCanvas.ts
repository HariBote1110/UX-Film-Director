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
  encodeTarget?: 'iosurfaceVideoToolbox';
  renderFrame?: (request: ProjectExportRustFrameRequest) => Promise<ImageBitmap>;
  renderEncodeFrame?: (request: ProjectExportRustEncodeFrameRequest) => Promise<RustBackendVideoEncodeFrame>;
  close?: () => Promise<void> | void;
}

export interface ProjectExportRustFrameSourceContext {
  objects: TimelineObject[];
  hasVideoObjects: boolean;
  hasNativeRenderMediaObjects?: boolean;
  time: number;
  preferEncodeOnly?: boolean;
  presentedFrameSharedFrameTaker?: SharedRendererPresentedFrameSharedFrameTaker;
  onFrameSourceUnavailable?: (decision: ProjectExportRustFrameSourceUnavailableDecision) => void;
}

export type ProjectExportRustFrameSourceUnavailableDecision = {
  reason: string;
  detail: string;
  nativeRenderEnvelope?: ProjectExportRustFrameSourceUnavailableNativeRenderEnvelope;
};

export type ProjectExportRustFrameSourceUnavailableNativeRenderEnvelope =
  | {
      ok: true;
      mediaCount: number;
      mediaKinds: string[];
      sourceCount: number;
      sourceMediaIds: string[];
    }
  | {
      ok: false;
      reason: string;
      detail: string;
    };

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
  rustFrameSourceUnavailableDetail?: string;
  rustFrameSourcePolicy?: ProjectExportRustFrameSourcePolicy;
  rustFrameSourceBlockedFallback?: ProjectExportRustFrameSourceBlockedFallback;
  hasVideoObjects: boolean;
  hasNativeRenderMediaObjects?: boolean;
}

export interface ResolveProjectExportFrameRuntimePlanInput {
  frameSourcePlan: Extract<ProjectExportFrameSourcePlanResult, { ok: true }>;
  rustFrameSourceBlocked: boolean;
}

export interface ResolveProjectExportFrameSourcePolicyForEncodeInput {
  rustExportOnly: boolean;
  hasVideoObjects: boolean;
  hasNativeRenderMediaObjects?: boolean;
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
  onFrameSourceUnavailable?: ProjectExportRustFrameSourceContext['onFrameSourceUnavailable'];
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
  rustFrameSourceUnavailableDetail,
  rustFrameSourcePolicy = 'allowLegacyCanvas',
  rustFrameSourceBlockedFallback = 'legacyCanvas',
  hasVideoObjects,
  hasNativeRenderMediaObjects = false,
  getExportCanvas,
  legacyCanvas = null,
}: BuildProjectExportFrameSourcePlanInput): ProjectExportFrameSourcePlanResult => {
  if (rustFrameSource) {
    if ((hasVideoObjects || rustFrameSourcePolicy === 'requireRustFrameSource') && !rustFrameSource.renderEncodeFrame) {
      return {
        ok: false,
        reason: 'rustFrameSourceRequired',
        detail: hasVideoObjects
          ? 'Video export requires a shared-frame Rust export source.'
          : 'Rust-only export requires a shared-frame Rust export source.',
      };
    }

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
      detail: appendRustFrameSourceUnavailableDetail(
        hasNativeRenderMediaObjects
          ? 'Image/PSD export requires a shared renderer Rust frame source.'
          : 'Rust-only export requires a shared renderer Rust frame source.',
        rustFrameSourceUnavailableDetail
      ),
    };
  }

  if (hasVideoObjects) {
    return {
      ok: false,
      reason: 'rustFrameSourceRequired',
      detail: appendRustFrameSourceUnavailableDetail(
        'Video export requires a shared renderer Rust frame source.',
        rustFrameSourceUnavailableDetail
      ),
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

const appendRustFrameSourceUnavailableDetail = (
  baseDetail: string,
  unavailableDetail: string | undefined
): string => unavailableDetail
  ? `${baseDetail} ${unavailableDetail}`
  : baseDetail;

export const formatProjectExportRustFrameSourceUnavailableDetail = (
  decision: ProjectExportRustFrameSourceUnavailableDecision
): string => {
  const diagnostics = [`fallback=${decision.reason}`];
  if (decision.nativeRenderEnvelope) {
    diagnostics.push(formatUnavailableNativeRenderEnvelope(decision.nativeRenderEnvelope));
  }
  return `${decision.detail} [${diagnostics.join('; ')}]`;
};

const formatUnavailableNativeRenderEnvelope = (
  envelope: ProjectExportRustFrameSourceUnavailableNativeRenderEnvelope
): string => {
  if (!envelope.ok) {
    return `nativeRenderEnvelope=${envelope.reason}: ${envelope.detail}`;
  }
  return [
    'nativeRenderEnvelope=ready',
    `media=${envelope.mediaCount}`,
    `kinds=${envelope.mediaKinds.join(',')}`,
    `sources=${envelope.sourceCount}`,
    `sourceMediaIds=${envelope.sourceMediaIds.join(',')}`,
  ].join(' ');
};

export const resolveProjectExportFrameSourcePolicyForEncode = ({
  rustExportOnly,
  hasVideoObjects,
  hasNativeRenderMediaObjects = false,
  encodeEngine,
}: ResolveProjectExportFrameSourcePolicyForEncodeInput): ProjectExportFrameSourcePolicyForEncode => {
  const requiresRustFrameSource = rustExportOnly
    || encodeEngine === 'rustBackendVideoEncoder'
    || hasVideoObjects
    || hasNativeRenderMediaObjects;

  return {
    rustFrameSourcePolicy: requiresRustFrameSource ? 'requireRustFrameSource' : 'allowLegacyCanvas',
    rustFrameSourceBlockedFallback: requiresRustFrameSource ? 'failExport' : 'legacyCanvas',
  };
};

export const hasProjectExportNativeRenderMediaObjects = (
  objects: readonly TimelineObject[]
): boolean =>
  objects.some((object) =>
    object.type === 'shape'
    || object.type === 'image'
    || object.type === 'psd'
    || object.type === 'video'
    || object.type === 'audio_sphere'
    || object.type === 'particle'
    || object.type === 'barcode'
    || object.type === 'puzzle_piece'
    || object.type === 'colour_wheel'
    || object.type === 'gourd'
    || object.type === 'gear'
    || object.type === 'track_bar'
    || object.type === 'pie_chart'
    || object.type === 'histogram'
    || object.type === 'tone_curve'
    || object.type === 'getcolor_dot_field'
    || object.type === 'hksy_checker_grid'
    || object.type === 'region_frame'
    || object.type === 'simple_tube'
    || object.type === 'sphere_dots'
    || object.type === 'spherical_field'
    || object.type === 'sunburst'
    || object.type === 'circular_arrow'
    || object.type === 'triangle_bracket'
    || object.type === 'tartan_check'
    || object.type === 'houndstooth'
    || object.type === 'yagasuri'
    || object.type === 'paper_airplane'
    || object.type === 'asanoha_pattern'
    || object.type === 'focus_lines_plus'
    || object.type === 'random_line_ex'
    || object.type === 'contour_trace'
    || object.type === 'displacement_poly'
    || object.type === 'hologram'
    || object.type === 'protractor'
    || object.type === 'shaking_polygon'
    || object.type === 'audio_visualization'
  );

export const resolveProjectExportRustFrameSourceContext = ({
  objects,
  time,
  encodeEngine,
  presentedFrameSharedFrameTaker,
  onFrameSourceUnavailable,
}: ResolveProjectExportRustFrameSourceContextInput): ProjectExportRustFrameSourceContext => {
  const hasVideoObjects = objects.some((object) => object.type === 'video');
  const hasNativeRenderMediaObjects = hasProjectExportNativeRenderMediaObjects(objects);

  return {
    objects,
    hasVideoObjects,
    ...(hasNativeRenderMediaObjects ? { hasNativeRenderMediaObjects } : {}),
    time,
    preferEncodeOnly: encodeEngine === 'rustBackendVideoEncoder' || hasVideoObjects,
    presentedFrameSharedFrameTaker,
    onFrameSourceUnavailable,
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
