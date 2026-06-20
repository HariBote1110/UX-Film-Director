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

    expect(code).toContain("obj.type === 'video'");
    expect(code).toContain('container.removeChildren()');
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

  it('publishes shared renderer presenter start count for playback performance diagnostics', () => {
    const code = viewportSource();
    const start = code.indexOf('void startSharedRendererViewportPresenter({');
    const beforePresenterStartBlock = code.slice(0, start);

    expect(code).toContain('sharedRendererPresenterStartCountRef');
    expect(beforePresenterStartBlock).toContain('uxfdSharedRendererPresenterStartCount');
    expect(beforePresenterStartBlock).toContain('sharedRendererPresenterStartCountRef.current += 1');
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
    expect(presenterKeyBlock).toContain('includePlaybackFrame: !canReuseExternalVideoPresenter');
    expect(effectKeyBlock).toContain('includePlaybackFrame: !canReuseCurrentPresenterSession');
    expect(presenterKeyBlock).toContain('syncSharedRendererExternalVideoSources({');
    expect(presenterKeyBlock).toContain('presentExternalVideoFrameScene?.({');
    expect(presenterKeyBlock).toContain('publishSharedRendererExternalVideoPresentationDiagnostics(');
    expect(presenterKeyBlock.indexOf('syncSharedRendererExternalVideoSources({')).toBeLessThan(
      presenterKeyBlock.indexOf('presentExternalVideoFrameScene?.({')
    );
    expect(pendingBlock).toContain('sharedRendererPendingPreviewSessionRef.current = session');
    expect(pendingBlock).not.toContain('if (!sharedRendererPendingPreviewSessionRef.current)');
  });

  it('throttles external video playback sync while the presenter is reused', () => {
    const code = viewportSource();
    const syncStart = code.indexOf('syncSharedRendererExternalVideoPlayback({');
    const syncEnd = code.indexOf('});', syncStart);
    const syncBlock = code.slice(syncStart, syncEnd);

    expect(code).toContain('SHARED_RENDERER_EXTERNAL_VIDEO_PLAYING_SYNC_INTERVAL_MS = 75');
    expect(syncBlock).toContain('minimumPlayingSyncIntervalMs: SHARED_RENDERER_EXTERNAL_VIDEO_PLAYING_SYNC_INTERVAL_MS');
  });

  it('disposes external video sources before export presenter starts without them', () => {
    const code = viewportSource();
    const start = code.indexOf('let externalVideoSourcesByClipId =');
    const end = code.indexOf('sharedRendererPresenterStartingRef.current = true;', start);
    const externalSourceBlock = code.slice(start, end);

    expect(externalSourceBlock).toContain('if (isExporting) {');
    expect(externalSourceBlock).toContain('disposeSharedRendererExternalVideoSources(sharedRendererExternalVideoSourcesRef.current)');
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
