import { describe, expect, it, vi } from 'vitest';
import {
  startSharedRendererViewportPresenter,
  type SharedRendererViewportPresenterStarter,
  type SharedRendererViewportVideoUploadPreparer,
} from './sharedRendererViewportPresenterOrchestration';
import type { SharedRendererPreviewPresenterControl } from './sharedRendererPreviewPresenterController';
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

const upload = {
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
    reason: 'cutoverEnabled',
    solidColourObjectIds: [],
  },
  videoOwnership: {
    owner: 'sharedRenderer',
    reason: 'cutoverEnabled',
    videoObjectIds: ['video-1'],
  },
  dispose: vi.fn(),
};

describe('sharedRendererViewportPresenterOrchestration', () => {
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
});
