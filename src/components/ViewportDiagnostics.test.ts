import { describe, expect, it } from 'vitest';
import { buildSharedRendererPreviewDiagnostic } from './Viewport';

describe('buildSharedRendererPreviewDiagnostic', () => {
  it('hides non-blocking external video upload warnings while the preview is ready', () => {
    expect(buildSharedRendererPreviewDiagnostic({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterVideoPresentationSource: 'external-video-source',
      uxfdSharedRendererPresenterVideoFrameUploadReady: 'true',
      uxfdSharedRendererPresenterVideoUploadFailureReason: 'copyReportTargetChecksumMismatch',
      uxfdSharedRendererPresenterVideoUploadFailureDetail: 'Shared video frame upload buffer checksum must match the copy report.',
    }, { ok: true, stop: () => {} })).toBeNull();
  });

  it('keeps blocked preview diagnostics visible on the canvas', () => {
    expect(buildSharedRendererPreviewDiagnostic({
      uxfdSharedRendererPresenterStatus: 'blocked',
      uxfdSharedRendererPresenterFailureReason: 'requiredVideoOwnershipUnavailable',
    }, { ok: false, reason: 'requiredVideoOwnershipUnavailable' })).toContain('status=blocked');
  });
});
