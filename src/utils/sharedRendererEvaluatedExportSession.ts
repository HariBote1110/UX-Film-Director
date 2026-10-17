import type { EditorMode, ProjectSettings } from '../types';
import type { RustBackendSceneEvaluation } from './rustBackendSceneControl';
import { buildSharedRendererPreviewPlanFromEvaluation } from './sharedRendererPreviewBridge';
import {
  buildSharedRendererPresentationContract,
} from './sharedRendererPresentationContract';
import {
  buildSharedRendererPreviewSurfaceGate,
} from './sharedRendererPreviewSurface';
import { buildSharedRendererExportNativeRenderEnvelope } from './sharedRendererExportEnvelope';
import type {
  SharedRendererExportSession,
} from './sharedRendererExportSession';

export interface SharedRendererExportEvaluatedSceneInput {
  evaluation: Pick<RustBackendSceneEvaluation, 'snapshot' | 'media'>;
  projectSettings: Pick<ProjectSettings, 'width' | 'height'>;
  editorMode: EditorMode;
  webGpuAvailable: boolean;
  fallbackAdapter: boolean;
}

export const buildSharedRendererExportSessionFromEvaluation = ({
  evaluation,
  projectSettings,
  editorMode,
  webGpuAvailable,
  fallbackAdapter,
}: SharedRendererExportEvaluatedSceneInput): SharedRendererExportSession => {
  const plan = buildSharedRendererPreviewPlanFromEvaluation(evaluation);
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
