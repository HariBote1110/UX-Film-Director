import type { EditorMode, ProjectSettings } from '../types';
import type { RustBackendSceneEvaluation } from './rustBackendSceneControl';
import type { SharedRendererPreviewPlan } from './sharedRendererPreviewBridge';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';
import { buildSharedRendererPreviewSurfaceGate } from './sharedRendererPreviewSurface';
import {
  type RustSceneMediaReference,
  type RustSceneSnapshot,
} from './rustSceneSnapshot';
import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';

export interface SharedRendererEvaluatedScenePreviewSessionInput {
  evaluation: Pick<RustBackendSceneEvaluation, 'snapshot' | 'media'>;
  projectSettings: Pick<ProjectSettings, 'width' | 'height'>;
  editorMode: EditorMode;
  isExporting: boolean;
  webGpuAvailable: boolean;
  fallbackAdapter: boolean;
}

/**
 * 常駐Rustシーンの評価結果はIPC境界では unknown であるため、ここで既存の
 * surface gate に必ず渡す。surface gate が validateRustSceneSnapshotBoundary を
 * 実行し、壊れた応答を renderer へ到達させず invalidBoundaryPayload として止める。
 */
export const buildSharedRendererPreviewSessionFromEvaluatedScene = ({
  evaluation,
  projectSettings,
  editorMode,
  isExporting,
  webGpuAvailable,
  fallbackAdapter,
}: SharedRendererEvaluatedScenePreviewSessionInput): SharedRendererPreviewSession => {
  const plan: SharedRendererPreviewPlan = {
    mode: 'sharedRenderer',
    snapshot: evaluation.snapshot as RustSceneSnapshot,
    media: evaluation.media as RustSceneMediaReference[],
  };

  return {
    plan,
    surfaceGate: buildSharedRendererPreviewSurfaceGate({
      plan,
      projectSettings,
      editorMode,
      isExporting,
      webGpuAvailable,
      fallbackAdapter,
    }),
    presentationContract: buildSharedRendererPresentationContract(),
  };
};
