import type {
  SharedRendererPreviewSession,
  SharedRendererPreviewSessionInput,
} from './sharedRendererPreviewSession';
import { buildSharedRendererPreviewPlanReference } from './sharedRendererPreviewPlanReference';
import {
  buildSharedRendererPreviewSurfaceGate,
} from './sharedRendererPreviewSurface';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';

/** Test-only reference session using the legacy TypeScript serializer. */
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
  const plan = buildSharedRendererPreviewPlanReference({
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
    presentationContract: buildSharedRendererPresentationContract(),
  };
};
