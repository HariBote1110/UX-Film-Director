import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NATIVE_OVERLAY_TRANSPARENT_CLEAR_INITIAL_STATE,
  resolveNativeOverlayTransparentClearTransition,
} from './sharedRendererViewportPresenterOrchestration';

// 実機バグ「動画をタイムラインから消してもキャンバスに動画フレームが残る」
// の再発防止契約。
//
// 主因（レース）: native reuse の single-flight decode+present が in flight の
// まま削除 publish が presenter 再起動（空セッション → noVideoDecodeRequest →
// Bug F transparent clear）へ進むと、clear の後に削除前 tick の present が完了
// して古いフレームを overlay drawable に上書きする。さらに Bug F の
// clearedForNoVideo ガードが立ったままになるため、以後の noVideoDecodeRequest
// でも再 clear されず残像が恒久化する。
//
// 副因（stale objects）: reuse .finally の pending replay が pending.objects
// （削除前スナップショット）で publish を再実行すると、削除済みクリップ入りの
// セッションが再構築され、キー不一致 → presenter 再起動でもう一度削除済み
// フレームを present しうる。
describe('viewport deleted clip residual frame boundary', () => {
  const viewportSource = () =>
    readFileSync(new URL('../components/Viewport.tsx', import.meta.url), 'utf8');

  it('guards the native reuse in-flight overlay present with a current-request check', () => {
    const code = viewportSource();
    const start = code.indexOf('if (nativeOverlayPreviewEnabled && isSharedRendererExternalVideoOnlySession(session)) {');
    const end = code.indexOf('if (!presentPreparedNativeRenderFrame) return;', start);
    const reuseOverlayBlock = code.slice(start, end);

    expect(reuseOverlayBlock).toContain('const nativeOverlayReuseRequestId = (sharedRendererVideoDecodeRequestIdRef.current += 1);');
    expect(reuseOverlayBlock).toContain('requestId: nativeOverlayReuseRequestId');
    expect(reuseOverlayBlock).toContain('isRequestCurrent: () => sharedRendererVideoDecodeRequestIdRef.current === nativeOverlayReuseRequestId');
    // 追い越された tick が「失敗」扱いで fallback 再起動
    // （setSharedRendererPreviewSession(session)）へ落ちると、この tick が
    // 捕捉した古い session（削除済みクリップ入り）を復活させてしまう。
    expect(reuseOverlayBlock).toContain("result.reason === 'supersededRequest'");
  });

  it('guards the presenter restart overlay present with a current-request check', () => {
    const code = viewportSource();
    const start = code.indexOf('presentNativeOverlayDecodedFrame: nativeOverlayDecodedFrameEligible');
    const end = code.indexOf('activeVideoDecodeJob:', start);
    const restartWrapperBlock = code.slice(start, end);

    expect(restartWrapperBlock).toContain('isRequestCurrent: () => sharedRendererVideoDecodeRequestIdRef.current === input.requestId');
  });

  it('replays the pending native reuse tick with the latest objects instead of a pre-deletion snapshot', () => {
    const code = viewportSource();
    const start = code.indexOf('const pending = sharedRendererNativeReusePendingRef.current;');
    const end = code.indexOf('})();', start);
    const pendingReplayBlock = code.slice(start, end);

    expect(pendingReplayBlock).toContain('latestObjectsRef.current');
    expect(pendingReplayBlock).not.toContain('pending.objects');
  });

  it('keeps the Bug F clear guard untouched for a superseded overlay present', () => {
    // supersededRequest は「present しなかった」だけで動画要求の有無を確定させ
    // ないため、clear もガード解除もしない（noVideoDecodeRequest のときの1回
    // clear の機会を奪わない）ことを固定する。
    const afterClear = { clearedForNoVideo: true };
    const supersededResult = {
      ok: false as const,
      reason: 'supersededRequest',
      detail: 'superseded',
      activeJob: null,
    };

    expect(resolveNativeOverlayTransparentClearTransition(afterClear, supersededResult)).toEqual({
      next: afterClear,
      shouldClear: false,
    });
    expect(resolveNativeOverlayTransparentClearTransition(
      NATIVE_OVERLAY_TRANSPARENT_CLEAR_INITIAL_STATE,
      supersededResult,
    )).toEqual({
      next: NATIVE_OVERLAY_TRANSPARENT_CLEAR_INITIAL_STATE,
      shouldClear: false,
    });
  });
});
