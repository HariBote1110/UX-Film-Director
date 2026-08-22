// Phase 7 (W7) STAGE 1: native overlay をプラットフォームごとに既定 ON/OFF
// 切り替えるための純粋関数。
//
// - macOS: 既存どおり opt-out（`VITE_UXFD_NATIVE_OVERLAY !== '0'` で既定 ON）。
// - Windows: 24 時間ベンチが完了するまでは opt-in（既定 OFF）。ベンチ合格後に
//   macOS と同じ opt-out へ切り替える際は `WINDOWS_DEFAULT_ENABLED` を
//   `true` に変えるだけで済むようにしてある。
// - 未知のプラットフォーム: Windows と同じ安全側（opt-in）にフォールバックする。

export type NativeOverlayEnvLike = {
  VITE_UXFD_NATIVE_OVERLAY?: string;
};

// ステージ2（24時間ベンチ合格後）でこの1箇所を true にして既定 ON へ切り替える。
const WINDOWS_DEFAULT_ENABLED = false;

export function resolveNativeOverlayEnabled(platform: string, env: NativeOverlayEnvLike): boolean {
  const flag = env.VITE_UXFD_NATIVE_OVERLAY;

  if (platform === 'darwin') {
    // opt-out: 明示的に '0' を指定したときだけ無効化する。
    return flag !== '0';
  }

  // Windows および未知のプラットフォームは opt-in/opt-out いずれになるかを
  // WINDOWS_DEFAULT_ENABLED だけで切り替えられる形にしておく。
  if (flag === '1') return true;
  if (flag === '0') return false;
  return WINDOWS_DEFAULT_ENABLED;
}
