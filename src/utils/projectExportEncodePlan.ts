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
  rustVideoOnly?: boolean;
  hasVideoObjects?: boolean;
  rustEncoderAvailable: boolean;
}

export interface ResolveProjectExportEncodePlanFromBridgeInput {
  rustExportOnly: boolean;
  rustVideoOnly?: boolean;
  hasVideoObjects?: boolean;
  rustVideoEncoderBridge?: Partial<RustBackendVideoEncodeBridge> | null;
}

export const resolveProjectExportEncodePlan = ({
  rustExportOnly,
  rustVideoOnly = false,
  hasVideoObjects = false,
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
  rustVideoOnly = false,
  hasVideoObjects = false,
  rustVideoEncoderBridge,
}: ResolveProjectExportEncodePlanFromBridgeInput): ProjectExportEncodePlan =>
  resolveProjectExportEncodePlan({
    rustExportOnly,
    rustVideoOnly,
    hasVideoObjects,
    rustEncoderAvailable: isRustBackendVideoEncodeBridgeAvailable(rustVideoEncoderBridge),
  });
