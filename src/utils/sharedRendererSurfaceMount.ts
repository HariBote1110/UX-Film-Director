export interface ShouldMountSharedRendererSurfaceCanvasInput {
  previewEnabled: boolean;
  exportEnabled: boolean;
}

export const shouldMountSharedRendererSurfaceCanvas = ({
  previewEnabled,
  exportEnabled,
}: ShouldMountSharedRendererSurfaceCanvasInput): boolean =>
  previewEnabled || exportEnabled;
