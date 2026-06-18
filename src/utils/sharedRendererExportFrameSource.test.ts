import { describe, expect, it } from 'vitest';
import type { ImageObject, ProjectSettings } from '../types';
import { createDefaultLayers } from './sceneState';
import {
  createSharedRendererExportFrameSource,
  isSharedRendererExportFrameSourceBlockedError,
} from './sharedRendererExportFrameSource';
import type { SharedRendererViewportVideoDecodeJob } from './sharedRendererViewportVideoUpload';
import type { RustBackendVideoEncodeWriteFramePayload } from './rustBackendVideoEncodeControl';

const settings: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 60,
  sampleRate: 48000,
};

const image = (patch: Partial<ImageObject> = {}): ImageObject => ({
  id: 'image-1',
  type: 'image',
  name: 'image.png',
  layer: 1,
  startTime: 0,
  duration: 5,
  x: 32,
  y: 48,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 32,
  endY: 48,
  easing: 'linear',
  src: 'blob:image',
  filePath: '/tmp/image.png',
  width: 640,
  height: 360,
  ...patch,
});

const decodeJob = (jobId: string): SharedRendererViewportVideoDecodeJob => ({
  jobId,
  source: `/tmp/${jobId}.mp4`,
  slotCount: 2,
  width: 1920,
  height: 1080,
  sourceRate: {
    numerator: 60,
    denominator: 1,
  },
});

describe('createSharedRendererExportFrameSource', () => {
  it('renders a shared renderer export session and captures its canvas as an ImageBitmap', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const frameBitmap = { close: () => undefined } as ImageBitmap;
    const presenterCalls: unknown[] = [];
    const bitmapCalls: unknown[] = [];
    let disposeCount = 0;

    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      startViewportPresenter: async (input) => {
        presenterCalls.push(input);
        return {
          control: { dispose: () => { disposeCount += 1; } },
          activeVideoDecodeJob: null,
          activeVideoDecodeJobs: [],
        } as never;
      },
      createFrameBitmap: async (...args) => {
        bitmapCalls.push(args);
        return frameBitmap;
      },
    });

    const result = await source.renderFrame({
      frameIndex: 12,
      timestampUs: 200_000,
      time: 0.2,
      width: 1920,
      height: 1080,
      objects: [image()],
    });

    expect(result).toBe(frameBitmap);
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
    expect(presenterCalls).toHaveLength(1);
    expect(bitmapCalls).toEqual([[canvas, 0, 0, 1920, 1080]]);
    expect(disposeCount).toBe(1);
    const presenterInput = presenterCalls[0] as {
      session: { surfaceGate: { ok: boolean } };
      videoCutoverEnabled: boolean;
      requestId: number;
    };
    expect(presenterInput.session.surfaceGate.ok).toBe(true);
    expect(presenterInput.videoCutoverEnabled).toBe(true);
    expect(presenterInput.requestId).toBe(1);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'ready',
      uxfdRustExportFrameSourceFrameIndex: '12',
      uxfdRustExportFrameSourceFrameReason: undefined,
    });
  });

  it('renders an encode frame directly into a writable shared frame payload', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    let bitmapClosed = 0;
    const frameBitmap = { close: () => { bitmapClosed += 1; } } as ImageBitmap;
    const payload: RustBackendVideoEncodeWriteFramePayload = {
      sessionId: 'encode-session-1',
      frameIndex: 2,
      timestampUs: 33_333,
      slotCount: 1,
      frame: {
        descriptor: {
          memoryId: '/uxfd-export-source-encode-session-1',
          slotIndex: 0,
          generation: 3,
          byteOffset: 0,
          byteLen: 8_294_400,
          width: 1920,
          height: 1080,
          strideBytes: 7680,
          format: 'rgba8Srgb',
          colour: {
            primaries: 'bt709',
            transfer: 'srgb',
            matrix: 'rgb',
            range: 'full',
          },
        },
        ptsFrame: 2,
      },
    };
    const calls: unknown[] = [];
    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      startViewportPresenter: async () => ({
        control: { dispose: () => undefined },
        activeVideoDecodeJob: null,
        activeVideoDecodeJobs: [],
      }) as never,
      createFrameBitmap: async (...args) => {
        calls.push(['createFrameBitmap', args]);
        return frameBitmap;
      },
      extractEncodeFrameRgbaBytes: async (bitmap, width, height) => {
        calls.push(['extractEncodeFrameRgbaBytes', bitmap === frameBitmap, width, height]);
        return Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
      },
      createEncodeFrameWriter: async (input) => {
        calls.push(['createEncodeFrameWriter', input]);
        return {
          writeFrame: async (writeInput) => {
            calls.push(['writeFrame', writeInput]);
            return payload;
          },
          writePaddedFrame: async (writeInput) => {
            calls.push(['writePaddedFrame', writeInput]);
            return payload;
          },
          close: async () => {
            calls.push(['closeEncodeFrameWriter']);
          },
        };
      },
    });

    await expect(source.renderEncodeFrame?.({
      frameIndex: 2,
      timestampUs: 33_333,
      time: 2 / 60,
      width: 1920,
      height: 1080,
      objects: [image()],
      encodeSessionId: 'encode-session-1',
    })).resolves.toEqual({
      timestamp: 33_333,
      sharedFramePayload: payload,
    });
    await source.close?.();

    expect(bitmapClosed).toBe(1);
    expect(calls).toEqual([
      ['createFrameBitmap', [canvas, 0, 0, 1920, 1080]],
      ['extractEncodeFrameRgbaBytes', true, 1920, 1080],
      ['createEncodeFrameWriter', {
        sessionId: 'encode-session-1',
        memoryId: '/uxfd-export-source-encode-session-1',
        width: 1920,
        height: 1080,
        fps: 60,
      }],
      ['writeFrame', {
        frameIndex: 2,
        timestampUs: 33_333,
        rgbaBytes: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
      }],
      ['closeEncodeFrameWriter'],
    ]);
  });

  it('uses presenter WebGPU readback for encode frames without creating an ImageBitmap', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const paddedRgbaBytes = new Uint8Array(512);
    paddedRgbaBytes.set([1, 2, 3, 4, 5, 6, 7, 8], 0);
    paddedRgbaBytes.set([9, 10, 11, 12, 13, 14, 15, 16], 256);
    const payload: RustBackendVideoEncodeWriteFramePayload = {
      sessionId: 'encode-session-readback',
      frameIndex: 5,
      timestampUs: 83_333,
      slotCount: 1,
      frame: {
        descriptor: {
          memoryId: '/uxfd-export-source-encode-session-readback',
          slotIndex: 0,
          generation: 6,
          byteOffset: 0,
          byteLen: 512,
          width: 2,
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
        ptsFrame: 5,
      },
    };
    const calls: unknown[] = [];
    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: {
        ...settings,
        width: 2,
        height: 2,
      },
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      startViewportPresenter: async () => ({
        control: {
          ok: true,
          readPresentedFrameRgbaBytes: async (input) => {
            calls.push(['readPresentedFrameRgbaBytes', input]);
            return {
              rgbaBytes: paddedRgbaBytes,
              strideBytes: 256,
              byteLen: 512,
              width: 2,
              height: 2,
            };
          },
          dispose: () => {
            calls.push(['dispose']);
          },
        },
        activeVideoDecodeJob: null,
        activeVideoDecodeJobs: [],
      }) as never,
      createFrameBitmap: async () => {
        throw new Error('ImageBitmap capture must not run when presenter readback is available.');
      },
      extractEncodeFrameRgbaBytes: async () => {
        throw new Error('ImageBitmap RGBA extraction must not run when presenter readback is available.');
      },
      createEncodeFrameWriter: async (input) => {
        calls.push(['createEncodeFrameWriter', input]);
        return {
          writeFrame: async (writeInput) => {
            calls.push(['writeFrame', writeInput]);
            return payload;
          },
          writePaddedFrame: async (writeInput) => {
            calls.push(['writePaddedFrame', writeInput]);
            return payload;
          },
          close: async () => {
            calls.push(['closeEncodeFrameWriter']);
          },
        };
      },
    });

    await expect(source.renderEncodeFrame?.({
      frameIndex: 5,
      timestampUs: 83_333,
      time: 5 / 60,
      width: 2,
      height: 2,
      objects: [image()],
      encodeSessionId: 'encode-session-readback',
    })).resolves.toEqual({
      timestamp: 83_333,
      sharedFramePayload: payload,
    });
    await source.close?.();

    expect(calls).toEqual([
      ['readPresentedFrameRgbaBytes', {
        width: 2,
        height: 2,
      }],
      ['createEncodeFrameWriter', {
        sessionId: 'encode-session-readback',
        memoryId: '/uxfd-export-source-encode-session-readback',
        width: 2,
        height: 2,
        fps: 60,
      }],
      ['writePaddedFrame', {
        frameIndex: 5,
        timestampUs: 83_333,
        paddedRgbaBytes,
        strideBytes: 256,
      }],
      ['dispose'],
      ['closeEncodeFrameWriter'],
    ]);
  });

  it('carries resolved Rust decode jobs across export frames', async () => {
    const canvas = {
      width: 1920,
      height: 1080,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const firstJob = decodeJob('decode-1');
    const secondJob = decodeJob('decode-2');
    const activeJobsSeen: unknown[] = [];
    const jobsToReturn = [[firstJob], [secondJob]];

    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      startViewportPresenter: async (input) => {
        activeJobsSeen.push(input.activeVideoDecodeJobs);
        return {
          control: { dispose: () => undefined },
          activeVideoDecodeJob: jobsToReturn[0]?.[0] ?? null,
          activeVideoDecodeJobs: jobsToReturn.shift() ?? [],
        } as never;
      },
      createFrameBitmap: async () => ({ close: () => undefined }) as ImageBitmap,
    });

    await source.renderFrame({
      frameIndex: 1,
      timestampUs: 16_667,
      time: 1 / 60,
      width: 1920,
      height: 1080,
      objects: [image()],
    });
    await source.renderFrame({
      frameIndex: 2,
      timestampUs: 33_333,
      time: 2 / 60,
      width: 1920,
      height: 1080,
      objects: [image()],
    });

    expect(activeJobsSeen).toEqual([
      [],
      [firstJob],
    ]);
  });

  it('stops active Rust decode jobs when the export frame source closes', async () => {
    const canvas = {
      width: 1920,
      height: 1080,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const activeJob = decodeJob('decode-close');
    const stoppedJobIds: string[] = [];

    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      startViewportPresenter: async () => ({
        control: { dispose: () => undefined },
        activeVideoDecodeJob: activeJob,
        activeVideoDecodeJobs: [activeJob],
      }) as never,
      createFrameBitmap: async () => ({ close: () => undefined }) as ImageBitmap,
      stopVideoDecodeJob: async (job) => {
        stoppedJobIds.push(job.jobId);
      },
    });

    await source.renderFrame({
      frameIndex: 1,
      timestampUs: 16_667,
      time: 1 / 60,
      width: 1920,
      height: 1080,
      objects: [image()],
    });

    await source.close?.();
    await source.close?.();

    expect(stoppedJobIds).toEqual(['decode-close']);
  });

  it('fails loud before presenter work when the export session is not renderable', async () => {
    const canvas = {
        width: 1920,
        height: 1080,
        dataset: {},
    } as unknown as HTMLCanvasElement;
    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '3d_stage',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      startViewportPresenter: async () => {
        throw new Error('presenter must not start for a blocked export session');
      },
      createFrameBitmap: async () => {
        throw new Error('bitmap capture must not start for a blocked export session');
      },
    });

    const blocked = await source.renderFrame({
      frameIndex: 1,
      timestampUs: 16_667,
      time: 1 / 60,
      width: 1920,
      height: 1080,
      objects: [image()],
    }).catch((error) => error);

    expect(isSharedRendererExportFrameSourceBlockedError(blocked)).toBe(true);
    expect(blocked).toMatchObject({
      message: 'Shared renderer preview surface currently supports only the 2D editor mode.',
      reason: 'unsupportedEditorMode',
      frameIndex: 1,
      fallbackToLegacyCanvas: true,
    });
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'blocked',
      uxfdRustExportFrameSourceFrameIndex: '1',
      uxfdRustExportFrameSourceFrameReason: 'unsupportedEditorMode',
    });
  });

  it('falls back before bitmap capture when Rust video upload fails during export', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    let disposeCount = 0;
    let bitmapCaptureCount = 0;

    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      startViewportPresenter: async () => ({
        control: { dispose: () => { disposeCount += 1; } },
        activeVideoDecodeJob: null,
        activeVideoDecodeJobs: [],
        videoUploadsResult: {
          ok: false,
          reason: 'uploadFailed',
          detail: 'copy failed',
          activeJobs: [],
        },
      }) as never,
      createFrameBitmap: async () => {
        bitmapCaptureCount += 1;
        return ({ close: () => undefined }) as ImageBitmap;
      },
    });

    const blocked = await source.renderFrame({
      frameIndex: 2,
      timestampUs: 33_333,
      time: 2 / 60,
      width: 1920,
      height: 1080,
      objects: [image()],
    }).catch((error) => error);

    expect(isSharedRendererExportFrameSourceBlockedError(blocked)).toBe(true);
    expect(blocked).toMatchObject({
      message: 'copy failed',
      reason: 'videoUploadFailed',
      frameIndex: 2,
      fallbackToLegacyCanvas: true,
    });
    expect(bitmapCaptureCount).toBe(0);
    expect(disposeCount).toBe(1);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'blocked',
      uxfdRustExportFrameSourceFrameIndex: '2',
      uxfdRustExportFrameSourceFrameReason: 'videoUploadFailed',
    });
  });

  it('continues bitmap capture when Rust video upload preparation reports no video request', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const frameBitmap = { close: () => undefined } as ImageBitmap;

    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      startViewportPresenter: async () => ({
        control: { dispose: () => undefined },
        activeVideoDecodeJob: null,
        activeVideoDecodeJobs: [],
        videoUploadsResult: {
          ok: false,
          reason: 'noVideoDecodeRequest',
          detail: 'Shared renderer preview session does not contain a visible video frame request.',
          activeJobs: [],
        },
      }) as never,
      createFrameBitmap: async () => frameBitmap,
    });

    await expect(source.renderFrame({
      frameIndex: 3,
      timestampUs: 50_000,
      time: 3 / 60,
      width: 1920,
      height: 1080,
      objects: [image()],
    })).resolves.toBe(frameBitmap);
  });

  it('falls back before bitmap capture when export video ownership remains on Pixi', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    let disposeCount = 0;
    let bitmapCaptureCount = 0;

    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      startViewportPresenter: async () => ({
        control: {
          dispose: () => { disposeCount += 1; },
          videoOwnership: {
            owner: 'pixi',
            reason: 'videoFrameUploadUnavailable',
            videoObjectIds: [],
          },
        },
        activeVideoDecodeJob: null,
        activeVideoDecodeJobs: [],
      }) as never,
      createFrameBitmap: async () => {
        bitmapCaptureCount += 1;
        return ({ close: () => undefined }) as ImageBitmap;
      },
    });

    const blocked = await source.renderFrame({
      frameIndex: 4,
      timestampUs: 66_667,
      time: 4 / 60,
      width: 1920,
      height: 1080,
      objects: [image()],
    }).catch((error) => error);

    expect(isSharedRendererExportFrameSourceBlockedError(blocked)).toBe(true);
    expect(blocked).toMatchObject({
      reason: 'videoOwnershipUnavailable',
      frameIndex: 4,
      fallbackToLegacyCanvas: true,
    });
    expect(blocked.message).toContain('videoFrameUploadUnavailable');
    expect(bitmapCaptureCount).toBe(0);
    expect(disposeCount).toBe(1);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'blocked',
      uxfdRustExportFrameSourceFrameIndex: '4',
      uxfdRustExportFrameSourceFrameReason: 'videoOwnershipUnavailable',
    });
  });
});
