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

  return {
    plan,
    surfaceGate: buildSharedRendererPreviewSurfaceGate({
      plan,
      projectSettings,
      editorMode,
      isExporting: false,
      webGpuAvailable,
      fallbackAdapter,
    }),
    presentationContract: buildSharedRendererPresentationContract(),
  };
};
