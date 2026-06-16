import type { LayerState, ProjectSettings, TimelineObject } from '../types';
import {
  buildRustSceneSnapshotForTimeline,
  type RustSceneMediaReference,
  type RustSceneSnapshot,
  type RustSceneSnapshotBuildIssue,
} from './rustSceneSnapshot';

export type SharedRendererPreviewPlan =
  | {
      mode: 'pixiOnly';
      reason: 'disabled';
    }
  | {
      mode: 'parallelCompare';
      primary: 'pixi';
      candidate: 'sharedRenderer';
      snapshot: RustSceneSnapshot;
      media: RustSceneMediaReference[];
    }
  | {
      mode: 'pixiFallback';
      reason: 'unsupportedScene';
      issues: RustSceneSnapshotBuildIssue[];
    };

export interface SharedRendererPreviewPlanInput {
  enabled: boolean;
  projectSettings: ProjectSettings;
  layers: LayerState[];
  objects: TimelineObject[];
  time: number;
}

export const buildSharedRendererPreviewPlan = ({
  enabled,
  projectSettings,
  layers,
  objects,
  time,
}: SharedRendererPreviewPlanInput): SharedRendererPreviewPlan => {
  if (!enabled) {
    return {
      mode: 'pixiOnly',
      reason: 'disabled',
    };
  }

  const snapshotResult = buildRustSceneSnapshotForTimeline({
    projectSettings,
    layers,
    objects,
    time,
  });

  if (!snapshotResult.ok) {
    return {
      mode: 'pixiFallback',
      reason: 'unsupportedScene',
      issues: snapshotResult.issues,
    };
  }

  return {
    mode: 'parallelCompare',
    primary: 'pixi',
    candidate: 'sharedRenderer',
    snapshot: snapshotResult.snapshot,
    media: snapshotResult.media,
  };
};
