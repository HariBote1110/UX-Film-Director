import type { LayerState, ProjectSettings, TimelineObject } from '../types';
import type { EditableSceneGraph } from '../generated/rustCore';
import {
  buildEditableRustScene,
  type EditableRustSceneIssue,
} from './editableRustScene';
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
  requestTime: (timeSeconds: number, fps: number) => void;
  dispose: () => void;
}

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

  return {
    replaceScene: (input) => {
      const result = buildEditableRustScene({ sceneId, ...input });
      if (!result.ok) {
        scheduler.invalidate();
        return result;
      }

      revision += 1;
      const payload: Parameters<typeof scheduler.submitRevision>[0] = {
        sceneId,
        revision,
        project: result.project,
        media: result.media,
      };
      if (includeEditableScene) {
        const editableScene: EditableSceneGraph = {
          settings: input.projectSettings,
          layers: input.layers,
          objects: input.objects,
          mediaContext: { purpose: 'previewProxy', sceneId },
        };
        payload.editableScene = editableScene;
      }
      scheduler.submitRevision(payload);
      return { ok: true, revision };
    },
    requestTime: (timeSeconds, fps) => {
      scheduler.requestFrame(secondsToFrameIndex(timeSeconds, fps));
    },
    dispose: () => {
      scheduler.dispose();
    },
  };
};
