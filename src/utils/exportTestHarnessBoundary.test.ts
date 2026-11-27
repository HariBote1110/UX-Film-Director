import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const harnessSource = () =>
  readFileSync(new URL('../exportTest/exportTestHarness.ts', import.meta.url), 'utf8');

describe('export test harness boundary', () => {
  it('does not call the removed VideoDecoder proxy IPC channel', () => {
    const code = harnessSource();

    expect(code).not.toContain('resolve-4k-proxy-video');
    expect(code).toContain('resolveExportHarnessProxyVideo');
  });
});
