export interface ExportOverlayTextureForCleanup {
  destroy: (destroyBase?: boolean) => void;
}

export interface ExportOverlayForCleanup {
  texture: ExportOverlayTextureForCleanup;
}

export const destroyExportOverlayCanvases = (
  overlays: Map<string, ExportOverlayForCleanup>
): void => {
  overlays.forEach((overlay) => {
    overlay.texture.destroy(true);
  });
  overlays.clear();
};
