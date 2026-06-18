import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = () =>
  readFileSync(new URL('../hooks/useProjectExport.ts', import.meta.url), 'utf8');

describe('useProjectExport legacy browser dependency boundary', () => {
  it('does not load legacy browser video providers from the production export hook', () => {
    const code = source();

    expect(code).not.toContain("from '../utils/videoFrameProvider'");
    expect(code).not.toContain("from '../utils/playbackFrameProvider'");
    expect(code).not.toContain("import('../utils/videoFrameProvider')");
    expect(code).not.toContain("import('../utils/playbackFrameProvider')");
  });

  it('loads the WebCodecs encoder only from the compatibility export branch', () => {
    const code = source();

    expect(code).not.toContain("from '../utils/videoExportPipeline'");
    expect(code).toContain("import('../utils/videoExportPipeline')");
  });

  it('does not keep legacy browser video provider gates in the production export hook', () => {
    const code = source();

    expect(code).not.toContain('shouldLoadLegacyBrowserVideoProviders');
    expect(code).not.toContain('requiresHtmlVideoElementSeekFallback');
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
});
