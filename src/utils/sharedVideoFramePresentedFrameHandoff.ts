import type { RustBackendResult } from './rustBackendVideoDecodeControl';
import type { RustBackendVideoEncodeWriteFramePayload } from './rustBackendVideoEncodeControl';
import type {
  SharedRendererPresentedFrameNativeHandoffInput,
  SharedRendererPresentedFrameSharedFrameTaker,
} from './sharedRendererWebGpuPresenter';

export interface SharedVideoFramePresentedFrameBridge {
  getPresentedFrameHandoffCapabilities?: () => SharedVideoFramePresentedFrameHandoffCapabilities;
  takePresentedFrameSharedFrame?: (
    input: SharedRendererPresentedFrameNativeHandoffInput
  ) => Promise<RustBackendResult<RustBackendVideoEncodeWriteFramePayload>>;
}

export interface SharedVideoFramePresentedFrameHandoffCapabilities {
  available: boolean;
  reason?: string;
}

export const isSharedVideoFramePresentedFrameBridgeAvailable = (
  bridge: Partial<SharedVideoFramePresentedFrameBridge> | null | undefined,
): bridge is Required<Pick<SharedVideoFramePresentedFrameBridge, 'takePresentedFrameSharedFrame'>> =>
  typeof bridge?.takePresentedFrameSharedFrame === 'function'
  && bridge.getPresentedFrameHandoffCapabilities?.().available !== false;

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
