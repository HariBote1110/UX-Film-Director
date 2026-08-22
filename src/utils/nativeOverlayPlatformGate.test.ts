import { describe, expect, it } from 'vitest';
import { resolveNativeOverlayEnabled } from './nativeOverlayPlatformGate';

// Phase 7 (W7) STAGE 1: プラットフォームごとの既定値を切り替えるゲート。
// macOS は既存どおり opt-out（既定 ON）。Windows は 24 時間ベンチ完了までの
// あいだ opt-in（既定 OFF）とし、あとで既定を反転する際に1行で切り替えられる
// 形にしておく。

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

  it('Windows: フラグ未設定なら既定で無効（opt-in、ステージ1の暫定既定）', () => {
    expect(resolveNativeOverlayEnabled('win32', {})).toBe(false);
  });

  it('Windows: VITE_UXFD_NATIVE_OVERLAY=1 で有効化できる', () => {
    expect(resolveNativeOverlayEnabled('win32', { VITE_UXFD_NATIVE_OVERLAY: '1' })).toBe(true);
  });

  it('Windows: VITE_UXFD_NATIVE_OVERLAY=0 は明示的無効のまま', () => {
    expect(resolveNativeOverlayEnabled('win32', { VITE_UXFD_NATIVE_OVERLAY: '0' })).toBe(false);
  });

  it('未知のプラットフォームは Windows と同じ opt-in 扱いにする（安全側デフォルト）', () => {
    expect(resolveNativeOverlayEnabled('linux', {})).toBe(false);
    expect(resolveNativeOverlayEnabled('linux', { VITE_UXFD_NATIVE_OVERLAY: '1' })).toBe(true);
  });
});
