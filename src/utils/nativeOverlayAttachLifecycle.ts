// Phase 7 (W7) Option B: attach_native_overlay の非同期化に伴う
// interim-presenter 状態機械（純粋なオーケストレーション部分）。
//
// native-overlay の attach（native-overlay/src/lib.rs の
// attach_native_overlay、windows-w7-async-attach.md 参照）は napi
// AsyncTask 化され、常に Promise を返すようになった。Windows では初回
// attach が DXC パイプラインコンパイルのため数十秒かかりうる。
// Viewport.tsx はその間 WebGPU presenter を表示し続け、attach が成功
// した時点でだけ native overlay へ切り替える必要がある。
//
// このファイルは React に依存しない純粋なオーケストレーション部分だけを
// 切り出し、Viewport.tsx 側の実際の useEffect からは
// createNativeOverlayAttachLifecycle が返す handle を呼ぶだけにする。
// こうすることで「pending → resolved(success)」「pending →
// resolved(failure)」「unmount/無効化中の resolve」「連続トグル」の
// 4パターンを、DOM/React テスト環境なしで直接ユニットテストできる
// （nativeOverlayAttachLifecycle.test.ts）。

export type NativeOverlayLifecycleState = 'presenter' | 'attaching' | 'overlay';

export type NativeOverlayAttachOutcome =
  | { attached: true }
  | { attached: false; reason?: string };

export interface NativeOverlayAttachLifecycleOptions {
  /** 実際の attach 呼び出し。native-overlay addon の attach() をラップする想定。 */
  attach: () => Promise<NativeOverlayAttachOutcome>;
  /** 状態が変わるたびに呼ばれる（React 側では setState を渡す）。 */
  onStateChange: (state: NativeOverlayLifecycleState) => void;
  /** attach が成功したときだけ呼ばれる（tick bump 等の副作用用）。 */
  onAttached?: () => void;
  /** attach が失敗したときだけ呼ばれる（console.error 等の副作用用）。 */
  onAttachFailed?: (reason: string | undefined) => void;
}

export interface NativeOverlayAttachLifecycleHandle {
  /**
   * 現在の意図（最新の attach rect 等）で attach を1回発行する。
   * 呼び出し元（Viewport.tsx）は従来どおり rect key で dedupe してから
   * 呼ぶ想定——ここでは「発行するたびに新しい世代とみなし、古い世代の
   * resolve は無視する」という「最新の呼び出しが勝つ」契約だけを保証する。
   */
  runAttach: () => void;
  /**
   * unmount または機能無効化（トグルOFF）時に呼ぶ。以降に届く古い世代の
   * resolve は無視され、状態は直ちに 'presenter' に戻る。
   */
  cancel: () => void;
}

export function createNativeOverlayAttachLifecycle(
  options: NativeOverlayAttachLifecycleOptions,
): NativeOverlayAttachLifecycleHandle {
  let generation = 0;
  let cancelled = false;

  const runAttach = () => {
    if (cancelled) return;
    const requestGeneration = (generation += 1);
    options.onStateChange('attaching');
    void options.attach().then((outcome) => {
      // 世代不一致 = このresolveより後に runAttach/cancel が呼ばれている
      // （トグルOFF→ON、resize連打による再attach、unmount のいずれか）。
      // 「最新の意図が勝つ」契約により、古い世代の結果は状態遷移に反映しない。
      if (cancelled || requestGeneration !== generation) return;
      if (outcome.attached) {
        options.onStateChange('overlay');
        options.onAttached?.();
      } else {
        options.onStateChange('presenter');
        options.onAttachFailed?.(outcome.reason);
      }
    });
  };

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    // 以降どんな世代のresolveも黙って無視されるようにする。
    generation += 1;
    options.onStateChange('presenter');
  };

  return { runAttach, cancel };
}
