import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viteEnvSource = () =>
  readFileSync(new URL('../vite-env.d.ts', import.meta.url), 'utf8');

describe('Vite env boundary', () => {
  it('declares Phase 0 benchmark flags in renderer env types', () => {
    const viteEnv = viteEnvSource();

    expect(viteEnv).toContain('readonly VITE_UXFD_PHASE0_SKIP_DECODED_UPLOAD?: string;');
    expect(viteEnv).toContain('readonly VITE_UXFD_PHASE0_WRITE_TEXTURE_NOOP?: string;');
    expect(viteEnv).toContain('readonly VITE_UXFD_PHASE0_DISCARD_NATIVE_RENDER_OUTPUT?: string;');
  });
});
