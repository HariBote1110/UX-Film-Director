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

    expect(result).toEqual({
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
  });
});
