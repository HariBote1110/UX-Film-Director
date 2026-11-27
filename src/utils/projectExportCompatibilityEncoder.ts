export interface ProjectExportCompatibilityEncodeResult {
  buffer: ArrayBuffer;
  streamed: boolean;
  codecUsed: string;
  durationMs: number;
  peakQueueSize: number;
}

export interface ProjectExportCompatibilityEncodeInput {
  width: number;
  height: number;
  fps: number;
  frames: AsyncIterable<{ timestamp: number; bitmap: ImageBitmap }>;
  audioBuffer?: AudioBuffer | null;
  writeChunk?: (data: Uint8Array, position: number) => void | Promise<void>;
  hasVideoObjects: boolean;
}

export const encodeProjectExportCompatibilityVideo = async (
  input: ProjectExportCompatibilityEncodeInput
): Promise<ProjectExportCompatibilityEncodeResult> => {
  if (input.hasVideoObjects) {
    throw new Error('Video export requires the Rust backend encoder; WebCodecs compatibility export is non-video only.');
  }

  const { encodeVideoToMp4 } = await import('./videoExportPipeline');
  return encodeVideoToMp4(input);
};
