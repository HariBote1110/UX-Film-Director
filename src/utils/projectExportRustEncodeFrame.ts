import type {
  ProjectExportRustEncodeFrameRequest,
  ProjectExportRustFrameRequest,
  ProjectExportRustFrameSource,
} from './projectExportFrameCanvas';
import type { RustBackendVideoEncodeFrame } from './rustBackendVideoEncodeExport';

export interface RenderProjectExportRustEncodeFrameInput {
  frameSource: ProjectExportRustFrameSource;
  request: ProjectExportRustFrameRequest;
  encodeSessionId: string;
  preferSharedFrame: boolean;
}

export const renderProjectExportRustEncodeFrame = async ({
  frameSource,
  request,
  encodeSessionId,
  preferSharedFrame,
}: RenderProjectExportRustEncodeFrameInput): Promise<RustBackendVideoEncodeFrame> => {
  if (preferSharedFrame && frameSource.renderEncodeFrame) {
    const encodeRequest: ProjectExportRustEncodeFrameRequest = {
      ...request,
      encodeSessionId,
    };
    return frameSource.renderEncodeFrame(encodeRequest);
  }

  const bitmap = await frameSource.renderFrame(request);
  return {
    timestamp: request.timestampUs,
    bitmap,
  };
};
