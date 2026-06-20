import { describe, expect, it } from 'vitest';
import type { RustBackendSharedVideoFrame } from './rustBackendVideoDecodeControl';
import {
  prepareSharedRendererViewportNativeRenderSources,
} from './sharedRendererViewportNativeRenderSource';
import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';

const sharedFrame = (memoryId = '/uxfd-native-source-video-1'): RustBackendSharedVideoFrame => ({
  descriptor: {
    memoryId,
    slotIndex: 0,
    generation: 4,
    byteOffset: 0,
    byteLen: 1024,
    width: 4,
    height: 4,
    strideBytes: 256,
    format: 'rgba8Srgb',
    colour: {
      primaries: 'bt709',
      transfer: 'srgb',
      matrix: 'rgb',
      range: 'full',
    },
  },
  ptsFrame: 12,
});

const session = (): SharedRendererPreviewSession => ({
  plan: {
    mode: 'parallelCompare',
    primary: 'pixi',
    candidate: 'sharedRenderer',
    snapshot: {
      frame_index: 2,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [],
    },
    media: [],
  },
  presentationContract: {
    canvas: {
      colorSpace: 'srgb',
      alphaMode: 'premultiplied',
    },
    comparisonReadback: {
      target: 'offscreenRenderTarget',
      includesPageCompositing: false,
    },
    frameTiming: {
      source: 'frozenSceneSnapshot',
    },
    deviceLost: {
      fallback: 'pixi',
      staleSharedFrameAllowed: false,
    },
  },
  surfaceGate: {
    ok: true,
    canvas: {
      width: 4,
      height: 4,
    },
    snapshot: {
      frame_index: 2,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [],
    },
    media: [],
  },
});

describe('prepareSharedRendererViewportNativeRenderSources', () => {
  it('keeps decoded video frames as shared-frame descriptors for Rust native render without JS copy-out', async () => {
    const calls: unknown[] = [];
    const frame = sharedFrame();
    const result = await prepareSharedRendererViewportNativeRenderSources({
      session: session(),
      requestId: 99,
      activeJobs: [],
      rustBackendBridge: {
        startVideoDecode: async (payload) => {
          calls.push(['startVideoDecode', payload]);
          return { success: true };
        },
        requestVideoDecodeFrame: async (payload) => {
          calls.push(['requestVideoDecodeFrame', payload]);
          return {
            success: true,
            result: {
              accepted: true,
              jobId: 'shared-renderer-video-video-1-4x4-60over1',
              requestId: 99,
              frameIndex: 12,
              mode: 'latestWins',
              frame,
              verification: {
                frameIndex: 12,
                checksum: {
                  algorithm: 'crc32',
                  valueHex: '00000000',
                  byteLen: frame.descriptor.byteLen,
                },
                status: 'withinTolerance',
              },
            },
          };
        },
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          return { success: true };
        },
        stopVideoDecode: async (payload) => {
          calls.push(['stopVideoDecode', payload]);
          return { success: true };
        },
      },
      decodeRequestBuilder: () => ({
        ok: true,
        requestCount: 1,
        requests: [{
          clipId: 'clip-video-1',
          mediaId: 'video-1',
          source: '/tmp/video-1.mp4',
          sourceFrame: 12,
          sourceRate: {
            numerator: 60,
            denominator: 1,
          },
          timelineFrame: 2,
          width: 4,
          height: 4,
          format: 'rgba8Srgb',
          colour: 'rec709SrgbFullRange',
        }],
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      activeJobs: [{
        jobId: 'shared-renderer-video-video-1-4x4-60over1',
        source: '/tmp/video-1.mp4',
        slotCount: 2,
        width: 4,
        height: 4,
        sourceRate: {
          numerator: 60,
          denominator: 1,
        },
      }],
      sources: [{
        mediaId: 'video-1',
        slotCount: 2,
        frame,
      }],
    });
    if (!result.ok) throw new Error('Expected native render source preparation to succeed.');
    const source = result.sources[0] as typeof result.sources[number] & {
      releaseAfterNativeRenderComplete?: () => Promise<void>;
      releaseAfterNativeRenderAbort?: () => Promise<void>;
    };
    expect(source.releaseAfterNativeRenderComplete).toEqual(expect.any(Function));
    expect(source.releaseAfterNativeRenderAbort).toEqual(expect.any(Function));
    expect(calls).toEqual([
      ['startVideoDecode', {
        jobId: 'shared-renderer-video-video-1-4x4-60over1',
        source: '/tmp/video-1.mp4',
        slotCount: 2,
        width: 4,
        height: 4,
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
      }],
      ['requestVideoDecodeFrame', {
        jobId: 'shared-renderer-video-video-1-4x4-60over1',
        requestId: 99,
        frameIndex: 12,
        mode: 'latestWins',
      }],
    ]);

    await source.releaseAfterNativeRenderComplete?.();
    await source.releaseAfterNativeRenderAbort?.();
    await source.releaseAfterNativeRenderComplete?.();

    expect(calls).toEqual([
      ['startVideoDecode', {
        jobId: 'shared-renderer-video-video-1-4x4-60over1',
        source: '/tmp/video-1.mp4',
        slotCount: 2,
        width: 4,
        height: 4,
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
      }],
      ['requestVideoDecodeFrame', {
        jobId: 'shared-renderer-video-video-1-4x4-60over1',
        requestId: 99,
        frameIndex: 12,
        mode: 'latestWins',
      }],
      ['releaseVideoDecodeFrame', {
        jobId: 'shared-renderer-video-video-1-4x4-60over1',
        slotIndex: 0,
        generation: 4,
        copyOutState: 'gpuUploadFenceSignalled',
      }],
    ]);
  });

  it('preserves original decode dimensions when the caller disables the viewport decode edge limit', async () => {
    const calls: unknown[] = [];
    const frame = sharedFrame('/uxfd-native-source-original-video');
    const result = await prepareSharedRendererViewportNativeRenderSources({
      session: session(),
      requestId: 100,
      activeJobs: [],
      maxDecodeEdge: null,
      rustBackendBridge: {
        startVideoDecode: async (payload) => {
          calls.push(['startVideoDecode', payload]);
          return { success: true };
        },
        requestVideoDecodeFrame: async (payload) => {
          calls.push(['requestVideoDecodeFrame', payload]);
          return {
            success: true,
            result: {
              accepted: true,
              jobId: 'shared-renderer-video-video-1-3840x2160-60over1',
              requestId: 100,
              frameIndex: 12,
              mode: 'latestWins',
              frame,
              verification: {
                frameIndex: 12,
                checksum: {
                  algorithm: 'crc32',
                  valueHex: '00000000',
                  byteLen: frame.descriptor.byteLen,
                },
                status: 'withinTolerance',
              },
            },
          };
        },
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          return { success: true };
        },
        stopVideoDecode: async (payload) => {
          calls.push(['stopVideoDecode', payload]);
          return { success: true };
        },
      },
      decodeRequestBuilder: () => ({
        ok: true,
        requestCount: 1,
        requests: [{
          clipId: 'clip-video-1',
          mediaId: 'video-1',
          source: '/tmp/original-4k.mp4',
          sourceFrame: 12,
          sourceRate: {
            numerator: 60,
            denominator: 1,
          },
          timelineFrame: 2,
          width: 3840,
          height: 2160,
          format: 'rgba8Srgb',
          colour: 'rec709SrgbFullRange',
        }],
      }),
    });

    expect(result.ok).toBe(true);
    expect(calls[0]).toEqual(['startVideoDecode', {
      jobId: 'shared-renderer-video-video-1-3840x2160-60over1',
      source: '/tmp/original-4k.mp4',
      slotCount: 2,
      width: 3840,
      height: 2160,
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
    }]);
  });

  it('restarts a cached Rust decode job when native render source preparation finds no backend session', async () => {
    const calls: unknown[] = [];
    const frame = sharedFrame();
    let requestCount = 0;
    const activeJob = {
      jobId: 'shared-renderer-video-video-1-4x4-60over1',
      source: '/tmp/video-1.mp4',
      slotCount: 2,
      width: 4,
      height: 4,
      sourceRate: {
        numerator: 60,
        denominator: 1,
      },
    };

    const result = await prepareSharedRendererViewportNativeRenderSources({
      session: session(),
      requestId: 100,
      activeJobs: [activeJob],
      rustBackendBridge: {
        startVideoDecode: async (payload) => {
          calls.push(['startVideoDecode', payload]);
          return { success: true };
        },
        requestVideoDecodeFrame: async (payload) => {
          calls.push(['requestVideoDecodeFrame', payload]);
          requestCount += 1;
          if (requestCount === 1) {
            return {
              success: false,
              error: 'No active decode session',
            };
          }
          return {
            success: true,
            result: {
              accepted: true,
              jobId: payload.jobId,
              requestId: payload.requestId,
              frameIndex: payload.frameIndex,
              mode: payload.mode,
              frame,
              verification: {
                frameIndex: payload.frameIndex,
                checksum: {
                  algorithm: 'crc32',
                  valueHex: '00000000',
                  byteLen: frame.descriptor.byteLen,
                },
                status: 'withinTolerance',
              },
            },
          };
        },
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          return { success: true };
        },
        stopVideoDecode: async (payload) => {
          calls.push(['stopVideoDecode', payload]);
          return { success: true };
        },
      },
      decodeRequestBuilder: () => ({
        ok: true,
        requestCount: 1,
        requests: [{
          clipId: 'clip-video-1',
          mediaId: 'video-1',
          source: '/tmp/video-1.mp4',
          sourceFrame: 12,
          sourceRate: {
            numerator: 60,
            denominator: 1,
          },
          timelineFrame: 2,
          width: 4,
          height: 4,
          format: 'rgba8Srgb',
          colour: 'rec709SrgbFullRange',
        }],
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      activeJobs: [activeJob],
      sources: [{
        mediaId: 'video-1',
        slotCount: 2,
        frame,
      }],
    });
    expect(calls).toEqual([
      ['requestVideoDecodeFrame', {
        jobId: 'shared-renderer-video-video-1-4x4-60over1',
        requestId: 100,
        frameIndex: 12,
        mode: 'latestWins',
      }],
      ['startVideoDecode', {
        jobId: 'shared-renderer-video-video-1-4x4-60over1',
        source: '/tmp/video-1.mp4',
        slotCount: 2,
        width: 4,
        height: 4,
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
      }],
      ['requestVideoDecodeFrame', {
        jobId: 'shared-renderer-video-video-1-4x4-60over1',
        requestId: 100,
        frameIndex: 12,
        mode: 'latestWins',
      }],
    ]);
  });

  it('replaces a cached Rust decode job when native render source preparation finds no free decode frame slot', async () => {
    const calls: unknown[] = [];
    const frame = sharedFrame();
    let requestCount = 0;
    const activeJob = {
      jobId: 'shared-renderer-video-video-1-4x4-60over1',
      source: '/tmp/video-1.mp4',
      slotCount: 2,
      width: 4,
      height: 4,
      sourceRate: {
        numerator: 60,
        denominator: 1,
      },
    };

    const result = await prepareSharedRendererViewportNativeRenderSources({
      session: session(),
      requestId: 102,
      activeJobs: [activeJob],
      rustBackendBridge: {
        startVideoDecode: async (payload) => {
          calls.push(['startVideoDecode', payload]);
          return { success: true };
        },
        requestVideoDecodeFrame: async (payload) => {
          calls.push(['requestVideoDecodeFrame', payload]);
          requestCount += 1;
          if (requestCount === 1) {
            return {
              success: false,
              error: 'No free decode frame slot: NoFreeSlot',
            };
          }
          return {
            success: true,
            result: {
              accepted: true,
              jobId: payload.jobId,
              requestId: payload.requestId,
              frameIndex: payload.frameIndex,
              mode: payload.mode,
              frame,
              verification: {
                frameIndex: payload.frameIndex,
                checksum: {
                  algorithm: 'crc32',
                  valueHex: '00000000',
                  byteLen: frame.descriptor.byteLen,
                },
                status: 'withinTolerance',
              },
            },
          };
        },
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          return { success: true };
        },
        stopVideoDecode: async (payload) => {
          calls.push(['stopVideoDecode', payload]);
          return { success: true };
        },
      },
      decodeRequestBuilder: () => ({
        ok: true,
        requestCount: 1,
        requests: [{
          clipId: 'clip-video-1',
          mediaId: 'video-1',
          source: '/tmp/video-1.mp4',
          sourceFrame: 12,
          sourceRate: {
            numerator: 60,
            denominator: 1,
          },
          timelineFrame: 2,
          width: 4,
          height: 4,
          format: 'rgba8Srgb',
          colour: 'rec709SrgbFullRange',
        }],
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      activeJobs: [activeJob],
      sources: [{
        mediaId: 'video-1',
        slotCount: 2,
        frame,
      }],
    });
    expect(calls.map((call) => Array.isArray(call) ? call[0] : call)).toEqual([
      'requestVideoDecodeFrame',
      'stopVideoDecode',
      'startVideoDecode',
      'requestVideoDecodeFrame',
    ]);
    expect(calls).toContainEqual(['stopVideoDecode', {
      jobId: 'shared-renderer-video-video-1-4x4-60over1',
    }]);
  });

  it('replaces a backend-active Rust decode job when native render has no cached active job but frame slots are exhausted', async () => {
    const calls: unknown[] = [];
    const frame = sharedFrame();
    let startCount = 0;
    let requestCount = 0;

    const result = await prepareSharedRendererViewportNativeRenderSources({
      session: session(),
      requestId: 103,
      activeJobs: [],
      rustBackendBridge: {
        startVideoDecode: async (payload) => {
          calls.push(['startVideoDecode', payload]);
          startCount += 1;
          if (startCount === 1) {
            return {
              success: false,
              error: 'Decode session already active for jobId',
            };
          }
          return { success: true };
        },
        requestVideoDecodeFrame: async (payload) => {
          calls.push(['requestVideoDecodeFrame', payload]);
          requestCount += 1;
          if (requestCount === 1) {
            return {
              success: false,
              error: 'No free decode frame slot: NoFreeSlot',
            };
          }
          return {
            success: true,
            result: {
              accepted: true,
              jobId: payload.jobId,
              requestId: payload.requestId,
              frameIndex: payload.frameIndex,
              mode: payload.mode,
              frame,
              verification: {
                frameIndex: payload.frameIndex,
                checksum: {
                  algorithm: 'crc32',
                  valueHex: '00000000',
                  byteLen: frame.descriptor.byteLen,
                },
                status: 'withinTolerance',
              },
            },
          };
        },
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          return { success: true };
        },
        stopVideoDecode: async (payload) => {
          calls.push(['stopVideoDecode', payload]);
          return { success: true };
        },
      },
      decodeRequestBuilder: () => ({
        ok: true,
        requestCount: 1,
        requests: [{
          clipId: 'clip-video-1',
          mediaId: 'video-1',
          source: '/tmp/video-1.mp4',
          sourceFrame: 12,
          sourceRate: {
            numerator: 60,
            denominator: 1,
          },
          timelineFrame: 2,
          width: 4,
          height: 4,
          format: 'rgba8Srgb',
          colour: 'rec709SrgbFullRange',
        }],
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      sources: [{
        mediaId: 'video-1',
        slotCount: 2,
        frame,
      }],
    });
    expect(calls.map((call) => Array.isArray(call) ? call[0] : call)).toEqual([
      'startVideoDecode',
      'requestVideoDecodeFrame',
      'stopVideoDecode',
      'startVideoDecode',
      'requestVideoDecodeFrame',
    ]);
  });

  it('reuses a backend decode session for native render sources when start reports the same job is already active', async () => {
    const calls: unknown[] = [];
    const frame = sharedFrame();

    const result = await prepareSharedRendererViewportNativeRenderSources({
      session: session(),
      requestId: 101,
      activeJobs: [],
      rustBackendBridge: {
        startVideoDecode: async (payload) => {
          calls.push(['startVideoDecode', payload]);
          return {
            success: false,
            error: 'Decode session already active for jobId',
          };
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
              frame,
              verification: {
                frameIndex: payload.frameIndex,
                checksum: {
                  algorithm: 'crc32',
                  valueHex: '00000000',
                  byteLen: frame.descriptor.byteLen,
                },
                status: 'withinTolerance',
              },
            },
          };
        },
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          return { success: true };
        },
        stopVideoDecode: async (payload) => {
          calls.push(['stopVideoDecode', payload]);
          return { success: true };
        },
      },
      decodeRequestBuilder: () => ({
        ok: true,
        requestCount: 1,
        requests: [{
          clipId: 'clip-video-1',
          mediaId: 'video-1',
          source: '/tmp/video-1.mp4',
          sourceFrame: 12,
          sourceRate: {
            numerator: 60,
            denominator: 1,
          },
          timelineFrame: 2,
          width: 4,
          height: 4,
          format: 'rgba8Srgb',
          colour: 'rec709SrgbFullRange',
        }],
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      activeJobs: [{
        jobId: 'shared-renderer-video-video-1-4x4-60over1',
        source: '/tmp/video-1.mp4',
        slotCount: 2,
        width: 4,
        height: 4,
        sourceRate: {
          numerator: 60,
          denominator: 1,
        },
      }],
      sources: [{
        mediaId: 'video-1',
        slotCount: 2,
        frame,
      }],
    });
    expect(calls.map((call) => Array.isArray(call) ? call[0] : call)).toEqual([
      'startVideoDecode',
      'requestVideoDecodeFrame',
    ]);
  });

  it('rejects native render source release callbacks when Rust decode slot release returns success false', async () => {
    const frame = sharedFrame();
    const result = await prepareSharedRendererViewportNativeRenderSources({
      session: session(),
      requestId: 99,
      activeJobs: [],
      rustBackendBridge: {
        startVideoDecode: async () => ({ success: true }),
        requestVideoDecodeFrame: async () => ({
          success: true,
          result: {
            accepted: true,
            jobId: 'shared-renderer-video-video-1-4x4-60over1',
            requestId: 99,
            frameIndex: 12,
            mode: 'latestWins',
            frame,
            verification: {
              frameIndex: 12,
              checksum: {
                algorithm: 'crc32',
                valueHex: '00000000',
                byteLen: frame.descriptor.byteLen,
              },
              status: 'withinTolerance',
            },
          },
        }),
        releaseVideoDecodeFrame: async () => ({
          success: false,
          error: 'native render source release returned false',
        }),
        stopVideoDecode: async () => ({ success: true }),
      },
      decodeRequestBuilder: () => ({
        ok: true,
        requestCount: 1,
        requests: [{
          clipId: 'clip-video-1',
          mediaId: 'video-1',
          source: '/tmp/video-1.mp4',
          sourceFrame: 12,
          sourceRate: {
            numerator: 60,
            denominator: 1,
          },
          timelineFrame: 2,
          width: 4,
          height: 4,
          format: 'rgba8Srgb',
          colour: 'rec709SrgbFullRange',
        }],
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected native render source preparation to succeed.');

    await expect(result.sources[0].releaseAfterNativeRenderComplete?.()).rejects.toThrow(
      'native render source release returned false'
    );
  });

  it('reports stale decoded frame release failure instead of hiding it as a stale response', async () => {
    const frame = sharedFrame();
    const result = await prepareSharedRendererViewportNativeRenderSources({
      session: session(),
      requestId: 99,
      activeJobs: [],
      rustBackendBridge: {
        startVideoDecode: async () => ({ success: true }),
        requestVideoDecodeFrame: async () => ({
          success: true,
          result: {
            accepted: true,
            jobId: 'shared-renderer-video-video-1-4x4-60over1',
            requestId: 98,
            frameIndex: 12,
            mode: 'latestWins',
            frame,
            verification: {
              frameIndex: 12,
              checksum: {
                algorithm: 'crc32',
                valueHex: '00000000',
                byteLen: frame.descriptor.byteLen,
              },
              status: 'withinTolerance',
            },
          },
        }),
        releaseVideoDecodeFrame: async () => ({
          success: false,
          error: 'stale native render source release failed',
        }),
        stopVideoDecode: async () => ({ success: true }),
      },
      decodeRequestBuilder: () => ({
        ok: true,
        requestCount: 1,
        requests: [{
          clipId: 'clip-video-1',
          mediaId: 'video-1',
          source: '/tmp/video-1.mp4',
          sourceFrame: 12,
          sourceRate: {
            numerator: 60,
            denominator: 1,
          },
          timelineFrame: 2,
          width: 4,
          height: 4,
          format: 'rgba8Srgb',
          colour: 'rec709SrgbFullRange',
        }],
      }),
    });

    expect(result).toEqual({
      ok: false,
      reason: 'staleDecodeReleaseFailed',
      detail: 'stale native render source release failed',
      activeJobs: [{
        jobId: 'shared-renderer-video-video-1-4x4-60over1',
        source: '/tmp/video-1.mp4',
        slotCount: 2,
        width: 4,
        height: 4,
        sourceRate: {
          numerator: 60,
          denominator: 1,
        },
      }],
    });
  });

  it('rejects stale decoded frame job ids and releases the returned slot without using it as a native render source', async () => {
    const calls: unknown[] = [];
    const frame = sharedFrame('/uxfd-native-source-stale-video');
    const result = await prepareSharedRendererViewportNativeRenderSources({
      session: session(),
      requestId: 99,
      activeJobs: [],
      rustBackendBridge: {
        startVideoDecode: async (payload) => {
          calls.push(['startVideoDecode', payload]);
          return { success: true };
        },
        requestVideoDecodeFrame: async (payload) => {
          calls.push(['requestVideoDecodeFrame', payload]);
          return {
            success: true,
            result: {
              accepted: true,
              jobId: 'shared-renderer-video-stale-video-4x4-60over1',
              requestId: payload.requestId,
              frameIndex: payload.frameIndex,
              mode: 'latestWins',
              frame,
              verification: {
                frameIndex: payload.frameIndex,
                checksum: {
                  algorithm: 'crc32',
                  valueHex: '00000000',
                  byteLen: frame.descriptor.byteLen,
                },
                status: 'withinTolerance',
              },
            },
          };
        },
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          return { success: true };
        },
        stopVideoDecode: async (payload) => {
          calls.push(['stopVideoDecode', payload]);
          return { success: true };
        },
      },
      decodeRequestBuilder: () => ({
        ok: true,
        requestCount: 1,
        requests: [{
          clipId: 'clip-video-1',
          mediaId: 'video-1',
          source: '/tmp/video-1.mp4',
          sourceFrame: 12,
          sourceRate: {
            numerator: 60,
            denominator: 1,
          },
          timelineFrame: 2,
          width: 4,
          height: 4,
          format: 'rgba8Srgb',
          colour: 'rec709SrgbFullRange',
        }],
      }),
    });

    expect(result).toEqual({
      ok: false,
      reason: 'staleDecodeResponse',
      detail: 'Rust backend returned a decoded frame for a stale job id. clip=clip-video-1 media=video-1',
      activeJobs: [{
        jobId: 'shared-renderer-video-video-1-4x4-60over1',
        source: '/tmp/video-1.mp4',
        slotCount: 2,
        width: 4,
        height: 4,
        sourceRate: {
          numerator: 60,
          denominator: 1,
        },
      }],
    });
    expect(calls).toContainEqual(['releaseVideoDecodeFrame', {
      jobId: 'shared-renderer-video-stale-video-4x4-60over1',
      slotIndex: 0,
      generation: 4,
      copyOutState: 'rendererUploadAborted',
    }]);
  });

  it('aborts already prepared native render sources when a later multi-video decode response is stale', async () => {
    const calls: unknown[] = [];
    const firstFrame = sharedFrame('/uxfd-native-source-video-1');
    const staleSecondFrame = {
      ...sharedFrame('/uxfd-native-source-stale-video-2'),
      ptsFrame: 7,
    };
    const result = await prepareSharedRendererViewportNativeRenderSources({
      session: session(),
      requestId: 99,
      activeJobs: [],
      rustBackendBridge: {
        startVideoDecode: async (payload) => {
          calls.push(['startVideoDecode', payload]);
          return { success: true };
        },
        requestVideoDecodeFrame: async (payload) => {
          calls.push(['requestVideoDecodeFrame', payload]);
          const isFirstVideo = payload.jobId === 'shared-renderer-video-video-1-4x4-60over1';
          const frame = isFirstVideo ? firstFrame : staleSecondFrame;
          return {
            success: true,
            result: {
              accepted: true,
              jobId: isFirstVideo
                ? payload.jobId
                : 'shared-renderer-video-stale-video-2-80x45-30over1',
              requestId: payload.requestId,
              frameIndex: payload.frameIndex,
              mode: 'latestWins',
              frame,
              verification: {
                frameIndex: payload.frameIndex,
                checksum: {
                  algorithm: 'crc32',
                  valueHex: '00000000',
                  byteLen: frame.descriptor.byteLen,
                },
                status: 'withinTolerance',
              },
            },
          };
        },
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          return { success: true };
        },
        stopVideoDecode: async (payload) => {
          calls.push(['stopVideoDecode', payload]);
          return { success: true };
        },
      },
      decodeRequestBuilder: () => ({
        ok: true,
        requestCount: 2,
        requests: [
          {
            clipId: 'clip-video-1',
            mediaId: 'video-1',
            source: '/tmp/video-1.mp4',
            sourceFrame: 12,
            sourceRate: {
              numerator: 60,
              denominator: 1,
            },
            timelineFrame: 2,
            width: 4,
            height: 4,
            format: 'rgba8Srgb',
            colour: 'rec709SrgbFullRange',
          },
          {
            clipId: 'clip-video-2',
            mediaId: 'video-2',
            source: '/tmp/video-2.mp4',
            sourceFrame: 7,
            sourceRate: {
              numerator: 30,
              denominator: 1,
            },
            timelineFrame: 2,
            width: 80,
            height: 45,
            format: 'rgba8Srgb',
            colour: 'rec709SrgbFullRange',
          },
        ],
      }),
    });

    expect(result).toEqual({
      ok: false,
      reason: 'staleDecodeResponse',
      detail: 'Rust backend returned a decoded frame for a stale job id. clip=clip-video-2 media=video-2',
      activeJobs: [
        {
          jobId: 'shared-renderer-video-video-1-4x4-60over1',
          source: '/tmp/video-1.mp4',
          slotCount: 2,
          width: 4,
          height: 4,
          sourceRate: {
            numerator: 60,
            denominator: 1,
          },
        },
        {
          jobId: 'shared-renderer-video-video-2-80x45-30over1',
          source: '/tmp/video-2.mp4',
          slotCount: 2,
          width: 80,
          height: 45,
          sourceRate: {
            numerator: 30,
            denominator: 1,
          },
        },
      ],
    });
    expect(calls).toContainEqual(['releaseVideoDecodeFrame', {
      jobId: 'shared-renderer-video-stale-video-2-80x45-30over1',
      slotIndex: 0,
      generation: 4,
      copyOutState: 'rendererUploadAborted',
    }]);
    expect(calls).toContainEqual(['releaseVideoDecodeFrame', {
      jobId: 'shared-renderer-video-video-1-4x4-60over1',
      slotIndex: 0,
      generation: 4,
      copyOutState: 'rendererUploadAborted',
    }]);
  });

  it('aborts already prepared native render sources when a later multi-video decode request fails', async () => {
    const calls: unknown[] = [];
    const firstFrame = sharedFrame('/uxfd-native-source-video-1');
    const result = await prepareSharedRendererViewportNativeRenderSources({
      session: session(),
      requestId: 99,
      activeJobs: [],
      rustBackendBridge: {
        startVideoDecode: async (payload) => {
          calls.push(['startVideoDecode', payload]);
          return { success: true };
        },
        requestVideoDecodeFrame: async (payload) => {
          calls.push(['requestVideoDecodeFrame', payload]);
          if (payload.jobId === 'shared-renderer-video-video-2-80x45-30over1') {
            return {
              success: false,
              error: 'second native render decode failed',
            };
          }
          return {
            success: true,
            result: {
              accepted: true,
              jobId: payload.jobId,
              requestId: payload.requestId,
              frameIndex: payload.frameIndex,
              mode: 'latestWins',
              frame: firstFrame,
              verification: {
                frameIndex: payload.frameIndex,
                checksum: {
                  algorithm: 'crc32',
                  valueHex: '00000000',
                  byteLen: firstFrame.descriptor.byteLen,
                },
                status: 'withinTolerance',
              },
            },
          };
        },
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          return { success: true };
        },
        stopVideoDecode: async (payload) => {
          calls.push(['stopVideoDecode', payload]);
          return { success: true };
        },
      },
      decodeRequestBuilder: () => ({
        ok: true,
        requestCount: 2,
        requests: [
          {
            clipId: 'clip-video-1',
            mediaId: 'video-1',
            source: '/tmp/video-1.mp4',
            sourceFrame: 12,
            sourceRate: {
              numerator: 60,
              denominator: 1,
            },
            timelineFrame: 2,
            width: 4,
            height: 4,
            format: 'rgba8Srgb',
            colour: 'rec709SrgbFullRange',
          },
          {
            clipId: 'clip-video-2',
            mediaId: 'video-2',
            source: '/tmp/video-2.mp4',
            sourceFrame: 7,
            sourceRate: {
              numerator: 30,
              denominator: 1,
            },
            timelineFrame: 2,
            width: 80,
            height: 45,
            format: 'rgba8Srgb',
            colour: 'rec709SrgbFullRange',
          },
        ],
      }),
    });

    expect(result).toEqual({
      ok: false,
      reason: 'frameDecodeFailed',
      detail: 'second native render decode failed',
      activeJobs: [
        {
          jobId: 'shared-renderer-video-video-1-4x4-60over1',
          source: '/tmp/video-1.mp4',
          slotCount: 2,
          width: 4,
          height: 4,
          sourceRate: {
            numerator: 60,
            denominator: 1,
          },
        },
        {
          jobId: 'shared-renderer-video-video-2-80x45-30over1',
          source: '/tmp/video-2.mp4',
          slotCount: 2,
          width: 80,
          height: 45,
          sourceRate: {
            numerator: 30,
            denominator: 1,
          },
        },
      ],
    });
    expect(calls).toContainEqual(['releaseVideoDecodeFrame', {
      jobId: 'shared-renderer-video-video-1-4x4-60over1',
      slotIndex: 0,
      generation: 4,
      copyOutState: 'rendererUploadAborted',
    }]);
  });

  it('reports prepared native render source abort release failure separately from the stale frame release', async () => {
    const calls: unknown[] = [];
    const firstFrame = sharedFrame('/uxfd-native-source-video-1');
    const staleSecondFrame = {
      ...sharedFrame('/uxfd-native-source-stale-video-2'),
      ptsFrame: 7,
    };
    const result = await prepareSharedRendererViewportNativeRenderSources({
      session: session(),
      requestId: 99,
      activeJobs: [],
      rustBackendBridge: {
        startVideoDecode: async (payload) => {
          calls.push(['startVideoDecode', payload]);
          return { success: true };
        },
        requestVideoDecodeFrame: async (payload) => {
          calls.push(['requestVideoDecodeFrame', payload]);
          const isFirstVideo = payload.jobId === 'shared-renderer-video-video-1-4x4-60over1';
          const frame = isFirstVideo ? firstFrame : staleSecondFrame;
          return {
            success: true,
            result: {
              accepted: true,
              jobId: isFirstVideo
                ? payload.jobId
                : 'shared-renderer-video-stale-video-2-80x45-30over1',
              requestId: payload.requestId,
              frameIndex: payload.frameIndex,
              mode: 'latestWins',
              frame,
              verification: {
                frameIndex: payload.frameIndex,
                checksum: {
                  algorithm: 'crc32',
                  valueHex: '00000000',
                  byteLen: frame.descriptor.byteLen,
                },
                status: 'withinTolerance',
              },
            },
          };
        },
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          if (payload.jobId === 'shared-renderer-video-video-1-4x4-60over1') {
            return {
              success: false,
              error: 'prepared native render source abort release failed',
            };
          }
          return { success: true };
        },
        stopVideoDecode: async (payload) => {
          calls.push(['stopVideoDecode', payload]);
          return { success: true };
        },
      },
      decodeRequestBuilder: () => ({
        ok: true,
        requestCount: 2,
        requests: [
          {
            clipId: 'clip-video-1',
            mediaId: 'video-1',
            source: '/tmp/video-1.mp4',
            sourceFrame: 12,
            sourceRate: {
              numerator: 60,
              denominator: 1,
            },
            timelineFrame: 2,
            width: 4,
            height: 4,
            format: 'rgba8Srgb',
            colour: 'rec709SrgbFullRange',
          },
          {
            clipId: 'clip-video-2',
            mediaId: 'video-2',
            source: '/tmp/video-2.mp4',
            sourceFrame: 7,
            sourceRate: {
              numerator: 30,
              denominator: 1,
            },
            timelineFrame: 2,
            width: 80,
            height: 45,
            format: 'rgba8Srgb',
            colour: 'rec709SrgbFullRange',
          },
        ],
      }),
    });

    expect(result).toEqual({
      ok: false,
      reason: 'preparedNativeRenderSourceAbortReleaseFailed',
      detail: 'prepared native render source abort release failed',
      activeJobs: [
        {
          jobId: 'shared-renderer-video-video-1-4x4-60over1',
          source: '/tmp/video-1.mp4',
          slotCount: 2,
          width: 4,
          height: 4,
          sourceRate: {
            numerator: 60,
            denominator: 1,
          },
        },
        {
          jobId: 'shared-renderer-video-video-2-80x45-30over1',
          source: '/tmp/video-2.mp4',
          slotCount: 2,
          width: 80,
          height: 45,
          sourceRate: {
            numerator: 30,
            denominator: 1,
          },
        },
      ],
    });
    expect(calls).toContainEqual(['releaseVideoDecodeFrame', {
      jobId: 'shared-renderer-video-stale-video-2-80x45-30over1',
      slotIndex: 0,
      generation: 4,
      copyOutState: 'rendererUploadAborted',
    }]);
    expect(calls).toContainEqual(['releaseVideoDecodeFrame', {
      jobId: 'shared-renderer-video-video-1-4x4-60over1',
      slotIndex: 0,
      generation: 4,
      copyOutState: 'rendererUploadAborted',
    }]);
  });

  it('reports prepared native render source abort release failure when a later multi-video decode start fails', async () => {
    const calls: unknown[] = [];
    const firstFrame = sharedFrame('/uxfd-native-source-video-1');
    const result = await prepareSharedRendererViewportNativeRenderSources({
      session: session(),
      requestId: 99,
      activeJobs: [],
      rustBackendBridge: {
        startVideoDecode: async (payload) => {
          calls.push(['startVideoDecode', payload]);
          if (payload.jobId === 'shared-renderer-video-video-2-80x45-30over1') {
            return {
              success: false,
              error: 'second native render decode start failed',
            };
          }
          return { success: true };
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
              mode: 'latestWins',
              frame: firstFrame,
              verification: {
                frameIndex: payload.frameIndex,
                checksum: {
                  algorithm: 'crc32',
                  valueHex: '00000000',
                  byteLen: firstFrame.descriptor.byteLen,
                },
                status: 'withinTolerance',
              },
            },
          };
        },
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          return {
            success: false,
            error: 'prepared source release after start failure failed',
          };
        },
        stopVideoDecode: async (payload) => {
          calls.push(['stopVideoDecode', payload]);
          return { success: true };
        },
      },
      decodeRequestBuilder: () => ({
        ok: true,
        requestCount: 2,
        requests: [
          {
            clipId: 'clip-video-1',
            mediaId: 'video-1',
            source: '/tmp/video-1.mp4',
            sourceFrame: 12,
            sourceRate: {
              numerator: 60,
              denominator: 1,
            },
            timelineFrame: 2,
            width: 4,
            height: 4,
            format: 'rgba8Srgb',
            colour: 'rec709SrgbFullRange',
          },
          {
            clipId: 'clip-video-2',
            mediaId: 'video-2',
            source: '/tmp/video-2.mp4',
            sourceFrame: 7,
            sourceRate: {
              numerator: 30,
              denominator: 1,
            },
            timelineFrame: 2,
            width: 80,
            height: 45,
            format: 'rgba8Srgb',
            colour: 'rec709SrgbFullRange',
          },
        ],
      }),
    });

    expect(result).toEqual({
      ok: false,
      reason: 'preparedNativeRenderSourceAbortReleaseFailed',
      detail: 'prepared source release after start failure failed',
      activeJobs: [{
        jobId: 'shared-renderer-video-video-1-4x4-60over1',
        source: '/tmp/video-1.mp4',
        slotCount: 2,
        width: 4,
        height: 4,
        sourceRate: {
          numerator: 60,
          denominator: 1,
        },
      }],
    });
    expect(calls).toContainEqual(['releaseVideoDecodeFrame', {
      jobId: 'shared-renderer-video-video-1-4x4-60over1',
      slotIndex: 0,
      generation: 4,
      copyOutState: 'rendererUploadAborted',
    }]);
  });
});
