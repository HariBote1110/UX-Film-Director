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

  it('does not name the export canvas provider after Pixi internals', () => {
    const code = viewportSource();
    const start = code.indexOf('const getExportCanvas = useCallback');
    const end = code.indexOf('const getRustExportFrameSource = useCallback', start);
    const getExportCanvasBlock = code.slice(start, end);

    expect(getExportCanvasBlock).not.toContain('pixiCanvas');
  });

  it('keeps a legacy HTMLVideoElement preview fallback while Rust video preview is incomplete', () => {
    const code = pixiRenderHelperSource();

    expect(code).toContain("document.createElement('video')");
    expect(code).toContain('ensureVideoFrameTextureState');
    expect(code).toContain('drawVideoFrameToTexture');
  });

  it('keeps Pixi video fallback scoped to preview without restoring subject crop helpers', () => {
    const code = pixiRenderHelperSource();

    expect(code).not.toContain('evaluateSubjectCropNormRectAtTime');
    expect(code).not.toContain('applyVideoSubjectCropMask');
    expect(code).not.toContain("obj.type === 'image' || obj.type === 'video'");
  });
});
