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

  it('requests encode-only Rust frame sources for the Rust backend encoder path', () => {
    const code = source();

    expect(code).toContain("preferEncodeOnly: exportEncodePlan.engine === 'rustBackendVideoEncoder'");
  });

  it('passes the native/Rust presented-frame handoff into Rust export frame sources', () => {
    const code = source();

    expect(code).toContain("import { createSharedVideoFramePresentedFrameTaker } from '../utils/sharedVideoFramePresentedFrameHandoff'");
    expect(code).toContain('presentedFrameSharedFrameTaker: createSharedVideoFramePresentedFrameTaker() ?? undefined');
  });
});
