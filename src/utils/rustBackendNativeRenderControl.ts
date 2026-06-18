import type {
  RustBackendResult,
  RustBackendSharedVideoFrame,
} from './rustBackendVideoDecodeControl';
import type {
  RustSceneMediaReference,
  RustSceneSnapshot,
} from './rustSceneSnapshot';

export interface RustBackendNativeRenderSharedFrameSource {
  mediaId: string;
  slotCount: number;
  frame: RustBackendSharedVideoFrame;
}

export interface RustBackendNativeRenderSharedFramePayload {
  renderId: string;
  memoryId: string;
  slotCount: number;
  ptsFrame: number;
  width: number;
  height: number;
  snapshot: RustSceneSnapshot;
  media: RustSceneMediaReference[];
  sources: RustBackendNativeRenderSharedFrameSource[];
}

export interface RustBackendNativeRenderSharedFrameResult {
  rendered: true;
  renderId: string;
  memoryId: string;
  slotCount: number;
  slotByteLen: number;
  frame: RustBackendSharedVideoFrame;
}

export interface RustBackendNativeRenderSharedFrameBridge {
  renderNativeSharedFrame: (
    payload: RustBackendNativeRenderSharedFramePayload
  ) => Promise<RustBackendResult<RustBackendNativeRenderSharedFrameResult>>;
}

const defaultRustBackendNativeRenderBridge = (): RustBackendNativeRenderSharedFrameBridge => ({
  renderNativeSharedFrame: (payload) =>
    window.rustBackend.renderNativeSharedFrame(payload) as Promise<
      RustBackendResult<RustBackendNativeRenderSharedFrameResult>
    >,
});

export const renderRustBackendNativeSharedFrame = (
  payload: RustBackendNativeRenderSharedFramePayload,
  bridge: RustBackendNativeRenderSharedFrameBridge = defaultRustBackendNativeRenderBridge()
): Promise<RustBackendResult<RustBackendNativeRenderSharedFrameResult>> =>
  bridge.renderNativeSharedFrame(payload);
