import type { LayerState, ProjectSettings, PsdObject, TimelineObject } from '../types';
import type { EditableSceneGraph } from '../generated/rustCore';
import {
  buildEditableRustScene,
  type EditableRustSceneIssue,
} from './editableRustScene';
import { stripPsdLayerNodeForPersistence } from './psdParser';
import { secondsToFrameIndex } from './rustSceneFrameRate';
import type { SharedRendererScenePreviewScheduler } from './sharedRendererScenePreviewScheduler';
import type { ConfirmedSceneRevision } from './sharedRendererScenePreviewScheduler';

export type EditableRustScenePreviewReplaceResult =
  | { ok: true; revision: number }
  | { ok: false; issues: EditableRustSceneIssue[] };

export class EditableRustSceneUnsupportedError extends Error {
  constructor(readonly issues: EditableRustSceneIssue[]) {
    super(issues.map((issue) => `${issue.objectId}:${issue.code}`).join(', '));
    this.name = 'EditableRustSceneUnsupportedError';
  }
}

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
): boolean => dualRunFlag === '1' || Boolean(cutoverFlag?.trim()) || rawGraphOnlyFlag === '1';

export const shouldUseRawEditableSceneGraphOnly = (flag: string | undefined): boolean => flag === '1';

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
  rawGraphOnly = false,
}: {
  sceneId: string;
  scheduler: SharedRendererScenePreviewScheduler;
  initialRevision?: number;
  includeEditableScene?: boolean;
  rawGraphOnly?: boolean;
}): EditableRustScenePreviewController => {
  let revision = Number.isSafeInteger(initialRevision) && initialRevision >= 0
    ? initialRevision
    : Date.now();

  const buildReplacement = (input: {
    projectSettings: ProjectSettings;
    layers: LayerState[];
    objects: TimelineObject[];
  }, targetSceneId = sceneId, purpose: 'previewProxy' | 'exportOriginal' = 'previewProxy') => {
    if (rawGraphOnly) {
      revision += 1;
      const editableScene: EditableSceneGraph = {
        settings: input.projectSettings,
        layers: input.layers,
        objects: input.objects.map(sanitiseEditableSceneObject),
        mediaContext: { purpose, sceneId: targetSceneId },
      };
      return {
        ok: true as const,
        revision,
        payload: {
          sceneId: targetSceneId,
          revision,
          editableScene,
        },
      };
    }

    const result = buildEditableRustScene({ sceneId: targetSceneId, ...input, mediaPurpose: purpose });
    if (!result.ok) return result;

    revision += 1;
    const payload: Parameters<typeof scheduler.submitRevision>[0] = {
      sceneId: targetSceneId,
      revision,
      project: result.project,
      media: result.media,
    };
    if (includeEditableScene) {
      payload.editableScene = {
        settings: input.projectSettings,
        layers: input.layers,
        objects: input.objects.map(sanitiseEditableSceneObject),
        mediaContext: { purpose, sceneId: targetSceneId },
      };
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
      const result = buildReplacement(exportInput, exportSceneId, 'exportOriginal');
      if (!result.ok) {
        scheduler.invalidate();
        throw new EditableRustSceneUnsupportedError(result.issues);
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
