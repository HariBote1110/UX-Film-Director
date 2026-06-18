import {
  isRustBackendDecodedVideoFrameAvailable,
  releaseRustBackendVideoDecodeFrame,
  type RustBackendResult,
  type RustBackendVideoDecodeBridge,
} from './rustBackendVideoDecodeControl';
import {
  prepareSharedRendererDecodedVideoFrameUpload,
  type PrepareSharedRendererDecodedVideoFrameUploadResult,
  type SharedVideoFrameCopyBridge,
} from './sharedVideoFrameUploadBridge';

export interface PrepareSharedRendererRustDecodedVideoUploadInput {
  decodeResponse: RustBackendResult<unknown>;
  slotCount: number;
  copyBridge: SharedVideoFrameCopyBridge;
  rustBackendBridge: RustBackendVideoDecodeBridge;
}

export type PrepareSharedRendererRustDecodedVideoUploadResult =
  | PrepareSharedRendererDecodedVideoFrameUploadResult
  | {
      ok: false;
      reason: 'decodedFrameUnavailable';
      detail: string;
    };

export const prepareSharedRendererRustDecodedVideoUpload = async ({
  decodeResponse,
  slotCount,
  copyBridge,
  rustBackendBridge,
}: PrepareSharedRendererRustDecodedVideoUploadInput): Promise<PrepareSharedRendererRustDecodedVideoUploadResult> => {
  if (!isRustBackendDecodedVideoFrameAvailable(decodeResponse)) {
    return {
      ok: false,
      reason: 'decodedFrameUnavailable',
      detail: 'Rust backend did not return a verified decoded video frame.',
    };
  }

  const { frame, jobId } = decodeResponse.result;
  const releaseFrame = (copyOutState: 'gpuUploadFenceSignalled' | 'rendererUploadAborted') =>
    releaseRustBackendVideoDecodeFrame({
      jobId,
      slotIndex: frame.descriptor.slotIndex,
      generation: frame.descriptor.generation,
      copyOutState,
    }, rustBackendBridge).then(() => undefined);

  const upload = await prepareSharedRendererDecodedVideoFrameUpload({
    sharedFrame: frame,
    slotCount,
    bridge: copyBridge,
    releaseAfterGpuUpload: () => releaseFrame('gpuUploadFenceSignalled'),
    releaseAfterUploadAbort: () => releaseFrame('rendererUploadAborted'),
  });
  if (!upload.ok) {
    await releaseFrame('rendererUploadAborted');
  }

  return upload;
};
