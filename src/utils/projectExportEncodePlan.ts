import { isRustBackendVideoEncodeBridgeAvailable } from './rustBackendVideoEncodeControl';
import type { RustBackendVideoEncodeBridge } from './rustBackendVideoEncodeControl';
import type { EditorMode } from '../types';
import type { VideoExportCodec } from './videoExportEncodeSettings';

export type ProjectExportEncodeEngine =
  | 'webCodecsMp4Muxer'
  | 'rustBackendVideoEncoder';

export type ProjectExportEncodePlan =
  | {
      ok: true;
      engine: ProjectExportEncodeEngine;
    }
  | {
      ok: false;
      reason: 'rustEncoderRequired' | 'unsupportedCodecForEditorMode';
      detail: string;
    };

export interface ResolveProjectExportEncodePlanInput {
  editorMode: EditorMode;
  codec: VideoExportCodec;
  rustExportOnly: boolean;
  hasVideoObjects: boolean;
  rustEncoderAvailable: boolean;
}

export interface ResolveProjectExportEncodePlanFromBridgeInput {
  editorMode: EditorMode;
  codec: VideoExportCodec;
  rustExportOnly: boolean;
  hasVideoObjects: boolean;
  rustVideoEncoderBridge?: Partial<RustBackendVideoEncodeBridge> | null;
}

export const resolveProjectExportEncodePlan = ({
  editorMode,
  codec,
  rustExportOnly,
  hasVideoObjects,
  rustEncoderAvailable,
}: ResolveProjectExportEncodePlanInput): ProjectExportEncodePlan => {
  if (editorMode === '3d_stage') {
    if (codec !== 'h264') {
      const codecLabel = codec === 'hevc' ? 'HEVC (H.265)' : 'Apple ProRes';
      return {
        ok: false,
        reason: 'unsupportedCodecForEditorMode',
        detail: `${codecLabel} は3Dステージ書き出しでは未対応です。H.264を選択してください。`,
      };
    }
    return {
      ok: true,
      engine: 'webCodecsMp4Muxer',
    };
  }

  if (rustEncoderAvailable) {
    return {
      ok: true,
      engine: 'rustBackendVideoEncoder',
    };
  }

  if (rustExportOnly || hasVideoObjects) {
    return {
      ok: false,
      reason: 'rustEncoderRequired',
      detail: 'Rust-only export requires a Rust video encoder backend; WebCodecs encoding is disabled.',
    };
  }

  return {
    ok: true,
    engine: 'webCodecsMp4Muxer',
  };
};

export const resolveProjectExportEncodePlanFromBridge = ({
  editorMode,
  codec,
  rustExportOnly,
  hasVideoObjects,
  rustVideoEncoderBridge,
}: ResolveProjectExportEncodePlanFromBridgeInput): ProjectExportEncodePlan =>
  resolveProjectExportEncodePlan({
    editorMode,
    codec,
    rustExportOnly,
    hasVideoObjects,
    rustEncoderAvailable: isRustBackendVideoEncodeBridgeAvailable(rustVideoEncoderBridge),
  });
