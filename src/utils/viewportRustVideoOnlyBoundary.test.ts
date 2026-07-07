import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewportSource = () =>
  readFileSync(new URL('../components/Viewport.tsx', import.meta.url), 'utf8');

// pixiRenderHelper.ts は PixiJS 排除計画 Phase 5 で削除済み。
// 旧 pixiRenderHelper 向けの契約は pixiRemovalBoundary.test.ts の
// 「ファイル不存在」検査がより強い保証として引き継いでいる。

describe('Viewport Rust video-only boundary', () => {
  it('uses Rust/shared renderer video cutover for readiness diagnostics instead of HTMLVideoElement readiness', () => {
    const code = viewportSource();
    const start = code.indexOf('const videoReadiness = session.surfaceGate.ok');
    const end = code.indexOf(
      'diagnosticsWindow.__UXFD_SHARED_RENDERER_VIDEO_MEDIA_READINESS__',
      start
    );
    const readinessBlock = code.slice(start, end);

    expect(readinessBlock).toContain('buildSharedRendererVideoMediaReadiness({');
    expect(readinessBlock).not.toContain('requireSharedRendererVideo:');
    expect(readinessBlock).not.toContain('videoElements:');
  });

  it('does not pass stale video ownership gates into Pixi content routing', () => {
    const code = viewportSource();
    const start = code.indexOf('const content = updatePixiContent(obj, container, time, {');
    const end = code.indexOf('});', start);
    const updatePixiContentBlock = code.slice(start, end);

    expect(updatePixiContentBlock).not.toContain('sharedRendererVideoObjectIds:');
    expect(updatePixiContentBlock).not.toContain('requireSharedRendererVideo:');
    expect(code).not.toContain('sharedRendererVideoObjectIdsRef');
    expect(code).not.toContain('updateSharedRendererVideoObjectIds');
  });

  it('updates generated effect Pixi cutover ids from the shared renderer preview session before presenter completion', () => {
    const code = viewportSource();
    const start = code.indexOf('const session = buildSharedRendererPreviewSession({');
    const end = code.indexOf('setSharedRendererPreviewSession(session)', start);
    const publishSessionBlock = code.slice(start, end);

    expect(code).toContain('collectSharedRendererGeneratedEffectObjectIdsFromSession');
    expect(publishSessionBlock).toContain(
      'updateSharedRendererGeneratedEffectObjectIds(collectSharedRendererGeneratedEffectObjectIdsFromSession(session))'
    );
  });

  it('does not let the Viewport own legacy Pixi HTMLVideoElement texture resources', () => {
    const code = viewportSource();

    expect(code).not.toContain('videoElementsRef');
    expect(code).not.toContain('videoFrameTexturesRef');
    expect(code).not.toContain('VideoFrameTextureState');
    expect(code).not.toContain('destroyVideoFrameTextureState');
    expect(code).not.toContain('useCanvasVideoUploadForPixiPreview');
    expect(code).not.toContain('videoElementForPixi');
    expect(code).not.toContain('videoElements:');
    expect(code).not.toContain('videoFrameTextures:');
  });


  it('uses Rust/shared renderer video cutover for presenter orchestration instead of the legacy browser video path', () => {
    const code = viewportSource();
    const start = code.indexOf('void startSharedRendererViewportPresenter({');
    const end = code.indexOf('}).then', start);
    const presenterBlock = code.slice(start, end);

    expect(presenterBlock).toContain('videoCutoverEnabled: sharedRendererVideoCutoverEnabled');
    expect(presenterBlock).toContain('requireSharedRendererVideo: sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled');
  });

  it('passes isolated external video sources into shared renderer presenter orchestration', () => {
    const code = viewportSource();
    const start = code.indexOf('void startSharedRendererViewportPresenter({');
    const end = code.indexOf('}).then', start);
    const presenterBlock = code.slice(start, end);

    expect(code).toContain('createSharedRendererExternalVideoSource');
    expect(code).toContain('syncSharedRendererExternalVideoSources');
    expect(presenterBlock).toContain('sharedRendererExternalVideoSourcesByClipId');
  });

  it('does not pass HTMLVideoElement external sources into rust-only presenter orchestration', () => {
    const code = viewportSource();
    const start = code.indexOf('void startSharedRendererViewportPresenter({');
    const end = code.indexOf('}).then', start);
    const presenterBlock = code.slice(start, end);

    expect(presenterBlock).toContain('sharedRendererExternalVideoSourcesByClipId: !rustVideoOnlyEnabled');
  });

  it('publishes shared renderer presenter start count for playback performance diagnostics', () => {
    const code = viewportSource();
    const start = code.indexOf('void startSharedRendererViewportPresenter({');
    const beforePresenterStartBlock = code.slice(0, start);

    expect(code).toContain('sharedRendererPresenterStartCountRef');
    expect(beforePresenterStartBlock).toContain('uxfdSharedRendererPresenterStartCount');
    expect(beforePresenterStartBlock).toContain('sharedRendererPresenterStartCountRef.current += 1');
  });

  it('passes Phase 0 benchmark env flags into shared renderer presenter orchestration', () => {
    const code = viewportSource();
    const start = code.indexOf('void startSharedRendererViewportPresenter({');
    const end = code.indexOf('}).then', start);
    const presenterBlock = code.slice(start, end);

    expect(code).toContain("const phase0SkipDecodedUploadEnabled = import.meta.env.VITE_UXFD_PHASE0_SKIP_DECODED_UPLOAD === '1';");
    expect(code).toContain("const phase0WriteTextureNoOpEnabled = import.meta.env.VITE_UXFD_PHASE0_WRITE_TEXTURE_NOOP === '1';");
    expect(code).toContain("const phase0DiscardNativeRenderOutputEnabled = import.meta.env.VITE_UXFD_PHASE0_DISCARD_NATIVE_RENDER_OUTPUT === '1';");
    expect(presenterBlock).toContain('skipDecodedVideoUploadForBenchmark: phase0SkipDecodedUploadEnabled');
    expect(presenterBlock).toContain('sharedRendererWriteTextureNoOpEnabled: phase0WriteTextureNoOpEnabled');
    expect(presenterBlock).toContain('discardNativeRenderOutputForBenchmark: phase0DiscardNativeRenderOutputEnabled');
  });

  it('attaches the native overlay preview by default while allowing an explicit env opt-out', () => {
    const code = viewportSource();

    expect(code).toContain('buildNativeOverlayAttachRect');
    expect(code).toContain("const nativeOverlayPreviewEnabled = import.meta.env.VITE_UXFD_NATIVE_OVERLAY !== '0';");
    expect(code).toContain('window.nativeOverlay?.attach');
    expect(code).toContain('window.nativeOverlay?.detach');
  });

  it('resends the native overlay attach rectangle for viewport lifecycle changes', () => {
    const code = viewportSource();
    const start = code.indexOf('if (!nativeOverlayPreviewEnabled) return;');
    const end = code.indexOf('}, [nativeOverlayPreviewEnabled]', start);
    const nativeOverlayEffectBlock = code.slice(start, end);

    expect(nativeOverlayEffectBlock).toContain('lastNativeOverlayAttachKey');
    expect(nativeOverlayEffectBlock).toContain('if (nextAttachKey === lastNativeOverlayAttachKey) return;');
    expect(nativeOverlayEffectBlock).toContain("visualViewport?.addEventListener('resize', attach)");
    expect(nativeOverlayEffectBlock).toContain("visualViewport?.addEventListener('scroll', attach)");
    expect(nativeOverlayEffectBlock).toContain('window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)');
    expect(nativeOverlayEffectBlock).toContain("resolutionMediaQuery?.addEventListener('change', attach)");
    expect(nativeOverlayEffectBlock).toContain("document.addEventListener('fullscreenchange', attach)");
    expect(nativeOverlayEffectBlock).toContain("document.addEventListener('visibilitychange', attach)");
    expect(nativeOverlayEffectBlock).toContain("window.addEventListener('focus', attach)");
    expect(nativeOverlayEffectBlock).toContain("window.addEventListener('pageshow', attach)");
    expect(nativeOverlayEffectBlock).toContain("visualViewport?.removeEventListener('resize', attach)");
    expect(nativeOverlayEffectBlock).toContain("resolutionMediaQuery?.removeEventListener('change', attach)");
    expect(nativeOverlayEffectBlock).toContain("document.removeEventListener('fullscreenchange', attach)");
  });

  it('connects the native overlay preview presenter path behind the explicit env flag', () => {
    const code = viewportSource();
    const start = code.indexOf('void startSharedRendererViewportPresenter({');
    const end = code.indexOf('}).then', start);
    const presenterBlock = code.slice(start, end);

    expect(code).toContain('prepareSharedRendererViewportNativeOverlayPresent');
    expect(presenterBlock).toContain('nativeOverlayPreviewEnabled');
    expect(presenterBlock).toContain('presentNativeOverlayDecodedFrame: nativeOverlayPreviewEnabled');
    expect(presenterBlock).toContain('prepareSharedRendererViewportNativeOverlayPresent({');
    expect(presenterBlock).toContain('nativeOverlayBridge: window.nativeOverlay');
    expect(presenterBlock).toContain('rustBackendBridge: window.rustBackend');
  });

  it('routes native-reuse playback frames through Native Overlay when the overlay flag is enabled', () => {
    const code = viewportSource();
    const start = code.indexOf('if (canReuseNativeRenderPresenter && sharedRendererPresenterSessionKeyRef.current === nextPresenterKey)');
    const end = code.indexOf('if (sharedRendererPresenterSessionKeyRef.current !== nextPresenterKey)', start);
    const nativeReuseBlock = code.slice(start, end);

    // 非 video（図形）セッションは overlay 経路に乗せず DOM canvas 側の
    // presentPreparedNativeRenderFrame を通すため、overlay 分岐は video-only
    // セッションに限定される（isSharedRendererNativeRenderOnlySession 追加に伴う
    // 挙動の絞り込み）。
    expect(nativeReuseBlock).toContain('if (nativeOverlayPreviewEnabled && isSharedRendererExternalVideoOnlySession(session)) {');
    expect(nativeReuseBlock).toContain('prepareSharedRendererViewportNativeOverlayPresent({');
    expect(nativeReuseBlock).toContain('activeJob: sharedRendererVideoDecodeJobsRef.current[0] ?? null');
    expect(nativeReuseBlock).toContain('sharedRendererVideoDecodeJobsRef.current = result.ok ? [result.activeJob] : []');
    expect(nativeReuseBlock).toContain('presentPreparedNativeRenderFrame(result.upload, { session })');
    expect(nativeReuseBlock.indexOf('if (nativeOverlayPreviewEnabled && isSharedRendererExternalVideoOnlySession(session)) {')).toBeLessThan(
      nativeReuseBlock.indexOf('presentPreparedNativeRenderFrame(result.upload, { session })')
    );
  });

  it('reuses the existing external video presenter across playback ticks', () => {
    const code = viewportSource();
    const start = code.indexOf('const nextPresenterKey = buildSharedRendererPresenterSessionKey(session');
    const end = code.indexOf('if (sharedRendererPresenterSessionKeyRef.current !== nextPresenterKey)', start);
    const presenterKeyBlock = code.slice(start, end);
    const effectKeyStart = code.indexOf('const presenterSessionKey = buildSharedRendererPresenterSessionKey(sharedRendererPreviewSession');
    const effectKeyEnd = code.indexOf('let externalVideoSourcesByClipId =', effectKeyStart);
    const effectKeyBlock = code.slice(effectKeyStart, effectKeyEnd);
    const pendingStart = code.indexOf('if (shouldDeferSharedRendererPreviewSessionPublish(sharedRendererPresenterStartingRef.current))');
    const pendingEnd = code.indexOf('if (sharedRendererPresenterSessionKeyRef.current !== nextPresenterKey)', pendingStart);
    const pendingBlock = code.slice(pendingStart, pendingEnd);

    expect(code).toContain('isSharedRendererExternalVideoOnlySession');
    expect(presenterKeyBlock).toContain('includePlaybackFrame: !(canReuseExternalVideoPresenter || canReuseNativeRenderPresenter)');
    expect(effectKeyBlock).toContain('includePlaybackFrame: !(canReuseCurrentPresenterSession || canReuseCurrentNativeRenderPresenter)');
    expect(presenterKeyBlock).toContain('syncSharedRendererExternalVideoSources({');
    expect(presenterKeyBlock).toContain('presentExternalVideoFrameScene?.({');
    expect(presenterKeyBlock).toContain('publishSharedRendererExternalVideoPresentationDiagnostics(');
    expect(presenterKeyBlock.indexOf('syncSharedRendererExternalVideoSources({')).toBeLessThan(
      presenterKeyBlock.indexOf('presentExternalVideoFrameScene?.({')
    );
    expect(pendingBlock).toContain('sharedRendererPendingPreviewSessionRef.current = session');
    expect(pendingBlock).not.toContain('if (!sharedRendererPendingPreviewSessionRef.current)');
  });

  it('keeps timeline objects out of the presenter start effect dependencies (drag restart-cancel chain)', () => {
    // 症状B: ドラッグ中は毎 pointermove で store の objects 参照が変わる。
    // presenter 起動 effect の依存配列に objects が含まれていると、publish 側の
    // pending 退避と無関係に effect 自体が毎 move で cleanup（cancelled=true）→
    // 再実行され、in-flight の startSharedRendererViewportPresenter が cancel
    // され続けて一度も present が完了しない。さらにキャンセルされた run の
    // .finally は早期 return するため startingRef のリセットも pending replay も
    // 行われない。objects は latestObjectsRef.current 経由で読む契約を固定する。
    const code = viewportSource();
    const effectStart = code.indexOf('if (!sharedRendererPreviewEnabled || !sharedRendererPreviewSession) {');
    const presenterStart = code.indexOf('void startSharedRendererViewportPresenter({', effectStart);
    const depsStart = code.indexOf('}, [isExporting', presenterStart);
    const depsEnd = code.indexOf(']);', depsStart);
    const depsBlock = code.slice(depsStart, depsEnd);
    const effectBlock = code.slice(effectStart, depsStart);
    const startPathSyncBlock = code.slice(effectStart, presenterStart);
    const replaySyncBlock = code.slice(presenterStart, depsStart);

    expect(effectStart).toBeGreaterThan(0);
    expect(presenterStart).toBeGreaterThan(effectStart);
    expect(depsStart).toBeGreaterThan(presenterStart);
    // 依存配列に素の objects を含めない（updateShared...ObjectIds 等は許容）。
    expect(depsBlock).not.toMatch(/\bobjects\b/);
    // effect 内の external video sync は起動時点・replay 時点の最新 objects を
    // ref から読む（起動時クロージャの stale objects を渡さない）。
    expect(startPathSyncBlock).toContain('objects: latestObjectsRef.current');
    expect(replaySyncBlock).toContain('objects: latestObjectsRef.current');
    expect(effectBlock).not.toMatch(/^\s*objects,\s*$/m);
  });

  it('threads preview decode settings into rust-only native reuse uploads', () => {
    const code = viewportSource();
    const start = code.indexOf('const result = await prepareSharedRendererViewportNativeRenderUpload({');
    const end = code.indexOf('});', start);
    const nativeReuseUploadBlock = code.slice(start, end);

    expect(nativeReuseUploadBlock).toContain('sourceSlotCount: SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT');
    // decode edge は固定 720 ではなく preview drawable の長辺へ追従する
    // （固定 720 だと大きな drawable へ引き伸ばされ preview がボケる）。
    expect(nativeReuseUploadBlock).toContain('maxDecodeEdge: resolveSharedRendererPlaybackDecodeMaxEdge(nativeOverlayDrawableSizeRef.current)');
  });

  it('clamps rust-only native reuse playback publish time from the last requested preview frame', () => {
    const code = viewportSource();
    const publishStart = code.indexOf('const rawPreviewTime = isPlaying');
    const publishEnd = code.indexOf('const session = buildSharedRendererPreviewSession({', publishStart);
    const publishTimeBlock = code.slice(publishStart, publishEnd);
    const nativeReuseStart = code.indexOf('if (canReuseNativeRenderPresenter && sharedRendererPresenterSessionKeyRef.current === nextPresenterKey)');
    const nativeReuseEnd = code.indexOf('if (sharedRendererPresenterSessionKeyRef.current !== nextPresenterKey)', nativeReuseStart);
    const nativeReuseBlock = code.slice(nativeReuseStart, nativeReuseEnd);

    expect(code).toContain('sharedRendererNativeReuseLastPreviewTimeRef');
    expect(publishTimeBlock).toContain('resolveSharedRendererNativeReuseReplayTime({');
    expect(publishTimeBlock).toContain('requestedTime: sharedRendererNativeReuseLastPreviewTimeRef.current');
    expect(nativeReuseBlock).toContain('sharedRendererNativeReuseLastPreviewTimeRef.current =');
  });

  it('prefers native render upload for rust-only presenter starts', () => {
    const code = viewportSource();
    const start = code.indexOf('void startSharedRendererViewportPresenter({');
    const end = code.indexOf('}).then', start);
    const presenterBlock = code.slice(start, end);

    expect(presenterBlock).toContain('nativeRenderPreviewEnabled: sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled');
    expect(presenterBlock).toContain('preferNativeRenderUpload: rustVideoOnlyEnabled');
  });

  it('throttles external video playback sync while the presenter is reused', () => {
    const code = viewportSource();
    const syncStart = code.indexOf('syncSharedRendererExternalVideoPlayback({');
    const syncEnd = code.indexOf('});', syncStart);
    const syncBlock = code.slice(syncStart, syncEnd);

    expect(code).toContain('SHARED_RENDERER_EXTERNAL_VIDEO_PLAYING_SYNC_INTERVAL_MS = 75');
    expect(syncBlock).toContain('minimumPlayingSyncIntervalMs: SHARED_RENDERER_EXTERNAL_VIDEO_PLAYING_SYNC_INTERVAL_MS');
  });

  it('does not retain the previous shared renderer presenter when playback has just paused', () => {
    const code = viewportSource();
    const playbackStateStart = code.indexOf('const nextPlaybackState = useStore.getState().isPlaying');
    const cleanupStart = code.lastIndexOf('return () => {', playbackStateStart);
    const cleanupEnd = code.indexOf('};', cleanupStart);
    const cleanupBlock = code.slice(cleanupStart, cleanupEnd);

    expect(playbackStateStart).toBeGreaterThan(0);
    expect(cleanupBlock).toContain('const nextPlaybackState = useStore.getState().isPlaying');
    expect(cleanupBlock).toContain('nextPlaybackState');
    expect(cleanupBlock).not.toContain('(isPlaying || nextPlaybackState)');
  });

  it('disposes external video sources before export presenter starts without them', () => {
    const code = viewportSource();
    const start = code.indexOf('let externalVideoSourcesByClipId =');
    const end = code.indexOf('sharedRendererPresenterStartingRef.current = true;', start);
    const externalSourceBlock = code.slice(start, end);

    expect(externalSourceBlock).toContain('if (isExporting) {');
    expect(externalSourceBlock).toContain('disposeSharedRendererExternalVideoSources(sharedRendererExternalVideoSourcesRef.current)');
  });

  it('invalidates the presenter session key when export disposes external video sources', () => {
    const code = viewportSource();
    const start = code.indexOf('if (isExporting) {');
    const end = code.indexOf('} else {', start);
    const exportExternalSourceBlock = code.slice(start, end);

    expect(exportExternalSourceBlock).toContain('disposeSharedRendererExternalVideoSources(sharedRendererExternalVideoSourcesRef.current)');
    expect(exportExternalSourceBlock).toContain('sharedRendererPresenterSessionKeyRef.current = null');
  });

  it('requires the Rust video control plane in Rust video-only presenter orchestration', () => {
    const code = viewportSource();
    const start = code.indexOf('void startSharedRendererViewportPresenter({');
    const end = code.indexOf('}).then', start);
    const presenterBlock = code.slice(start, end);

    expect(presenterBlock).toContain('requireRustVideoControlPlane: rustVideoOnlyEnabled');
  });

  it('passes export context encode-only preference into the Rust export frame source', () => {
    const code = viewportSource();
    const start = code.indexOf('const getRustExportFrameSource = useCallback');
    const end = code.indexOf('useProjectExport(', start);
    const exportSourceBlock = code.slice(start, end);

    expect(exportSourceBlock).toContain('preferEncodeOnly: context.preferEncodeOnly');
  });

  it('passes native/Rust frame handoff into the Rust export frame source', () => {
    const code = viewportSource();
    const start = code.indexOf('const getRustExportFrameSource = useCallback');
    const end = code.indexOf('useProjectExport(', start);
    const exportSourceBlock = code.slice(start, end);

    expect(exportSourceBlock).toContain('presentedFrameSharedFrameTaker: context.presentedFrameSharedFrameTaker');
  });

  it('threads Rust video-only mode into the Rust export frame source cutover gate', () => {
    const code = viewportSource();
    const start = code.indexOf('const getRustExportFrameSource = useCallback');
    const end = code.indexOf('useProjectExport(', start);
    const exportSourceBlock = code.slice(start, end);

    expect(exportSourceBlock).toContain('videoCutoverEnabled: sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled');
    expect(exportSourceBlock).toContain('rustVideoOnlyEnabled');
  });

  it('enables shared renderer video cutover by default and only disables it explicitly', () => {
    const code = viewportSource();

    expect(code).toContain(
      "const sharedRendererVideoCutoverEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER !== '0';"
    );
    expect(code).not.toContain(
      "const sharedRendererVideoCutoverEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER === '1';"
    );
  });

  it('enables the shared renderer preview surface by default and only disables it explicitly', () => {
    const code = viewportSource();

    expect(code).toContain(
      "const sharedRendererPreviewEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_PREVIEW !== '0';"
    );
    expect(code).not.toContain(
      "const sharedRendererPreviewEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_PREVIEW === '1';"
    );
  });

  it('enables the shared renderer export surface by default and only disables it explicitly', () => {
    const code = viewportSource();

    expect(code).toContain(
      "const sharedRendererExportEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_EXPORT !== '0';"
    );
    expect(code).not.toContain(
      "const sharedRendererExportEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_EXPORT === '1';"
    );
  });

  it('does not opt the Viewport back into legacy Pixi video rendering', () => {
    const code = viewportSource();

    expect(code).not.toContain('allowLegacyPixiVideo');
  });

  it('renders shared renderer preview diagnostics instead of leaving a blank video preview unexplained', () => {
    const code = viewportSource();

    expect(code).toContain('shared-renderer-preview-diagnostics');
    expect(code).toContain('sharedRendererPreviewDiagnostic');
  });

  it('does not name the export canvas provider after Pixi internals', () => {
    const code = viewportSource();
    const start = code.indexOf('const getExportCanvas = useCallback');
    const end = code.indexOf('const getRustExportFrameSource = useCallback', start);
    const getExportCanvasBlock = code.slice(start, end);

    expect(getExportCanvasBlock).not.toContain('pixiCanvas');
  });



  it('clears the native overlay live surface transparently when the scene clips transition to empty (Bug D case i)', () => {
    // Bug D — clip 削除で `activeJob=null` になり shared frame present が止まると、
    // CAMetalLayer drawable に古いフレームが残ったままになる。対処として scene の
    // clips.length === 0 遷移を検出し、`window.nativeOverlay.clearSurface({ windowId })`
    // と Bug C で追加した `notifyNativeOverlaySceneCleared(windowId)` を同じイベント源で
    // 発行する。Cache 消去（Bug C）と drawable clear（Bug D）は独立した効果を持つため、
    // どちらか片方だけでは overlay が残ってしまう。
    const code = viewportSource();

    expect(code).toContain('notifyNativeOverlaySceneCleared');
    expect(code).toContain('window.nativeOverlay?.clearSurface');
    expect(code).toContain('session.surfaceGate.snapshot.clips.length === 0');
  });

  it('clears the native overlay live surface transparently on Viewport unmount cleanup (Bug D case ii)', () => {
    // Bug D — Viewport unmount で detach が呼ばれるが、detach は AppKit view の
    // 破棄側で drawable の内容をそのまま残す実装。unmount 後に別 project を
    // attach すると古い drawable が一瞬映る競合を避けるため、detach 前に
    // clearSurface を発行する。attach effect の cleanup で clearSurface が
    // detach より先に呼ばれる順序も併せて要求する。
    const code = viewportSource();
    const start = code.indexOf('if (!nativeOverlayPreviewEnabled) return;');
    const end = code.indexOf('}, [nativeOverlayPreviewEnabled]', start);
    const nativeOverlayEffectBlock = code.slice(start, end);

    expect(nativeOverlayEffectBlock).toContain('window.nativeOverlay?.clearSurface');
    // detach と clearSurface の呼び順は clear -> detach でなければならない
    // （detach が view を破棄してしまうと clearSurface の registry lookup が
    //  失敗して drawable が古いまま残る）。
    const clearIndex = nativeOverlayEffectBlock.lastIndexOf('window.nativeOverlay?.clearSurface');
    const detachIndex = nativeOverlayEffectBlock.lastIndexOf('window.nativeOverlay?.detach');
    expect(clearIndex).toBeGreaterThan(-1);
    expect(detachIndex).toBeGreaterThan(-1);
    expect(clearIndex).toBeLessThan(detachIndex);
  });

  it('declares Bug D case (i)/(iii) effects after the useStore destructure to avoid a TDZ ReferenceError on objects/projectId', () => {
    // Bug E — Bug D で追加した case (i)/(iii) の useEffect は `objects` と
    // `projectId` を deps に参照するが、これらは useStore destructure で
    // const 宣言される。effect が destructure より前のソース位置にあると、
    // 宣言前に deps 配列が評価され temporal dead zone 違反
    // （Uncaught ReferenceError: Cannot access 'objects' before initialization）
    // が発生し、error boundary 不在のためアプリ全体が真っ黒になる。
    // 再発防止のため、ソース上の出現位置（byte position）が
    // useStore destructure より後ろであることを契約として固定する。
    const code = viewportSource();

    const destructureIndex = code.indexOf('} = useStore((state) => ({');
    const caseIEffectIndex = code.indexOf(
      "// Bug D case (i) — timeline objects が空集合に遷移したとき"
    );
    const caseIIIEffectIndex = code.indexOf(
      '// Bug D case (iii) — projectId（activeSceneId）の変化を検出し'
    );

    expect(destructureIndex).toBeGreaterThan(-1);
    expect(caseIEffectIndex).toBeGreaterThan(-1);
    expect(caseIIIEffectIndex).toBeGreaterThan(-1);

    expect(caseIEffectIndex).toBeGreaterThan(destructureIndex);
    expect(caseIIIEffectIndex).toBeGreaterThan(destructureIndex);
  });

  it('clears the native overlay live surface transparently when the loaded project id changes (Bug D case iii)', () => {
    // Bug D — project 切替時も同じ drawable に別 project のフレームが遺存する
    // 可能性があるため、project id の変化を effect の deps で検出して
    // clearSurface と notifyNativeOverlaySceneCleared を発火する。
    const code = viewportSource();

    // project 切替を検知する effect は projectId を deps に含む
    expect(code).toMatch(/useEffect\([\s\S]*?window\.nativeOverlay\?\.clearSurface[\s\S]*?projectId/);
    expect(code).toContain('notifyNativeOverlaySceneCleared');
  });

  it('clears the native overlay live surface transparently when the playhead moves to a position with no visible video clip (Bug F)', () => {
    // Bug F — Bug D の3ケース（scene全体が空 / unmount / project切替）は
    // 「timelineにクリップは存在するが playhead が動画を含まない位置にある」
    // ケースを捕捉しない。presenter orchestration の戻り値
    // `nativeOverlayPresentResult.reason === 'noVideoDecodeRequest'` への
    // 遷移を検出し、resolveNativeOverlayTransparentClearTransition の判定に
    // 従って clearSurface を発火する配線が Viewport.tsx に必要。
    const code = viewportSource();

    expect(code).toContain('resolveNativeOverlayTransparentClearTransition');
    expect(code).toContain('nativeOverlayPresentResult');
  });

  it('does not clear the native overlay on every playback tick while noVideoDecodeRequest persists, only on the transition into it', () => {
    // 毎tickの透明presentは不要なGPU負荷になるため、clear-onceガードの
    // 状態（ref）を presenter start の完了ハンドラ内で保持し、
    // resolveNativeOverlayTransparentClearTransition の戻り値 next で
    // 更新する配線を要求する。
    const code = viewportSource();
    // 呼び出し箇所（import ではなく実際に呼んでいる箇所）を対象にする。
    const start = code.lastIndexOf('resolveNativeOverlayTransparentClearTransition(');
    expect(start).toBeGreaterThan(-1);

    const surroundingWindowStart = Math.max(0, start - 400);
    const surrounding = code.slice(surroundingWindowStart, start + 400);
    expect(surrounding).toContain('Ref');
  });

  // 図形（SolidColour 等の非 Video メディア）ドラッグ中のレイテンシ解消 ——
  // 選択枠は native overlay（child NSWindow）へ約1ms/回で present され即座に
  // 追従するが、矩形本体は従来 isSharedRendererExternalVideoOnlySession が
  // false になるため reuse 経路に乗れず、presenterKey に transform が含まれて
  // 毎 pointermove でフル再起動（約28ms/回）していた。枠と本体のレート差が
  // 「ずれ」として見えていたため、動画を含まない（＝Rust native render が
  // 単独で描ける）セッションも video-only と同様に reuse 対象へ広げる。
  it('defines a native-render-only session predicate for non-video reuse eligibility', () => {
    const code = viewportSource();

    expect(code).toContain('isSharedRendererNativeRenderOnlySession');
    const start = code.indexOf('const isSharedRendererNativeRenderOnlySession = (');
    const end = code.indexOf('\n};', start);
    const block = code.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    // video-only 判定と同様、surfaceGate 不整合・clips 空は reuse 対象外とする。
    expect(block).toContain('if (!session.surfaceGate.ok || session.surfaceGate.snapshot.clips.length === 0) return false;');
    // 全 clip の media kind が 'Video' でないことを要求する（混在セッションは対象外）。
    expect(block).toContain("mediaKindById.get(clip.media_id) !== 'Video'");
  });

  it('extends native render presenter reuse to non-video (shape/image) sessions alongside video-only sessions', () => {
    const code = viewportSource();
    const start = code.indexOf('const canReuseNativeRenderPresenter = rustVideoOnlyEnabled');
    const end = code.indexOf(';', start);
    const block = code.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(block).toContain('isSharedRendererExternalVideoOnlySession(session)');
    expect(block).toContain('isSharedRendererNativeRenderOnlySession(session)');
  });

  it('mirrors the non-video reuse extension in the presenter start effect key computation', () => {
    const code = viewportSource();
    const start = code.indexOf('const canReuseCurrentNativeRenderPresenter = rustVideoOnlyEnabled');
    const end = code.indexOf(';', start);
    const block = code.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(block).toContain('isSharedRendererExternalVideoOnlySession(sharedRendererPreviewSession)');
    expect(block).toContain('isSharedRendererNativeRenderOnlySession(sharedRendererPreviewSession)');
  });

  it('routes the non-video native-render reuse tick through prepareSharedRendererViewportNativeRenderUpload even when the native overlay is enabled', () => {
    // 動画セッションの reuse tick は nativeOverlayPreviewEnabled 時
    // prepareSharedRendererViewportNativeOverlayPresent（video decode +
    // native overlay present）を通るが、図形は DOM 側 canvas に描画される
    // ため、非 video セッションは overlay の有無に関わらず
    // prepareSharedRendererViewportNativeRenderUpload →
    // presentPreparedNativeRenderFrame のサブパスを通す必要がある。
    const code = viewportSource();
    const start = code.indexOf('if (canReuseNativeRenderPresenter && sharedRendererPresenterSessionKeyRef.current === nextPresenterKey)');
    const end = code.indexOf('if (sharedRendererPresenterSessionKeyRef.current !== nextPresenterKey)', start);
    const block = code.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    // overlay 分岐に入るのは動画セッションのときだけに限定する。
    expect(block).toContain('if (nativeOverlayPreviewEnabled && isSharedRendererExternalVideoOnlySession(session)) {');
    expect(block).toContain('presentPreparedNativeRenderFrame(result.upload, { session })');
  });

  it('does not reuse the native render presenter for mixed video + non-video sessions', () => {
    // 混在セッション（video と図形が同時に存在）は今回の対象外。
    // isSharedRendererExternalVideoOnlySession と
    // isSharedRendererNativeRenderOnlySession はどちらも「全 clip が同一種別」
    // を要求するため、混在セッションはどちらの判定にも該当せず reuse に乗らない
    // （挙動は predicate 自体の実装で保証される。ここでは両判定が
    //  互いに排他的な条件—video か非video かで分岐する—であることを固定する）。
    const code = viewportSource();
    const videoOnlyStart = code.indexOf('const isSharedRendererExternalVideoOnlySession = (');
    const videoOnlyEnd = code.indexOf('\n};', videoOnlyStart);
    const videoOnlyBlock = code.slice(videoOnlyStart, videoOnlyEnd);
    const nativeRenderOnlyStart = code.indexOf('const isSharedRendererNativeRenderOnlySession = (');
    const nativeRenderOnlyEnd = code.indexOf('\n};', nativeRenderOnlyStart);
    const nativeRenderOnlyBlock = code.slice(nativeRenderOnlyStart, nativeRenderOnlyEnd);

    expect(videoOnlyBlock).toContain("mediaKindById.get(clip.media_id) === 'Video'");
    expect(nativeRenderOnlyBlock).toContain("mediaKindById.get(clip.media_id) !== 'Video'");
  });
});
