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

// Phase 7 (W7) stage6 ★完了（2026-08-23）— mainpc実機A/Bバイセクトで
// attach_native_overlayの非同期化アーキテクチャ自体（DComp window/device
// 作成をworkerスレッドへ丸ごと逃がす設計、stage1-2）が実Electronアプリでは
// 機能しないことが判明し、HWND/COM区間はJSスレッドで同期実行・pipeline
// コンパイルのみworkerスレッドへ回す設計へ再設計した
// （progress/windows-w7-async-attach.md参照）。mainpc実機で3回のattach
// latency測定を実施し、UIスレッドが実際のattach進行中も一度もブロック
// されないことを直接確認（Responding=False 0/179・0/179・0/178サンプル）、
// geometry追従・soakは既存実績を維持。この検証結果を根拠に既定ONへ切替。
const WINDOWS_DEFAULT_ENABLED = true;

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
