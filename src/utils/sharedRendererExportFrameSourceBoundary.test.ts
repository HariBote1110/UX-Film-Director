import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = () =>
  readFileSync(new URL('./sharedRendererExportFrameSource.ts', import.meta.url), 'utf8');

describe('shared renderer export frame source dependency boundary', () => {
  it('does not load the JS shared-frame writer from the export frame source', () => {
    const code = source();

    expect(code).not.toMatch(
      /import\s*\{[^}]*createRustBackendVideoEncodeSharedFrameWriter[^}]*\}\s*from\s*['"]\.\/rustBackendVideoEncodeSharedFrameWriter['"]/
    );
    expect(code).not.toContain("import('./rustBackendVideoEncodeSharedFrameWriter')");
    expect(code).not.toContain('createRustBackendVideoEncodeSharedFrameWriter');
  });
});
