import { describe, expect, it } from 'vitest';
import {
  buildSharedRendererPreviewDiagnostic,
  isTransientExternalVideoPresentationFailure,
  shouldReuseExternalVideoPresenterSession,
} from './Viewport';
import type { SharedRendererPreviewPresenterControl } from '../utils/sharedRendererPreviewPresenterController';
import type { SharedRendererPreviewSession } from '../utils/sharedRendererPreviewSession';

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

describe('isTransientExternalVideoPresentationFailure', () => {
  it('treats a not-ready external video frame as a transient (retain-presenter) failure', () => {
    expect(isTransientExternalVideoPresentationFailure({
      ok: false,
      reason: 'videoTextureViewUnavailable',
      detail: 'No ready external video source was available for the video plane scene.',
    })).toBe(true);
  });

  it('does not retain the presenter for genuine external video failures', () => {
    expect(isTransientExternalVideoPresentationFailure({
      ok: false,
      reason: 'unsupportedVideoScene',
      detail: 'Shared renderer could not build an external video plane scene.',
    })).toBe(false);
  });

  it('returns false for a successful presentation or a missing result', () => {
    expect(isTransientExternalVideoPresentationFailure({ ok: true, planeCount: 1 })).toBe(false);
    expect(isTransientExternalVideoPresentationFailure(undefined)).toBe(false);
    expect(isTransientExternalVideoPresentationFailure(null)).toBe(false);
  });
});

describe('shouldReuseExternalVideoPresenterSession', () => {
  const externalVideoOnlySession = {
    surfaceGate: {
      ok: true,
      media: [{ id: 'media-video', kind: 'Video' }],
      snapshot: {
        clips: [{ media_id: 'media-video', clip_id: 'video-1', z_index: 0 }],
      },
    },
  } as unknown as SharedRendererPreviewSession;

  it('allows an external-video-only presenter to survive the transition from pause to playback', () => {
    expect(shouldReuseExternalVideoPresenterSession({
      session: externalVideoOnlySession,
      isExporting: false,
    })).toBe(true);
  });

  it('does not reuse the external video presenter while exporting', () => {
    expect(shouldReuseExternalVideoPresenterSession({
      session: externalVideoOnlySession,
      isExporting: true,
    })).toBe(false);
  });
});
