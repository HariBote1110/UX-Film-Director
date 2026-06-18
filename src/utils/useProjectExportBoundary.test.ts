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
    expect(code).toContain("await import('../utils/videoFrameProvider')");
    expect(code).toContain("await import('../utils/playbackFrameProvider')");
    expect(code).toContain("await import('../utils/videoExportPipeline')");
  });
});
