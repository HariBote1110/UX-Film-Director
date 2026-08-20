import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const oxidiseStageSource = () =>
  readFileSync(new URL('./OxidiseStageViewport.tsx', import.meta.url), 'utf8');
const viewportSource = () =>
  readFileSync(new URL('./Viewport.tsx', import.meta.url), 'utf8');
const synchroniserSource = () =>
  readFileSync(new URL('../utils/psdBillboardSync.ts', import.meta.url), 'utf8');

describe('oxidise-engine stage boundary (post Three.js swap)', () => {
  it('keeps the PSD composite synchroniser free of Canvas2D round trips', () => {
    const source = synchroniserSource();

    expect(source).not.toContain('document.createElement');
    expect(source).not.toContain('ImageData');
    expect(source).not.toContain('putImageData');
    expect(source).not.toContain('HTMLCanvasElement');
  });

  it('passes cached RGBA bytes and source identity from Viewport.tsx into the stage boundary', () => {
    const source = viewportSource();

    expect(source).toContain('fetchPsdCompositeRgba');
    expect(source).toContain('psdBillboardRgbaCacheRef');
    expect(source).toContain('rgba: cachedComposite.data');
    expect(source).toContain('sourceKey: cacheKey');
    expect(source).not.toContain('psdBillboardCanvasCacheRef');
    expect(source).not.toContain('fetchPsdCompositeCanvas');
  });

  it('OxidiseStageViewport does not depend on three.js', () => {
    const source = oxidiseStageSource();

    expect(source).not.toMatch(/from ['"]three['"]/);
    expect(source).not.toMatch(/from ['"]three\//);
    expect(source).not.toContain('THREE.');
  });

  it('OxidiseStageViewport uploads billboard RGBA bytes straight to StageRenderer#syncBillboard without a Canvas2D round trip', () => {
    const source = oxidiseStageSource();

    // syncBillboard は entry.rgba (fetchPsdCompositeRgba が返した生バイト列) を
    // そのまま wasm 側へ渡す。Canvas2D/ImageData を経由してビルボードテクスチャを
    // 作り直す処理があってはならない(readback→2Dキャンバスの export/snapshot 経路は
    // Viewport.tsx 側の別責務なので、このファイルには存在しないはず)。
    expect(source).toContain('renderer.syncBillboard(');
    expect(source).not.toContain('document.createElement');
    expect(source).not.toContain('putImageData');
    expect(source).not.toContain('new ImageData');
    expect(source).not.toContain('getContext(\'2d\')');
  });

  it('uses computeBillboardSyncPlan for source-key reuse semantics instead of an ad-hoc texture cache', () => {
    const source = oxidiseStageSource();

    expect(source).toContain('computeBillboardSyncPlan');
    expect(source).toContain('nextBillboardSourceKeys');
    expect(source).not.toContain('DataTexture');
    expect(source).not.toContain('CanvasTexture');
  });

  it('Viewport.tsx converts the readback path through a Canvas2D-backed snapshot canvas only for export/snapshot capture, not billboard upload', () => {
    const source = viewportSource();

    expect(source).toContain('readbackRgba');
    expect(source).toContain('stage3dSnapshotCanvasRef');
    expect(source).toContain('putImageData');
  });
});
