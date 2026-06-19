import type { EncodeResult, EncodeVideoConfig } from './videoExportPipeline';

export type ProjectExportCompatibilityEncodeInput = EncodeVideoConfig & {
  hasVideoObjects?: boolean;
};

export const encodeProjectExportCompatibilityVideo = async (
  input: ProjectExportCompatibilityEncodeInput
): Promise<EncodeResult> => {
  if (input.hasVideoObjects) {
    throw new Error('Video export requires the Rust backend encoder; WebCodecs compatibility export is non-video only.');
  }

  const { encodeVideoToMp4 } = await import('./videoExportPipeline');
  return encodeVideoToMp4(input);
};
