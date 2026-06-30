import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('Native Overlay parity boundary', () => {
  it('exposes a CI command for the overlay, WebGPU preview, and export readback parity gate', () => {
    expect(packageJson.scripts['test:native-overlay-parity'])
      .toBe('cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test overlay_surface_parity');

    const parityDoc = read('markdown/architecture/04-render-parity.md');
    expect(parityDoc).toContain('Native Overlay Phase 6 3経路 parity gate');
    expect(parityDoc).toContain('overlay surface');
    expect(parityDoc).toContain('WebGPU preview');
    expect(parityDoc).toContain('export readback');
    expect(parityDoc).toContain('test:native-overlay-parity');
    expect(parityDoc).toContain('max channel delta = 0');
  });
});
