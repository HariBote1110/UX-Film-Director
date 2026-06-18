import { describe, expect, it, vi } from 'vitest';
import {
  startSharedRendererViewportPresenter,
  type SharedRendererViewportNativeRenderUploadPreparer,
  type SharedRendererViewportPresenterStarter,
  type SharedRendererViewportVideoUploadPreparer,
} from './sharedRendererViewportPresenterOrchestration';
import type {
  SharedRendererDecodedVideoFrameUpload,
  SharedRendererPreviewPresenterControl,
} from './sharedRendererPreviewPresenterController';
import type { SharedVideoFrameCopyReport } from './sharedVideoFrameUploadBridge';
import type { SharedRendererViewportVideoDecodeJob } from './sharedRendererViewportVideoUpload';

const canvas = {} as HTMLCanvasElement;
const session = { surfaceGate: { ok: true } } as any;
const activeJob: SharedRendererViewportVideoDecodeJob = {
  jobId: 'shared-renderer-video-video-1-64x32-60over1',
  source: '/tmp/gopro clip.mp4',
  slotCount: 2,
  width: 64,
  height: 32,
  sourceRate: {
    numerator: 60,
    denominator: 1,
  },
};
const secondActiveJob: SharedRendererViewportVideoDecodeJob = {
  jobId: 'shared-renderer-video-video-2-80x45-30over1',
  source: '/tmp/second clip.mp4',
  slotCount: 2,
  width: 80,
  height: 45,
  sourceRate: {
    numerator: 30,
    denominator: 1,
  },
};

const upload: SharedRendererDecodedVideoFrameUpload & {
  ok: true;
  copyReport: SharedVideoFrameCopyReport;
} = {
  ok: true,
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
  rgbaBytes: new Uint8Array(8192),
  copyReport: {
    sequence: 42,
    byteLen: 8192,
    expectedChecksum: 0x1234,
    actualChecksum: 0x1234,
  },
};

const control: SharedRendererPreviewPresenterControl = {
  ok: true,
  format: 'rgba8unorm-srgb',
  solidColourOwnership: {
    owner: 'sharedRenderer',
    reason: 'rustSolidColourReady',
    solidColourObjectIds: [],
  },
  videoOwnership: {
    owner: 'sharedRenderer',
    reason: 'rustDecodedFrameUploadReady',
    videoObjectIds: ['video-1'],
  },
  imageOwnership: {
    owner: 'pixi',
    reason: 'noImageScene',
    imageObjectIds: [],
  },
  readPresentedFrameRgbaBytes: async () => ({
    rgbaBytes: new Uint8Array(),
    strideBytes: 0,
    byteLen: 0,
    width: 0,
    height: 0,
  }),
  dispose: vi.fn(),
};

describe('sharedRendererViewportPresenterOrchestration', () => {
  it('passes native/Rust frame handoff into the presenter start input', async () => {
    let presenterInput: unknown;
    const presentedFrameSharedFrameTaker = async () => null;
    const startPresenter: SharedRendererViewportPresenterStarter = async (input) => {
      presenterInput = input;
      return control;
    };

    await startSharedRendererViewportPresenter({
      canvas,
      session,
      datasets: [],
      diagnosticSwatchEnabled: false,
      videoCutoverEnabled: false,
      activeVideoDecodeJob: null,
      requestId: 10,
      presentedFrameSharedFrameTaker,
      startPresenter,
    } as Parameters<typeof startSharedRendererViewportPresenter>[0] & {
      presentedFrameSharedFrameTaker: unknown;
    });

    expect(presenterInput).toMatchObject({
      presentedFrameSharedFrameTaker,
    });
  });

  it('passes multiple prepared Rust decoded video uploads into the presenter start input', async () => {
    let presenterInput: unknown;
    const secondUpload = {
      ...upload,
      descriptor: {
        ...upload.descriptor,
        memoryId: '/uxfd-second-video-ring',
        slotIndex: 1,
      },
      ptsFrame: 7,
    };
    const startPresenter: SharedRendererViewportPresenterStarter = async (input) => {
      presenterInput = input;
      return control;
    };

    const result = await startSharedRendererViewportPresenter({
      canvas,
      session,
      datasets: [],
      diagnosticSwatchEnabled: true,
      videoCutoverEnabled: true,
      activeVideoDecodeJobs: [],
      requestId: 11,
      prepareVideoUploads: async () => ({
        ok: true,
        activeJobs: [activeJob, secondActiveJob],
        uploads: [
          {
            request: { clipId: 'video-1' } as any,
            upload,
          },
          {
            request: { clipId: 'video-2' } as any,
            upload: secondUpload,
          },
        ],
      }),
      startPresenter,
    } as any);

    expect(result.activeVideoDecodeJobs).toEqual([activeJob, secondActiveJob]);
    expect(presenterInput).toMatchObject({
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererDecodedVideoFrameUploads: [
        {
          clipId: 'video-1',
          descriptor: upload.descriptor,
          ptsFrame: 42,
        },
        {
          clipId: 'video-2',
          descriptor: secondUpload.descriptor,
          ptsFrame: 7,
        },
      ],
    });
  });

  it('passes a prepared Rust decoded video upload into the presenter start input', async () => {
    let presenterInput: unknown;
    const events: string[] = [];
    const prepareVideoUpload: SharedRendererViewportVideoUploadPreparer = async () => ({
      ok: true,
      activeJob,
      request: {} as any,
      upload,
    });
    const startPresenter: SharedRendererViewportPresenterStarter = async (input) => {
      events.push('startPresenter');
      presenterInput = input;
      return control;
    };

    const result = await startSharedRendererViewportPresenter({
      canvas,
      session,
      datasets: [],
      diagnosticSwatchEnabled: true,
      videoCutoverEnabled: true,
      activeVideoDecodeJob: null,
      requestId: 9,
      prepareVideoUpload,
      startPresenter,
      onVideoDecodeJobResolved: (job) => {
        events.push(`job:${job?.jobId ?? 'none'}`);
      },
    });

    expect(result.control).toBe(control);
    expect(result.activeVideoDecodeJob).toBe(activeJob);
    expect(events).toEqual([
      'job:shared-renderer-video-video-1-64x32-60over1',
      'startPresenter',
    ]);
    expect(presenterInput).toMatchObject({
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererDecodedVideoFrameUpload: upload,
    });
  });

  it('passes a prepared native render upload into the presenter and skips per-video preview upload', async () => {
    let presenterInput: unknown;
    const events: string[] = [];
    const prepareNativeRenderUpload: SharedRendererViewportNativeRenderUploadPreparer = async () => {
      events.push('prepareNativeRenderUpload');
      return {
        ok: true,
        activeJobs: [activeJob],
        upload: upload as any,
      };
    };
    const prepareVideoUpload: SharedRendererViewportVideoUploadPreparer = async () => {
      events.push('prepareVideoUpload');
      return {
        ok: true,
        activeJob,
        request: {} as any,
        upload,
      };
    };
    const startPresenter: SharedRendererViewportPresenterStarter = async (input) => {
      events.push('startPresenter');
      presenterInput = input;
      return control;
    };

    const result = await startSharedRendererViewportPresenter({
      canvas,
      session,
      datasets: [],
      diagnosticSwatchEnabled: true,
      videoCutoverEnabled: true,
      activeVideoDecodeJob: null,
      activeVideoDecodeJobs: [],
      requestId: 13,
      prepareNativeRenderUpload,
      prepareVideoUpload,
      startPresenter,
    });

    expect(result.activeVideoDecodeJobs).toEqual([activeJob]);
    expect(events).toEqual([
      'prepareNativeRenderUpload',
      'startPresenter',
    ]);
    expect(presenterInput).toMatchObject({
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererNativeRenderFrameUpload: upload,
      sharedRendererDecodedVideoFrameUpload: undefined,
      sharedRendererDecodedVideoFrameUploads: undefined,
    });
  });

  it('passes native render preparation failure details into the presenter diagnostics input', async () => {
    let presenterInput: unknown;
    const prepareNativeRenderUpload: SharedRendererViewportNativeRenderUploadPreparer = async () => ({
      ok: false,
      reason: 'nativeRenderFailed',
      detail: 'Rust backend rejected unsupported PSD media',
      activeJobs: [activeJob],
    });
    const startPresenter: SharedRendererViewportPresenterStarter = async (input) => {
      presenterInput = input;
      return control;
    };

    const result = await startSharedRendererViewportPresenter({
      canvas,
      session,
      datasets: [],
      diagnosticSwatchEnabled: true,
      videoCutoverEnabled: true,
      activeVideoDecodeJob: null,
      activeVideoDecodeJobs: [],
      requestId: 14,
      prepareNativeRenderUpload,
      prepareVideoUploads: async () => ({
        ok: false,
        reason: 'uploadFailed',
        detail: 'video upload intentionally bypassed in this diagnostics contract',
        activeJobs: [activeJob],
      }),
      startPresenter,
    });

    expect(result.activeVideoDecodeJobs).toEqual([activeJob]);
    expect(presenterInput).toMatchObject({
      sharedRendererNativeRenderFrameUpload: undefined,
      sharedRendererNativeRenderFailure: {
        reason: 'nativeRenderFailed',
        detail: 'Rust backend rejected unsupported PSD media',
      },
    });
  });

  it('uses the native render resolved active job when falling back to a single Rust video upload', async () => {
    let presenterInput: unknown;
    let videoUploadActiveJob: SharedRendererViewportVideoDecodeJob | null | undefined;
    const events: string[] = [];
    const prepareNativeRenderUpload: SharedRendererViewportNativeRenderUploadPreparer = async () => {
      events.push('prepareNativeRenderUpload');
      return {
        ok: false,
        reason: 'nativeRenderFailed',
        detail: 'Rust backend rejected unsupported PSD media',
        activeJobs: [activeJob],
      };
    };
    const prepareVideoUpload: SharedRendererViewportVideoUploadPreparer = async (input) => {
      events.push('prepareVideoUpload');
      videoUploadActiveJob = input.activeJob;
      return {
        ok: true,
        activeJob: input.activeJob ?? activeJob,
        request: { clipId: 'video-1' } as any,
        upload,
      };
    };
    const startPresenter: SharedRendererViewportPresenterStarter = async (input) => {
      events.push('startPresenter');
      presenterInput = input;
      return control;
    };

    const result = await startSharedRendererViewportPresenter({
      canvas,
      session,
      datasets: [],
      diagnosticSwatchEnabled: true,
      videoCutoverEnabled: true,
      activeVideoDecodeJob: null,
      requestId: 15,
      prepareNativeRenderUpload,
      prepareVideoUpload,
      startPresenter,
    });

    expect(events).toEqual([
      'prepareNativeRenderUpload',
      'prepareVideoUpload',
      'startPresenter',
    ]);
    expect(videoUploadActiveJob).toBe(activeJob);
    expect(result.activeVideoDecodeJob).toBe(activeJob);
    expect(presenterInput).toMatchObject({
      sharedRendererNativeRenderFailure: {
        reason: 'nativeRenderFailed',
        detail: 'Rust backend rejected unsupported PSD media',
      },
      sharedRendererDecodedVideoFrameUpload: upload,
    });
  });

  it('starts the presenter without upload when Rust video preparation fails so Pixi can remain owner', async () => {
    let presenterInput: unknown;
    const prepareVideoUpload: SharedRendererViewportVideoUploadPreparer = async () => ({
      ok: false,
      reason: 'uploadFailed',
      detail: 'copy failed',
      activeJob,
    });
    const startPresenter: SharedRendererViewportPresenterStarter = async (input) => {
      presenterInput = input;
      return control;
    };

    const result = await startSharedRendererViewportPresenter({
      canvas,
      session,
      datasets: [],
      diagnosticSwatchEnabled: false,
      videoCutoverEnabled: true,
      activeVideoDecodeJob: null,
      requestId: 10,
      prepareVideoUpload,
      startPresenter,
    });

    expect(result.control).toBe(control);
    expect(result.activeVideoDecodeJob).toBe(activeJob);
    expect(presenterInput).toMatchObject({
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererDecodedVideoFrameUpload: undefined,
    });
  });

  it('prepares Rust video upload when Rust video is required even if the cutover flag is off', async () => {
    let presenterInput: unknown;
    const events: string[] = [];
    const prepareVideoUpload: SharedRendererViewportVideoUploadPreparer = async () => {
      events.push('prepareVideoUpload');
      return {
        ok: true,
        activeJob,
        request: {} as any,
        upload: upload as any,
      };
    };
    const startPresenter: SharedRendererViewportPresenterStarter = async (input) => {
      events.push('startPresenter');
      presenterInput = input;
      return control;
    };

    const result = await startSharedRendererViewportPresenter({
      canvas,
      session,
      datasets: [],
      diagnosticSwatchEnabled: false,
      videoCutoverEnabled: false,
      requireSharedRendererVideo: true,
      activeVideoDecodeJob: null,
      requestId: 12,
      prepareVideoUpload,
      startPresenter,
    });

    expect(result.activeVideoDecodeJob).toBe(activeJob);
    expect(events).toEqual(['prepareVideoUpload', 'startPresenter']);
    expect(presenterInput).toMatchObject({
      sharedRendererVideoCutoverEnabled: true,
      requireSharedRendererVideo: true,
      sharedRendererDecodedVideoFrameUpload: upload,
    });
  });
});
