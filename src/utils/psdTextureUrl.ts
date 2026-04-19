/** Virtual URL prefix for PSD layer rasters held as ImageBitmap (no PNG blob round-trip). */
export const PSD_LAYER_TEXTURE_URL_PREFIX = 'uxfd:psd-layer:' as const;

export const psdLayerTextureUrl = (layerId: string): string =>
  `${PSD_LAYER_TEXTURE_URL_PREFIX}${layerId}`;

export const isPsdLayerTextureUrl = (url: string): boolean =>
  url.startsWith(PSD_LAYER_TEXTURE_URL_PREFIX);
