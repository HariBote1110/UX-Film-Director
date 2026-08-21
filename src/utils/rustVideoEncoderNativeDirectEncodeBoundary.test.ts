import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

describe('rustVideoEncoder native direct encode boundary', () => {
  it('enables the IOSurface/VideoToolbox direct encode path by default and only disables it explicitly', () => {
    const preload = readFileSync(resolve(root, 'electron/preload.ts'), 'utf8');

    expect(preload).toContain(
      "nativeDirectEncodeEnabled: process.env.VITE_UXFD_NATIVE_DIRECT_ENCODE !== '0',"
    );
    expect(preload).not.toContain(
      "nativeDirectEncodeEnabled: process.env.VITE_UXFD_NATIVE_DIRECT_ENCODE === '1',"
    );
  });
});
