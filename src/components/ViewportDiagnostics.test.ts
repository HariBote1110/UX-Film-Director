import { describe, expect, it } from 'vitest';
import {
  buildSharedRendererPreviewDiagnostic,
  isTransientExternalVideoPresentationFailure,
  shouldBuildSharedRendererPreviewSessionForTick,
  shouldDeferSharedRendererPreviewSessionPublish,
  shouldReuseExternalVideoPresenterSession,
  shouldRequestRustTimelineSceneEvaluationForTick,
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
  it('hides the banner for a plain ready status with no failure info', () => {
    expect(buildSharedRendererPreviewDiagnostic({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterVideoPresentationSource: 'external-video-source',
      uxfdSharedRendererPresenterVideoFrameUploadReady: 'true',
    }, readyControl)).toBeNull();
  });

  it('shows successful native-render path diagnostics in the preview banner', () => {
    expect(buildSharedRendererPreviewDiagnostic({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterVideoFrameUploadReady: 'true',
      uxfdSharedRendererPresenterNativeRenderDecodePaths: 'inprocess',
      uxfdSharedRendererPresenterNativeRenderPath: 'webgpu',
      uxfdSharedRendererPresenterNativeRenderNv12ZeroCopyMediaIds: 'video-1',
    }, readyControl)).toBe(
      'Rust shared renderer preview / status=ready / decode=inprocess / render=webgpu / nv12=video-1'
    );
  });

  // Non-blocking, superseded video upload failures (e.g. a decoded-frame
  // upload that failed while the external-video-source path already owns
  // presentation) are no longer filtered here: the write site
  // (sharedRendererPreviewPresenterController.ts) simply never puts them into
  // the ready diagnostics state, so this dataset shape does not occur in
  // practice. See sharedRendererPreviewPresenterController.test.ts, "keeps a
  // superseded decoded-video-upload failure out of the persistent ready
  // diagnostics...".
  it('surfaces a videoUploadFailureReason present on the dataset as a banner', () => {
    expect(buildSharedRendererPreviewDiagnostic({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterVideoPresentationSource: 'external-video-source',
      uxfdSharedRendererPresenterVideoFrameUploadReady: 'true',
      uxfdSharedRendererPresenterVideoUploadFailureReason: 'copyReportTargetChecksumMismatch',
      uxfdSharedRendererPresenterVideoUploadFailureDetail: 'Shared video frame upload buffer checksum must match the copy report.',
    }, readyControl)).toContain('video=copyReportTargetChecksumMismatch');
  });

  it('keeps blocked preview diagnostics visible on the canvas', () => {
    expect(buildSharedRendererPreviewDiagnostic({
      uxfdSharedRendererPresenterStatus: 'blocked',
      uxfdSharedRendererPresenterFailureReason: 'requiredVideoOwnershipUnavailable',
    }, blockedControl)).toContain('status=blocked');
  });

  // The transient skip debug counter (written by
  // sharedRendererPresenterDiagnostics.ts) is not part of the banner
  // decision: a busy counter while status stays 'ready' must not surface a
  // banner, otherwise every one-tick videoTextureViewUnavailable skip would
  // flash the diagnostics banner again.
  it('ignores the transient skip debug counter while the status stays ready', () => {
    expect(buildSharedRendererPreviewDiagnostic({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterVideoPresentationSource: 'external-video-source',
      uxfdSharedRendererPresenterVideoFrameUploadReady: 'true',
      uxfdSharedRendererPresenterTransientSkips: '42',
      uxfdSharedRendererPresenterLastTransientSkipReason: 'videoTextureViewUnavailable',
    }, readyControl)).toBeNull();
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

  it('does not reuse the external video presenter in rust-only mode so the native render path drives without per-frame thrash', () => {
    expect(shouldReuseExternalVideoPresenterSession({
      session: externalVideoOnlySession,
      isExporting: false,
      rustVideoOnly: true,
    })).toBe(false);
  });
});

describe('shouldDeferSharedRendererPreviewSessionPublish', () => {
  // 症状B: 図形ドラッグ中は毎 pointermove で publish が呼ばれ、presenter 起動中に
  // 即 setSharedRendererPreviewSession すると起動 useEffect の cleanup が
  // in-flight の startSharedRendererViewportPresenter を cancel してしまい、
  // move が続く間は一度も present が完了しない（起動→キャンセルの連鎖）。
  // 以前は isPlaying（再生中）限定でこの退避を行っていたため、一時停止中の
  // ドラッグ（= 通常の編集操作）ではこの連鎖が起きたままだった。
  it('defers publish while the presenter is starting, regardless of playback state', () => {
    expect(shouldDeferSharedRendererPreviewSessionPublish(true)).toBe(true);
  });

  it('does not defer publish while the presenter is not starting, regardless of playback state', () => {
    expect(shouldDeferSharedRendererPreviewSessionPublish(false)).toBe(false);
  });
});

describe('shouldRequestRustTimelineSceneEvaluationForTick', () => {
  // export完了直後は rustTimelineSceneRpcEnabled: true / revisionAvailable: true /
  // isExporting: false / nativePlaybackActive: false / isPlaying: false という状態になる。
  // このとき true を返すことが、外部動画要素が notifyOnNextPresentableFrame 経由で
  // present可能になった通知（sharedRendererExternalVideoFrameReadyTick の bump）を
  // 受けてRust常駐sceneを再評価できる唯一の復帰契機である。
  it('export完了直後の状態では true を返し、frame ready通知によるRust常駐scene再評価を許可する（唯一の復帰契機）', () => {
    expect(shouldRequestRustTimelineSceneEvaluationForTick({
      rustTimelineSceneRpcEnabled: true,
      rustTimelineSceneRevisionAvailable: true,
      isExporting: false,
      nativePlaybackActive: false,
      isPlaying: false,
    })).toBe(true);
  });

  it('rustTimelineSceneRpcEnabled が false のとき false を返す', () => {
    expect(shouldRequestRustTimelineSceneEvaluationForTick({
      rustTimelineSceneRpcEnabled: false,
      rustTimelineSceneRevisionAvailable: true,
      isExporting: false,
      nativePlaybackActive: false,
      isPlaying: false,
    })).toBe(false);
  });

  it('rustTimelineSceneRevisionAvailable が false のとき false を返す', () => {
    expect(shouldRequestRustTimelineSceneEvaluationForTick({
      rustTimelineSceneRpcEnabled: true,
      rustTimelineSceneRevisionAvailable: false,
      isExporting: false,
      nativePlaybackActive: false,
      isPlaying: false,
    })).toBe(false);
  });

  it('isExporting が true のとき false を返す', () => {
    expect(shouldRequestRustTimelineSceneEvaluationForTick({
      rustTimelineSceneRpcEnabled: true,
      rustTimelineSceneRevisionAvailable: true,
      isExporting: true,
      nativePlaybackActive: false,
      isPlaying: false,
    })).toBe(false);
  });

  it('nativePlaybackActive && isPlaying のとき false を返す', () => {
    expect(shouldRequestRustTimelineSceneEvaluationForTick({
      rustTimelineSceneRpcEnabled: true,
      rustTimelineSceneRevisionAvailable: true,
      isExporting: false,
      nativePlaybackActive: true,
      isPlaying: true,
    })).toBe(false);
  });

  // RPCモードでは shouldBuildSharedRendererPreviewSessionForTick が false を返すため
  // Chromium側のscene再構築は起きない。この新関数が true を返すことで、
  // RPCモード下でのRust常駐scene再評価はこちらが担う、という役割分担を対比で示す。
  it('RPCモードでは shouldBuildSharedRendererPreviewSessionForTick が false、代わりに shouldRequestRustTimelineSceneEvaluationForTick が true を返す（復帰契機の担当を対比）', () => {
    const rustTimelineSceneRpcEnabled = true;

    expect(shouldBuildSharedRendererPreviewSessionForTick(rustTimelineSceneRpcEnabled)).toBe(false);
    expect(shouldRequestRustTimelineSceneEvaluationForTick({
      rustTimelineSceneRpcEnabled,
      rustTimelineSceneRevisionAvailable: true,
      isExporting: false,
      nativePlaybackActive: false,
      isPlaying: false,
    })).toBe(true);
  });
});
