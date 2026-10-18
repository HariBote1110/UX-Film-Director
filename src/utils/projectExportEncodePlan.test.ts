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

  it('requires the video-object sentinel at the encode planning type boundary', () => {
    const code = source();

    expect(code).toContain('hasVideoObjects: boolean');
    expect(code).not.toContain('hasVideoObjects?: boolean');
    expect(code).not.toContain('hasVideoObjects = false');
  });

  it('keeps WebCodecs mp4-muxer encoding only when the Rust encoder is unavailable', () => {
    expect(resolveProjectExportEncodePlan({
      editorMode: '2d',
      codec: 'h264',
      rustExportOnly: false,
      hasVideoObjects: false,
      rustEncoderAvailable: false,
    })).toEqual({ ok: true, engine: 'webCodecsMp4Muxer' });
  });

  it('prefers the Rust backend encoder in normal 2D export mode when the bridge is available', () => {
    expect(resolveProjectExportEncodePlan({
      editorMode: '2d',
      codec: 'h264',
      rustExportOnly: false,
      hasVideoObjects: false,
      rustEncoderAvailable: true,
    })).toEqual({ ok: true, engine: 'rustBackendVideoEncoder' });
  });

  it('refuses WebCodecs encoding when Rust-only 2D export is requested but no Rust encoder is available', () => {
    expect(resolveProjectExportEncodePlan({
      editorMode: '2d',
      codec: 'h264',
      rustExportOnly: true,
      hasVideoObjects: false,
      rustEncoderAvailable: false,
    })).toEqual({
      ok: false,
      reason: 'rustEncoderRequired',
      detail: 'Rust-only export requires a Rust video encoder backend; WebCodecs encoding is disabled.',
    });
  });

  it('refuses 2D video exports when the Rust encoder is unavailable', () => {
    expect(resolveProjectExportEncodePlan({
      editorMode: '2d',
      codec: 'h264',
      rustExportOnly: false,
      hasVideoObjects: true,
      rustEncoderAvailable: false,
    })).toEqual({
      ok: false,
      reason: 'rustEncoderRequired',
      detail: 'Rust-only export requires a Rust video encoder backend; WebCodecs encoding is disabled.',
    });
  });

  it('uses WebCodecs H.264 for 3D Stage exports with a Rust backend present and Rust-only mode enabled', () => {
    expect(resolveProjectExportEncodePlan({
      editorMode: '3d_stage',
      codec: 'h264',
      rustExportOnly: true,
      hasVideoObjects: false,
      rustEncoderAvailable: true,
    })).toEqual({ ok: true, engine: 'webCodecsMp4Muxer' });
  });

  it.each(['hevc', 'prores'] as const)('rejects 3D Stage %s instead of silently converting it to H.264', (codec) => {
    expect(resolveProjectExportEncodePlan({
      editorMode: '3d_stage',
      codec,
      rustExportOnly: true,
      hasVideoObjects: false,
      rustEncoderAvailable: true,
    })).toEqual({
      ok: false,
      reason: 'unsupportedCodecForEditorMode',
      detail: `${codec === 'hevc' ? 'HEVC (H.265)' : 'Apple ProRes'} は3Dステージ書き出しでは未対応です。H.264を選択してください。`,
    });
  });

  it('derives Rust encoder availability from the renderer bridge shape for 2D exports', () => {
    const bridge = {
      startVideoEncode: async () => ({ success: true }),
      writeVideoEncodeFrame: async () => ({ success: true }),
      finishVideoEncode: async () => ({ success: true }),
    };

    expect(resolveProjectExportEncodePlanFromBridge({
      editorMode: '2d',
      codec: 'h264',
      rustExportOnly: false,
      hasVideoObjects: false,
      rustVideoEncoderBridge: bridge,
    })).toEqual({ ok: true, engine: 'rustBackendVideoEncoder' });

    expect(resolveProjectExportEncodePlanFromBridge({
      editorMode: '2d',
      codec: 'h264',
      rustExportOnly: true,
      hasVideoObjects: false,
      rustVideoEncoderBridge: bridge,
    })).toEqual({ ok: true, engine: 'rustBackendVideoEncoder' });

    expect(resolveProjectExportEncodePlanFromBridge({
      editorMode: '2d',
      codec: 'h264',
      rustExportOnly: true,
      hasVideoObjects: false,
      rustVideoEncoderBridge: { startVideoEncode: bridge.startVideoEncode },
    })).toEqual({
      ok: false,
      reason: 'rustEncoderRequired',
      detail: 'Rust-only export requires a Rust video encoder backend; WebCodecs encoding is disabled.',
    });

    expect(resolveProjectExportEncodePlanFromBridge({
      editorMode: '2d',
      codec: 'h264',
      rustExportOnly: false,
      hasVideoObjects: true,
      rustVideoEncoderBridge: { startVideoEncode: bridge.startVideoEncode },
    })).toEqual({
      ok: false,
      reason: 'rustEncoderRequired',
      detail: 'Rust-only export requires a Rust video encoder backend; WebCodecs encoding is disabled.',
    });
  });
});
