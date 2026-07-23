import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveSharedRendererPresenterRestartSession } from './sharedRendererPresenterRestartSession';

describe('sharedRendererPresenterRestartSession', () => {
  it('presents the latest published session on a presenter restart, not the stale trigger session', () => {
    // 実機回帰「ポーズすると一番最初のフレームが表示される」の真因:
    // presenter 起動 effect は presenterKey 変化時にしか更新されない state の
    // セッション（最後にフル再起動した時点＝典型的には frame 0）を present して
    // いた。再起動時は毎 publish で更新される最新セッションを選ぶこと。
    const staleTriggerSession = { label: 'restart-time-frame-0' };
    const latestPublishedSession = { label: 'current-head-frame' };

    expect(resolveSharedRendererPresenterRestartSession(
      latestPublishedSession,
      staleTriggerSession,
    )).toBe(latestPublishedSession);
  });

  it('falls back to the trigger session before any publish has stored a latest session', () => {
    const triggerSession = { label: 'initial' };

    expect(resolveSharedRendererPresenterRestartSession(null, triggerSession)).toBe(triggerSession);
  });

  it('returns null when neither session exists', () => {
    expect(resolveSharedRendererPresenterRestartSession(null, null)).toBeNull();
  });

  describe('Viewport wiring boundary', () => {
    const viewportSource = () =>
      readFileSync(new URL('../components/Viewport.tsx', import.meta.url), 'utf8');

    it('stores every built session into the latest-published ref inside publish', () => {
      const code = viewportSource();
      const start = code.indexOf('const session = evaluatedSession ?? buildSharedRendererPreviewSession({');
      const end = code.indexOf('updateSharedRendererGeneratedEffectObjectIds(collectSharedRendererGeneratedEffectObjectIdsFromSession(session))', start);
      const publishBuildBlock = code.slice(start, end);

      expect(publishBuildBlock).toContain('sharedRendererLatestPublishedPreviewSessionRef.current = session;');
    });

    it('presents the resolved restart session instead of the stale state session', () => {
      const code = viewportSource();
      const effectStart = code.indexOf('const presenterRestartSession = resolveSharedRendererPresenterRestartSession(');
      expect(effectStart).toBeGreaterThan(-1);

      const presenterStart = code.indexOf('void startSharedRendererViewportPresenter({');
      const presenterEnd = code.indexOf('}).then', presenterStart);
      const presenterBlock = code.slice(presenterStart, presenterEnd);

      expect(presenterBlock).toContain('session: presenterRestartSession');
      expect(presenterBlock).not.toContain('session: sharedRendererPreviewSession');
    });

    it('derives the pending-replay key and reuse predicates from the same restart session', () => {
      const code = viewportSource();
      const start = code.indexOf('const canReuseCurrentPresenterSession = shouldReuseExternalVideoPresenterSession({');
      const end = code.indexOf('void startSharedRendererViewportPresenter({', start);
      const restartPreludeBlock = code.slice(start, end);

      expect(restartPreludeBlock).toContain('session: presenterRestartSession');
      expect(restartPreludeBlock).toContain('buildSharedRendererPresenterSessionKey(presenterRestartSession, {');
      expect(restartPreludeBlock).toContain('isSharedRendererExternalVideoOnlySession(presenterRestartSession)');
      expect(restartPreludeBlock).toContain('isSharedRendererNativeRenderOnlySession(presenterRestartSession)');
    });
  });
});
