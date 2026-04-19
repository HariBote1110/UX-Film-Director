import { describe, expect, it } from 'vitest';
import {
  PSD_LAYER_TEXTURE_URL_PREFIX,
  isPsdLayerTextureUrl,
  psdLayerTextureUrl,
} from './psdTextureUrl';

describe('psdTextureUrl', () => {
  it('builds a stable internal URL from layer id', () => {
    expect(psdLayerTextureUrl('psd-layer-7')).toBe(`${PSD_LAYER_TEXTURE_URL_PREFIX}psd-layer-7`);
  });

  it('detects internal PSD layer texture URLs', () => {
    expect(isPsdLayerTextureUrl(psdLayerTextureUrl('x'))).toBe(true);
    expect(isPsdLayerTextureUrl('blob:mock')).toBe(false);
    expect(isPsdLayerTextureUrl('https://example.com/x.png')).toBe(false);
  });
});
