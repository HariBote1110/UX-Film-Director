import { describe, expect, it } from 'vitest';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';
import {
  prepareSharedRendererViewportNativeOverlayPresent,
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

type ComparablePreviewPlan = Extract<SharedRendererPreviewSession['plan'], { mode: 'parallelCompare' }>;
type ReadyPreviewSurfaceGate = Extract<SharedRendererPreviewSession['surfaceGate'], { ok: true }>;

const basePlan = session.plan as ComparablePreviewPlan;
const baseSurfaceGate = session.surfaceGate as ReadyPreviewSurfaceGate;

const imageVideoSession: SharedRendererPreviewSession = {
  ...session,
  plan: {
    ...basePlan,
    snapshot: {
      ...basePlan.snapshot,
      clips: [
        {
          clip_id: 'image-1',
          track_id: 'layer-0',
          media_id: 'image-1',
          source_frame: 0,
          z_index: 0,
          transform: {
            translation_x: 12,
            translation_y: 8,
            scale_x: 1,
            scale_y: 1,
            rotation_degrees: 0,
            sampling: 'bilinear',
          },
          opacity: 1,
          effects: [],
        },
        {
          ...basePlan.snapshot.clips[0],
          z_index: 1,
        },
      ],
    },
    media: [
      {
        id: 'image-1',
        kind: 'Image',
        source: '/tmp/poster.png',
        width: 128,
        height: 72,
      },
      ...basePlan.media,
    ],
  },
  surfaceGate: {
    ...baseSurfaceGate,
    snapshot: {
      ...baseSurfaceGate.snapshot,
      clips: [
        {
          clip_id: 'image-1',
          track_id: 'layer-0',
          media_id: 'image-1',
          source_frame: 0,
          z_index: 0,
          transform: {
            translation_x: 12,
            translation_y: 8,
            scale_x: 1,
            scale_y: 1,
            rotation_degrees: 0,
            sampling: 'bilinear',
          },
          opacity: 1,
          effects: [],
        },
        {
          ...baseSurfaceGate.snapshot.clips[0],
          z_index: 1,
        },
      ],
    },
    media: [
      {
        id: 'image-1',
        kind: 'Image',
        source: '/tmp/poster.png',
        width: 128,
        height: 72,
      },
      ...baseSurfaceGate.media,
    ],
  },
};

const multiVideoSession: SharedRendererPreviewSession = {
  ...session,
  plan: {
    ...basePlan,
    snapshot: {
      ...basePlan.snapshot,
      clips: [
        ...basePlan.snapshot.clips,
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
      ...basePlan.media,
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
    ...baseSurfaceGate,
    snapshot: {
      ...baseSurfaceGate.snapshot,
      clips: [
        ...baseSurfaceGate.snapshot.clips,
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
      ...baseSurfaceGate.media,
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
          slotIndex: payload.slotIndex,
          generation: payload.generation,
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
  it('presents a scene snapshot with image media through Native Overlay without copying into a WebGPU upload buffer', async () => {
    const { calls, rustBackendBridge, copyBridge } = createBridges();
    const nativeOverlayBridge = {
      presentSharedFrame: async (payload: any) => {
        calls.push(['presentSharedFrame', payload]);
        return {
          success: true,
          attached: true,
          releaseFrame: {
            memoryId: payload.frame.descriptor.memoryId,
            slotIndex: payload.frame.descriptor.slotIndex,
            generation: payload.frame.descriptor.generation,
            ptsFrame: payload.frame.ptsFrame,
            copyOutState: 'gpuUploadFenceSignalled' as const,
          },
        };
      },
    };

    const result = await prepareSharedRendererViewportNativeOverlayPresent({
      windowId: 7,
      session: imageVideoSession,
      requestId: 80,
      slotCount: 2,
      activeJob: null,
      rustBackendBridge,
      nativeOverlayBridge,
      copyBridge,
    });

    expect(result).toEqual({
      ok: true,
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
      ['presentSharedFrame', {
        windowId: 7,
        mediaId: expectedJobId,
        snapshot: {
          frameIndex: 12,
          colour: {
            profile: 'rec709-sdr',
            workingSpace: 'linear-light',
            alpha: 'premultiplied',
          },
          clips: [
            {
              clipId: 'image-1',
              trackId: 'layer-0',
              mediaId: 'image-1',
              sourceFrame: 0,
              zIndex: 0,
              transform: {
                translationX: 12,
                translationY: 8,
                scaleX: 1,
                scaleY: 1,
                rotationDegrees: 0,
                sampling: 'bilinear',
              },
              opacity: 1,
            },
            {
              clipId: 'video-1',
              trackId: 'layer-0',
              mediaId: 'video-1',
              sourceFrame: 42,
              zIndex: 1,
              transform: {
                translationX: 0,
                translationY: 0,
                scaleX: 1,
                scaleY: 1,
                rotationDegrees: 0,
                sampling: 'bilinear',
              },
              opacity: 1,
            },
          ],
        },
        media: [
          {
            id: 'image-1',
            kind: 'Image',
            source: '/tmp/poster.png',
            width: 128,
            height: 72,
          },
          {
            id: 'video-1',
            kind: 'Video',
            source: '/tmp/gopro clip.mp4',
            width: 64,
            height: 32,
          },
        ],
        slotCount: 2,
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
          ptsFrame: 42,
        },
      }],
      ['releaseVideoDecodeFrame', {
        jobId: expectedJobId,
        slotIndex: 0,
        generation: 3,
        copyOutState: 'gpuUploadFenceSignalled',
      }],
    ]);
    expect(calls.some((call) => Array.isArray(call) && call[0] === 'copyIntoUploadBuffer')).toBe(false);
    void copyBridge;
  });

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
        slotIndex: 0,
        generation: 3,
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
        slotIndex: 0,
        generation: 3,
        ptsFrame: 7,
      }, 8192],
    ]);
    expect(calls).not.toContainEqual(['stopVideoDecode', expect.anything()]);
  });

  it('downscales oversized source video decode jobs to the preview canvas size', async () => {
    const { calls, rustBackendBridge, copyBridge } = createBridges();
    const oversizedSession: SharedRendererPreviewSession = {
      ...session,
      surfaceGate: {
        ...baseSurfaceGate,
        canvas: {
          width: 1920,
          height: 1080,
        },
        media: [{
          id: 'video-1',
          kind: 'Video',
          source: '/Volumes/ExtendSSD-W/GX020052.MP4',
          width: 3840,
          height: 2160,
          source_rate: {
            numerator: 120000,
            denominator: 1001,
          },
        }],
      },
    };

    const result = await prepareSharedRendererViewportVideoUploads({
      session: oversizedSession,
      requestId: 84,
      slotCount: 2,
      activeJobs: [],
      rustBackendBridge,
      copyBridge,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected oversized video upload preparation to succeed');
    expect(result.activeJobs[0]).toMatchObject({
      jobId: 'shared-renderer-video-video-1-1920x1080-120000over1001',
      width: 1920,
      height: 1080,
    });
    expect(calls[0]).toEqual(['startVideoDecode', {
      jobId: 'shared-renderer-video-video-1-1920x1080-120000over1001',
      source: '/Volumes/ExtendSSD-W/GX020052.MP4',
      slotCount: 2,
      width: 1920,
      height: 1080,
      sourceRate: {
        numerator: 120000,
        denominator: 1001,
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

  it('reuses a backend decode session when start reports the same job is already active', async () => {
    const { calls, rustBackendBridge, copyBridge } = createBridges();
    rustBackendBridge.startVideoDecode = async (payload) => {
      calls.push(['startVideoDecode', payload]);
      return {
        success: false,
        error: 'Decode session already active for jobId',
      };
    };

    const result = await prepareSharedRendererViewportVideoUploads({
      session,
      requestId: 85,
      slotCount: 2,
      activeJobs: [],
      rustBackendBridge,
      copyBridge,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected already-active backend session to be reused');
    expect(result.activeJobs).toEqual([{
      jobId: expectedJobId,
      source: '/tmp/gopro clip.mp4',
      slotCount: 2,
      width: 64,
      height: 32,
      sourceRate: {
        numerator: 60,
        denominator: 1,
      },
    }]);
    expect(calls.map((call) => Array.isArray(call) ? call[0] : call)).toEqual([
      'startVideoDecode',
      'requestVideoDecodeFrame',
      'copyIntoUploadBuffer',
    ]);
  });

  it('aborts already prepared decoded slots when a later visible video upload fails', async () => {
    const { calls, rustBackendBridge } = createBridges();
    const copyBridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async (payload, target) => {
        calls.push(['copyIntoUploadBuffer', payload, target.byteLength]);
        if (payload.ptsFrame === 7) {
          return {
            success: false,
            error: 'copy failed for second video',
          };
        }
        target.fill(0x6a);
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

    const result = await prepareSharedRendererViewportVideoUploads({
      session: multiVideoSession,
      requestId: 82,
      slotCount: 2,
      activeJobs: [],
      rustBackendBridge,
      copyBridge,
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'uploadFailed',
      detail: 'copy failed for second video',
    });
    expect(calls).toContainEqual(['releaseVideoDecodeFrame', {
      jobId: expectedJobId,
      slotIndex: 0,
      generation: 3,
      copyOutState: 'rendererUploadAborted',
    }]);
  });

  it('preserves the shared frame copy checksum failure reason for viewport diagnostics', async () => {
    const { calls, rustBackendBridge } = createBridges();
    const copyBridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async (payload, target) => {
        calls.push(['copyIntoUploadBuffer', payload, target.byteLength]);
        target.fill(0x6a);
        return {
          success: true,
          result: {
            sequence: payload.ptsFrame,
            slotIndex: payload.slotIndex,
            generation: payload.generation,
            byteLen: target.byteLength,
            expectedChecksum: 0x1234,
            actualChecksum: payload.ptsFrame === 7 ? 0x4321 : 0x1234,
          },
        };
      },
    };

    const result = await prepareSharedRendererViewportVideoUploads({
      session: multiVideoSession,
      requestId: 83,
      slotCount: 2,
      activeJobs: [],
      rustBackendBridge,
      copyBridge,
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'uploadFailed',
      uploadFailureReason: 'copyReportChecksumMismatch',
      uploadFailureClipId: 'video-2',
      uploadFailureMediaId: 'video-2',
      detail: 'Shared video frame copy report checksum verification failed.',
    });
  });

  it('attempts every prepared abort release even when an earlier abort release fails', async () => {
    const calls: unknown[] = [];
    const requestCountByJobId = new Map<string, number>();
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async (payload) => {
        calls.push(['startVideoDecode', payload]);
        return { success: true, result: { jobId: payload.jobId } };
      },
      requestVideoDecodeFrame: async (payload) => {
        calls.push(['requestVideoDecodeFrame', payload]);
        const count = requestCountByJobId.get(payload.jobId) ?? 0;
        requestCountByJobId.set(payload.jobId, count + 1);
        const width = payload.jobId === expectedSecondJobId
          ? 80
          : payload.jobId.includes('video-3')
            ? 96
            : 64;
        const height = payload.jobId === expectedSecondJobId
          ? 45
          : payload.jobId.includes('video-3')
            ? 54
            : 32;
        const strideBytes = width === 64 ? 256 : 512;
        const byteLen = strideBytes * height;
        const slotIndex = payload.jobId === expectedSecondJobId ? 1 : 0;
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
                slotIndex,
                generation: payload.jobId === expectedSecondJobId ? 4 : 3,
                byteOffset: byteLen * slotIndex,
                byteLen,
                width,
                height,
                strideBytes,
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
                byteLen,
              },
              status: 'withinTolerance',
            },
          },
        };
      },
      releaseVideoDecodeFrame: async (payload) => {
        calls.push(['releaseVideoDecodeFrame', payload]);
        if (payload.jobId === expectedJobId) {
          return { success: false, error: 'first prepared abort release failed' };
        }
        return { success: true };
      },
      stopVideoDecode: async () => ({ success: true }),
    };
    const threeVideoSession: SharedRendererPreviewSession = {
      ...multiVideoSession,
      plan: {
        ...(multiVideoSession.plan as ComparablePreviewPlan),
        snapshot: {
          ...(multiVideoSession.plan as ComparablePreviewPlan).snapshot,
          clips: [
            ...(multiVideoSession.plan as ComparablePreviewPlan).snapshot.clips,
            {
              clip_id: 'video-3',
              track_id: 'layer-2',
              media_id: 'video-3',
              source_frame: 9,
              z_index: 2,
              transform: {
                translation_x: 120,
                translation_y: 80,
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
          ...(multiVideoSession.plan as ComparablePreviewPlan).media,
          {
            id: 'video-3',
            kind: 'Video',
            source: '/tmp/third clip.mp4',
            width: 96,
            height: 54,
            source_rate: {
              numerator: 24,
              denominator: 1,
            },
          },
        ],
      },
      surfaceGate: {
        ...(multiVideoSession.surfaceGate as ReadyPreviewSurfaceGate),
        snapshot: {
          ...(multiVideoSession.surfaceGate as ReadyPreviewSurfaceGate).snapshot,
          clips: [
            ...(multiVideoSession.surfaceGate as ReadyPreviewSurfaceGate).snapshot.clips,
            {
              clip_id: 'video-3',
              track_id: 'layer-2',
              media_id: 'video-3',
              source_frame: 9,
              z_index: 2,
              transform: {
                translation_x: 120,
                translation_y: 80,
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
          ...(multiVideoSession.surfaceGate as ReadyPreviewSurfaceGate).media,
          {
            id: 'video-3',
            kind: 'Video',
            source: '/tmp/third clip.mp4',
            width: 96,
            height: 54,
            source_rate: {
              numerator: 24,
              denominator: 1,
            },
          },
        ],
      },
    };

    const result = await prepareSharedRendererViewportVideoUploads({
      session: threeVideoSession,
      requestId: 84,
      slotCount: 2,
      activeJobs: [],
      rustBackendBridge,
      copyBridge: {
        copyIntoUploadBuffer: async (payload, target) => {
          calls.push(['copyIntoUploadBuffer', payload, target.byteLength]);
          if (payload.ptsFrame === 9) {
            return { success: false, error: 'copy failed for third video' };
          }
          target.fill(0x6a);
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
      },
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'uploadAbortReleaseFailed',
      detail: 'first prepared abort release failed',
    });
    expect(calls).toContainEqual(['releaseVideoDecodeFrame', {
      jobId: expectedJobId,
      slotIndex: 0,
      generation: 3,
      copyOutState: 'rendererUploadAborted',
    }]);
    expect(calls).toContainEqual(['releaseVideoDecodeFrame', {
      jobId: expectedSecondJobId,
      slotIndex: 1,
      generation: 4,
      copyOutState: 'rendererUploadAborted',
    }]);
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
        slotIndex: 0,
        generation: 3,
        ptsFrame: 42,
      }, 8192],
    ]);
  });

  it('treats a stale decode stop that reports no active session as already stopped', async () => {
    const { calls, rustBackendBridge, copyBridge } = createBridges();
    // The backend session for the stale job has already been torn down (e.g. by a
    // previous stop during rapid pause/play toggling), so stopping it again reports
    // "No active decode session". That is the desired end state and must not abort
    // the whole upload.
    rustBackendBridge.stopVideoDecode = async (payload) => {
      calls.push(['stopVideoDecode', payload]);
      return { success: false, error: 'No active decode session' };
    };
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
    if (!result.ok) throw new Error('expected an already-gone stale session to be tolerated');
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
        slotIndex: 0,
        generation: 3,
        ptsFrame: 42,
      }, 8192],
    ]);
  });

  it('still reports stopFailed when a stale decode stop fails for a non-session reason', async () => {
    const { rustBackendBridge, copyBridge } = createBridges();
    rustBackendBridge.stopVideoDecode = async () => ({
      success: false,
      error: 'Rust backend internal stop error',
    });
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
      activeJobs: [staleJob],
      rustBackendBridge,
      copyBridge,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a genuine stop failure to abort the upload');
    expect(result.reason).toBe('stopFailed');
    expect(result.detail).toBe('Rust backend internal stop error');
  });

  it('restarts a cached Rust decode job when the backend no longer has its active session', async () => {
    const calls: unknown[] = [];
    let requestCount = 0;
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
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
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
            slotIndex: payload.slotIndex,
            generation: payload.generation,
            byteLen: target.byteLength,
            expectedChecksum: 0x1234,
            actualChecksum: 0x1234,
          },
        };
      },
    };

    const result = await prepareSharedRendererViewportVideoUploads({
      session,
      requestId: 82,
      slotCount: 2,
      activeJobs: [activeJob],
      rustBackendBridge,
      copyBridge,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected cached job restart to recover the upload');
    expect(result.activeJobs).toEqual([activeJob]);
    expect(calls).toEqual([
      ['requestVideoDecodeFrame', {
        jobId: expectedJobId,
        requestId: 82,
        frameIndex: 42,
        mode: 'latestWins',
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
      ['requestVideoDecodeFrame', {
        jobId: expectedJobId,
        requestId: 82,
        frameIndex: 42,
        mode: 'latestWins',
      }],
      ['copyIntoUploadBuffer', {
        memoryId: '/uxfd-node-video-ring',
        slotCount: 2,
        slotByteLen: 8192,
        slotIndex: 0,
        generation: 3,
        ptsFrame: 42,
      }, 8192],
    ]);
  });

  it('replaces a cached Rust decode job when the backend reports no free decode frame slot', async () => {
    const calls: unknown[] = [];
    let requestCount = 0;
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
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
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
            frame: {
              descriptor: {
                memoryId: '/uxfd-node-video-ring',
                slotIndex: 0,
                generation: 4,
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
            slotIndex: payload.slotIndex,
            generation: payload.generation,
            byteLen: target.byteLength,
            expectedChecksum: 0x1234,
            actualChecksum: 0x1234,
          },
        };
      },
    };

    const result = await prepareSharedRendererViewportVideoUploads({
      session,
      requestId: 86,
      slotCount: 2,
      activeJobs: [activeJob],
      rustBackendBridge,
      copyBridge,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected no-free-slot recovery to prepare the upload');
    expect(result.activeJobs).toEqual([activeJob]);
    expect(calls.map((call) => Array.isArray(call) ? call[0] : call)).toEqual([
      'requestVideoDecodeFrame',
      'stopVideoDecode',
      'startVideoDecode',
      'requestVideoDecodeFrame',
      'copyIntoUploadBuffer',
    ]);
    expect(calls).toContainEqual(['stopVideoDecode', {
      jobId: expectedJobId,
    }]);
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
        slotIndex: 0,
        generation: 3,
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
      uploadFailureClipId: 'video-1',
      uploadFailureMediaId: 'video-1',
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

  it('rejects a stale decode response job id and releases the returned slot without copying', async () => {
    const calls: unknown[] = [];
    const staleJobId = 'shared-renderer-video-old-video-64x32-60over1';
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
            jobId: staleJobId,
            requestId: payload.requestId,
            frameIndex: payload.frameIndex,
            mode: payload.mode,
            frame: {
              descriptor: {
                memoryId: '/uxfd-stale-video-ring',
                slotIndex: 1,
                generation: 9,
                byteOffset: 8192,
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
        copyIntoUploadBuffer: async (payload, target) => {
          calls.push(['copyIntoUploadBuffer', payload, target.byteLength]);
          target.fill(0x6a);
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
      },
    });

    expect(result).toEqual({
      ok: false,
      reason: 'staleDecodeResponse',
      detail: 'Rust backend returned a decoded frame for a stale job id.',
      uploadFailureClipId: 'video-1',
      uploadFailureMediaId: 'video-1',
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
    expect(calls).not.toContainEqual(['copyIntoUploadBuffer', expect.anything(), expect.anything()]);
    expect(calls).toContainEqual(['releaseVideoDecodeFrame', {
      jobId: staleJobId,
      slotIndex: 1,
      generation: 9,
      copyOutState: 'rendererUploadAborted',
    }]);
  });

  it('reports stale decoded upload release failure instead of hiding it as a stale response', async () => {
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async () => ({ success: true }),
      requestVideoDecodeFrame: async (payload) => ({
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
      }),
      releaseVideoDecodeFrame: async () => ({
        success: false,
        error: 'stale preview upload release failed',
      }),
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
      reason: 'staleDecodeReleaseFailed',
      detail: 'stale preview upload release failed',
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
  });

  it('reports stale decoded release failure for multi-video upload preparation', async () => {
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async (payload) => ({ success: true, result: { jobId: payload.jobId } }),
      requestVideoDecodeFrame: async (payload) => ({
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
              width: payload.jobId === expectedSecondJobId ? 80 : 64,
              height: payload.jobId === expectedSecondJobId ? 45 : 32,
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
      }),
      releaseVideoDecodeFrame: async () => ({
        success: false,
        error: 'multi stale preview upload release failed',
      }),
      stopVideoDecode: async () => ({ success: true }),
    };

    const result = await prepareSharedRendererViewportVideoUploads({
      session: multiVideoSession,
      requestId: 80,
      slotCount: 2,
      activeJobs: [],
      rustBackendBridge,
      copyBridge: {
        copyIntoUploadBuffer: async () => {
          throw new Error('stale decode response must not be copied');
        },
      },
    });

    expect(result).toEqual({
      ok: false,
      reason: 'staleDecodeReleaseFailed',
      detail: 'multi stale preview upload release failed',
      activeJobs: [{
        jobId: expectedJobId,
        source: '/tmp/gopro clip.mp4',
        slotCount: 2,
        width: 64,
        height: 32,
        sourceRate: {
          numerator: 60,
          denominator: 1,
        },
      }],
    });
  });
});
