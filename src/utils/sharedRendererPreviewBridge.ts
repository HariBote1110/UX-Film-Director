import type { LayerState, ProjectSettings, TimelineObject } from '../types';
import {
  buildRustSceneSnapshotForTimeline,
  type RustSceneMediaReference,
  type RustSceneSnapshot,
  type RustSceneSnapshotBuildIssue,
  type RustSceneVideoSourceMode,
} from './rustSceneSnapshot';

/**
 * PixiJS 排除計画 Phase 4: preview プランは shared renderer（Rust）を唯一の
 * presenter とする。旧 `parallelCompare`（Pixi 併走比較）と `pixiFallback`
 * （Pixi への退避）は撤去し、表現不能なシーンは `blocked` として issues を
 * 保持したまま診断に流す（Pixi へ退避する経路は存在しない）。
 */
export type SharedRendererPreviewPlan =
  | {
      mode: 'disabled';
      reason: 'disabled';
    }
  | {
      mode: 'sharedRenderer';
      snapshot: RustSceneSnapshot;
      media: RustSceneMediaReference[];
    }
  | {
      mode: 'blocked';
      reason: 'unsupportedScene';
      issues: RustSceneSnapshotBuildIssue[];
    };

export interface SharedRendererPreviewPlanInput {
  enabled: boolean;
  projectSettings: ProjectSettings;
  layers: LayerState[];
  objects: TimelineObject[];
  time: number;
  videoSourceMode?: RustSceneVideoSourceMode;
}

export const buildSharedRendererPreviewPlan = ({
  enabled,
  projectSettings,
  layers,
  objects,
  time,
  videoSourceMode = 'previewProxy',
}: SharedRendererPreviewPlanInput): SharedRendererPreviewPlan => {
  if (!enabled) {
    return {
      mode: 'disabled',
      reason: 'disabled',
    };
  }

  const snapshotResult = buildRustSceneSnapshotForTimeline({
    projectSettings,
    layers,
    objects,
    time,
    videoSourceMode,
  });

  if (!snapshotResult.ok) {
    return {
      mode: 'blocked',
      reason: 'unsupportedScene',
      issues: snapshotResult.issues,
    };
  }

  return {
    mode: 'sharedRenderer',
    snapshot: snapshotResult.snapshot,
    media: snapshotResult.media,
  };
};
