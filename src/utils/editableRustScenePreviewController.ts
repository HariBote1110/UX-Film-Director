import type { LayerState, ProjectSettings, TimelineObject } from '../types';
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
    projectSettings: Pick<ProjectSettings, 'width' | 'height' | 'fps'>;
    layers: LayerState[];
    objects: TimelineObject[];
  }) => EditableRustScenePreviewReplaceResult;
  requestTime: (timeSeconds: number, fps: number) => void;
  dispose: () => void;
}

export const createEditableRustScenePreviewController = ({
  sceneId,
  scheduler,
}: {
  sceneId: string;
  scheduler: SharedRendererScenePreviewScheduler;
}): EditableRustScenePreviewController => {
  let revision = 0;

  return {
    replaceScene: (input) => {
      const result = buildEditableRustScene({ sceneId, ...input });
      if (!result.ok) {
        scheduler.invalidate();
        return result;
      }

      revision += 1;
      scheduler.submitRevision({
        sceneId,
        revision,
        project: result.project,
        media: result.media,
      });
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
