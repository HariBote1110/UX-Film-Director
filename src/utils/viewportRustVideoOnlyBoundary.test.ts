import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewportSource = () =>
  readFileSync(new URL('../components/Viewport.tsx', import.meta.url), 'utf8');

const pixiRenderHelperSource = () =>
  readFileSync(new URL('./pixiRenderHelper.ts', import.meta.url), 'utf8');

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

  it('does not route Pixi video cleanup through the stale Pixi video cutover gate', () => {
    const code = pixiRenderHelperSource();
    const start = code.indexOf("} else if (obj.type === 'video') {");
    const end = code.indexOf("} else if (obj.type === 'audio_visualization')", start);
    const videoBlock = code.slice(start, end);

    expect(code).toContain("obj.type === 'video'");
    expect(videoBlock).toContain('hidePixiChildrenForSharedRendererCutover(container.children)');
    expect(videoBlock).not.toContain('removeChildren()');
    expect(code).not.toContain('pixiVideoCutover');
    expect(code).not.toContain('resolvePixiVideoRenderPath');
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
    expect(nativeOverlayEffectBlock).toContain("document.addEventListener('fullscreenchange', attach)");
    expect(nativeOverlayEffectBlock).toContain("document.addEventListener('visibilitychange', attach)");
    expect(nativeOverlayEffectBlock).toContain("window.addEventListener('focus', attach)");
    expect(nativeOverlayEffectBlock).toContain("window.addEventListener('pageshow', attach)");
    expect(nativeOverlayEffectBlock).toContain("visualViewport?.removeEventListener('resize', attach)");
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

    expect(nativeReuseBlock).toContain('if (nativeOverlayPreviewEnabled) {');
    expect(nativeReuseBlock).toContain('prepareSharedRendererViewportNativeOverlayPresent({');
    expect(nativeReuseBlock).toContain('activeJob: sharedRendererVideoDecodeJobsRef.current[0] ?? null');
    expect(nativeReuseBlock).toContain('sharedRendererVideoDecodeJobsRef.current = result.ok ? [result.activeJob] : []');
    expect(nativeReuseBlock).toContain('presentPreparedNativeRenderFrame(result.upload)');
    expect(nativeReuseBlock.indexOf('if (nativeOverlayPreviewEnabled) {')).toBeLessThan(
      nativeReuseBlock.indexOf('presentPreparedNativeRenderFrame(result.upload)')
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
    const pendingStart = code.indexOf('if (isPlaying && sharedRendererPresenterStartingRef.current)');
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

  it('threads preview decode settings into rust-only native reuse uploads', () => {
    const code = viewportSource();
    const start = code.indexOf('const result = await prepareSharedRendererViewportNativeRenderUpload({');
    const end = code.indexOf('});', start);
    const nativeReuseUploadBlock = code.slice(start, end);

    expect(nativeReuseUploadBlock).toContain('sourceSlotCount: SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT');
    expect(nativeReuseUploadBlock).toContain('maxDecodeEdge: SHARED_RENDERER_PLAYBACK_DECODE_MAX_EDGE');
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

  it('does not let pixiRenderHelper create legacy HTMLVideoElement or Pixi VideoSource fallbacks', () => {
    const code = pixiRenderHelperSource();

    expect(code).not.toContain("document.createElement('video')");
    expect(code).not.toContain('new PIXI.VideoSource');
    expect(code).not.toContain('ensureVideoFrameTextureState');
    expect(code).not.toContain('drawVideoFrameToTexture');
    expect(code).not.toContain('shouldReplacePixiVideoElementSource');
  });

  it('does not keep stale Pixi video sprite crop helpers after video cutover', () => {
    const code = pixiRenderHelperSource();

    expect(code).not.toContain('VideoObject');
    expect(code).not.toContain('evaluateSubjectCropNormRectAtTime');
    expect(code).not.toContain('applyVideoSubjectCropMask');
    expect(code).not.toContain("obj.type === 'image' || obj.type === 'video'");
  });
});
