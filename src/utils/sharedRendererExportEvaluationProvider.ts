import type { TimelineObject } from '../types';
import type { RustBackendSceneEvaluation } from './rustBackendSceneControl';

export interface SharedRendererExportResidentScene {
  sceneId: string;
  revision: number;
}

export interface SharedRendererExportEvaluationRequest {
  objects: readonly TimelineObject[];
  frameIndex: number;
}

export interface SharedRendererExportEvaluationProviderInput {
  prepareScene: (
    objects: readonly TimelineObject[]
  ) => Promise<SharedRendererExportResidentScene | null>;
  evaluateScene: (input: {
    sceneId: string;
    revision: number;
    frameIndex: number;
  }) => Promise<RustBackendSceneEvaluation>;
}

export type SharedRendererExportEvaluationProvider = (
  request: SharedRendererExportEvaluationRequest
) => Promise<RustBackendSceneEvaluation | null>;

/**
 * Export 内で同じ immutable object graph を使い続ける間は scene.replace を再利用し、
 * 各 frame では scene.evaluate だけを行う。未対応 graph は null で呼出側へ返し、
 * 既存 TS direct serializer の fallback を維持する。
 */
export const createSharedRendererExportEvaluationProvider = ({
  prepareScene,
  evaluateScene,
}: SharedRendererExportEvaluationProviderInput) => {
  const preparedScenes = new WeakMap<readonly TimelineObject[], Promise<SharedRendererExportResidentScene | null>>();

  const evaluate: SharedRendererExportEvaluationProvider = async ({ objects, frameIndex }) => {
    let prepared = preparedScenes.get(objects);
    if (!prepared) {
      prepared = prepareScene(objects);
      preparedScenes.set(objects, prepared);
    }
    const residentScene = await prepared;
    if (!residentScene) return null;

    const evaluation = await evaluateScene({
      ...residentScene,
      frameIndex,
    });
    if (
      evaluation.sceneId !== residentScene.sceneId
      || evaluation.revision !== residentScene.revision
      || evaluation.frameIndex !== frameIndex
    ) {
      throw new Error('Rust export scene evaluation does not match the requested resident revision and frame.');
    }
    return evaluation;
  };

  return evaluate;
};
