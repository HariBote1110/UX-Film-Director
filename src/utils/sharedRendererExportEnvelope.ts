import { resolveMixedNativeRenderUnsupportedMedia } from './sharedRendererNativeRenderMediaGate';
import type { SharedRendererPreviewSurfaceGate } from './sharedRendererPreviewSurface';

export type SharedRendererNativeRenderEnvelope =
  | {
      ok: true;
      mediaCount: number;
      mediaKinds: string[];
      sourceCount: number;
      sourceMediaIds: string[];
    }
  | {
      ok: false;
      reason: 'surfaceGateUnavailable' | 'nativeRenderUnsupportedMedia';
      detail: string;
    };

export const buildSharedRendererExportNativeRenderEnvelope = (
  surfaceGate: SharedRendererPreviewSurfaceGate
): SharedRendererNativeRenderEnvelope => {
  if (!surfaceGate.ok) {
    return {
      ok: false,
      reason: 'surfaceGateUnavailable',
      detail: surfaceGate.detail,
    };
  }

  const unsupportedMedia = resolveMixedNativeRenderUnsupportedMedia({
    snapshot: surfaceGate.snapshot,
    media: surfaceGate.media,
  });
  if (unsupportedMedia) {
    return {
      ok: false,
      reason: 'nativeRenderUnsupportedMedia',
      detail: unsupportedMedia,
    };
  }

  const sourceMediaIds = surfaceGate.media
    .filter((reference) => reference.kind === 'Video')
    .map((reference) => reference.id);

  return {
    ok: true,
    mediaCount: surfaceGate.media.length,
    mediaKinds: surfaceGate.media.map((reference) => reference.kind),
    sourceCount: sourceMediaIds.length,
    sourceMediaIds,
  };
};
