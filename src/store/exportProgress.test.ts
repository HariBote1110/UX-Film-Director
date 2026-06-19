import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './useStore';

describe('export progress state', () => {
  beforeEach(() => {
    useStore.getState().setExporting(false);
  });

  it('initialises progress and clears the cancel flag when export starts', () => {
    useStore.getState().setExporting(true);
    const state = useStore.getState();
    expect(state.isExporting).toBe(true);
    expect(state.exportCancelRequested).toBe(false);
    expect(state.exportProgress).toEqual({ phase: 'preparing', currentFrame: 0, totalFrames: 0 });
  });

  it('updates the progress payload', () => {
    useStore.getState().setExporting(true);
    useStore.getState().setExportProgress({ phase: 'rendering', currentFrame: 12, totalFrames: 120 });
    expect(useStore.getState().exportProgress).toEqual({ phase: 'rendering', currentFrame: 12, totalFrames: 120 });
  });

  it('keeps the current export step detail on the progress payload', () => {
    useStore.getState().setExporting(true);
    useStore.getState().setExportProgress({
      phase: 'rendering',
      currentFrame: 0,
      totalFrames: 120,
      stepDetail: 'Rust frame source: rendering frame 0',
    });

    expect(useStore.getState().exportProgress?.stepDetail).toBe('Rust frame source: rendering frame 0');
  });

  it('keeps native render output release diagnostics on the progress payload', () => {
    useStore.getState().setExporting(true);
    useStore.getState().setExportProgress({
      phase: 'rendering',
      currentFrame: 12,
      totalFrames: 120,
      nativeRenderOutputRelease: {
        status: 'released',
        memoryId: '/uxfd-native-render-output',
        reason: 'encodeWriteFailed',
      },
    });

    expect(useStore.getState().exportProgress).toEqual({
      phase: 'rendering',
      currentFrame: 12,
      totalFrames: 120,
      nativeRenderOutputRelease: {
        status: 'released',
        memoryId: '/uxfd-native-render-output',
        reason: 'encodeWriteFailed',
      },
    });
  });

  it('keeps Rust frame source blocked diagnostics on the progress payload', () => {
    useStore.getState().setExporting(true);
    useStore.getState().setExportProgress({
      phase: 'rendering',
      currentFrame: 13,
      totalFrames: 120,
      rustFrameSourceBlocked: {
        reason: 'videoBitmapCaptureDisabled',
        frameIndex: 13,
        legacyCanvasFallbackAllowed: false,
        detail: 'Video export cannot use browser bitmap capture for video objects.',
      },
    });

    expect(useStore.getState().exportProgress).toEqual({
      phase: 'rendering',
      currentFrame: 13,
      totalFrames: 120,
      rustFrameSourceBlocked: {
        reason: 'videoBitmapCaptureDisabled',
        frameIndex: 13,
        legacyCanvasFallbackAllowed: false,
        detail: 'Video export cannot use browser bitmap capture for video objects.',
      },
    });
  });

  it('keeps the last Rust export diagnostics after export progress is cleared', () => {
    useStore.getState().setExporting(true);
    useStore.getState().setExportProgress({
      phase: 'saving',
      currentFrame: 120,
      totalFrames: 120,
      rustFrameSourceBlocked: {
        reason: 'videoOwnershipUnavailable',
        frameIndex: 5,
        legacyCanvasFallbackAllowed: true,
        detail: 'Shared renderer export is missing uploaded video clips: video-2.',
      },
      nativeRenderOutputRelease: {
        status: 'failed',
        memoryId: '/uxfd-native-render-output',
        reason: 'encodeWriteFailed',
        error: 'release rejected',
      },
    });

    useStore.getState().setExporting(false);

    expect(useStore.getState().exportProgress).toBeNull();
    expect(useStore.getState().lastExportDiagnostics).toEqual({
      rustFrameSourceBlocked: {
        reason: 'videoOwnershipUnavailable',
        frameIndex: 5,
        legacyCanvasFallbackAllowed: false,
        detail: 'Shared renderer export is missing uploaded video clips: video-2.',
      },
      nativeRenderOutputRelease: {
        status: 'failed',
        memoryId: '/uxfd-native-render-output',
        reason: 'encodeWriteFailed',
        error: 'release rejected',
      },
    });
  });

  it('normalises video Rust blocked diagnostics on the progress payload', () => {
    useStore.getState().setExporting(true);
    useStore.getState().setExportProgress({
      phase: 'rendering',
      currentFrame: 5,
      totalFrames: 120,
      rustFrameSourceBlocked: {
        reason: 'videoOwnershipUnavailable',
        frameIndex: 5,
        legacyCanvasFallbackAllowed: true,
        detail: 'Shared renderer export is missing uploaded video clips: video-2.',
      },
    });

    expect(useStore.getState().exportProgress?.rustFrameSourceBlocked).toEqual({
      reason: 'videoOwnershipUnavailable',
      frameIndex: 5,
      legacyCanvasFallbackAllowed: false,
      detail: 'Shared renderer export is missing uploaded video clips: video-2.',
    });
  });

  it('keeps the last Rust frame source plan failure after export progress is cleared', () => {
    useStore.getState().setExporting(true);
    useStore.getState().setExportProgress({
      phase: 'preparing',
      currentFrame: 0,
      totalFrames: 0,
      exportFrameSourcePlanFailure: {
        reason: 'rustFrameSourceRequired',
        detail: 'Video export requires a shared-frame Rust export source.',
      },
    });

    useStore.getState().setExporting(false);

    expect(useStore.getState().exportProgress).toBeNull();
    expect(useStore.getState().lastExportDiagnostics).toEqual({
      exportFrameSourcePlanFailure: {
        reason: 'rustFrameSourceRequired',
        detail: 'Video export requires a shared-frame Rust export source.',
      },
    });
  });

  it('clears stale last export diagnostics when a new export starts', () => {
    useStore.getState().setExporting(true);
    useStore.getState().setExportProgress({
      phase: 'rendering',
      currentFrame: 4,
      totalFrames: 10,
      rustFrameSourceBlocked: {
        reason: 'videoUploadFailed',
        frameIndex: 4,
        legacyCanvasFallbackAllowed: false,
        detail: 'copyReportChecksumMismatch: checksum mismatch',
      },
    });
    useStore.getState().setExporting(false);

    expect(useStore.getState().lastExportDiagnostics).not.toBeNull();

    useStore.getState().setExporting(true);

    expect(useStore.getState().lastExportDiagnostics).toBeNull();
  });

  it('flags cancellation and switches the phase to cancelling', () => {
    useStore.getState().setExporting(true);
    useStore.getState().setExportProgress({ phase: 'rendering', currentFrame: 30, totalFrames: 120 });
    useStore.getState().requestExportCancel();
    const state = useStore.getState();
    expect(state.exportCancelRequested).toBe(true);
    expect(state.exportProgress?.phase).toBe('cancelling');
    // フレーム情報は保持される。
    expect(state.exportProgress?.currentFrame).toBe(30);
  });

  it('does nothing when cancel is requested while not exporting', () => {
    useStore.getState().requestExportCancel();
    const state = useStore.getState();
    expect(state.exportCancelRequested).toBe(false);
    expect(state.exportProgress).toBeNull();
  });

  it('clears progress and cancel flag when export ends', () => {
    useStore.getState().setExporting(true);
    useStore.getState().requestExportCancel();
    useStore.getState().setExporting(false);
    const state = useStore.getState();
    expect(state.isExporting).toBe(false);
    expect(state.exportProgress).toBeNull();
    expect(state.exportCancelRequested).toBe(false);
  });
});
