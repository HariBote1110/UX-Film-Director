import { describe, expect, it, vi } from 'vitest';
import {
  createNativeOverlayAttachLifecycle,
  type NativeOverlayLifecycleState,
} from './nativeOverlayAttachLifecycle';

// deferred() ヘルパー — attach() を手動で resolve できるようにし、
// 「pending 中に何が起きるか」を明示的にテストする。
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('createNativeOverlayAttachLifecycle', () => {
  it('resolves to overlay after a successful pending attach (presenter -> attaching -> overlay)', async () => {
    const states: NativeOverlayLifecycleState[] = [];
    const attachDeferred = deferred<{ attached: true }>();
    const onAttached = vi.fn();
    const lifecycle = createNativeOverlayAttachLifecycle({
      attach: () => attachDeferred.promise,
      onStateChange: (state) => states.push(state),
      onAttached,
    });

    lifecycle.runAttach();
    expect(states).toEqual(['attaching']);

    attachDeferred.resolve({ attached: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(states).toEqual(['attaching', 'overlay']);
    expect(onAttached).toHaveBeenCalledTimes(1);
  });

  it('stays on presenter and reports the failure when attach fails (no retry storm)', async () => {
    const states: NativeOverlayLifecycleState[] = [];
    const attachDeferred = deferred<{ attached: false; reason: string }>();
    const onAttachFailed = vi.fn();
    const attach = vi.fn(() => attachDeferred.promise);
    const lifecycle = createNativeOverlayAttachLifecycle({
      attach,
      onStateChange: (state) => states.push(state),
      onAttachFailed,
    });

    lifecycle.runAttach();
    attachDeferred.resolve({ attached: false, reason: 'SetWinEventHook failed' });
    await Promise.resolve();
    await Promise.resolve();

    expect(states).toEqual(['attaching', 'presenter']);
    expect(onAttachFailed).toHaveBeenCalledWith('SetWinEventHook failed');
    // 失敗後、呼び出し元が再度 runAttach() しない限り追加の attach は
    // 発行されない — このオーケストレーション層自体は自動リトライしない。
    expect(attach).toHaveBeenCalledTimes(1);
  });

  it('ignores a late resolve after cancel (unmount during a pending attach)', async () => {
    const states: NativeOverlayLifecycleState[] = [];
    const attachDeferred = deferred<{ attached: true }>();
    const onAttached = vi.fn();
    const lifecycle = createNativeOverlayAttachLifecycle({
      attach: () => attachDeferred.promise,
      onStateChange: (state) => states.push(state),
      onAttached,
    });

    lifecycle.runAttach();
    expect(states).toEqual(['attaching']);

    // unmount / トグルOFF 相当
    lifecycle.cancel();
    expect(states).toEqual(['attaching', 'presenter']);

    // pending だった attach がその後で resolve しても、既に cancel 済みなので
    // overlay へは遷移しない（addon 側の detach は呼び出し元の責務、ここでは
    // 「状態機械側が古いresolveを無視する」ことだけを保証する）。
    attachDeferred.resolve({ attached: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(states).toEqual(['attaching', 'presenter']);
    expect(onAttached).not.toHaveBeenCalled();
  });

  it('lets the latest runAttach() win when toggled/re-issued while a previous attach is still pending', async () => {
    const states: NativeOverlayLifecycleState[] = [];
    const firstAttach = deferred<{ attached: true }>();
    const secondAttach = deferred<{ attached: false; reason: string }>();
    const attachImpls = [() => firstAttach.promise, () => secondAttach.promise];
    let callIndex = 0;
    const lifecycle = createNativeOverlayAttachLifecycle({
      attach: () => attachImpls[callIndex++](),
      onStateChange: (state) => states.push(state),
    });

    lifecycle.runAttach(); // 世代1（古い意図）
    lifecycle.runAttach(); // 世代2（最新の意図）— resizeの連打やtoggleのすばやい往復を模す
    expect(states).toEqual(['attaching', 'attaching']);

    // 古い世代（世代1）が後から成功で返ってきても無視される。
    firstAttach.resolve({ attached: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(states).toEqual(['attaching', 'attaching']);

    // 最新の世代（世代2）の結果だけが状態に反映される。
    secondAttach.resolve({ attached: false, reason: 'stale geometry' });
    await Promise.resolve();
    await Promise.resolve();
    expect(states).toEqual(['attaching', 'attaching', 'presenter']);
  });

  it('resolves fast (effectively synchronously) on the macOS path without changing the state sequence', async () => {
    // macOS の attach は高速に完了する — テストでは「即resolveするPromise」で
    // 模す。非同期化前と違い、必ず 'attaching' を一度経由してから 'overlay' に
    // 至る点は Windows と同じシーケンスのまま変わらないことを確認する
    // （実際の所要時間が短いだけで、状態機械の分岐自体はプラットフォーム
    // 非依存で共通コードのため、これは設計上自明であることをテストで固定する）。
    const states: NativeOverlayLifecycleState[] = [];
    const lifecycle = createNativeOverlayAttachLifecycle({
      attach: () => Promise.resolve({ attached: true }),
      onStateChange: (state) => states.push(state),
    });

    lifecycle.runAttach();
    expect(states).toEqual(['attaching']);
    await Promise.resolve();
    await Promise.resolve();
    expect(states).toEqual(['attaching', 'overlay']);
  });

  it('runAttach() after cancel() is a no-op (fully disabled lifecycle stays inert)', async () => {
    const states: NativeOverlayLifecycleState[] = [];
    const attach = vi.fn(() => Promise.resolve({ attached: true as const }));
    const lifecycle = createNativeOverlayAttachLifecycle({
      attach,
      onStateChange: (state) => states.push(state),
    });

    lifecycle.cancel();
    expect(states).toEqual(['presenter']);
    lifecycle.runAttach();
    expect(attach).not.toHaveBeenCalled();
    expect(states).toEqual(['presenter']);
  });
});
