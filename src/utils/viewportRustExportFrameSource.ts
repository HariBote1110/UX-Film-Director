import type { EditorMode, LayerState, ProjectSettings } from '../types';
import type { SharedRendererPresentedFrameSharedFrameTaker } from './sharedRendererPresentedFrameTypes';
import {
  createSharedRendererExportFrameSource,
  type CreateSharedRendererExportFrameSourceInput,
} from './sharedRendererExportFrameSource';
import {
  type SharedRendererNativeRenderEnvelope,
} from './sharedRendererExportSession';
import type { ProjectExportRustFrameSource } from './projectExportFrameCanvas';
import type { SharedRendererExportEvaluationProvider } from './sharedRendererExportEvaluationProvider';

export interface BuildViewportRustExportFrameSourceInput {
  exportEnabled: boolean;
  canvas: HTMLCanvasElement | null;
  projectSettings: ProjectSettings;
  layers: LayerState[];
  editorMode: EditorMode;
  webGpuAvailable: boolean;
  fallbackAdapter: boolean;
  videoCutoverEnabled: boolean;
  hasVideoObjects: boolean;
  hasNativeRenderMediaObjects?: boolean;
  preferEncodeOnly?: boolean;
  presentedFrameSharedFrameTaker?: SharedRendererPresentedFrameSharedFrameTaker;
  evaluateResidentScene?: SharedRendererExportEvaluationProvider;
  createFrameSource?: (
    input: CreateSharedRendererExportFrameSourceInput
  ) => ProjectExportRustFrameSource;
  onFrameSourceUnavailable?: (decision: Extract<ViewportRustExportFrameSourceDecision, { ok: false }>) => void;
  diagnosticsDataset?: Record<string, string | undefined>;
}

export type ViewportRustExportFrameSourceFallbackReason =
  | 'exportFlagDisabled'
  | 'surfaceCanvasUnavailable'
  | 'unsupportedEditorMode'
  | 'webGpuUnavailable'
  | 'fallbackAdapter'
  | 'videoCutoverDisabled'
  | 'residentEvaluationUnavailable';

export type ViewportRustExportFrameSourceDecision =
  | {
      ok: true;
      source: ProjectExportRustFrameSource;
      nativeRenderEnvelope?: SharedRendererNativeRenderEnvelope;
    }
  | {
      ok: false;
      reason: ViewportRustExportFrameSourceFallbackReason;
      detail: string;
      diagnosticStatus?: 'fallback' | 'blocked';
      nativeRenderEnvelope?: SharedRendererNativeRenderEnvelope;
    };

export const buildViewportRustExportFrameSource = ({
  diagnosticsDataset,
  onFrameSourceUnavailable,
  ...input
}: BuildViewportRustExportFrameSourceInput): ProjectExportRustFrameSource | null => {
  const decision = resolveViewportRustExportFrameSource(input);
  if (diagnosticsDataset) {
    writeViewportRustExportFrameSourceDiagnostics(diagnosticsDataset, decision);
  }
  if (!decision.ok) {
    onFrameSourceUnavailable?.(decision);
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
  hasVideoObjects,
  hasNativeRenderMediaObjects = false,
  preferEncodeOnly = false,
  presentedFrameSharedFrameTaker,
  evaluateResidentScene,
  createFrameSource = createSharedRendererExportFrameSource,
}: BuildViewportRustExportFrameSourceInput): ViewportRustExportFrameSourceDecision => {
  const effectiveVideoCutoverEnabled = videoCutoverEnabled || hasVideoObjects;
  const effectivePreferEncodeOnly = preferEncodeOnly || hasVideoObjects;
  const requiresNativeRenderOutput = effectivePreferEncodeOnly || hasNativeRenderMediaObjects;

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
  if (!effectiveVideoCutoverEnabled) {
    return fallback(
      'videoCutoverDisabled',
      'Shared renderer Rust export requires Rust video cutover to be enabled.'
    );
  }
  if (!evaluateResidentScene) {
    return fallback(
      'residentEvaluationUnavailable',
      'Rust resident scene evaluation provider is unavailable.',
      undefined,
      'blocked',
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
      videoCutoverEnabled: effectiveVideoCutoverEnabled,
      ...(effectivePreferEncodeOnly ? {
        bitmapCaptureEnabled: false,
        nativeRenderRequired: true,
      } : {}),
      ...(presentedFrameSharedFrameTaker ? { presentedFrameSharedFrameTaker } : {}),
      evaluateResidentScene,
    }),
  };
};

export const writeViewportRustExportFrameSourceDiagnostics = (
  dataset: Record<string, string | undefined>,
  decision: ViewportRustExportFrameSourceDecision
): void => {
  dataset.uxfdRustExportFrameSourceStatus = decision.ok ? 'ready' : decision.diagnosticStatus ?? 'fallback';
  dataset.uxfdRustExportFrameSourceReason = decision.ok ? undefined : decision.reason;
  writeNativeRenderEnvelopeDiagnostics(dataset, decision.nativeRenderEnvelope);
};

const fallback = (
  reason: ViewportRustExportFrameSourceFallbackReason,
  detail: string,
  nativeRenderEnvelope?: SharedRendererNativeRenderEnvelope,
  diagnosticStatus?: 'fallback' | 'blocked'
): ViewportRustExportFrameSourceDecision => ({
  ok: false,
  reason,
  detail,
  ...(diagnosticStatus ? { diagnosticStatus } : {}),
  ...(nativeRenderEnvelope ? { nativeRenderEnvelope } : {}),
});

const writeNativeRenderEnvelopeDiagnostics = (
  dataset: Record<string, string | undefined>,
  envelope: SharedRendererNativeRenderEnvelope | undefined
): void => {
  if (!envelope) {
    clearNativeRenderEnvelopeDiagnostics(dataset);
    return;
  }

  dataset.uxfdRustExportFrameSourceNativeRenderEnvelopeStatus = envelope.ok
    ? 'ready'
    : 'blocked';
  if (!envelope.ok) {
    dataset.uxfdRustExportFrameSourceNativeRenderEnvelopeReason = envelope.reason;
    dataset.uxfdRustExportFrameSourceNativeRenderEnvelopeDetail = envelope.detail;
    delete dataset.uxfdRustExportFrameSourceNativeRenderMediaCount;
    delete dataset.uxfdRustExportFrameSourceNativeRenderMediaKinds;
    delete dataset.uxfdRustExportFrameSourceNativeRenderSourceCount;
    delete dataset.uxfdRustExportFrameSourceNativeRenderSourceMediaIds;
    return;
  }

  delete dataset.uxfdRustExportFrameSourceNativeRenderEnvelopeReason;
  delete dataset.uxfdRustExportFrameSourceNativeRenderEnvelopeDetail;
  dataset.uxfdRustExportFrameSourceNativeRenderMediaCount = String(envelope.mediaCount);
  dataset.uxfdRustExportFrameSourceNativeRenderMediaKinds = envelope.mediaKinds.join(',');
  dataset.uxfdRustExportFrameSourceNativeRenderSourceCount = String(envelope.sourceCount);
  dataset.uxfdRustExportFrameSourceNativeRenderSourceMediaIds = envelope.sourceMediaIds.join(',');
};

const clearNativeRenderEnvelopeDiagnostics = (
  dataset: Record<string, string | undefined>
): void => {
  delete dataset.uxfdRustExportFrameSourceNativeRenderEnvelopeStatus;
  delete dataset.uxfdRustExportFrameSourceNativeRenderEnvelopeReason;
  delete dataset.uxfdRustExportFrameSourceNativeRenderEnvelopeDetail;
  delete dataset.uxfdRustExportFrameSourceNativeRenderMediaCount;
  delete dataset.uxfdRustExportFrameSourceNativeRenderMediaKinds;
  delete dataset.uxfdRustExportFrameSourceNativeRenderSourceCount;
  delete dataset.uxfdRustExportFrameSourceNativeRenderSourceMediaIds;
};
