import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the Electron main bundle: `ws` optionally requires the
 * native peer dependencies `bufferutil` and `utf-8-validate` inside a
 * try/catch. If the main-process bundler tries to resolve them at build/load
 * time instead of leaving them as runtime requires, app start-up throws
 * "Could not resolve \"bufferutil\" imported by \"ws\"". They must therefore
 * be declared external in the main-process build config.
 */
describe('remote deck build boundary', () => {
  it('marks ws optional native deps as external in the electron main build', () => {
    const viteConfig = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf8');
    expect(viteConfig).toContain("'bufferutil'");
    expect(viteConfig).toContain("'utf-8-validate'");
    expect(viteConfig).toContain('external');
  });
});
