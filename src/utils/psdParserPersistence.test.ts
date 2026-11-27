import { describe, expect, it } from 'vitest';
import type { PsdLayerNode } from '../types';
import { stripPsdLayerNodeForPersistence } from './psdParser';

describe('stripPsdLayerNodeForPersistence', () => {
  it('removes textureSource and preserves tree metadata', () => {
    const leaf: PsdLayerNode = {
      id: 'psd-layer-0',
      name: 'Layer',
      isGroup: false,
      isRadio: false,
      children: [],
      width: 64,
      height: 64,
      left: 0,
      top: 0,
      defaultVisible: true,
      src: 'uxfd:psd-layer:psd-layer-0',
      textureSource: {} as ImageBitmap,
    };
    const root: PsdLayerNode = {
      id: 'root',
      name: 'Root',
      isGroup: true,
      isRadio: false,
      children: [leaf],
      width: 100,
      height: 100,
      left: 0,
      top: 0,
      defaultVisible: true,
    };

    const stripped = stripPsdLayerNodeForPersistence(root);
    expect(stripped.children[0].textureSource).toBeUndefined();
    expect(stripped.children[0].src).toBe('uxfd:psd-layer:psd-layer-0');
    expect(stripped.children[0].name).toBe('Layer');
  });
});
