// presenter 実装（sharedRendererWebGpuPresenter.ts）から export 経路が型のみ参照する
// ことによる不要な実装依存を避けるため、独立の型定義ファイルとして切り出したもの。
// R6（presenter interim専用縮小）バッチ1の機械的リファクタ。
// 詳細は markdown/Rust_Source_Of_Truth_Plan.md の R6 節を参照。

import type { RustBackendVideoEncodeWriteFramePayload } from './rustBackendVideoEncodeControl';

export interface SharedRendererPresentedFrameSharedFrameInput {
  encodeSessionId: string;
  memoryId: string;
  frameIndex: number;
  timestampUs: number;
  width: number;
  height: number;
  fps: number;
}

export interface SharedRendererPresentedFrameNativeHandoffInput
  extends SharedRendererPresentedFrameSharedFrameInput {
  device: unknown;
  texture: unknown;
  format: string;
  canvasSize: {
    width: number;
    height: number;
  };
}

export type SharedRendererPresentedFrameSharedFrameTaker = (
  input: SharedRendererPresentedFrameNativeHandoffInput
) => Promise<RustBackendVideoEncodeWriteFramePayload | null>;
