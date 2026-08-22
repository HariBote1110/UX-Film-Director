import { describe, expect, it } from 'vitest';
import { resolveNativeOverlayEnabled } from './nativeOverlayPlatformGate';

// Phase 7 (W7) STAGE 1〜6: プラットフォームごとの既定値を切り替えるゲート。
// macOS は既存どおり opt-out（既定 ON）。Windows は stage6（mainpc実機の
// attach latency測定・UIスレッド非ブロック証明）完了により、macOSと同じ
// opt-out（既定 ON）へ切り替えた（windows-w7-async-attach.md参照）。
// VITE_UXFD_NATIVE_OVERLAY=0 で明示的に無効化するopt-outの経路は
// プラットフォーム非依存で維持している。

describe('resolveNativeOverlayEnabled', () => {
  it('macOS: フラグ未設定なら既定で有効（opt-out）', () => {
    expect(resolveNativeOverlayEnabled('darwin', {})).toBe(true);
  });

  it('macOS: VITE_UXFD_NATIVE_OVERLAY=0 で無効化できる', () => {
    expect(resolveNativeOverlayEnabled('darwin', { VITE_UXFD_NATIVE_OVERLAY: '0' })).toBe(false);
  });

  it('macOS: VITE_UXFD_NATIVE_OVERLAY=1 でも有効のまま', () => {
    expect(resolveNativeOverlayEnabled('darwin', { VITE_UXFD_NATIVE_OVERLAY: '1' })).toBe(true);
  });

  it('Windows: フラグ未設定なら既定で有効（opt-out、stage6完了後の既定）', () => {
    expect(resolveNativeOverlayEnabled('win32', {})).toBe(true);
  });

  it('Windows: VITE_UXFD_NATIVE_OVERLAY=1 でも有効のまま', () => {
    expect(resolveNativeOverlayEnabled('win32', { VITE_UXFD_NATIVE_OVERLAY: '1' })).toBe(true);
  });

  it('Windows: VITE_UXFD_NATIVE_OVERLAY=0 で明示的に無効化できる', () => {
    expect(resolveNativeOverlayEnabled('win32', { VITE_UXFD_NATIVE_OVERLAY: '0' })).toBe(false);
  });

  it('未知のプラットフォームは Windows と同じ opt-out 扱いにする（stage6完了後の既定）', () => {
    expect(resolveNativeOverlayEnabled('linux', {})).toBe(true);
    expect(resolveNativeOverlayEnabled('linux', { VITE_UXFD_NATIVE_OVERLAY: '0' })).toBe(false);
  });
});
