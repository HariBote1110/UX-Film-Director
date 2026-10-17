import type { LayerState, ProjectSettings, TimelineObject } from '../types';
import type { SharedRendererPreviewPlan } from './sharedRendererPreviewBridge';
import { buildRustSceneSnapshotForTimeline } from './rustSceneSnapshot';
import type { RustSceneVideoSourceMode } from './rustSceneContract';

export interface SharedRendererPreviewPlanReferenceInput {
  enabled: boolean;
  projectSettings: ProjectSettings;
  layers: LayerState[];
  objects: TimelineObject[];
  time: number;
  videoSourceMode?: RustSceneVideoSourceMode;
}

/** Test-only reference serializer for comparing legacy TS plans with Rust evaluation. */
export const buildSharedRendererPreviewPlanReference = ({
  enabled,
  projectSettings,
  layers,
  objects,
  time,
  videoSourceMode = 'previewProxy',
}: SharedRendererPreviewPlanReferenceInput): SharedRendererPreviewPlan => {
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
