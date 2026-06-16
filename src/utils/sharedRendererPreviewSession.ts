import type { EditorMode, LayerState, ProjectSettings, TimelineObject } from '../types';
import {
  buildSharedRendererPreviewPlan,
  type SharedRendererPreviewPlan,
} from './sharedRendererPreviewBridge';
import {
  buildSharedRendererPreviewSurfaceGate,
  type SharedRendererPreviewSurfaceGate,
} from './sharedRendererPreviewSurface';

export interface SharedRendererPreviewSessionInput {
  enabled: boolean;
  projectSettings: ProjectSettings;
  layers: LayerState[];
  objects: TimelineObject[];
  time: number;
  editorMode: EditorMode;
  isExporting: boolean;
  webGpuAvailable: boolean;
  fallbackAdapter: boolean;
}

export interface SharedRendererPreviewSession {
  plan: SharedRendererPreviewPlan;
  surfaceGate: SharedRendererPreviewSurfaceGate;
}

export const buildSharedRendererPreviewSession = ({
  enabled,
  projectSettings,
  layers,
  objects,
  time,
  editorMode,
  isExporting,
  webGpuAvailable,
  fallbackAdapter,
}: SharedRendererPreviewSessionInput): SharedRendererPreviewSession => {
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
    isExporting,
    webGpuAvailable,
    fallbackAdapter,
  });

  return {
    plan,
    surfaceGate,
  };
};
