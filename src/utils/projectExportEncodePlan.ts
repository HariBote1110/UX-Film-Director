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
  hasVideoObjects: boolean;
  rustEncoderAvailable: boolean;
}

export interface ResolveProjectExportEncodePlanFromBridgeInput {
  rustExportOnly: boolean;
  hasVideoObjects: boolean;
  rustVideoEncoderBridge?: Partial<RustBackendVideoEncodeBridge> | null;
}

export const resolveProjectExportEncodePlan = ({
  rustExportOnly,
  hasVideoObjects,
  rustEncoderAvailable,
}: ResolveProjectExportEncodePlanInput): ProjectExportEncodePlan => {
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
  rustExportOnly,
  hasVideoObjects,
  rustVideoEncoderBridge,
}: ResolveProjectExportEncodePlanFromBridgeInput): ProjectExportEncodePlan =>
  resolveProjectExportEncodePlan({
    rustExportOnly,
    hasVideoObjects,
    rustEncoderAvailable: isRustBackendVideoEncodeBridgeAvailable(rustVideoEncoderBridge),
  });
