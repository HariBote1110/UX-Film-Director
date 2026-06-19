import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = () =>
  readFileSync(new URL('../hooks/useProjectExport.ts', import.meta.url), 'utf8');

const compatibilityEncoderSource = () =>
  readFileSync(new URL('./projectExportCompatibilityEncoder.ts', import.meta.url), 'utf8');

const exportProgressModalSource = () =>
  readFileSync(new URL('../components/ExportProgressModal.tsx', import.meta.url), 'utf8');

describe('useProjectExport legacy browser dependency boundary', () => {
  it('does not load legacy browser video providers from the production export hook', () => {
    const code = source();

    expect(code).not.toContain("from '../utils/videoFrameProvider'");
    expect(code).not.toContain("from '../utils/playbackFrameProvider'");
    expect(code).not.toContain("import('../utils/videoFrameProvider')");
    expect(code).not.toContain("import('../utils/playbackFrameProvider')");
  });

  it('loads the WebCodecs encoder only from the compatibility export adapter', () => {
    const code = source();
    const adapterCode = compatibilityEncoderSource();

    expect(code).not.toContain("from '../utils/videoExportPipeline'");
    expect(code).not.toContain("import('../utils/videoExportPipeline')");
    expect(adapterCode).toContain("import('./videoExportPipeline')");
  });

  it('refuses video objects before opening the WebCodecs compatibility export stream', () => {
    const code = source();

    expect(code).toContain('if (hasVideoObjects) {');
    expect(code).toContain('Video export requires the Rust backend encoder before opening the WebCodecs export stream.');
    expect(code.indexOf('Video export requires the Rust backend encoder before opening the WebCodecs export stream.')).toBeLessThan(
      code.indexOf("ipcRenderer.invoke('export-stream-open'")
    );
  });

  it('does not keep legacy browser video provider gates in the production export hook', () => {
    const code = source();

    expect(code).not.toContain('shouldLoadLegacyBrowserVideoProviders');
    expect(code).not.toContain('requiresHtmlVideoElementSeekFallback');
  });

  it('does not accept HTMLVideoElement refs in the production export hook', () => {
    const code = source();

    expect(code).not.toContain('videoElementsRef');
    expect(code).not.toContain('pauseLegacyBrowserVideosForExport');
    expect(code).not.toContain('HTMLVideoElement');
  });

  it('does not keep the unused VideoFrameProvider module in production utils', () => {
    expect(existsSync(new URL('./videoFrameProvider.ts', import.meta.url))).toBe(false);
  });

  it('keeps legacy browser playback frame providers out of production utils', () => {
    expect(existsSync(new URL('./playbackFrameProvider.ts', import.meta.url))).toBe(false);
    expect(existsSync(new URL('./frameProvider.ts', import.meta.url))).toBe(false);
  });

  it('keeps stale Pixi export overlay canvas utilities out of production utils', () => {
    expect(existsSync(new URL('./exportOverlayCanvases.ts', import.meta.url))).toBe(false);
  });

  it('resolves Rust frame source context outside the hook body', () => {
    const code = source();

    expect(code).toContain('resolveProjectExportRustFrameSourceContext');
    expect(code).toContain('encodeEngine: exportEncodePlan.engine');
  });

  it('passes the native/Rust presented-frame handoff into Rust export frame sources', () => {
    const code = source();

    expect(code).toContain("import { createSharedVideoFramePresentedFrameTaker } from '../utils/sharedVideoFramePresentedFrameHandoff'");
    expect(code).toContain('presentedFrameSharedFrameTaker: createSharedVideoFramePresentedFrameTaker() ?? undefined');
  });

  it('replaces the runtime plan in the same frame after the Rust frame source is blocked', () => {
    const code = source();

    expect(code).toContain('let frameRuntimePlan = resolveProjectExportFrameRuntimePlan({');
    expect(code).toContain('frameRuntimePlan = blockedRuntimePlan;');
    expect(code.indexOf('frameRuntimePlan = blockedRuntimePlan;')).toBeLessThan(
      code.indexOf('if (frameRuntimePlan.requiresRenderScene)')
    );
  });

  it('uses a single-use closer for Rust export frame source cleanup', () => {
    const code = source();

    expect(code).toContain('createSingleUseProjectExportFrameSourceCloser');
    expect(code).not.toContain('exportFrameSourcePlan.frameSource.close?.()');
  });

  it('passes native render output release diagnostics into export progress', () => {
    const code = source();

    expect(code).toContain('onNativeRenderOutputRelease: (event) => {');
    expect(code).toContain('nativeRenderOutputRelease: event');
  });

  it('publishes Rust frame source blocked diagnostics before failing or falling back', () => {
    const code = source();

    expect(code).toContain('rustFrameSourceBlocked: {');
    expect(code).toContain('detail: error.message');
    expect(code).toContain('legacyCanvasFallbackAllowed: error.legacyCanvasFallbackAllowed');
    expect(code.indexOf('rustFrameSourceBlocked: {')).toBeLessThan(
      code.indexOf('if (blockedRuntimePlan.shouldFailOnRustFrameSourceBlocked)')
    );
  });

  it('preserves Rust frame source blocked diagnostics across rendering progress ticks', () => {
    const code = source();

    expect(code).toContain("import { updateExportProgressPhase } from '../utils/exportProgressDiagnostics'");
    expect(code).toContain('const progress = useStore.getState().exportProgress;');
    expect(code).toContain('setExportProgress(updateExportProgressPhase(progress, {');
    expect(code).toContain("phase: 'rendering'");
  });

  it('preserves Rust diagnostics when the export enters the saving phase', () => {
    const code = source();

    expect(code).toContain('const savingProgress = useStore.getState().exportProgress;');
    expect(code).toContain('setExportProgress(updateExportProgressPhase(savingProgress, {');
    expect(code).toContain("phase: 'saving'");
  });

  it('logs the retained Rust export diagnostics after export cleanup', () => {
    const code = source();

    expect(code).toContain("import { logLastExportDiagnostics } from '../utils/exportDiagnosticsLog'");
    expect(code).toContain('setExporting(false);');
    expect(code).toContain('logLastExportDiagnostics(useStore.getState().lastExportDiagnostics);');
    expect(code.indexOf('setExporting(false);')).toBeLessThan(
      code.indexOf('logLastExportDiagnostics(useStore.getState().lastExportDiagnostics);')
    );
  });

  it('renders native render output release diagnostics from export progress', () => {
    const code = exportProgressModalSource();

    expect(code).toContain('exportProgress?.nativeRenderOutputRelease');
    expect(code).toContain('formatNativeRenderOutputReleaseDiagnostic');
  });
});
