import type { EditorMode, LayerState, ProjectSettings } from '../types';
import {
  createSharedRendererExportFrameSource,
  type CreateSharedRendererExportFrameSourceInput,
} from './sharedRendererExportFrameSource';
import type { ProjectExportRustFrameSource } from './projectExportFrameCanvas';

export interface BuildViewportRustExportFrameSourceInput {
  exportEnabled: boolean;
  canvas: HTMLCanvasElement | null;
  projectSettings: ProjectSettings;
  layers: LayerState[];
  editorMode: EditorMode;
  webGpuAvailable: boolean;
  fallbackAdapter: boolean;
  videoCutoverEnabled: boolean;
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
  | 'videoCutoverDisabled';

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
