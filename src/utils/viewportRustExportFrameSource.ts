import type { EditorMode, LayerState, ProjectSettings, TimelineObject } from '../types';
import type { SharedRendererPresentedFrameSharedFrameTaker } from './sharedRendererWebGpuPresenter';
import {
  createSharedRendererExportFrameSource,
  type CreateSharedRendererExportFrameSourceInput,
} from './sharedRendererExportFrameSource';
import {
  buildSharedRendererExportSession,
  type SharedRendererExportSession,
  type SharedRendererExportSessionInput,
  type SharedRendererNativeRenderEnvelope,
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
  hasVideoObjects: boolean;
  preferEncodeOnly?: boolean;
  presentedFrameSharedFrameTaker?: SharedRendererPresentedFrameSharedFrameTaker;
  objects?: TimelineObject[];
  time?: number;
  buildExportSession?: BuildSharedRendererExportSession;
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
  | 'exportSessionBlocked';

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
  preferEncodeOnly = false,
  presentedFrameSharedFrameTaker,
  objects,
  time,
  buildExportSession = buildSharedRendererExportSession,
  createFrameSource = createSharedRendererExportFrameSource,
}: BuildViewportRustExportFrameSourceInput): ViewportRustExportFrameSourceDecision => {
  const effectiveVideoCutoverEnabled = videoCutoverEnabled || hasVideoObjects;
  const effectivePreferEncodeOnly = preferEncodeOnly || hasVideoObjects;

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

  if (objects && time !== undefined) {
    let nativeRenderEnvelope: SharedRendererNativeRenderEnvelope | undefined;
    for (const preflightTime of buildViewportRustExportPreflightTimes(objects, time, projectSettings.fps)) {
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
        return fallback(
          'exportSessionBlocked',
          session.surfaceGate.detail,
          session.nativeRenderEnvelope
        );
      }
      nativeRenderEnvelope = session.nativeRenderEnvelope;
      if (!nativeRenderEnvelope.ok) {
        return fallback(
          'exportSessionBlocked',
          nativeRenderEnvelope.detail,
          nativeRenderEnvelope
        );
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
        videoCutoverEnabled: effectiveVideoCutoverEnabled,
        ...(effectivePreferEncodeOnly ? {
          bitmapCaptureEnabled: false,
          nativeRenderRequired: true,
        } : {}),
        ...(presentedFrameSharedFrameTaker ? { presentedFrameSharedFrameTaker } : {}),
      }),
      ...(nativeRenderEnvelope ? { nativeRenderEnvelope } : {}),
    };
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
    }),
  };
};

export const writeViewportRustExportFrameSourceDiagnostics = (
  dataset: Record<string, string | undefined>,
  decision: ViewportRustExportFrameSourceDecision
): void => {
  dataset.uxfdRustExportFrameSourceStatus = decision.ok ? 'ready' : 'fallback';
  dataset.uxfdRustExportFrameSourceReason = decision.ok ? undefined : decision.reason;
  writeNativeRenderEnvelopeDiagnostics(dataset, decision.nativeRenderEnvelope);
};

const fallback = (
  reason: ViewportRustExportFrameSourceFallbackReason,
  detail: string,
  nativeRenderEnvelope?: SharedRendererNativeRenderEnvelope
): ViewportRustExportFrameSourceDecision => ({
  ok: false,
  reason,
  detail,
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

const buildViewportRustExportPreflightTimes = (
  objects: TimelineObject[],
  initialTime: number,
  fps: number
): number[] => {
  const times = new Set<number>();
  const frameDuration = fps > 0 ? 1 / fps : 0;
  addPreflightTime(times, initialTime);
  objects.forEach((object) => {
    if (object.duration <= 0) return;
    addPreflightTime(times, Math.max(0, object.startTime));
    if (frameDuration > 0) {
      addPreflightTime(times, Math.max(object.startTime, object.startTime + object.duration - frameDuration));
    }
  });
  return Array.from(times).sort((left, right) => left - right);
};

const addPreflightTime = (times: Set<number>, time: number): void => {
  if (!Number.isFinite(time)) return;
  if (time < 0) return;
  times.add(time);
};
