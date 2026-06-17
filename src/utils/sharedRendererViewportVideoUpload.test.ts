import { describe, expect, it } from 'vitest';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';
import {
  prepareSharedRendererViewportVideoUpload,
  type SharedRendererViewportVideoDecodeJob,
} from './sharedRendererViewportVideoUpload';
import type { RustBackendVideoDecodeBridge } from './rustBackendVideoDecodeControl';
import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
import type { SharedVideoFrameCopyBridge } from './sharedVideoFrameUploadBridge';

const session: SharedRendererPreviewSession = {
  plan: {
    mode: 'parallelCompare',
    primary: 'pixi',
    candidate: 'sharedRenderer',
    snapshot: {
      frame_index: 12,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'video-1',
        track_id: 'layer-0',
        media_id: 'video-1',
        source_frame: 42,
        z_index: 0,
        transform: {
          translation_x: 0,
          translation_y: 0,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'bilinear',
        },
        opacity: 1,
        effects: [],
      }],
    },
    media: [{
      id: 'video-1',
      kind: 'Video',
      source: '/tmp/gopro clip.mp4',
      width: 64,
      height: 32,
      source_rate: {
        numerator: 60,
        denominator: 1,
      },
    }],
  },
  surfaceGate: {
    ok: true,
    canvas: {
      width: 1920,
      height: 1080,
    },
    snapshot: {
      frame_index: 12,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'video-1',
        track_id: 'layer-0',
        media_id: 'video-1',
        source_frame: 42,
        z_index: 0,
        transform: {
          translation_x: 0,
          translation_y: 0,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'bilinear',
        },
        opacity: 1,
        effects: [],
      }],
    },
    media: [{
      id: 'video-1',
      kind: 'Video',
      source: '/tmp/gopro clip.mp4',
      width: 64,
      height: 32,
      source_rate: {
        numerator: 60,
        denominator: 1,
      },
    }],
  },
  presentationContract: buildSharedRendererPresentationContract(),
};

const expectedJobId = 'shared-renderer-video-video-1-64x32-60over1';

const createBridges = () => {
  const calls: unknown[] = [];
  const rustBackendBridge: RustBackendVideoDecodeBridge = {
    startVideoDecode: async (payload) => {
      calls.push(['startVideoDecode', payload]);
      return {
        success: true,
        result: {
          jobId: payload.jobId,
          memoryId: '/uxfd-node-video-ring',
          slotCount: payload.slotCount,
          slotByteLen: 8192,
          width: payload.width,
          height: payload.height,
          strideBytes: 256,
          sourceRate: payload.sourceRate,
          format: payload.format,
          colour: payload.colour,
        },
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
          frame: {
            descriptor: {
              memoryId: '/uxfd-node-video-ring',
              slotIndex: 0,
              generation: 3,
              byteOffset: 0,
              byteLen: 8192,
              width: 64,
              height: 32,
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
              valueHex: '12345678',
              byteLen: 8192,
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
  };
  const copyBridge: SharedVideoFrameCopyBridge = {
    copyIntoUploadBuffer: async (payload, target) => {
      calls.push(['copyIntoUploadBuffer', payload, target.byteLength]);
      target.fill(0x6a);
      return {
        success: true,
        result: {
          sequence: payload.ptsFrame,
          byteLen: target.byteLength,
          expectedChecksum: 0x1234,
          actualChecksum: 0x1234,
        },
      };
    },
  };

  return { calls, rustBackendBridge, copyBridge };
};

describe('sharedRendererViewportVideoUpload', () => {
  it('starts Rust decode, requests the visible frame, and prepares a WebGPU upload object', async () => {
    const { calls, rustBackendBridge, copyBridge } = createBridges();

    const result = await prepareSharedRendererViewportVideoUpload({
      session,
      requestId: 77,
      slotCount: 2,
      rustBackendBridge,
      copyBridge,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected viewport upload preparation to succeed');
    expect(result.activeJob).toEqual({
      jobId: expectedJobId,
      source: '/tmp/gopro clip.mp4',
      slotCount: 2,
      width: 64,
      height: 32,
      sourceRate: {
        numerator: 60,
        denominator: 1,
      },
    });
    expect(result.upload.rgbaBytes[0]).toBe(0x6a);
    expect(result.upload.descriptor.memoryId).toBe('/uxfd-node-video-ring');

    await result.upload.releaseAfterGpuUpload?.();

    expect(calls).toEqual([
      ['startVideoDecode', {
        jobId: expectedJobId,
        source: '/tmp/gopro clip.mp4',
        slotCount: 2,
        width: 64,
        height: 32,
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
        jobId: expectedJobId,
        requestId: 77,
        frameIndex: 42,
        mode: 'latestWins',
      }],
      ['copyIntoUploadBuffer', {
        memoryId: '/uxfd-node-video-ring',
        slotCount: 2,
        slotByteLen: 8192,
        ptsFrame: 42,
      }, 8192],
      ['releaseVideoDecodeFrame', {
        jobId: expectedJobId,
        slotIndex: 0,
        generation: 3,
        copyOutState: 'gpuUploadFenceSignalled',
      }],
    ]);
  });

  it('reuses an active decode job for the same video source and layout', async () => {
    const { calls, rustBackendBridge, copyBridge } = createBridges();
    const activeJob: SharedRendererViewportVideoDecodeJob = {
      jobId: expectedJobId,
      source: '/tmp/gopro clip.mp4',
      slotCount: 2,
      width: 64,
      height: 32,
      sourceRate: {
        numerator: 60,
        denominator: 1,
      },
    };

    const result = await prepareSharedRendererViewportVideoUpload({
      session,
      requestId: 78,
      slotCount: 2,
      activeJob,
      rustBackendBridge,
      copyBridge,
    });

    expect(result.ok).toBe(true);
    expect(calls[0]).toEqual(['requestVideoDecodeFrame', {
      jobId: expectedJobId,
      requestId: 78,
      frameIndex: 42,
      mode: 'latestWins',
    }]);
    expect(calls).not.toContainEqual(['startVideoDecode', expect.anything()]);
  });
});
