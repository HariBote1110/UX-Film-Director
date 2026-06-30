import { describe, expect, it, vi } from 'vitest';
import {
  startSharedRendererViewportPresenter,
  type SharedRendererViewportNativeRenderUploadPreparer,
  type SharedRendererViewportPresenterStarter,
  type SharedRendererViewportVideoUploadPreparer,
  type SharedRendererViewportVideoUploadsPreparer,
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
    slotIndex: 0,
    generation: 3,
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
  psdOwnership: {
    owner: 'pixi',
    reason: 'noPsdScene',
    psdObjectIds: [],
  },
  generatedEffectObjectIds: [],
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

  it('passes the required shared renderer output gate into the presenter start input', async () => {
    let presenterInput: unknown;
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
      requestId: 11,
      requireSharedRendererOutput: true,
      startPresenter,
    } as Parameters<typeof startSharedRendererViewportPresenter>[0] & {
      requireSharedRendererOutput: true;
    });

    expect(presenterInput).toMatchObject({
      requireSharedRendererOutput: true,
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
      activeVideoDecodeJob: null,
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

  it('passes external video sources into the presenter start input without requiring Rust RGBA uploads', async () => {
    let presenterInput: unknown;
    const externalSources = new Map<string, unknown>([
      ['video-1', { tagName: 'VIDEO' }],
    ]);
    const startPresenter: SharedRendererViewportPresenterStarter = async (input) => {
      presenterInput = input;
      return control;
    };

    await startSharedRendererViewportPresenter({
      canvas,
      session,
      datasets: [],
      diagnosticSwatchEnabled: true,
      videoCutoverEnabled: true,
      activeVideoDecodeJob: null,
      activeVideoDecodeJobs: [],
      requestId: 12,
      sharedRendererExternalVideoSourcesByClipId: externalSources,
      prepareVideoUploads: async () => ({
        ok: false,
        reason: 'noVideoDecodeRequest',
        detail: 'external texture fast path skips Rust RGBA upload',
        activeJobs: [],
      }),
      startPresenter,
    });

    expect(presenterInput).toMatchObject({
      sharedRendererExternalVideoSourcesByClipId: externalSources,
      sharedRendererDecodedVideoFrameUploads: undefined,
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

  it('uses Native Overlay decoded frame present instead of WebGPU decoded upload when enabled', async () => {
    let presenterInput: unknown;
    const events: string[] = [];
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
      nativeOverlayPreviewEnabled: true,
      activeVideoDecodeJob: activeJob,
      requestId: 24,
      prepareVideoUpload,
      presentNativeOverlayDecodedFrame: async (input) => {
        events.push(`nativeOverlay:${input.requestId}:${input.activeJob?.jobId ?? 'none'}`);
        return {
          ok: true,
          activeJob,
        };
      },
      startPresenter,
      onVideoDecodeJobResolved: (job) => {
        events.push(`job:${job?.jobId ?? 'none'}`);
      },
    } as Parameters<typeof startSharedRendererViewportPresenter>[0] & {
      nativeOverlayPreviewEnabled: true;
      presentNativeOverlayDecodedFrame: unknown;
    });

    expect(result.activeVideoDecodeJob).toBe(activeJob);
    expect(result.nativeOverlayPresentResult).toEqual({
      ok: true,
      activeJob,
    });
    expect(events).toEqual([
      'nativeOverlay:24:shared-renderer-video-video-1-64x32-60over1',
      'job:shared-renderer-video-video-1-64x32-60over1',
      'startPresenter',
    ]);
    expect(presenterInput).toMatchObject({
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererDecodedVideoFrameUpload: undefined,
      sharedRendererDecodedVideoFrameUploads: undefined,
    });
  });

  it('uses Native Overlay before preferred native render upload when both are enabled', async () => {
    const events: string[] = [];
    const dataset: Record<string, string | undefined> = {};
    const prepareNativeRenderUpload: SharedRendererViewportNativeRenderUploadPreparer = async () => {
      events.push('prepareNativeRenderUpload');
      return {
        ok: true,
        activeJobs: [activeJob],
        upload: upload as any,
      };
    };
    const startPresenter: SharedRendererViewportPresenterStarter = async () => {
      events.push('startPresenter');
      return control;
    };

    const result = await startSharedRendererViewportPresenter({
      canvas,
      session,
      datasets: [dataset],
      diagnosticSwatchEnabled: true,
      videoCutoverEnabled: true,
      nativeRenderPreviewEnabled: true,
      nativeOverlayPreviewEnabled: true,
      preferNativeRenderUpload: true,
      activeVideoDecodeJob: activeJob,
      activeVideoDecodeJobs: [activeJob],
      requestId: 25,
      prepareNativeRenderUpload,
      presentNativeOverlayDecodedFrame: async (input) => {
        events.push(`nativeOverlay:${input.requestId}`);
        return {
          ok: true,
          activeJob,
          activeJobs: [activeJob],
        };
      },
      startPresenter,
    } as any);

    expect(result.nativeOverlayPresentResult).toEqual({
      ok: true,
      activeJob,
      activeJobs: [activeJob],
    });
    expect(result.nativeRenderUploadResult).toBeUndefined();
    expect(events).toEqual([
      'nativeOverlay:25',
      'startPresenter',
    ]);
    expect(dataset.uxfdSharedRendererPresenterNativeOverlayAttempt).toBe('ok');
  });

  it('skips decoded video upload preparation for the Phase 0 benchmark discard path', async () => {
    let presenterInput: unknown;
    const events: string[] = [];
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
      activeVideoDecodeJob: activeJob,
      requestId: 21,
      skipDecodedVideoUploadForBenchmark: true,
      prepareVideoUpload,
      startPresenter,
      onVideoDecodeJobResolved: (job) => {
        events.push(`job:${job?.jobId ?? 'none'}`);
      },
    } as Parameters<typeof startSharedRendererViewportPresenter>[0] & {
      skipDecodedVideoUploadForBenchmark: true;
    });

    expect(result.control).toBe(control);
    expect(result.activeVideoDecodeJob).toBe(activeJob);
    expect(events).toEqual([
      'job:shared-renderer-video-video-1-64x32-60over1',
      'startPresenter',
    ]);
    expect(presenterInput).toMatchObject({
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererDecodedVideoFrameUpload: undefined,
      sharedRendererDecodedVideoFrameUploads: undefined,
    });
  });

  it('passes the Phase 0 writeTexture no-op benchmark flag into the presenter start input', async () => {
    let presenterInput: unknown;
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
      requestId: 22,
      sharedRendererWriteTextureNoOpEnabled: true,
      startPresenter,
    } as Parameters<typeof startSharedRendererViewportPresenter>[0] & {
      sharedRendererWriteTextureNoOpEnabled: true;
    });

    expect(presenterInput).toMatchObject({
      sharedRendererWriteTextureNoOpEnabled: true,
    });
  });

  it('does not start the WebGPU presenter after video upload when the viewport start is stale', async () => {
    let current = true;
    const events: string[] = [];
    const prepareVideoUpload: SharedRendererViewportVideoUploadPreparer = async () => {
      events.push('prepareVideoUpload');
      current = false;
      return {
        ok: true,
        activeJob,
        request: {} as any,
        upload,
      };
    };
    const startPresenter: SharedRendererViewportPresenterStarter = async () => {
      events.push('startPresenter');
      return control;
    };

    await expect(startSharedRendererViewportPresenter({
      canvas,
      session,
      datasets: [],
      diagnosticSwatchEnabled: true,
      videoCutoverEnabled: true,
      activeVideoDecodeJob: null,
      requestId: 18,
      prepareVideoUpload,
      startPresenter,
      isStartCurrent: () => current,
    })).rejects.toThrow('Shared renderer presenter start was cancelled.');

    expect(events).toEqual(['prepareVideoUpload']);
  });

  it('prioritises Rust decoded video upload over optional native render preview', async () => {
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
    const prepareVideoUploads: SharedRendererViewportVideoUploadsPreparer = async () => {
      events.push('prepareVideoUploads');
      return {
        ok: true,
        activeJobs: [activeJob],
        uploads: [
          {
            request: { clipId: 'video-1' } as any,
            upload,
          },
        ],
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
      prepareVideoUploads,
      startPresenter,
    });

    expect(result.activeVideoDecodeJobs).toEqual([activeJob]);
    expect(events).toEqual([
      'prepareVideoUploads',
      'startPresenter',
    ]);
    expect(presenterInput).toMatchObject({
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererNativeRenderFrameUpload: undefined,
      sharedRendererDecodedVideoFrameUpload: undefined,
      sharedRendererDecodedVideoFrameUploads: [
        {
          clipId: 'video-1',
          descriptor: upload.descriptor,
          ptsFrame: 42,
        },
      ],
    });
  });

  it('prefers native render upload for rust-only preview and forwards preview decode settings', async () => {
    let presenterInput: unknown;
    let nativeRenderInput: unknown;
    const events: string[] = [];
    const prepareNativeRenderUpload: SharedRendererViewportNativeRenderUploadPreparer = async (input) => {
      events.push('prepareNativeRenderUpload');
      nativeRenderInput = input;
      return {
        ok: true,
        activeJobs: [activeJob],
        upload: upload as any,
      };
    };
    const prepareVideoUploads: SharedRendererViewportVideoUploadsPreparer = async () => {
      events.push('prepareVideoUploads');
      return {
        ok: true,
        activeJobs: [activeJob],
        uploads: [
          {
            request: { clipId: 'video-1' } as any,
            upload,
          },
        ],
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
      nativeRenderPreviewEnabled: true,
      preferNativeRenderUpload: true,
      activeVideoDecodeJob: activeJob,
      activeVideoDecodeJobs: [activeJob],
      videoDecodeSlotCount: 6,
      videoDecodeMaxEdge: 320,
      requestId: 19,
      prepareNativeRenderUpload,
      prepareVideoUploads,
      startPresenter,
    } as any);

    expect(result.activeVideoDecodeJobs).toEqual([activeJob]);
    expect(events).toEqual([
      'prepareNativeRenderUpload',
      'startPresenter',
    ]);
    expect(nativeRenderInput).toMatchObject({
      session,
      requestId: 19,
      activeJobs: [activeJob],
      sourceSlotCount: 6,
      maxDecodeEdge: 320,
    });
    expect(presenterInput).toMatchObject({
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererNativeRenderFrameUpload: upload,
      sharedRendererDecodedVideoFrameUpload: undefined,
      sharedRendererDecodedVideoFrameUploads: undefined,
    });
  });

  it('forwards the Phase 0 native render output discard flag to native render upload preparation', async () => {
    let nativeRenderInput: unknown;
    const prepareNativeRenderUpload: SharedRendererViewportNativeRenderUploadPreparer = async (input) => {
      nativeRenderInput = input;
      return {
        ok: false,
        reason: 'nativeRenderFailed',
        detail: 'native render output discarded for benchmark',
        activeJobs: [activeJob],
      };
    };
    const startPresenter: SharedRendererViewportPresenterStarter = async () => control;

    await startSharedRendererViewportPresenter({
      canvas,
      session,
      datasets: [],
      diagnosticSwatchEnabled: true,
      videoCutoverEnabled: true,
      nativeRenderPreviewEnabled: true,
      preferNativeRenderUpload: true,
      activeVideoDecodeJob: activeJob,
      activeVideoDecodeJobs: [activeJob],
      requestId: 23,
      discardNativeRenderOutputForBenchmark: true,
      prepareNativeRenderUpload,
      startPresenter,
    } as Parameters<typeof startSharedRendererViewportPresenter>[0] & {
      discardNativeRenderOutputForBenchmark: true;
    });

    expect(nativeRenderInput).toMatchObject({
      discardNativeRenderOutputForBenchmark: true,
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

  it('does not pass optional native-render unsupported-media-only diagnostics into a ready presenter', async () => {
    let presenterInput: unknown;
    const prepareNativeRenderUpload: SharedRendererViewportNativeRenderUploadPreparer = async () => ({
      ok: false,
      reason: 'nativeRenderUnsupportedMediaOnly',
      detail: 'Shared renderer preview session does not contain only Rust native-renderable media.',
      activeJobs: [],
    });
    const startPresenter: SharedRendererViewportPresenterStarter = async (input) => {
      presenterInput = input;
      return control;
    };

    await startSharedRendererViewportPresenter({
      canvas,
      session,
      datasets: [],
      diagnosticSwatchEnabled: true,
      videoCutoverEnabled: false,
      nativeRenderPreviewEnabled: true,
      activeVideoDecodeJob: null,
      activeVideoDecodeJobs: [],
      requestId: 16,
      prepareNativeRenderUpload,
      startPresenter,
    });

    expect(presenterInput).toMatchObject({
      sharedRendererNativeRenderFrameUpload: undefined,
      sharedRendererNativeRenderFailure: undefined,
    });
  });

  it('keeps native-render unsupported-media-only diagnostics when shared renderer output is required', async () => {
    let presenterInput: unknown;
    const prepareNativeRenderUpload: SharedRendererViewportNativeRenderUploadPreparer = async () => ({
      ok: false,
      reason: 'nativeRenderUnsupportedMediaOnly',
      detail: 'Shared renderer preview session does not contain only Rust native-renderable media.',
      activeJobs: [],
    });
    const startPresenter: SharedRendererViewportPresenterStarter = async (input) => {
      presenterInput = input;
      return control;
    };

    await startSharedRendererViewportPresenter({
      canvas,
      session,
      datasets: [],
      diagnosticSwatchEnabled: true,
      videoCutoverEnabled: false,
      nativeRenderPreviewEnabled: true,
      requireSharedRendererOutput: true,
      activeVideoDecodeJob: null,
      activeVideoDecodeJobs: [],
      requestId: 17,
      prepareNativeRenderUpload,
      startPresenter,
    });

    expect(presenterInput).toMatchObject({
      sharedRendererNativeRenderFrameUpload: undefined,
      sharedRendererNativeRenderFailure: {
        reason: 'nativeRenderUnsupportedMediaOnly',
        detail: 'Shared renderer preview session does not contain only Rust native-renderable media.',
      },
    });
  });

  it('uses optional native render only after a single Rust video upload cannot provide a frame', async () => {
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
        ok: false,
        reason: 'noVideoDecodeRequest',
        detail: 'Shared renderer preview session does not contain a visible video frame request.',
        activeJob: null,
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
      'prepareVideoUpload',
      'prepareNativeRenderUpload',
      'startPresenter',
    ]);
    expect(result.activeVideoDecodeJob).toBe(activeJob);
    expect(presenterInput).toMatchObject({
      sharedRendererNativeRenderFrameUpload: upload,
      sharedRendererDecodedVideoFrameUpload: undefined,
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

  it('passes Rust video upload failure details into the presenter diagnostics input', async () => {
    let presenterInput: unknown;
    const prepareVideoUploads: SharedRendererViewportVideoUploadsPreparer = async () => ({
      ok: false,
      reason: 'uploadFailed',
      uploadFailureReason: 'copyReportChecksumMismatch',
      uploadFailureClipId: 'clip-video-2',
      uploadFailureMediaId: 'video-2',
      detail: 'Shared video frame copy report checksum verification failed.',
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
      diagnosticSwatchEnabled: false,
      videoCutoverEnabled: true,
      activeVideoDecodeJob: null,
      activeVideoDecodeJobs: [],
      requestId: 11,
      prepareVideoUploads,
      startPresenter,
    });

    expect(result.activeVideoDecodeJobs).toEqual([activeJob]);
    expect(presenterInput).toMatchObject({
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererDecodedVideoFrameUploads: undefined,
      sharedRendererVideoUploadFailure: {
        reason: 'copyReportChecksumMismatch',
        detail: 'Shared video frame copy report checksum verification failed.',
        clipId: 'clip-video-2',
        mediaId: 'video-2',
      },
    });
  });

  it('passes stale Rust video decode failure clip details into the presenter diagnostics input', async () => {
    let presenterInput: unknown;
    const prepareVideoUploads: SharedRendererViewportVideoUploadsPreparer = async () => ({
      ok: false,
      reason: 'staleDecodeResponse',
      uploadFailureClipId: 'clip-video-2',
      uploadFailureMediaId: 'video-2',
      detail: 'Rust backend returned a decoded frame for a stale job id.',
      activeJobs: [activeJob],
    });
    const startPresenter: SharedRendererViewportPresenterStarter = async (input) => {
      presenterInput = input;
      return control;
    };

    await startSharedRendererViewportPresenter({
      canvas,
      session,
      datasets: [],
      diagnosticSwatchEnabled: false,
      videoCutoverEnabled: true,
      activeVideoDecodeJob: null,
      activeVideoDecodeJobs: [],
      requestId: 16,
      prepareVideoUploads,
      startPresenter,
    });

    expect(presenterInput).toMatchObject({
      sharedRendererVideoUploadFailure: {
        reason: 'staleDecodeResponse',
        detail: 'Rust backend returned a decoded frame for a stale job id.',
        clipId: 'clip-video-2',
        mediaId: 'video-2',
      },
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
