import type { LayerState, ProjectSettings, PsdObject, TimelineObject } from '../types';
import type { EditableSceneGraph } from '../generated/rustCore';
import {
  buildEditableRustScene,
  type EditableRustSceneIssue,
} from './editableRustScene';
import { stripPsdLayerNodeForPersistence } from './psdParser';
import { secondsToFrameIndex } from './rustSceneSnapshot';
import type { SharedRendererScenePreviewScheduler } from './sharedRendererScenePreviewScheduler';

export type EditableRustScenePreviewReplaceResult =
  | { ok: true; revision: number }
  | { ok: false; issues: EditableRustSceneIssue[] };

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
  }) => Promise<{ sceneId: string; revision: number }>;
  requestTime: (timeSeconds: number, fps: number) => void;
  dispose: () => void;
}

export const shouldAttachEditableRustScene = (
  dualRunFlag: string | undefined,
  cutoverFlag: string | undefined,
): boolean => dualRunFlag === '1' || Boolean(cutoverFlag?.trim());

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
  includeEditableScene = false,
}: {
  sceneId: string;
  scheduler: SharedRendererScenePreviewScheduler;
  initialRevision?: number;
  includeEditableScene?: boolean;
}): EditableRustScenePreviewController => {
  let revision = Number.isSafeInteger(initialRevision) && initialRevision >= 0
    ? initialRevision
    : Date.now();

  const buildReplacement = (input: {
    projectSettings: ProjectSettings;
    layers: LayerState[];
    objects: TimelineObject[];
  }, targetSceneId = sceneId) => {
    const result = buildEditableRustScene({ sceneId: targetSceneId, ...input });
    if (!result.ok) return result;

    revision += 1;
    const payload: Parameters<typeof scheduler.submitRevision>[0] = {
      sceneId: targetSceneId,
      revision,
      project: result.project,
      media: result.media,
    };
    if (includeEditableScene) {
      const editableScene: EditableSceneGraph = {
        settings: input.projectSettings,
        layers: input.layers,
        objects: input.objects.map(sanitiseEditableSceneObject),
        mediaContext: { purpose: 'previewProxy', sceneId: targetSceneId },
      };
      payload.editableScene = editableScene;
    }
    return { ok: true as const, revision, payload };
  };

  return {
    replaceScene: (input) => {
      const result = buildReplacement(input);
      if (!result.ok) {
        scheduler.invalidate();
        return result;
      }
      scheduler.submitRevision(result.payload);
      return { ok: true, revision: result.revision };
    },
    confirmSceneForExport: async (input) => {
      const { sceneId: exportSceneId, ...exportInput } = input;
      const result = buildReplacement(exportInput, exportSceneId);
      if (!result.ok) {
        scheduler.invalidate();
        throw new Error(result.issues.map((issue) => `${issue.objectId}:${issue.code}`).join(', '));
      }
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
