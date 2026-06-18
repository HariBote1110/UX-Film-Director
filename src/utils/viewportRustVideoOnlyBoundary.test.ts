import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewportSource = () =>
  readFileSync(new URL('../components/Viewport.tsx', import.meta.url), 'utf8');

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
    expect(readinessBlock).toContain('requireSharedRendererVideo: sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled');
  });

  it('uses Rust/shared renderer video cutover for Pixi content routing instead of HTMLVideoElement fallback', () => {
    const code = viewportSource();
    const start = code.indexOf('const content = updatePixiContent(obj, container, time, {');
    const end = code.indexOf('});', start);
    const updatePixiContentBlock = code.slice(start, end);

    expect(updatePixiContentBlock).toContain('requireSharedRendererVideo: sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled');
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

  it('does not opt the Viewport back into legacy Pixi video rendering', () => {
    const code = viewportSource();

    expect(code).not.toContain('allowLegacyPixiVideo');
  });
});
