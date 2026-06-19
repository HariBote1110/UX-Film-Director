export interface ProjectExportLegacyCanvasCaptureInput {
  canvas: HTMLCanvasElement;
  sx?: number;
  sy?: number;
  width: number;
  height: number;
  timestamp: number;
}

export interface ProjectExportLegacyCanvasCapturedFrame {
  timestamp: number;
  bitmap: ImageBitmap;
}

export const captureProjectExportLegacyCanvasFrame = async ({
  canvas,
  sx = 0,
  sy = 0,
  width,
  height,
  timestamp,
}: ProjectExportLegacyCanvasCaptureInput): Promise<ProjectExportLegacyCanvasCapturedFrame> => {
  const bitmap = await createImageBitmap(canvas, sx, sy, width, height);
  return {
    timestamp,
    bitmap,
  };
};
