import type {
  SharedRendererExportSession,
  SharedRendererExportSessionInput,
} from './sharedRendererExportSession';
import { buildSharedRendererPreviewPlanReference } from './sharedRendererPreviewPlanReference';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';
import { buildSharedRendererPreviewSurfaceGate } from './sharedRendererPreviewSurface';
import { buildSharedRendererExportNativeRenderEnvelope } from './sharedRendererExportEnvelope';

/** Test-only reference session using the legacy TypeScript serializer. */
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
