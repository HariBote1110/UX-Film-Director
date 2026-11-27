import type { EditorMode, LayerState, ProjectSettings, TimelineObject } from '../types';
import type { SharedRendererPreviewPlan } from './sharedRendererPreviewBridge';
import type { SharedRendererPresentationContract } from './sharedRendererPresentationContract';
import type { SharedRendererPreviewSurfaceGate } from './sharedRendererPreviewSurface';
import type { SharedRendererNativeRenderEnvelope } from './sharedRendererExportEnvelope';

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
