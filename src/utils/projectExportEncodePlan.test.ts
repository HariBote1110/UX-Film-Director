import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  resolveProjectExportEncodePlan,
  resolveProjectExportEncodePlanFromBridge,
} from './projectExportEncodePlan';

const source = () =>
  readFileSync(new URL('./projectExportEncodePlan.ts', import.meta.url), 'utf8');

describe('resolveProjectExportEncodePlan', () => {
  it('does not expose rustVideoOnly as an export encode planning input', () => {
    expect(source()).not.toContain('rustVideoOnly');
  });

  it('keeps WebCodecs mp4-muxer encoding only when the Rust encoder is unavailable', () => {
    expect(resolveProjectExportEncodePlan({
      rustExportOnly: false,
      rustEncoderAvailable: false,
    })).toEqual({
      ok: true,
      engine: 'webCodecsMp4Muxer',
    });
  });

  it('prefers the Rust backend encoder in normal export mode when the bridge is available', () => {
    expect(resolveProjectExportEncodePlan({
      rustExportOnly: false,
      rustEncoderAvailable: true,
    })).toEqual({
      ok: true,
      engine: 'rustBackendVideoEncoder',
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

  it('refuses WebCodecs encoding for video exports when Rust video-only mode is enabled', () => {
    expect(resolveProjectExportEncodePlan({
      rustExportOnly: false,
      rustVideoOnly: true,
      hasVideoObjects: true,
      rustEncoderAvailable: false,
    })).toEqual({
      ok: false,
      reason: 'rustEncoderRequired',
      detail: 'Rust-only export requires a Rust video encoder backend; WebCodecs encoding is disabled.',
    });
  });

  it('refuses WebCodecs encoding for video exports even when Rust video-only mode is disabled', () => {
    expect(resolveProjectExportEncodePlan({
      rustExportOnly: false,
      rustVideoOnly: false,
      hasVideoObjects: true,
      rustEncoderAvailable: false,
    })).toEqual({
      ok: false,
      reason: 'rustEncoderRequired',
      detail: 'Rust-only export requires a Rust video encoder backend; WebCodecs encoding is disabled.',
    });
  });

  it('keeps WebCodecs available for non-video exports while Rust video-only mode is enabled', () => {
    expect(resolveProjectExportEncodePlan({
      rustExportOnly: false,
      rustVideoOnly: true,
      hasVideoObjects: false,
      rustEncoderAvailable: false,
    })).toEqual({
      ok: true,
      engine: 'webCodecsMp4Muxer',
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
      rustExportOnly: false,
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

    expect(resolveProjectExportEncodePlanFromBridge({
      rustExportOnly: false,
      rustVideoOnly: true,
      hasVideoObjects: true,
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
