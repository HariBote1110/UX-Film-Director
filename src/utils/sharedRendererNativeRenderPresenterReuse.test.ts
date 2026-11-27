import { describe, expect, it } from 'vitest';
import { shouldReuseSharedRendererNativeRenderPresenter } from './sharedRendererNativeRenderPresenterReuse';

const baseInput = {
  isExporting: false,
  rustVideoOnlyEnabled: false,
  sharedRendererVideoCutoverEnabled: true,
  externalVideoOnly: false,
  nativeRenderOnly: false,
  mixedNativeRender: false,
};

describe('shouldReuseSharedRendererNativeRenderPresenter', () => {
  it('reuses a video-free native-render session without Rust video-only mode', () => {
    expect(shouldReuseSharedRendererNativeRenderPresenter({
      ...baseInput,
      nativeRenderOnly: true,
    })).toBe(true);
  });

  it('respects the shared renderer cutover opt-out for video-free sessions', () => {
    expect(shouldReuseSharedRendererNativeRenderPresenter({
      ...baseInput,
      sharedRendererVideoCutoverEnabled: false,
      nativeRenderOnly: true,
    })).toBe(false);
  });

  it.each([
    ['external-video-only', { externalVideoOnly: true }],
    ['mixed video and native render', { mixedNativeRender: true }],
  ])('does not reuse a %s session outside Rust video-only mode', (_label, sessionShape) => {
    expect(shouldReuseSharedRendererNativeRenderPresenter({
      ...baseInput,
      ...sessionShape,
    })).toBe(false);
  });

  it.each([
    ['external-video-only', { externalVideoOnly: true }],
    ['native-render-only', { nativeRenderOnly: true }],
    ['mixed video and native render', { mixedNativeRender: true }],
  ])('preserves %s reuse in Rust video-only mode', (_label, sessionShape) => {
    expect(shouldReuseSharedRendererNativeRenderPresenter({
      ...baseInput,
      rustVideoOnlyEnabled: true,
      sharedRendererVideoCutoverEnabled: false,
      ...sessionShape,
    })).toBe(true);
  });

  it('never reuses the preview presenter while exporting', () => {
    expect(shouldReuseSharedRendererNativeRenderPresenter({
      ...baseInput,
      isExporting: true,
      rustVideoOnlyEnabled: true,
      nativeRenderOnly: true,
    })).toBe(false);
  });
});
