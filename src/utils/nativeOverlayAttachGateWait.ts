// Phase 7 (W7) stage-5 blocker fix: attach effect の起動ゲート
// （container 要素のマウント・window.nativeOverlay ブリッジの注入）が
// effect 初回実行の時点でまだ揃っていない場合、従来は黙って
// 'presenter' に固定されたまま二度と再試行されなかった
// （windows-w7-async-attach.md stage5 のブロッカー — mainpc実機で
// attach が一度も発火せず、ipcMain診断ログにも痕跡が残らなかった現象の
// 最有力な根本原因）。
//
// このユーティリティは React に依存しない純粋なポーリング/リトライ層。
// 「ゲートが揃うまで一定間隔で isReady() を確認し、揃った時点で一度だけ
// onReady() を呼ぶ」という単純な契約だけを持つ。Viewport.tsx 側は
// この handle の cancel() を effect cleanup から呼ぶだけでよい。

export interface NativeOverlayAttachGateWaitOptions {
  /** ゲートが揃ったか（container マウント済み・bridge 注入済み等）を返す。 */
  isReady: () => boolean;
  /** ゲートが揃った瞬間に一度だけ呼ばれる。 */
  onReady: () => void;
  /** ポーリング間隔（ミリ秒）。 */
  intervalMs: number;
  /** テスト用の setInterval/clearInterval 差し替え（既定は globalThis のもの）。 */
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

export interface NativeOverlayAttachGateWaitHandle {
  /** ポーリングを止める（unmount・トグルOFF等）。onReady 未発火なら二度と呼ばれない。 */
  cancel: () => void;
}

export function waitForNativeOverlayAttachGate(
  options: NativeOverlayAttachGateWaitOptions,
): NativeOverlayAttachGateWaitHandle {
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;

  let settled = false;
  let timerId: ReturnType<typeof setInterval> | null = null;

  const stopPolling = () => {
    if (timerId !== null) {
      clearIntervalFn(timerId);
      timerId = null;
    }
  };

  const check = () => {
    if (settled) return;
    if (!options.isReady()) return;
    settled = true;
    stopPolling();
    options.onReady();
  };

  // 初回チェックは同期に行う — 既にゲートが揃っている通常ケース
  // （macOS・大半のWindows起動）ではポーリングを一切開始しない。
  check();
  if (!settled) {
    timerId = setIntervalFn(check, options.intervalMs);
  }

  return {
    cancel: () => {
      if (settled) return;
      settled = true;
      stopPolling();
    },
  };
}
