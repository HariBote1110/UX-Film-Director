import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = () =>
  readFileSync(new URL('./TimelineContextMenu.tsx', import.meta.url), 'utf8');

describe('TimelineContextMenu particle insertion boundary', () => {
  it('exposes the AviUtlPackV4 standard particle insertion command', () => {
    const code = source();

    expect(code).toContain('buildDefaultStandardParticleObject');
    expect(code).toContain('handleAddParticle');
    expect(code).toContain('Add Standard Particle');
    expect(code).toContain('標準パーティクルを追加');
  });
});
