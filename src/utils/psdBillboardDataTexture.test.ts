import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createPsdBillboardDataTexture,
  disposePsdBillboardDataTextures,
  disposeRemovedPsdBillboardDataTextures,
  syncPsdBillboardDataTexture,
  type PsdBillboardDataTextureState,
} from './psdBillboardDataTexture';

const source = (
  sourceKey: string,
  width = 2,
  height = 1,
  data = new Uint8Array(width * height * 4)
) => ({
  sourceKey,
  data,
  width,
  height,
});

describe('createPsdBillboardDataTexture', () => {
  it('creates a CanvasTexture-compatible sRGB texture over the original RGBA byte view', () => {
    const composite = source('standing.psd::face-open');

    const texture = createPsdBillboardDataTexture(composite);

    expect(texture).toBeInstanceOf(THREE.DataTexture);
    expect(texture.isDataTexture).toBe(true);
    expect((texture as THREE.DataTexture & { isCanvasTexture?: boolean }).isCanvasTexture).not.toBe(true);
    expect(texture.image.data).toBe(composite.data);
    expect(texture.image.width).toBe(2);
    expect(texture.image.height).toBe(1);
    expect(texture.format).toBe(THREE.RGBAFormat);
    expect(texture.type).toBe(THREE.UnsignedByteType);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.flipY).toBe(true);
    expect(texture.premultiplyAlpha).toBe(false);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.unpackAlignment).toBe(1);
    expect(texture.version).toBeGreaterThan(0);
  });
});

describe('syncPsdBillboardDataTexture', () => {
  it('reuses the texture without another upload while its source key is unchanged', () => {
    const composite = source('standing.psd::face-open');
    const initial = syncPsdBillboardDataTexture(undefined, composite);
    const initialVersion = initial.texture.version;

    const next = syncPsdBillboardDataTexture(initial, composite);

    expect(next).toBe(initial);
    expect(next.texture.version).toBe(initialVersion);
  });

  it('disposes and replaces the texture when the source key changes', () => {
    const initial = syncPsdBillboardDataTexture(undefined, source('standing.psd::face-open'));
    const dispose = vi.spyOn(initial.texture, 'dispose');
    const replacementSource = source('standing.psd::face-closed', 1, 2);

    const next = syncPsdBillboardDataTexture(initial, replacementSource);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(next).not.toBe(initial);
    expect(next.sourceKey).toBe('standing.psd::face-closed');
    expect(next.texture.image.data).toBe(replacementSource.data);
    expect(next.texture.image.width).toBe(1);
    expect(next.texture.image.height).toBe(2);
  });
});

describe('PSD billboard DataTexture disposal', () => {
  it('disposes and removes only textures for billboards no longer present', () => {
    const gone = syncPsdBillboardDataTexture(undefined, source('gone'));
    const live = syncPsdBillboardDataTexture(undefined, source('live'));
    const goneDispose = vi.spyOn(gone.texture, 'dispose');
    const liveDispose = vi.spyOn(live.texture, 'dispose');
    const textures = new Map<string, PsdBillboardDataTextureState>([
      ['gone', gone],
      ['live', live],
    ]);

    disposeRemovedPsdBillboardDataTextures(textures, new Set(['live']));

    expect(goneDispose).toHaveBeenCalledTimes(1);
    expect(liveDispose).not.toHaveBeenCalled();
    expect(textures.has('gone')).toBe(false);
    expect(textures.get('live')).toBe(live);
  });

  it('disposes every remaining texture on teardown', () => {
    const first = syncPsdBillboardDataTexture(undefined, source('first'));
    const second = syncPsdBillboardDataTexture(undefined, source('second'));
    const firstDispose = vi.spyOn(first.texture, 'dispose');
    const secondDispose = vi.spyOn(second.texture, 'dispose');
    const textures = new Map<string, PsdBillboardDataTextureState>([
      ['first', first],
      ['second', second],
    ]);

    disposePsdBillboardDataTextures(textures);

    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).toHaveBeenCalledTimes(1);
    expect(textures.size).toBe(0);
  });
});
