import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const threeStageSource = () =>
  readFileSync(new URL('./ThreeStageViewport.tsx', import.meta.url), 'utf8');
const viewportSource = () =>
  readFileSync(new URL('./Viewport.tsx', import.meta.url), 'utf8');
const synchroniserSource = () =>
  readFileSync(new URL('../utils/psdBillboardSync.ts', import.meta.url), 'utf8');

describe('PSD billboard DataTexture boundary', () => {
  it('keeps the PSD composite synchroniser free of Canvas2D round trips', () => {
    const source = synchroniserSource();

    expect(source).not.toContain('document.createElement');
    expect(source).not.toContain('ImageData');
    expect(source).not.toContain('putImageData');
    expect(source).not.toContain('HTMLCanvasElement');
  });

  it('passes cached RGBA bytes and source identity into the Three.js boundary', () => {
    const source = viewportSource();

    expect(source).toContain('fetchPsdCompositeRgba');
    expect(source).toContain('psdBillboardRgbaCacheRef');
    expect(source).toContain('rgba: cachedComposite.data');
    expect(source).toContain('sourceKey: cacheKey');
    expect(source).not.toContain('psdBillboardCanvasCacheRef');
    expect(source).not.toContain('fetchPsdCompositeCanvas');
  });

  it('uses managed DataTextures without retaining the CanvasTexture path', () => {
    const source = threeStageSource();

    expect(source).toContain('Map<string, PsdBillboardDataTextureState>');
    expect(source).toContain('syncPsdBillboardDataTexture');
    expect(source).toContain('disposeRemovedPsdBillboardDataTextures');
    expect(source).toContain('disposePsdBillboardDataTextures');
    expect(source).not.toContain('THREE.CanvasTexture');
    expect(source).not.toContain('new THREE.CanvasTexture');
  });
});
