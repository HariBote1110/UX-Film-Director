import type { EditorMode, LayerState, ProjectSettings, TimelineObject } from '../types';
import {
  buildSharedRendererPreviewPlan,
  type SharedRendererPreviewPlan,
} from './sharedRendererPreviewBridge';
import {
  buildSharedRendererPresentationContract,
  type SharedRendererPresentationContract,
} from './sharedRendererPresentationContract';
import {
  buildSharedRendererPreviewSurfaceGate,
  type SharedRendererPreviewSurfaceGate,
} from './sharedRendererPreviewSurface';
import { resolveMixedNativeRenderUnsupportedMedia } from './sharedRendererNativeRenderMediaGate';

export type SharedRendererNativeRenderEnvelope =
  | {
      ok: true;
      mediaCount: number;
      mediaKinds: string[];
      sourceCount: number;
      sourceMediaIds: string[];
    }
  | {
      ok: false;
      reason: 'surfaceGateUnavailable' | 'nativeRenderUnsupportedMedia';
      detail: string;
    };

export interface SharedRendererExportSessionInput {
  enabled: boolean;
  projectSettings: ProjectSettings;
  layers: LayerState[];
  objects: TimelineObject[];
  time: number;
  editorMode: EditorMode;
  webGpuAvailable: boolean;
  fallbackAdapter: boolean;
}

export interface SharedRendererExportSession {
  plan: SharedRendererPreviewPlan;
  surfaceGate: SharedRendererPreviewSurfaceGate;
  presentationContract: SharedRendererPresentationContract;
  nativeRenderEnvelope: SharedRendererNativeRenderEnvelope;
}

export const buildSharedRendererExportSession = ({
  enabled,
  projectSettings,
  layers,
  objects,
  time,
  editorMode,
  webGpuAvailable,
  fallbackAdapter,
}: SharedRendererExportSessionInput): SharedRendererExportSession => {
  const plan = buildSharedRendererPreviewPlan({
    enabled,
    projectSettings,
    layers,
    objects,
    time,
  });

  const surfaceGate = buildSharedRendererPreviewSurfaceGate({
    plan,
    projectSettings,
    editorMode,
    isExporting: false,
    webGpuAvailable,
    fallbackAdapter,
  });

  return {
    plan,
    surfaceGate,
    presentationContract: buildSharedRendererPresentationContract(),
    nativeRenderEnvelope: buildNativeRenderEnvelope(surfaceGate),
  };
};

const buildNativeRenderEnvelope = (
  surfaceGate: SharedRendererPreviewSurfaceGate
): SharedRendererNativeRenderEnvelope => {
  if (!surfaceGate.ok) {
    return {
      ok: false,
      reason: 'surfaceGateUnavailable',
      detail: surfaceGate.detail,
    };
  }

  const unsupportedMedia = resolveMixedNativeRenderUnsupportedMedia({
    snapshot: surfaceGate.snapshot,
    media: surfaceGate.media,
  });
  if (unsupportedMedia) {
    return {
      ok: false,
      reason: 'nativeRenderUnsupportedMedia',
      detail: unsupportedMedia,
    };
  }

  const sourceMediaIds = surfaceGate.media
    .filter((reference) => reference.kind === 'Video')
    .map((reference) => reference.id);

  return {
    ok: true,
    mediaCount: surfaceGate.media.length,
    mediaKinds: surfaceGate.media.map((reference) => reference.kind),
    sourceCount: sourceMediaIds.length,
    sourceMediaIds,
  };
};
