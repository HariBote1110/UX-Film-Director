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

export const resolveProjectExportEncodePlan = ({
  rustExportOnly,
  rustEncoderAvailable,
}: ResolveProjectExportEncodePlanInput): ProjectExportEncodePlan => {
  if (!rustExportOnly) {
    return {
      ok: true,
      engine: 'webCodecsMp4Muxer',
    };
  }

  if (!rustEncoderAvailable) {
    return {
      ok: false,
      reason: 'rustEncoderRequired',
      detail: 'Rust-only export requires a Rust video encoder backend; WebCodecs encoding is disabled.',
    };
  }

  return {
    ok: true,
    engine: 'rustBackendVideoEncoder',
  };
};
