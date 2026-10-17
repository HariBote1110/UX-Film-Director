import type { EditorMode, LayerState, ProjectSettings, TimelineObject } from '../types';
import type { SharedRendererPreviewPlan } from './sharedRendererPreviewBridge';
import { buildSharedRendererPreviewPlanReference } from './sharedRendererPreviewPlanReference';
import {
  buildSharedRendererPresentationContract,
  type SharedRendererPresentationContract,
} from './sharedRendererPresentationContract';
import {
  buildSharedRendererPreviewSurfaceGate,
  type SharedRendererPreviewSurfaceGate,
} from './sharedRendererPreviewSurface';
import {
  buildSharedRendererExportNativeRenderEnvelope,
  type SharedRendererNativeRenderEnvelope,
} from './sharedRendererExportEnvelope';

export type { SharedRendererNativeRenderEnvelope } from './sharedRendererExportEnvelope';

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

export { buildSharedRendererExportSessionFromEvaluation } from './sharedRendererEvaluatedExportSession';
export type { SharedRendererExportEvaluatedSceneInput } from './sharedRendererEvaluatedExportSession';

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
  const plan = buildSharedRendererPreviewPlanReference({
    enabled,
    projectSettings,
    layers,
    objects,
    time,
    videoSourceMode: 'exportOriginal',
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
    nativeRenderEnvelope: buildSharedRendererExportNativeRenderEnvelope(surfaceGate),
  };
};
