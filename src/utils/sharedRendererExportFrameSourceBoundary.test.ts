import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = () =>
  readFileSync(new URL('./sharedRendererExportFrameSource.ts', import.meta.url), 'utf8');

describe('shared renderer export frame source dependency boundary', () => {
  it('loads the JS shared-frame writer only from the readback fallback path', () => {
    const code = source();

    expect(code).not.toMatch(
      /import\s*\{[^}]*createRustBackendVideoEncodeSharedFrameWriter[^}]*\}\s*from\s*['"]\.\/rustBackendVideoEncodeSharedFrameWriter['"]/
    );
    expect(code).toContain("import('./rustBackendVideoEncodeSharedFrameWriter')");
  });
});
