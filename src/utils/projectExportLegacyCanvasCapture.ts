export interface ProjectExportLegacyCanvasCaptureInput {
  canvas: HTMLCanvasElement;
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
  width,
  height,
  timestamp,
}: ProjectExportLegacyCanvasCaptureInput): Promise<ProjectExportLegacyCanvasCapturedFrame> => {
  const bitmap = await createImageBitmap(canvas, 0, 0, width, height);
  return {
    timestamp,
    bitmap,
  };
};
