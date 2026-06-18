import type { EditorMode, LayerState, ProjectSettings, TimelineObject } from '../types';
import {
  createSharedRendererExportFrameSource,
  type CreateSharedRendererExportFrameSourceInput,
} from './sharedRendererExportFrameSource';
import {
  buildSharedRendererExportSession,
  type SharedRendererExportSession,
  type SharedRendererExportSessionInput,
} from './sharedRendererExportSession';
import type { ProjectExportRustFrameSource } from './projectExportFrameCanvas';

type BuildSharedRendererExportSession = (
  input: SharedRendererExportSessionInput
) => SharedRendererExportSession;

export interface BuildViewportRustExportFrameSourceInput {
  exportEnabled: boolean;
  canvas: HTMLCanvasElement | null;
  projectSettings: ProjectSettings;
  layers: LayerState[];
  editorMode: EditorMode;
  webGpuAvailable: boolean;
  fallbackAdapter: boolean;
  videoCutoverEnabled: boolean;
  objects?: TimelineObject[];
  time?: number;
  buildExportSession?: BuildSharedRendererExportSession;
  createFrameSource?: (
    input: CreateSharedRendererExportFrameSourceInput
  ) => ProjectExportRustFrameSource;
  diagnosticsDataset?: Record<string, string | undefined>;
}

export type ViewportRustExportFrameSourceFallbackReason =
  | 'exportFlagDisabled'
  | 'surfaceCanvasUnavailable'
  | 'unsupportedEditorMode'
  | 'webGpuUnavailable'
  | 'fallbackAdapter'
  | 'videoCutoverDisabled'
  | 'exportSessionBlocked';

export type ViewportRustExportFrameSourceDecision =
  | {
      ok: true;
      source: ProjectExportRustFrameSource;
    }
  | {
      ok: false;
      reason: ViewportRustExportFrameSourceFallbackReason;
      detail: string;
    };

export const buildViewportRustExportFrameSource = ({
  diagnosticsDataset,
  ...input
}: BuildViewportRustExportFrameSourceInput): ProjectExportRustFrameSource | null => {
  const decision = resolveViewportRustExportFrameSource(input);
  if (diagnosticsDataset) {
    writeViewportRustExportFrameSourceDiagnostics(diagnosticsDataset, decision);
  }

  return decision.ok ? decision.source : null;
};

export const resolveViewportRustExportFrameSource = ({
  exportEnabled,
  canvas,
  projectSettings,
  layers,
  editorMode,
  webGpuAvailable,
  fallbackAdapter,
  videoCutoverEnabled,
  objects,
  time,
  buildExportSession = buildSharedRendererExportSession,
  createFrameSource = createSharedRendererExportFrameSource,
}: BuildViewportRustExportFrameSourceInput): ViewportRustExportFrameSourceDecision => {
  if (!exportEnabled) {
    return fallback(
      'exportFlagDisabled',
      'Shared renderer Rust export is disabled.'
    );
  }
  if (!canvas) {
    return fallback(
      'surfaceCanvasUnavailable',
      'Shared renderer export surface canvas is not mounted.'
    );
  }
  if (editorMode !== '2d') {
    return fallback(
      'unsupportedEditorMode',
      'Shared renderer Rust export currently supports only the 2D editor mode.'
    );
  }
  if (!webGpuAvailable) {
    return fallback(
      'webGpuUnavailable',
      'WebGPU is not available for shared renderer Rust export.'
    );
  }
  if (fallbackAdapter) {
    return fallback(
      'fallbackAdapter',
      'Shared renderer Rust export requires a non-fallback WebGPU adapter.'
    );
  }
  if (!videoCutoverEnabled) {
    return fallback(
      'videoCutoverDisabled',
      'Shared renderer Rust export requires Rust video cutover to be enabled.'
    );
  }

  if (objects && time !== undefined) {
    for (const preflightTime of buildViewportRustExportPreflightTimes(objects, time)) {
      const session = buildExportSession({
        enabled: true,
        projectSettings,
        layers,
        objects,
        time: preflightTime,
        editorMode,
        webGpuAvailable,
        fallbackAdapter,
      });
      if (!session.surfaceGate.ok) {
        return fallback('exportSessionBlocked', session.surfaceGate.detail);
      }
    }
  }

  return {
    ok: true,
    source: createFrameSource({
      canvas,
      projectSettings,
      layers,
      editorMode,
      webGpuAvailable,
      fallbackAdapter,
      videoCutoverEnabled,
    }),
  };
};

export const writeViewportRustExportFrameSourceDiagnostics = (
  dataset: Record<string, string | undefined>,
  decision: ViewportRustExportFrameSourceDecision
): void => {
  dataset.uxfdRustExportFrameSourceStatus = decision.ok ? 'ready' : 'fallback';
  dataset.uxfdRustExportFrameSourceReason = decision.ok ? undefined : decision.reason;
};

const fallback = (
  reason: ViewportRustExportFrameSourceFallbackReason,
  detail: string
): ViewportRustExportFrameSourceDecision => ({
  ok: false,
  reason,
  detail,
});

const buildViewportRustExportPreflightTimes = (
  objects: TimelineObject[],
  initialTime: number
): number[] => {
  const times = new Set<number>();
  addPreflightTime(times, initialTime);
  objects.forEach((object) => {
    if (object.duration <= 0) return;
    addPreflightTime(times, Math.max(0, object.startTime));
  });
  return Array.from(times).sort((left, right) => left - right);
};

const addPreflightTime = (times: Set<number>, time: number): void => {
  if (!Number.isFinite(time)) return;
  if (time < 0) return;
  times.add(time);
};
