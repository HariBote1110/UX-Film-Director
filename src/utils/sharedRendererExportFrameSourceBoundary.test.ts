import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = () =>
  readFileSync(new URL('./sharedRendererExportFrameSource.ts', import.meta.url), 'utf8');

const testSource = () =>
  readFileSync(new URL('./sharedRendererExportFrameSource.test.ts', import.meta.url), 'utf8');

const jsSharedFrameWriterPath = () =>
  new URL('./rustBackendVideoEncodeSharedFrameWriter.ts', import.meta.url);

describe('shared renderer export frame source dependency boundary', () => {
  it('does not load the JS shared-frame writer from the export frame source', () => {
    const code = source();

    expect(code).not.toMatch(
      /import\s*\{[^}]*createRustBackendVideoEncodeSharedFrameWriter[^}]*\}\s*from\s*['"]\.\/rustBackendVideoEncodeSharedFrameWriter['"]/
    );
    expect(code).not.toContain("import('./rustBackendVideoEncodeSharedFrameWriter')");
    expect(code).not.toContain('createRustBackendVideoEncodeSharedFrameWriter');
  });

  it('does not keep JS shared-frame writer fixtures in export frame source tests', () => {
    const code = testSource();

    expect(code).not.toContain('createEncodeFrameWriter');
  });

  it('does not expose the removed WebGPU readback writer diagnostic path', () => {
    const code = source();

    expect(code).not.toContain('webGpuReadbackSharedFrameWriter');
  });

  it('does not keep WebGPU readback fixtures in export frame source tests', () => {
    const code = testSource();

    expect(code).not.toContain('readPresentedFrameRgbaBytes');
  });

  it('does not keep the removed JS shared-frame writer module', () => {
    expect(existsSync(jsSharedFrameWriterPath())).toBe(false);
  });
});
