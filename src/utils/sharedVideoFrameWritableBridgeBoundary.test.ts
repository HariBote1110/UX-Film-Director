import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('shared video frame writable bridge boundary', () => {
  it('does not expose renderer-side writable shared-frame writer APIs', () => {
    expect(existsSync(resolve(root, 'src/utils/sharedVideoFrameWritableBridge.ts'))).toBe(false);
    expect(existsSync(resolve(root, 'src/utils/sharedVideoFrameWritableBridge.test.ts'))).toBe(false);

    const preload = readFileSync(resolve(root, 'electron/preload.ts'), 'utf8');
    const windowTypes = readFileSync(resolve(root, 'src/vite-env.d.ts'), 'utf8');
    const exposedRendererSurface = `${preload}\n${windowTypes}`;

    expect(exposedRendererSurface).not.toContain('createWritableSharedFrameRing');
    expect(exposedRendererSurface).not.toContain('writeIntoSharedFrameRing');
    expect(exposedRendererSurface).not.toContain('closeWritableSharedFrameRing');
  });
});
