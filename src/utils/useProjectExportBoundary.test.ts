import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = () =>
  readFileSync(new URL('../hooks/useProjectExport.ts', import.meta.url), 'utf8');

describe('useProjectExport legacy browser dependency boundary', () => {
  it('loads browser decode providers and WebCodecs encoder only from legacy branches', () => {
    const code = source();

    expect(code).not.toContain("from '../utils/videoFrameProvider'");
    expect(code).not.toContain("from '../utils/playbackFrameProvider'");
    expect(code).not.toContain("from '../utils/videoExportPipeline'");
    expect(code).toContain("import('../utils/videoFrameProvider')");
    expect(code).toContain("import('../utils/playbackFrameProvider')");
    expect(code).toContain("import('../utils/videoExportPipeline')");
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
      code.indexOf('if (frameRuntimePlan.usesExportFrameOverrides && exportFrameOverridesRef)')
    );
  });
});
