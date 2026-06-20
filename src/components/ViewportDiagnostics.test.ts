import { describe, expect, it } from 'vitest';
import { buildSharedRendererPreviewDiagnostic } from './Viewport';
import type { SharedRendererPreviewPresenterControl } from '../utils/sharedRendererPreviewPresenterController';

const readyControl = {
  ok: true,
  format: 'bgra8unorm',
  solidColourOwnership: { ownedObjectIds: [], skippedObjectIds: [] },
  videoOwnership: { ownedClipIds: [], skippedClipIds: [] },
  imageOwnership: { ownedObjectIds: [], skippedObjectIds: [] },
  psdOwnership: { ownedObjectIds: [], skippedObjectIds: [] },
  dispose: () => {},
} as unknown as SharedRendererPreviewPresenterControl;

const blockedControl = {
  ok: false,
  reason: 'requiredVideoOwnershipUnavailable',
  dispose: () => {},
} as SharedRendererPreviewPresenterControl;

describe('buildSharedRendererPreviewDiagnostic', () => {
  it('hides non-blocking external video upload warnings while the preview is ready', () => {
    expect(buildSharedRendererPreviewDiagnostic({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterVideoPresentationSource: 'external-video-source',
      uxfdSharedRendererPresenterVideoFrameUploadReady: 'true',
      uxfdSharedRendererPresenterVideoUploadFailureReason: 'copyReportTargetChecksumMismatch',
      uxfdSharedRendererPresenterVideoUploadFailureDetail: 'Shared video frame upload buffer checksum must match the copy report.',
    }, readyControl)).toBeNull();
  });

  it('keeps blocked preview diagnostics visible on the canvas', () => {
    expect(buildSharedRendererPreviewDiagnostic({
      uxfdSharedRendererPresenterStatus: 'blocked',
      uxfdSharedRendererPresenterFailureReason: 'requiredVideoOwnershipUnavailable',
    }, blockedControl)).toContain('status=blocked');
  });
});
