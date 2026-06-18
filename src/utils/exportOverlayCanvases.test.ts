import { describe, expect, it } from 'vitest';
import { destroyExportOverlayCanvases } from './exportOverlayCanvases';

describe('destroyExportOverlayCanvases', () => {
  it('destroys overlay textures and clears the overlay map', () => {
    const destroyed: boolean[] = [];
    const overlays = new Map([
      ['video-1', { texture: { destroy: (destroyBase?: boolean) => destroyed.push(destroyBase === true) } }],
      ['video-2', { texture: { destroy: (destroyBase?: boolean) => destroyed.push(destroyBase === true) } }],
    ]);

    destroyExportOverlayCanvases(overlays);

    expect(destroyed).toEqual([true, true]);
    expect(overlays.size).toBe(0);
  });
});
