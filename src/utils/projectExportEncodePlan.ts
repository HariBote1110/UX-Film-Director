import { isRustBackendVideoEncodeBridgeAvailable } from './rustBackendVideoEncodeControl';
import type { RustBackendVideoEncodeBridge } from './rustBackendVideoEncodeControl';

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
      reason: 'rustEncoderRequired';
      detail: string;
    };

export interface ResolveProjectExportEncodePlanInput {
  rustExportOnly: boolean;
  rustEncoderAvailable: boolean;
}

export interface ResolveProjectExportEncodePlanFromBridgeInput {
  rustExportOnly: boolean;
  rustVideoEncoderBridge?: Partial<RustBackendVideoEncodeBridge> | null;
}

export const resolveProjectExportEncodePlan = ({
  rustExportOnly,
  rustEncoderAvailable,
}: ResolveProjectExportEncodePlanInput): ProjectExportEncodePlan => {
  if (rustEncoderAvailable) {
    return {
      ok: true,
      engine: 'rustBackendVideoEncoder',
    };
  }

  if (rustExportOnly) {
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
  rustExportOnly,
  rustVideoEncoderBridge,
}: ResolveProjectExportEncodePlanFromBridgeInput): ProjectExportEncodePlan =>
  resolveProjectExportEncodePlan({
    rustExportOnly,
    rustEncoderAvailable: isRustBackendVideoEncodeBridgeAvailable(rustVideoEncoderBridge),
  });
