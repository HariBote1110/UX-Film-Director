import { describe, expect, it } from 'vitest';
import type { ImageObject, ProjectSettings } from '../types';
import { createDefaultLayers } from './sceneState';
import { createSharedRendererExportFrameSource } from './sharedRendererExportFrameSource';
import type { SharedRendererViewportVideoDecodeJob } from './sharedRendererViewportVideoUpload';

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
    const source = createSharedRendererExportFrameSource({
      canvas: {
        width: 1920,
        height: 1080,
        dataset: {},
      } as unknown as HTMLCanvasElement,
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

    await expect(source.renderFrame({
      frameIndex: 1,
      timestampUs: 16_667,
      time: 1 / 60,
      width: 1920,
      height: 1080,
      objects: [image()],
    })).rejects.toThrow('Shared renderer preview surface currently supports only the 2D editor mode.');
  });
});
