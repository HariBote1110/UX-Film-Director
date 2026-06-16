import type { EditorMode, ProjectSettings } from '../types';
import {
  validateRustSceneSnapshotBoundary,
  type RustSceneMediaReference,
  type RustSceneSnapshot,
  type RustSceneSnapshotBoundaryIssue,
} from './rustSceneSnapshot';
import type { SharedRendererPreviewPlan } from './sharedRendererPreviewBridge';

export type SharedRendererPreviewSurfaceBlockedReason =
  | 'planNotComparable'
  | 'exporting'
  | 'unsupportedEditorMode'
  | 'invalidProjectSize'
  | 'webGpuUnavailable'
  | 'fallbackAdapter'
  | 'invalidBoundaryPayload';

export type SharedRendererPreviewSurfaceGate =
  | {
      ok: true;
      canvas: {
        width: number;
        height: number;
      };
      snapshot: RustSceneSnapshot;
      media: RustSceneMediaReference[];
    }
  | {
      ok: false;
      reason: Exclude<SharedRendererPreviewSurfaceBlockedReason, 'invalidBoundaryPayload'>;
      detail: string;
    }
  | {
      ok: false;
      reason: 'invalidBoundaryPayload';
      detail: string;
      issues: RustSceneSnapshotBoundaryIssue[];
    };

export interface SharedRendererPreviewSurfaceGateInput {
  plan: SharedRendererPreviewPlan;
  projectSettings: Pick<ProjectSettings, 'width' | 'height'>;
  editorMode: EditorMode;
  isExporting: boolean;
  webGpuAvailable: boolean;
  fallbackAdapter: boolean;
}

export const buildSharedRendererPreviewSurfaceGate = ({
  plan,
  projectSettings,
  editorMode,
  isExporting,
  webGpuAvailable,
  fallbackAdapter,
}: SharedRendererPreviewSurfaceGateInput): SharedRendererPreviewSurfaceGate => {
  if (plan.mode !== 'parallelCompare') {
    return blocked(
      'planNotComparable',
      'Shared renderer surface requires a parallelCompare plan.'
    );
  }

  if (isExporting) {
    return blocked(
      'exporting',
      'Shared renderer preview surface is disabled during export.'
    );
  }

  if (editorMode !== '2d') {
    return blocked(
      'unsupportedEditorMode',
      'Shared renderer preview surface currently supports only the 2D editor mode.'
    );
  }

  if (!isPositiveSafeInteger(projectSettings.width) || !isPositiveSafeInteger(projectSettings.height)) {
    return blocked(
      'invalidProjectSize',
      'Project width and height must be positive safe integers.'
    );
  }

  if (!webGpuAvailable) {
    return blocked(
      'webGpuUnavailable',
      'WebGPU is not available for the shared renderer preview surface.'
    );
  }

  if (fallbackAdapter) {
    return blocked(
      'fallbackAdapter',
      'Shared renderer preview requires a non-fallback WebGPU adapter.'
    );
  }

  const boundary = validateRustSceneSnapshotBoundary({
    snapshot: plan.snapshot,
    media: plan.media,
  });

  if (!boundary.ok) {
    return {
      ok: false,
      reason: 'invalidBoundaryPayload',
      detail: 'Shared renderer preview surface received a payload that does not match the Rust boundary.',
      issues: boundary.issues,
    };
  }

  return {
    ok: true,
    canvas: {
      width: projectSettings.width,
      height: projectSettings.height,
    },
    snapshot: plan.snapshot,
    media: plan.media,
  };
};

const blocked = (
  reason: Exclude<SharedRendererPreviewSurfaceBlockedReason, 'invalidBoundaryPayload'>,
  detail: string
): SharedRendererPreviewSurfaceGate => ({
  ok: false,
  reason,
  detail,
});

const isPositiveSafeInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;
