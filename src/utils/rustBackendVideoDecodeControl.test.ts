import { describe, expect, it } from 'vitest';
import {
  isRustBackendDecodedVideoFrameAvailable,
  releaseRustBackendVideoDecodeFrame,
  requestRustBackendVideoDecodeFrame,
  startRustBackendVideoDecode,
  stopRustBackendVideoDecode,
  type RustBackendResult,
  type RustBackendVideoDecodeFrameResult,
  type RustBackendVideoDecodeBridge,
} from './rustBackendVideoDecodeControl';

const bridge = (): {
  calls: unknown[];
  bridge: RustBackendVideoDecodeBridge;
} => {
  const calls: unknown[] = [];
  return {
    calls,
    bridge: {
      startVideoDecode: async (payload) => {
        calls.push(['startVideoDecode', payload]);
        return { success: true, result: { jobId: payload.jobId } };
      },
      requestVideoDecodeFrame: async (payload) => {
        calls.push(['requestVideoDecodeFrame', payload]);
        return { success: true, result: { accepted: true, frameIndex: payload.frameIndex } };
      },
      releaseVideoDecodeFrame: async (payload) => {
        calls.push(['releaseVideoDecodeFrame', payload]);
        return { success: true, result: { released: true, slotIndex: payload.slotIndex } };
      },
      stopVideoDecode: async (payload) => {
        calls.push(['stopVideoDecode', payload]);
        return { success: true, result: { stopped: true, jobId: payload.jobId } };
      },
    },
  };
};

const verifiedDecodeFrameResponse = (): RustBackendResult<RustBackendVideoDecodeFrameResult> => ({
  success: true,
  result: {
    accepted: true,
    jobId: 'decode-1',
    requestId: 12,
    frameIndex: 1,
    mode: 'latestWins',
    frame: {
      descriptor: {
        memoryId: 'decode-1-ring',
        slotIndex: 0,
        generation: 1,
        byteOffset: 0,
        byteLen: 4096,
        width: 34,
        height: 16,
        strideBytes: 256,
        format: 'rgba8Srgb',
        colour: {
          primaries: 'bt709',
          transfer: 'srgb',
          matrix: 'rgb',
          range: 'full',
        },
      },
      ptsFrame: 1,
    },
    verification: {
      frameIndex: 1,
      checksum: {
        algorithm: 'crc32',
        valueHex: '9f2a1c0b',
        byteLen: 4096,
      },
      status: 'withinTolerance',
    },
    decodeInvocationCount: 1,
  },
});

describe('rustBackendVideoDecodeControl', () => {
  it('starts a Rust video decode session with a shared-ring control payload only', async () => {
    const mocked = bridge();

    const response = await startRustBackendVideoDecode({
      jobId: 'decode-1',
      source: '/media/input.mp4',
      slotCount: 3,
      width: 1280,
      height: 720,
      sourceRate: {
        numerator: 60,
        denominator: 1,
      },
      format: 'rgba8Srgb',
      colour: {
        primaries: 'bt709',
        transfer: 'srgb',
        matrix: 'rgb',
        range: 'full',
      },
    }, mocked.bridge);

    expect(response).toEqual({ success: true, result: { jobId: 'decode-1' } });
    expect(mocked.calls).toEqual([[
      'startVideoDecode',
      {
        jobId: 'decode-1',
        source: '/media/input.mp4',
        slotCount: 3,
        width: 1280,
        height: 720,
        sourceRate: {
          numerator: 60,
          denominator: 1,
        },
        format: 'rgba8Srgb',
        colour: {
          primaries: 'bt709',
          transfer: 'srgb',
          matrix: 'rgb',
          range: 'full',
        },
      },
    ]]);
    expect(JSON.stringify(mocked.calls)).not.toContain('frameBase64');
  });

  it('stops the active Rust video decode session by job id', async () => {
    const mocked = bridge();

    const response = await stopRustBackendVideoDecode({
      jobId: 'decode-1',
    }, mocked.bridge);

    expect(response).toEqual({ success: true, result: { stopped: true, jobId: 'decode-1' } });
    expect(mocked.calls).toEqual([[
      'stopVideoDecode',
      {
        jobId: 'decode-1',
      },
    ]]);
  });

  it('requests and releases frames by frame index and slot lease token', async () => {
    const mocked = bridge();

    await requestRustBackendVideoDecodeFrame({
      jobId: 'decode-1',
      requestId: 7,
      frameIndex: 42,
      mode: 'latestWins',
    }, mocked.bridge);
    await releaseRustBackendVideoDecodeFrame({
      jobId: 'decode-1',
      slotIndex: 2,
      generation: 5,
      copyOutState: 'gpuUploadFenceSignalled',
    }, mocked.bridge);

    expect(mocked.calls).toEqual([
      ['requestVideoDecodeFrame', {
        jobId: 'decode-1',
        requestId: 7,
        frameIndex: 42,
        mode: 'latestWins',
      }],
      ['releaseVideoDecodeFrame', {
        jobId: 'decode-1',
        slotIndex: 2,
        generation: 5,
        copyOutState: 'gpuUploadFenceSignalled',
      }],
    ]);
  });

  it('recognises a verified Rust backend decoded frame descriptor without JSON pixel payloads', async () => {
    const calls: unknown[] = [];
    const mockedBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async (payload) => {
        calls.push(['startVideoDecode', payload]);
        return { success: true, result: { jobId: payload.jobId } };
      },
      requestVideoDecodeFrame: async (payload) => {
        calls.push(['requestVideoDecodeFrame', payload]);
        return {
          success: true,
          result: {
            accepted: true,
            jobId: payload.jobId,
            requestId: payload.requestId,
            frameIndex: payload.frameIndex,
            mode: payload.mode,
            frame: {
              descriptor: {
                memoryId: 'decode-1-ring',
                slotIndex: 0,
                generation: 1,
                byteOffset: 0,
                byteLen: 4096,
                width: 34,
                height: 16,
                strideBytes: 256,
                format: 'rgba8Srgb',
                colour: {
                  primaries: 'bt709',
                  transfer: 'srgb',
                  matrix: 'rgb',
                  range: 'full',
                },
              },
              ptsFrame: payload.frameIndex,
            },
            verification: {
              frameIndex: payload.frameIndex,
              checksum: {
                algorithm: 'crc32',
                valueHex: '9f2a1c0b',
                byteLen: 4096,
              },
              status: 'withinTolerance',
            },
            decodeInvocationCount: 1,
          },
        };
      },
      releaseVideoDecodeFrame: async (payload) => {
        calls.push(['releaseVideoDecodeFrame', payload]);
        return { success: true, result: { released: true, slotIndex: payload.slotIndex } };
      },
      stopVideoDecode: async (payload) => {
        calls.push(['stopVideoDecode', payload]);
        return { success: true, result: { stopped: true, jobId: payload.jobId } };
      },
    };

    const response = await requestRustBackendVideoDecodeFrame({
      jobId: 'decode-1',
      requestId: 12,
      frameIndex: 1,
      mode: 'latestWins',
    }, mockedBridge);

    expect(isRustBackendDecodedVideoFrameAvailable(response)).toBe(true);
    expect(JSON.stringify(response)).not.toContain('frameBase64');
    expect(JSON.stringify(response)).not.toContain('"pixels"');
    expect(JSON.stringify(response)).not.toContain('"bytes"');
  });

  it('rejects decoded frame responses that smuggle JSON pixel payloads alongside a descriptor', () => {
    const response = verifiedDecodeFrameResponse();

    const withFrameBytes = {
      ...response,
      result: {
        ...response.result!,
        frame: {
          ...response.result!.frame!,
          bytes: [0, 1, 2, 3],
        },
      },
    };
    const withRootPixels = {
      ...response,
      result: {
        ...response.result!,
        pixels: [0, 1, 2, 3],
      },
    };
    const withBase64 = {
      ...response,
      result: {
        ...response.result!,
        frameBase64: 'AAAA',
      },
    };

    expect(isRustBackendDecodedVideoFrameAvailable(withFrameBytes)).toBe(false);
    expect(isRustBackendDecodedVideoFrameAvailable(withRootPixels)).toBe(false);
    expect(isRustBackendDecodedVideoFrameAvailable(withBase64)).toBe(false);
  });

  it('rejects decoded frame descriptors that do not match the shared memory layout contract', () => {
    const response = verifiedDecodeFrameResponse();
    const descriptor = response.result!.frame!.descriptor;

    const withEmptyMemoryId = {
      ...response,
      result: {
        ...response.result!,
        frame: {
          ...response.result!.frame!,
          descriptor: {
            ...descriptor,
            memoryId: '',
          },
        },
      },
    };
    const withShortStride = {
      ...response,
      result: {
        ...response.result!,
        frame: {
          ...response.result!.frame!,
          descriptor: {
            ...descriptor,
            strideBytes: descriptor.width * 4 - 1,
          },
        },
      },
    };
    const withMismatchedByteLen = {
      ...response,
      result: {
        ...response.result!,
        frame: {
          ...response.result!.frame!,
          descriptor: {
            ...descriptor,
            byteLen: descriptor.strideBytes * descriptor.height - 1,
          },
        },
      },
    };

    expect(isRustBackendDecodedVideoFrameAvailable(withEmptyMemoryId)).toBe(false);
    expect(isRustBackendDecodedVideoFrameAvailable(withShortStride)).toBe(false);
    expect(isRustBackendDecodedVideoFrameAvailable(withMismatchedByteLen)).toBe(false);
  });
});
