import type { RustBackendResult } from './rustBackendVideoDecodeControl';
import type { RustBackendVideoEncodeWriteFramePayload } from './rustBackendVideoEncodeControl';
import type {
  SharedRendererPresentedFrameNativeHandoffInput,
  SharedRendererPresentedFrameSharedFrameTaker,
} from './sharedRendererWebGpuPresenter';

export interface SharedVideoFramePresentedFrameBridge {
  takePresentedFrameSharedFrame?: (
    input: SharedRendererPresentedFrameNativeHandoffInput
  ) => Promise<RustBackendResult<RustBackendVideoEncodeWriteFramePayload>>;
}

export const isSharedVideoFramePresentedFrameBridgeAvailable = (
  bridge: Partial<SharedVideoFramePresentedFrameBridge> | null | undefined,
): bridge is Required<SharedVideoFramePresentedFrameBridge> =>
  typeof bridge?.takePresentedFrameSharedFrame === 'function';

const getDefaultSharedVideoFrameBridge = (): Partial<SharedVideoFramePresentedFrameBridge> | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.sharedVideoFrame;
};

export const createSharedVideoFramePresentedFrameTaker = (
  bridge: Partial<SharedVideoFramePresentedFrameBridge> | null | undefined = getDefaultSharedVideoFrameBridge(),
): SharedRendererPresentedFrameSharedFrameTaker | null => {
  if (!isSharedVideoFramePresentedFrameBridgeAvailable(bridge)) {
    return null;
  }

  return async (input) => {
    const response = await bridge.takePresentedFrameSharedFrame(input);
    if (!response.success || !response.result) {
      return null;
    }

    return response.result;
  };
};
