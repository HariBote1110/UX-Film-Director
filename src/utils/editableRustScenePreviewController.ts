import type { LayerState, ProjectSettings, PsdObject, TimelineObject } from '../types';
import type { EditableSceneGraph } from '../generated/rustCore';
import { stripPsdLayerNodeForPersistence } from './psdParser';
import { secondsToFrameIndex } from './rustSceneFrameRate';
import type { SharedRendererScenePreviewScheduler } from './sharedRendererScenePreviewScheduler';
import type { ConfirmedSceneRevision } from './sharedRendererScenePreviewScheduler';

export type EditableRustScenePreviewReplaceResult = { ok: true; revision: number };

export interface EditableRustScenePreviewController {
  replaceScene: (input: {
    projectSettings: ProjectSettings;
    layers: LayerState[];
    objects: TimelineObject[];
  }) => EditableRustScenePreviewReplaceResult;
  confirmSceneForExport: (input: {
    sceneId: string;
    projectSettings: ProjectSettings;
    layers: LayerState[];
    objects: TimelineObject[];
  }) => Promise<ConfirmedSceneRevision>;
  requestTime: (timeSeconds: number, fps: number) => void;
  dispose: () => void;
}

export const shouldAttachEditableRustScene = (
  dualRunFlag: string | undefined,
  cutoverFlag: string | undefined,
  rawGraphOnlyFlag?: string,
): boolean => shouldUseRawEditableSceneGraphOnly(rawGraphOnlyFlag, dualRunFlag, cutoverFlag);

/**
 * The resident Rust scene graph is the production default. Legacy rollout flags
 * remain accepted as aliases, while an explicit raw-graph opt-out blocks it.
 */
export const shouldUseRawEditableSceneGraphOnly = (
  flag: string | undefined,
  dualRunFlag?: string,
  cutoverFlag?: string,
): boolean => {
  if (flag === '0') return false;
  if (flag === '1') return true;
  if (flag === undefined) return true;
  return dualRunFlag === '1' || Boolean(cutoverFlag?.trim());
};

const sanitiseEditableSceneObject = (object: TimelineObject): TimelineObject => {
  if (object.type !== 'psd') return object;

  const { file: _file, rootLayer, ...serialisablePsd } = object;
  return {
    ...serialisablePsd,
    ...(rootLayer ? { rootLayer: stripPsdLayerNodeForPersistence(rootLayer) } : {}),
  } as PsdObject;
};

export const createEditableRustScenePreviewController = ({
  sceneId,
  scheduler,
  initialRevision = Date.now(),
}: {
  sceneId: string;
  scheduler: SharedRendererScenePreviewScheduler;
  initialRevision?: number;
}): EditableRustScenePreviewController => {
  let revision = Number.isSafeInteger(initialRevision) && initialRevision >= 0
    ? initialRevision
    : Date.now();

  const buildReplacement = (input: {
    projectSettings: ProjectSettings;
    layers: LayerState[];
    objects: TimelineObject[];
  }, targetSceneId = sceneId, purpose: 'previewProxy' | 'exportOriginal' = 'previewProxy') => {
    revision += 1;
    const payload: Parameters<typeof scheduler.submitRevision>[0] = {
      sceneId: targetSceneId,
      revision,
      editableScene: {
        settings: input.projectSettings,
        layers: input.layers,
        objects: input.objects.map(sanitiseEditableSceneObject),
        mediaContext: { purpose, sceneId: targetSceneId },
      },
    };
    return { ok: true as const, revision, payload };
  };

  return {
    replaceScene: (input) => {
      const result = buildReplacement(input);
      scheduler.submitRevision(result.payload);
      return { ok: true, revision: result.revision };
    },
    confirmSceneForExport: async (input) => {
      const { sceneId: exportSceneId, ...exportInput } = input;
      const result = buildReplacement(exportInput, exportSceneId, 'exportOriginal');
      return scheduler.confirmExportRevision(result.payload);
    },
    requestTime: (timeSeconds, fps) => {
      scheduler.requestFrame(secondsToFrameIndex(timeSeconds, fps));
    },
    dispose: () => {
      scheduler.dispose();
    },
  };
};
