import { describe, expect, it } from 'vitest';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';
import {
  prepareSharedRendererViewportVideoUpload,
  prepareSharedRendererViewportVideoUploads,
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
const expectedSecondJobId = 'shared-renderer-video-video-2-80x45-30over1';

const multiVideoSession: SharedRendererPreviewSession = {
  ...session,
  plan: {
    ...session.plan,
    snapshot: {
      ...session.plan.snapshot,
      clips: [
        ...session.plan.snapshot.clips,
        {
          clip_id: 'video-2',
          track_id: 'layer-1',
          media_id: 'video-2',
          source_frame: 7,
          z_index: 1,
          transform: {
            translation_x: 80,
            translation_y: 45,
            scale_x: 1,
            scale_y: 1,
            rotation_degrees: 0,
            sampling: 'bilinear',
          },
          opacity: 1,
          effects: [],
        },
      ],
    },
    media: [
      ...session.plan.media,
      {
        id: 'video-2',
        kind: 'Video',
        source: '/tmp/second clip.mp4',
        width: 80,
        height: 45,
        source_rate: {
          numerator: 30,
          denominator: 1,
        },
      },
    ],
  },
  surfaceGate: {
    ...session.surfaceGate,
    snapshot: {
      ...session.surfaceGate.snapshot,
      clips: [
        ...session.surfaceGate.snapshot.clips,
        {
          clip_id: 'video-2',
          track_id: 'layer-1',
          media_id: 'video-2',
          source_frame: 7,
          z_index: 1,
          transform: {
            translation_x: 80,
            translation_y: 45,
            scale_x: 1,
            scale_y: 1,
            rotation_degrees: 0,
            sampling: 'bilinear',
          },
          opacity: 1,
          effects: [],
        },
      ],
    },
    media: [
      ...session.surfaceGate.media,
      {
        id: 'video-2',
        kind: 'Video',
        source: '/tmp/second clip.mp4',
        width: 80,
        height: 45,
        source_rate: {
          numerator: 30,
          denominator: 1,
        },
      },
    ],
  },
};

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
    stopVideoDecode: async (payload) => {
      calls.push(['stopVideoDecode', payload]);
      return { success: true, result: { stopped: true, jobId: payload.jobId } };
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
  it('prepares Rust decoded uploads for every visible video without stopping other active jobs', async () => {
    const { calls, rustBackendBridge, copyBridge } = createBridges();

    const result = await prepareSharedRendererViewportVideoUploads({
      session: multiVideoSession,
      requestId: 80,
      slotCount: 2,
      activeJobs: [],
      rustBackendBridge,
      copyBridge,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected multi-video viewport upload preparation to succeed');
    expect(result.activeJobs.map((job) => job.jobId)).toEqual([
      expectedJobId,
      expectedSecondJobId,
    ]);
    expect(result.uploads.map(({ request }) => request.mediaId)).toEqual([
      'video-1',
      'video-2',
    ]);
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
        requestId: 80,
        frameIndex: 42,
        mode: 'latestWins',
      }],
      ['copyIntoUploadBuffer', {
        memoryId: '/uxfd-node-video-ring',
        slotCount: 2,
        slotByteLen: 8192,
        ptsFrame: 42,
      }, 8192],
      ['startVideoDecode', {
        jobId: expectedSecondJobId,
        source: '/tmp/second clip.mp4',
        slotCount: 2,
        width: 80,
        height: 45,
        sourceRate: {
          numerator: 30,
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
        jobId: expectedSecondJobId,
        requestId: 80,
        frameIndex: 7,
        mode: 'latestWins',
      }],
      ['copyIntoUploadBuffer', {
        memoryId: '/uxfd-node-video-ring',
        slotCount: 2,
        slotByteLen: 8192,
        ptsFrame: 7,
      }, 8192],
    ]);
    expect(calls).not.toContainEqual(['stopVideoDecode', expect.anything()]);
  });

  it('stops active Rust decode jobs that are no longer visible', async () => {
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
    const staleJob: SharedRendererViewportVideoDecodeJob = {
      jobId: 'shared-renderer-video-stale-64x32-60over1',
      source: '/tmp/stale clip.mp4',
      slotCount: 2,
      width: 64,
      height: 32,
      sourceRate: {
        numerator: 60,
        denominator: 1,
      },
    };

    const result = await prepareSharedRendererViewportVideoUploads({
      session,
      requestId: 81,
      slotCount: 2,
      activeJobs: [activeJob, staleJob],
      rustBackendBridge,
      copyBridge,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected stale job cleanup to preserve visible upload');
    expect(result.activeJobs).toEqual([activeJob]);
    expect(calls).toEqual([
      ['stopVideoDecode', {
        jobId: 'shared-renderer-video-stale-64x32-60over1',
      }],
      ['requestVideoDecodeFrame', {
        jobId: expectedJobId,
        requestId: 81,
        frameIndex: 42,
        mode: 'latestWins',
      }],
      ['copyIntoUploadBuffer', {
        memoryId: '/uxfd-node-video-ring',
        slotCount: 2,
        slotByteLen: 8192,
        ptsFrame: 42,
      }, 8192],
    ]);
  });

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

  it('stops a stale active decode job before starting a different video source', async () => {
    const { calls, rustBackendBridge, copyBridge } = createBridges();
    const staleJob: SharedRendererViewportVideoDecodeJob = {
      jobId: 'shared-renderer-video-old-video-64x32-60over1',
      source: '/tmp/old clip.mp4',
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
      requestId: 79,
      slotCount: 2,
      activeJob: staleJob,
      rustBackendBridge,
      copyBridge,
    });

    expect(result.ok).toBe(true);
    expect(calls.slice(0, 2)).toEqual([
      ['stopVideoDecode', {
        jobId: 'shared-renderer-video-old-video-64x32-60over1',
      }],
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
    ]);
  });

  it('rejects a stale decode response request id and releases its slot without copying', async () => {
    const calls: unknown[] = [];
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
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
            jobId: payload.jobId,
            requestId: payload.requestId - 1,
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
      stopVideoDecode: async () => ({ success: true }),
    };

    const result = await prepareSharedRendererViewportVideoUpload({
      session,
      requestId: 79,
      slotCount: 2,
      rustBackendBridge,
      copyBridge: {
        copyIntoUploadBuffer: async () => {
          throw new Error('stale decode response must not be copied');
        },
      },
    });

    expect(result).toEqual({
      ok: false,
      reason: 'staleDecodeResponse',
      detail: 'Rust backend returned a decoded frame for a stale request id.',
      activeJob: {
        jobId: expectedJobId,
        source: '/tmp/gopro clip.mp4',
        slotCount: 2,
        width: 64,
        height: 32,
        sourceRate: {
          numerator: 60,
          denominator: 1,
        },
      },
    });
    expect(calls).toContainEqual(['releaseVideoDecodeFrame', {
      jobId: expectedJobId,
      slotIndex: 0,
      generation: 3,
      copyOutState: 'rendererUploadAborted',
    }]);
  });
});
