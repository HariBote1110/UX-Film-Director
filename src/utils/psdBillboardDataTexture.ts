import * as THREE from 'three';
import type { PsdCompositeRgba } from './psdBillboardSync';

export interface PsdBillboardDataTextureSource extends PsdCompositeRgba {
  sourceKey: string;
}

export interface PsdBillboardDataTextureState {
  sourceKey: string;
  texture: THREE.DataTexture;
}

/**
 * CanvasTexture の表示特性を維持したまま、PSD の straight-alpha RGBA8 を
 * GPU テクスチャへ直接渡す。
 */
export const createPsdBillboardDataTexture = (
  source: PsdBillboardDataTextureSource
): THREE.DataTexture => {
  const texture = new THREE.DataTexture(
    source.data,
    source.width,
    source.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.premultiplyAlpha = false;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
};

/**
 * 同じ合成キャッシュキーでは既存テクスチャを再利用し、毎tickのGPU再転送を
 * 避ける。キーが変わった場合は寸法変更もあり得るため、新規作成して置換する。
 */
export const syncPsdBillboardDataTexture = (
  current: PsdBillboardDataTextureState | undefined,
  source: PsdBillboardDataTextureSource
): PsdBillboardDataTextureState => {
  if (current?.sourceKey === source.sourceKey) {
    return current;
  }

  current?.texture.dispose();
  return {
    sourceKey: source.sourceKey,
    texture: createPsdBillboardDataTexture(source),
  };
};

export const disposeRemovedPsdBillboardDataTextures = (
  textures: Map<string, PsdBillboardDataTextureState>,
  activeIds: Set<string>
): void => {
  textures.forEach((state, id) => {
    if (activeIds.has(id)) return;
    state.texture.dispose();
    textures.delete(id);
  });
};

export const disposePsdBillboardDataTextures = (
  textures: Map<string, PsdBillboardDataTextureState>
): void => {
  textures.forEach(({ texture }) => texture.dispose());
  textures.clear();
};
