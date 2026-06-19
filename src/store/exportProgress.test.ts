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
