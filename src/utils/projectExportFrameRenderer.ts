import type { TimelineObject } from '../types';
import {
  resolveProjectExportFrameCanvas,
  resolveProjectExportFrameRuntimePlan,
  shouldSynchroniseTimelineForProjectExportFrame,
  type ProjectExportFrameSourcePlanResult,
} from './projectExportFrameCanvas';
import { captureProjectExportLegacyCanvasFrame } from './projectExportLegacyCanvasCapture';
import { renderProjectExportRustEncodeFrame } from './projectExportRustEncodeFrame';
import type { RustBackendVideoEncodeFrame } from './rustBackendVideoEncodeExport';
import {
  isSharedRendererExportFrameSourceBlockedError,
  type SharedRendererExportFrameSourceBlockedReason,
} from './sharedRendererExportFrameSource';

export interface ProjectExportRustFrameSourceBlockedDiagnostic {
  reason: SharedRendererExportFrameSourceBlockedReason;
  frameIndex: number;
  legacyCanvasFallbackAllowed: boolean;
  detail: string;
}

export interface RenderProjectExportFrameInput {
  frameSourcePlan: Extract<ProjectExportFrameSourcePlanResult, { ok: true }>;
  rustFrameSourceBlocked: boolean;
  frameIndex: number;
  fps: number;
  width: number;
  height: number;
  objects: TimelineObject[];
  encodeSessionId: string;
  preferSharedFrame: boolean;
  renderScene: (time: number, objects: TimelineObject[]) => void;
  getExportCanvas?: () => HTMLCanvasElement | null;
  closeRustFrameSource?: () => Promise<void> | void;
  onSynchroniseTimeline?: (time: number) => void;
  onRustFrameSourceBlocked?: (event: ProjectExportRustFrameSourceBlockedDiagnostic) => void;
  onRustFrameSourceFallback?: (event: ProjectExportRustFrameSourceBlockedDiagnostic) => void;
  renderRustEncodeFrame?: typeof renderProjectExportRustEncodeFrame;
  captureLegacyCanvasFrame?: typeof captureProjectExportLegacyCanvasFrame;
}

export interface RenderProjectExportFrameResult {
  frame: RustBackendVideoEncodeFrame;
  rustFrameSourceBlocked: boolean;
}

export const renderProjectExportFrame = async ({
  frameSourcePlan,
  rustFrameSourceBlocked,
  frameIndex,
  fps,
  width,
  height,
  objects,
  encodeSessionId,
  preferSharedFrame,
  renderScene,
  getExportCanvas,
  closeRustFrameSource,
  onSynchroniseTimeline,
  onRustFrameSourceBlocked,
  onRustFrameSourceFallback,
  renderRustEncodeFrame = renderProjectExportRustEncodeFrame,
  captureLegacyCanvasFrame = captureProjectExportLegacyCanvasFrame,
}: RenderProjectExportFrameInput): Promise<RenderProjectExportFrameResult> => {
  const time = frameIndex / fps;
  const timestampUs = Math.round(frameIndex * 1_000_000 / fps);
  let nextRustFrameSourceBlocked = rustFrameSourceBlocked;
  let frameRuntimePlan = resolveProjectExportFrameRuntimePlan({
    frameSourcePlan,
    rustFrameSourceBlocked: nextRustFrameSourceBlocked,
  });

  if (
    shouldSynchroniseTimelineForProjectExportFrame(frameRuntimePlan)
    && frameIndex % Math.max(1, Math.floor(fps / 2)) === 0
  ) {
    onSynchroniseTimeline?.(time);
  }

  if (
    frameRuntimePlan.source === 'sharedRendererRustFrameSource'
    && frameSourcePlan.source === 'sharedRendererRustFrameSource'
  ) {
    try {
      return {
        frame: await renderRustEncodeFrame({
          frameSource: frameSourcePlan.frameSource,
          encodeSessionId,
          preferSharedFrame,
          request: {
            frameIndex,
            timestampUs,
            time,
            width,
            height,
            objects,
          },
        }),
        rustFrameSourceBlocked: nextRustFrameSourceBlocked,
      };
    } catch (error) {
      if (!isSharedRendererExportFrameSourceBlockedError(error)) {
        throw error;
      }
      nextRustFrameSourceBlocked = true;
      const blockedRuntimePlan = resolveProjectExportFrameRuntimePlan({
        frameSourcePlan,
        rustFrameSourceBlocked: nextRustFrameSourceBlocked,
      });
      const blockedDiagnostic = {
        reason: error.reason,
        frameIndex: error.frameIndex,
        legacyCanvasFallbackAllowed: error.legacyCanvasFallbackAllowed,
        detail: error.message,
      };
      onRustFrameSourceBlocked?.(blockedDiagnostic);
      if (blockedRuntimePlan.shouldCloseRustFrameSource) {
        await closeRustFrameSource?.();
      }
      if (blockedRuntimePlan.shouldFailOnRustFrameSourceBlocked) {
        throw error;
      }
      onRustFrameSourceFallback?.(blockedDiagnostic);
      frameRuntimePlan = blockedRuntimePlan;
    }
  }

  if (frameRuntimePlan.requiresRenderScene) {
    renderScene(time, objects);
  }
  if (frameRuntimePlan.shouldFailOnRustFrameSourceBlocked) {
    throw new Error('Rust frame source is blocked and legacy canvas fallback is disabled.');
  }
  const frameCanvas = resolveProjectExportFrameCanvas({
    getExportCanvas,
  });
  if (!frameCanvas.ok) throw new Error(frameCanvas.detail);
  return {
    frame: await captureLegacyCanvasFrame({
      canvas: frameCanvas.canvas,
      width,
      height,
      timestamp: timestampUs,
    }),
    rustFrameSourceBlocked: nextRustFrameSourceBlocked,
  };
};
