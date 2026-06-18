import { describe, expect, it } from 'vitest';
import {
  resolveProjectExportEncodePlan,
  resolveProjectExportEncodePlanFromBridge,
} from './projectExportEncodePlan';

describe('resolveProjectExportEncodePlan', () => {
  it('keeps WebCodecs mp4-muxer encoding for the default compatibility export path', () => {
    expect(resolveProjectExportEncodePlan({
      rustExportOnly: false,
      rustEncoderAvailable: false,
    })).toEqual({
      ok: true,
      engine: 'webCodecsMp4Muxer',
    });
  });

  it('refuses WebCodecs encoding when Rust-only export is requested but no Rust encoder is available', () => {
    expect(resolveProjectExportEncodePlan({
      rustExportOnly: true,
      rustEncoderAvailable: false,
    })).toEqual({
      ok: false,
      reason: 'rustEncoderRequired',
      detail: 'Rust-only export requires a Rust video encoder backend; WebCodecs encoding is disabled.',
    });
  });

  it('selects the Rust backend encoder when Rust-only export has an encoder available', () => {
    expect(resolveProjectExportEncodePlan({
      rustExportOnly: true,
      rustEncoderAvailable: true,
    })).toEqual({
      ok: true,
      engine: 'rustBackendVideoEncoder',
    });
  });

  it('derives Rust encoder availability from the renderer bridge shape', () => {
    expect(resolveProjectExportEncodePlanFromBridge({
      rustExportOnly: true,
      rustVideoEncoderBridge: {
        startVideoEncode: async () => ({ success: true }),
        writeVideoEncodeFrame: async () => ({ success: true }),
        finishVideoEncode: async () => ({ success: true }),
      },
    })).toEqual({
      ok: true,
      engine: 'rustBackendVideoEncoder',
    });

    expect(resolveProjectExportEncodePlanFromBridge({
      rustExportOnly: true,
      rustVideoEncoderBridge: {
        startVideoEncode: async () => ({ success: true }),
      },
    })).toEqual({
      ok: false,
      reason: 'rustEncoderRequired',
      detail: 'Rust-only export requires a Rust video encoder backend; WebCodecs encoding is disabled.',
    });
  });
});
