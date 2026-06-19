import type { EncodeResult, EncodeVideoConfig } from './videoExportPipeline';

export type ProjectExportCompatibilityEncodeInput = EncodeVideoConfig;

export const encodeProjectExportCompatibilityVideo = async (
  input: ProjectExportCompatibilityEncodeInput
): Promise<EncodeResult> => {
  const { encodeVideoToMp4 } = await import('./videoExportPipeline');
  return encodeVideoToMp4(input);
};
