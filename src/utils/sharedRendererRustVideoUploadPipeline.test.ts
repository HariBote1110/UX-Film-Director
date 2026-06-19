import { describe, expect, it } from 'vitest';
import {
  prepareSharedRendererRustDecodedVideoUpload,
} from './sharedRendererRustVideoUploadPipeline';
import type {
  RustBackendResult,
  RustBackendVideoDecodeBridge,
  RustBackendVideoDecodeFrameResult,
} from './rustBackendVideoDecodeControl';
import type { SharedVideoFrameCopyBridge } from './sharedVideoFrameUploadBridge';

const decodedFrameResponse: RustBackendResult<RustBackendVideoDecodeFrameResult> = {
  success: true,
  result: {
    accepted: true,
    jobId: 'decode-job-1',
    requestId: 99,
    frameIndex: 42,
    mode: 'latestWins',
    frame: {
      descriptor: {
        memoryId: '/uxfd-video-ring',
        slotIndex: 1,
        generation: 5,
        byteOffset: 512,
        byteLen: 512,
        width: 34,
        height: 2,
        strideBytes: 256,
        format: 'rgba8Srgb',
        colour: {
          primaries: 'bt709',
          transfer: 'srgb',
          matrix: 'rgb',
          range: 'full',
        },
      },
      ptsFrame: 42,
    },
    verification: {
      frameIndex: 42,
      checksum: {
        algorithm: 'crc32',
        valueHex: '12345678',
        byteLen: 512,
      },
      status: 'withinTolerance',
    },
    decodeInvocationCount: 1,
  },
};

describe('sharedRendererRustVideoUploadPipeline', () => {
  it('copies a verified Rust decoded frame and releases the backend slot after GPU upload', async () => {
    const calls: unknown[] = [];
    const copyBridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async (payload, target) => {
        calls.push(['copyIntoUploadBuffer', payload, target.byteLength]);
        target.fill(0x44);
        return {
          success: true,
          result: {
            sequence: payload.ptsFrame,
            slotIndex: payload.slotIndex,
            generation: payload.generation,
            byteLen: target.byteLength,
            expectedChecksum: 0x1234,
            actualChecksum: 0x1234,
          },
        };
      },
    };
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async () => ({ success: true }),
      requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
      releaseVideoDecodeFrame: async (payload) => {
        calls.push(['releaseVideoDecodeFrame', payload]);
        return { success: true, result: { released: true } };
      },
      stopVideoDecode: async () => ({ success: true }),
    };

    const upload = await prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      copyBridge,
      rustBackendBridge,
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) throw new Error('expected upload preparation to succeed');
    expect(upload.descriptor).toBe(decodedFrameResponse.result!.frame!.descriptor);
    expect(upload.ptsFrame).toBe(42);
    expect(upload.rgbaBytes.byteLength).toBe(512);
    expect(upload.rgbaBytes[0]).toBe(0x44);

    await upload.releaseAfterGpuUpload?.();

    expect(calls).toEqual([
      ['copyIntoUploadBuffer', {
        memoryId: '/uxfd-video-ring',
        slotCount: 2,
        slotByteLen: 512,
        slotIndex: 1,
        generation: 5,
        ptsFrame: 42,
      }, 512],
      ['releaseVideoDecodeFrame', {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 5,
        copyOutState: 'gpuUploadFenceSignalled',
      }],
    ]);
  });

  it('keeps Pixi fallback when Rust decode response is not a verified decoded frame', async () => {
    const upload = await prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse: {
        success: true,
        result: {
          accepted: true,
          jobId: 'decode-job-1',
          requestId: 1,
          frameIndex: 42,
          mode: 'latestWins',
        },
      },
      slotCount: 2,
      copyBridge: {
        copyIntoUploadBuffer: async () => {
          throw new Error('copy must not run for unavailable decoded frames');
        },
      },
      rustBackendBridge: {
        startVideoDecode: async () => ({ success: true }),
        requestVideoDecodeFrame: async () => ({ success: true }),
        releaseVideoDecodeFrame: async () => ({ success: true }),
        stopVideoDecode: async () => ({ success: true }),
      },
    });

    expect(upload).toEqual({
      ok: false,
      reason: 'decodedFrameUnavailable',
      detail: 'Rust backend did not return a verified decoded video frame.',
    });
  });

  it('releases the decoded backend slot as aborted when shared memory copy fails', async () => {
    const calls: unknown[] = [];
    const upload = await prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      copyBridge: {
        copyIntoUploadBuffer: async () => ({
          success: false,
          error: 'copy failed',
        }),
      },
      rustBackendBridge: {
        startVideoDecode: async () => ({ success: true }),
        requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          return { success: true };
        },
        stopVideoDecode: async () => ({ success: true }),
      },
    });

    expect(upload).toEqual({
      ok: false,
      reason: 'copyFailed',
      detail: 'copy failed',
    });
    expect(calls).toEqual([[
      'releaseVideoDecodeFrame',
      {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 5,
        copyOutState: 'rendererUploadAborted',
      },
    ]]);
  });

  it('uses Rust inline decoded RGBA as an MVP preview path when the native copy bridge is unavailable', async () => {
    const calls: unknown[] = [];
    const inlineBytes = new Uint8Array(512);
    inlineBytes.fill(0x77);
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async () => ({ success: true }),
      requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
      requestVideoDecodeFrameInline: async (payload) => {
        calls.push(['requestVideoDecodeFrameInline', payload]);
        return {
          success: true,
          result: {
            ...decodedFrameResponse.result!,
            frame: {
              ...decodedFrameResponse.result!.frame!,
              rgbaBytes: inlineBytes,
            },
          },
        };
      },
      releaseVideoDecodeFrame: async (payload) => {
        calls.push(['releaseVideoDecodeFrame', payload]);
        return { success: true, result: { released: true } };
      },
      stopVideoDecode: async () => ({ success: true }),
    };

    const upload = await prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      copyBridge: {
        copyIntoUploadBuffer: async () => ({
          success: false,
          error: 'Shared video frame native bridge is unavailable.',
        }),
      },
      rustBackendBridge,
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) throw new Error('expected upload preparation to succeed');
    expect(upload.rgbaBytes.byteLength).toBe(512);
    expect(upload.rgbaBytes[0]).toBe(0x77);

    await upload.releaseAfterGpuUpload?.();

    expect(calls).toEqual([
      ['requestVideoDecodeFrameInline', {
        jobId: 'decode-job-1',
        requestId: 99,
        frameIndex: 42,
        mode: 'latestWins',
      }],
      ['releaseVideoDecodeFrame', {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 5,
        copyOutState: 'gpuUploadFenceSignalled',
      }],
    ]);
  });

  it('uses Rust inline decoded RGBA when the native copy report checksum does not match the upload buffer', async () => {
    const calls: unknown[] = [];
    const inlineBytes = new Uint8Array(512);
    inlineBytes.fill(0x55);
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async () => ({ success: true }),
      requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
      requestVideoDecodeFrameInline: async (payload) => {
        calls.push(['requestVideoDecodeFrameInline', payload]);
        return {
          success: true,
          result: {
            ...decodedFrameResponse.result!,
            frame: {
              ...decodedFrameResponse.result!.frame!,
              rgbaBytes: inlineBytes,
            },
          },
        };
      },
      releaseVideoDecodeFrame: async (payload) => {
        calls.push(['releaseVideoDecodeFrame', payload]);
        return { success: true, result: { released: true } };
      },
      stopVideoDecode: async () => ({ success: true }),
    };

    const upload = await prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      copyBridge: {
        copyIntoUploadBuffer: async () => ({
          success: true,
          result: {
            sequence: 42,
            slotIndex: 1,
            generation: 5,
            byteLen: 512,
            checksumAlgorithm: 'crc32',
            expectedChecksum: 0x1234,
            actualChecksum: 0x5678,
          },
        }),
      },
      rustBackendBridge,
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) throw new Error('expected upload preparation to succeed');
    expect(upload.rgbaBytes[0]).toBe(0x55);

    await upload.releaseAfterGpuUpload?.();

    expect(calls).toEqual([
      ['requestVideoDecodeFrameInline', {
        jobId: 'decode-job-1',
        requestId: 99,
        frameIndex: 42,
        mode: 'latestWins',
      }],
      ['releaseVideoDecodeFrame', {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 5,
        copyOutState: 'gpuUploadFenceSignalled',
      }],
    ]);
  });

  it('releases the decoded backend slot as aborted when shared memory copy throws', async () => {
    const calls: unknown[] = [];

    await expect(prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      copyBridge: {
        copyIntoUploadBuffer: async () => {
          throw new Error('native copy exploded');
        },
      },
      rustBackendBridge: {
        startVideoDecode: async () => ({ success: true }),
        requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          return { success: true };
        },
        stopVideoDecode: async () => ({ success: true }),
      },
    })).rejects.toThrow('native copy exploded');

    expect(calls).toEqual([[
      'releaseVideoDecodeFrame',
      {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 5,
        copyOutState: 'rendererUploadAborted',
      },
    ]]);
  });

  it('releases a decoded backend slot only once when GPU success and abort callbacks both run', async () => {
    const calls: unknown[] = [];
    const copyBridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async (payload, target) => {
        calls.push(['copyIntoUploadBuffer', payload, target.byteLength]);
        target.fill(0x44);
        return {
          success: true,
          result: {
            sequence: payload.ptsFrame,
            slotIndex: payload.slotIndex,
            generation: payload.generation,
            byteLen: target.byteLength,
            expectedChecksum: 0x1234,
            actualChecksum: 0x1234,
          },
        };
      },
    };
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async () => ({ success: true }),
      requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
      releaseVideoDecodeFrame: async (payload) => {
        calls.push(['releaseVideoDecodeFrame', payload]);
        return { success: true, result: { released: true } };
      },
      stopVideoDecode: async () => ({ success: true }),
    };

    const upload = await prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      copyBridge,
      rustBackendBridge,
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) throw new Error('expected upload preparation to succeed');

    await upload.releaseAfterGpuUpload?.();
    await upload.releaseAfterUploadAbort?.();
    await upload.releaseAfterGpuUpload?.();

    const releaseCalls = calls.filter((call) =>
      Array.isArray(call) && call[0] === 'releaseVideoDecodeFrame');

    expect(releaseCalls).toEqual([[
      'releaseVideoDecodeFrame',
      {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 5,
        copyOutState: 'gpuUploadFenceSignalled',
      },
    ]]);
  });

  it('rejects the release callback when Rust decode slot release returns success false', async () => {
    const calls: unknown[] = [];
    const upload = await prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      copyBridge: {
        copyIntoUploadBuffer: async (_payload, target) => {
          target.fill(0x44);
          return {
            success: true,
            result: {
              sequence: 42,
              slotIndex: 1,
              generation: 5,
              byteLen: target.byteLength,
              expectedChecksum: 0x1234,
              actualChecksum: 0x1234,
            },
          };
        },
      },
      rustBackendBridge: {
        startVideoDecode: async () => ({ success: true }),
        requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          return { success: false, error: 'decode slot release returned false' };
        },
        stopVideoDecode: async () => ({ success: true }),
      },
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) throw new Error('expected upload preparation to succeed');

    await expect(upload.releaseAfterGpuUpload?.()).rejects.toThrow('decode slot release returned false');
    expect(calls).toEqual([[
      'releaseVideoDecodeFrame',
      {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 5,
        copyOutState: 'gpuUploadFenceSignalled',
      },
    ]]);
  });
});
