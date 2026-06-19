import { describe, expect, it } from 'vitest';
import type { ImageObject, ProjectSettings, VideoObject } from '../types';
import { createDefaultLayers } from './sceneState';
import {
  createSharedRendererExportFrameSource,
  isSharedRendererExportFrameSourceBlockedError,
  type SharedRendererExportNativeRenderSourcesPreparer,
  type SharedRendererExportNativeSharedFrameReleaser,
  type SharedRendererExportNativeSharedFrameRenderer,
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

const video = (patch: Partial<VideoObject> = {}): VideoObject => ({
  id: 'video-1',
  type: 'video',
  name: 'GoPro.mp4',
  layer: 1,
  startTime: 0,
  duration: 5,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  src: 'blob:video',
  filePath: '/tmp/GoPro.mp4',
  width: 1920,
  height: 1080,
  volume: 1,
  muted: false,
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
      requireSharedRendererOutput: boolean;
      requestId: number;
    };
    expect(presenterInput.session.surfaceGate.ok).toBe(true);
    expect(presenterInput.videoCutoverEnabled).toBe(true);
    expect(presenterInput.requireSharedRendererOutput).toBe(true);
    expect(presenterInput.requestId).toBe(1);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'ready',
      uxfdRustExportFrameSourceFrameIndex: '12',
      uxfdRustExportFrameSourceFrameReason: undefined,
    });
  });

  it('blocks video renderFrame requests before presenter or ImageBitmap capture can run', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const calls: unknown[] = [];

    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      startViewportPresenter: async () => {
        calls.push(['startViewportPresenter']);
        throw new Error('presenter must not start for video bitmap capture.');
      },
      createFrameBitmap: async () => {
        calls.push(['createFrameBitmap']);
        throw new Error('ImageBitmap capture must not run for video export frames.');
      },
    });

    const blocked = await source.renderFrame({
      frameIndex: 13,
      timestampUs: 216_667,
      time: 13 / 60,
      width: 1920,
      height: 1080,
      objects: [video()],
    }).catch((error) => error);

    expect(isSharedRendererExportFrameSourceBlockedError(blocked)).toBe(true);
    expect(blocked).toMatchObject({
      reason: 'videoBitmapCaptureDisabled',
      frameIndex: 13,
      fallbackToLegacyCanvas: true,
      legacyCanvasFallbackAllowed: false,
    });
    expect(blocked.message).toContain('Video export frames require Rust native render shared-frame encoding');
    expect(calls).toEqual([]);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'blocked',
      uxfdRustExportFrameSourceFrameIndex: '13',
      uxfdRustExportFrameSourceFrameReason: 'videoBitmapCaptureDisabled',
    });
  });

  it('exposes an encode-only source without ImageBitmap capture', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
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
      bitmapCaptureEnabled: false,
      startViewportPresenter: async () => {
        calls.push(['startViewportPresenter']);
        throw new Error('presenter readback must not be needed to expose an encode-only source.');
      },
      createFrameBitmap: async () => {
        calls.push(['createFrameBitmap']);
        throw new Error('ImageBitmap capture must not exist for encode-only export sources.');
      },
    } as Parameters<typeof createSharedRendererExportFrameSource>[0] & {
      bitmapCaptureEnabled: false;
    });

    expect(source.renderFrame).toBeUndefined();
    await source.close?.();
    expect(calls).toEqual([]);
  });

  it('fails encode frames before ImageBitmap capture when presenter readback is unavailable', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const calls: unknown[] = [];
    let disposeCount = 0;
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
          ok: true,
          dispose: () => {
            disposeCount += 1;
          },
        },
        activeVideoDecodeJob: null,
        activeVideoDecodeJobs: [],
      }) as never,
      createFrameBitmap: async () => {
        calls.push(['createFrameBitmap']);
        throw new Error('ImageBitmap capture must not run for Rust direct encoding.');
      },
    });

    const blocked = await source.renderEncodeFrame?.({
      frameIndex: 2,
      timestampUs: 33_333,
      time: 2 / 60,
      width: 1920,
      height: 1080,
      objects: [image()],
      encodeSessionId: 'encode-session-1',
    }).catch((error) => error);
    await source.close?.();

    expect(isSharedRendererExportFrameSourceBlockedError(blocked)).toBe(true);
    expect(blocked).toMatchObject({
      reason: 'presentedSharedFrameHandoffUnavailable',
      frameIndex: 2,
      fallbackToLegacyCanvas: true,
    });
    expect(blocked.message).toContain('Presented shared-frame handoff is required');
    expect(disposeCount).toBe(1);
    expect(calls).toEqual([]);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'blocked',
      uxfdRustExportFrameSourceFrameIndex: '2',
      uxfdRustExportFrameSourceFrameReason: 'presentedSharedFrameHandoffUnavailable',
    });
  });

  it('blocks encode frames when presenter shared-frame handoff is unavailable', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const calls: unknown[] = [];
    let disposeCount = 0;
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
          dispose: () => {
            disposeCount += 1;
          },
        },
        activeVideoDecodeJob: null,
        activeVideoDecodeJobs: [],
      }) as never,
      createFrameBitmap: async () => {
        throw new Error('ImageBitmap capture must not run for encode frames.');
      },
    });

    const blocked = await source.renderEncodeFrame?.({
      frameIndex: 5,
      timestampUs: 83_333,
      time: 5 / 60,
      width: 2,
      height: 2,
      objects: [image()],
      encodeSessionId: 'encode-session-readback',
    }).catch((error) => error);

    expect(isSharedRendererExportFrameSourceBlockedError(blocked)).toBe(true);
    expect(blocked).toMatchObject({
      reason: 'presentedSharedFrameHandoffUnavailable',
      frameIndex: 5,
      fallbackToLegacyCanvas: true,
    });
    expect(calls).toEqual([]);
    expect(disposeCount).toBe(1);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'blocked',
      uxfdRustExportFrameSourceFrameIndex: '5',
      uxfdRustExportFrameSourceFrameReason: 'presentedSharedFrameHandoffUnavailable',
    });
  });

  it('uses presenter shared-frame payloads directly for encode frames', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const payload: RustBackendVideoEncodeWriteFramePayload = {
      sessionId: 'direct-shared-frame-session',
      frameIndex: 6,
      timestampUs: 100_000,
      slotCount: 1,
      frame: {
        descriptor: {
          memoryId: '/uxfd-export-source-direct-shared-frame-session',
          slotIndex: 0,
          generation: 7,
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
        ptsFrame: 6,
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
          takePresentedFrameSharedFrame: async (input: unknown) => {
            calls.push(['takePresentedFrameSharedFrame', input]);
            return payload;
          },
          dispose: () => {
            calls.push(['dispose']);
          },
        },
        activeVideoDecodeJob: null,
        activeVideoDecodeJobs: [],
      }) as never,
    });

    await expect(source.renderEncodeFrame?.({
      frameIndex: 6,
      timestampUs: 100_000,
      time: 0.1,
      width: 2,
      height: 2,
      objects: [image()],
      encodeSessionId: 'direct-shared-frame-session',
    })).resolves.toEqual({
      timestamp: 100_000,
      sharedFramePayload: payload,
    });
    await source.close?.();

    expect(calls).toEqual([
      ['takePresentedFrameSharedFrame', {
        encodeSessionId: 'direct-shared-frame-session',
        memoryId: '/uxfd-export-source-direct-shared-frame-session',
        frameIndex: 6,
        timestampUs: 100_000,
        width: 2,
        height: 2,
        fps: 60,
      }],
      ['dispose'],
    ]);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'ready',
      uxfdRustExportFrameSourceFrameIndex: '6',
      uxfdRustExportFrameSourceFramePath: 'presentedSharedFrame',
      uxfdRustExportFrameSourceFrameReason: undefined,
    });
  });

  it('passes native/Rust frame handoff into viewport presenter orchestration', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const payload: RustBackendVideoEncodeWriteFramePayload = {
      sessionId: 'export-handoff-session',
      frameIndex: 9,
      timestampUs: 150_000,
      slotCount: 1,
      frame: {
        descriptor: {
          memoryId: '/uxfd-export-source-export-handoff-session',
          slotIndex: 0,
          generation: 10,
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
        ptsFrame: 9,
      },
    };
    const presentedFrameSharedFrameTaker = async () => null;
    let presenterInput: unknown;
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
      presentedFrameSharedFrameTaker,
      startViewportPresenter: async (input) => {
        presenterInput = input;
        return {
          control: {
            ok: true,
            takePresentedFrameSharedFrame: async () => payload,
            dispose: () => undefined,
          },
          activeVideoDecodeJob: null,
          activeVideoDecodeJobs: [],
        } as never;
      },
    } as Parameters<typeof createSharedRendererExportFrameSource>[0] & {
      presentedFrameSharedFrameTaker: unknown;
    });

    await expect(source.renderEncodeFrame?.({
      frameIndex: 9,
      timestampUs: 150_000,
      time: 0.15,
      width: 2,
      height: 2,
      objects: [image()],
      encodeSessionId: 'export-handoff-session',
    })).resolves.toEqual({
      timestamp: 150_000,
      sharedFramePayload: payload,
    });

    expect(presenterInput).toMatchObject({
      presentedFrameSharedFrameTaker,
    });
  });

  it('blocks encode-only frames without presenter readback when the native renderer bridge is unavailable', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const calls: unknown[] = [];
    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: {
        ...settings,
        width: 4,
        height: 4,
      },
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      prepareNativeRenderSources: async () => {
        calls.push(['prepareNativeRenderSources']);
        throw new Error('native render source preparation must not run when the renderer bridge is unavailable.');
      },
      startViewportPresenter: async () => {
        calls.push(['startViewportPresenter']);
        throw new Error('presenter readback must not run for encode-only export sources.');
      },
    } as unknown as Parameters<typeof createSharedRendererExportFrameSource>[0] & {
      bitmapCaptureEnabled: false;
      prepareNativeRenderSources: unknown;
    });

    const blocked = await source.renderEncodeFrame?.({
      frameIndex: 5,
      timestampUs: 83_333,
      time: 5 / 60,
      width: 4,
      height: 4,
      objects: [image()],
      encodeSessionId: 'no-native-renderer-session',
    }).catch((error) => error);

    expect(isSharedRendererExportFrameSourceBlockedError(blocked)).toBe(true);
    expect(blocked).toMatchObject({
      reason: 'nativeRenderUnavailable',
      frameIndex: 5,
      fallbackToLegacyCanvas: true,
    });
    expect(calls).toEqual([]);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'blocked',
      uxfdRustExportFrameSourceFrameIndex: '5',
      uxfdRustExportFrameSourceFrameReason: 'nativeRenderUnavailable',
    });
  });

  it('blocks encode-only frames instead of falling back to JS readback when native render is required but unavailable', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const calls: unknown[] = [];
    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: {
        ...settings,
        width: 4,
        height: 4,
      },
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      nativeRenderRequired: true,
      prepareNativeRenderSources: async () => {
        calls.push(['prepareNativeRenderSources']);
        throw new Error('native render source preparation must not run when the renderer bridge is unavailable.');
      },
      startViewportPresenter: async () => {
        calls.push(['startViewportPresenter']);
        throw new Error('presenter readback must not run when native render is required.');
      },
    } as unknown as Parameters<typeof createSharedRendererExportFrameSource>[0] & {
      bitmapCaptureEnabled: false;
      nativeRenderRequired: true;
      prepareNativeRenderSources: unknown;
    });

    const blocked = await source.renderEncodeFrame?.({
      frameIndex: 5,
      timestampUs: 83_333,
      time: 5 / 60,
      width: 4,
      height: 4,
      objects: [image()],
      encodeSessionId: 'native-required-session',
    }).catch((error) => error);

    expect(isSharedRendererExportFrameSourceBlockedError(blocked)).toBe(true);
    expect(blocked).toMatchObject({
      reason: 'nativeRenderUnavailable',
      frameIndex: 5,
      fallbackToLegacyCanvas: true,
    });
    expect(calls).toEqual([]);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'blocked',
      uxfdRustExportFrameSourceFrameIndex: '5',
      uxfdRustExportFrameSourceFrameReason: 'nativeRenderUnavailable',
    });
  });

  it('treats encode-only sources as native-render-required even when the caller omits the explicit flag', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const calls: unknown[] = [];
    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: {
        ...settings,
        width: 4,
        height: 4,
      },
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      prepareNativeRenderSources: async () => {
        calls.push(['prepareNativeRenderSources']);
        throw new Error('native render source preparation must not run when the renderer bridge is unavailable.');
      },
      startViewportPresenter: async () => {
        calls.push(['startViewportPresenter']);
        throw new Error('presenter readback must not run for encode-only export sources.');
      },
    } as unknown as Parameters<typeof createSharedRendererExportFrameSource>[0] & {
      bitmapCaptureEnabled: false;
      prepareNativeRenderSources: unknown;
    });

    const blocked = await source.renderEncodeFrame?.({
      frameIndex: 6,
      timestampUs: 100_000,
      time: 6 / 60,
      width: 4,
      height: 4,
      objects: [image()],
      encodeSessionId: 'implicit-native-required-session',
    }).catch((error) => error);

    expect(isSharedRendererExportFrameSourceBlockedError(blocked)).toBe(true);
    expect(blocked).toMatchObject({
      reason: 'nativeRenderUnavailable',
      frameIndex: 6,
      fallbackToLegacyCanvas: true,
    });
    expect(calls).toEqual([]);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'blocked',
      uxfdRustExportFrameSourceFrameIndex: '6',
      uxfdRustExportFrameSourceFrameReason: 'nativeRenderUnavailable',
    });
  });

  it('uses Rust backend native render shared frames before WebGPU presenter readback for encode frames', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const decodedFrame = {
      descriptor: {
        memoryId: '/uxfd-decoded-video-1',
        slotIndex: 0,
        generation: 3,
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
      ptsFrame: 7,
    } as const;
    const renderedFrame = {
      descriptor: {
        memoryId: '/uxfd-native-render-native-session-frame-7',
        slotIndex: 0,
        generation: 1,
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
      ptsFrame: 7,
    } as const;
    const snapshot = {
      frame_index: 7,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'video-clip-1',
        track_id: 'layer-1',
        media_id: 'video-1',
        source_frame: 7,
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
      }, {
        clip_id: 'solid-clip-1',
        track_id: 'layer-2',
        media_id: 'solid-1',
        source_frame: 0,
        z_index: 1,
        transform: {
          translation_x: 0,
          translation_y: 0,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'nearest',
        },
        opacity: 1,
        effects: [],
      }],
    } as const;
    const media = [{
      id: 'video-1',
      kind: 'Video',
      source: '/tmp/video-1.mp4',
      width: 4,
      height: 4,
      source_rate: {
        numerator: 60,
        denominator: 1,
      },
    }, {
      id: 'solid-1',
      kind: 'SolidColour',
      source: '#ff0000',
      width: 2,
      height: 2,
    }] as const;
    const calls: unknown[] = [];
    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: {
        ...settings,
        width: 4,
        height: 4,
      },
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      buildExportSession: () => ({
        plan: {
          mode: 'parallelCompare',
          primary: 'pixi',
          candidate: 'sharedRenderer',
          snapshot,
          media,
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
          snapshot,
          media,
        },
      }),
      prepareNativeRenderSources: (async (input) => {
        calls.push(['prepareNativeRenderSources', {
          requestId: input.requestId,
          activeJobs: input.activeJobs,
          snapshot: input.session.surfaceGate.ok ? input.session.surfaceGate.snapshot : null,
        }]);
        return {
          ok: true,
          activeJobs: [decodeJob('native-render-video')],
          sources: [{
            mediaId: 'video-1',
            slotCount: 2,
            frame: decodedFrame,
            releaseAfterNativeRenderComplete: async () => {
              calls.push(['releaseAfterNativeRenderComplete']);
            },
            releaseAfterNativeRenderAbort: async () => {
              calls.push(['releaseAfterNativeRenderAbort']);
            },
          }],
        };
      }) satisfies SharedRendererExportNativeRenderSourcesPreparer,
      renderNativeSharedFrame: (async (payload) => {
        calls.push(['renderNativeSharedFrame', payload]);
        return {
          success: true,
          result: {
            rendered: true,
            renderId: 'native-session-frame-7',
            memoryId: '/uxfd-native-render-native-session-frame-7',
            slotCount: 1,
            slotByteLen: 1024,
            frame: renderedFrame,
          },
        };
      }) satisfies SharedRendererExportNativeSharedFrameRenderer,
      startViewportPresenter: async () => {
        calls.push(['startViewportPresenter']);
        throw new Error('WebGPU presenter must not start when Rust native render succeeds.');
      },
    } as unknown as Parameters<typeof createSharedRendererExportFrameSource>[0] & {
      bitmapCaptureEnabled: false;
      prepareNativeRenderSources: unknown;
      renderNativeSharedFrame: unknown;
    });

    await expect(source.renderEncodeFrame?.({
      frameIndex: 7,
      timestampUs: 116_667,
      time: 7 / 60,
      width: 4,
      height: 4,
      objects: [image()],
      encodeSessionId: 'native-session',
    })).resolves.toEqual({
      timestamp: 116_667,
      sharedFramePayload: {
        sessionId: 'native-session',
        frameIndex: 7,
        timestampUs: 116_667,
        slotCount: 1,
        frame: renderedFrame,
      },
      releaseAfterEncodeFailure: {
        kind: 'nativeRenderOutput',
        memoryId: '/uxfd-native-render-native-session-frame-7',
      },
    });

    expect(calls).toEqual([
      ['prepareNativeRenderSources', {
        requestId: 1,
        activeJobs: [],
        snapshot,
      }],
      ['renderNativeSharedFrame', {
        renderId: 'native-session-frame-7',
        memoryId: '/uxfd-native-render-native-session-frame-7',
        slotCount: 1,
        ptsFrame: 7,
        width: 4,
        height: 4,
        snapshot,
        media,
        sources: [{
          mediaId: 'video-1',
          slotCount: 2,
          frame: decodedFrame,
        }],
      }],
      ['releaseAfterNativeRenderComplete'],
    ]);
  });

  it('releases decoded native render sources as aborted when Rust native render fails', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const decodedFrame = {
      descriptor: {
        memoryId: '/uxfd-decoded-video-native-render-failure',
        slotIndex: 1,
        generation: 8,
        byteOffset: 256,
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
      ptsFrame: 7,
    } as const;
    const snapshot = {
      frame_index: 7,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'video-clip-1',
        track_id: 'layer-1',
        media_id: 'video-1',
        source_frame: 7,
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
    } as const;
    const media = [{
      id: 'video-1',
      kind: 'Video',
      source: '/tmp/video-1.mp4',
      width: 4,
      height: 4,
      source_rate: {
        numerator: 60,
        denominator: 1,
      },
    }] as const;
    const calls: unknown[] = [];
    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: {
        ...settings,
        width: 4,
        height: 4,
      },
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      buildExportSession: () => ({
        plan: {
          mode: 'parallelCompare',
          primary: 'pixi',
          candidate: 'sharedRenderer',
          snapshot,
          media,
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
          snapshot,
          media,
        },
      }),
      prepareNativeRenderSources: async () => ({
        ok: true,
        activeJobs: [decodeJob('native-render-failure-video')],
        sources: [{
          mediaId: 'video-1',
          slotCount: 2,
          frame: decodedFrame,
          releaseAfterNativeRenderComplete: async () => {
            calls.push(['releaseAfterNativeRenderComplete']);
          },
          releaseAfterNativeRenderAbort: async () => {
            calls.push(['releaseAfterNativeRenderAbort']);
          },
        }],
      }),
      renderNativeSharedFrame: (async (payload) => {
        calls.push(['renderNativeSharedFrame', payload]);
        return {
          success: false,
          error: 'native render failed',
        };
      }) satisfies SharedRendererExportNativeSharedFrameRenderer,
      startViewportPresenter: async () => {
        throw new Error('WebGPU presenter must not start when Rust native render fails.');
      },
    } as unknown as Parameters<typeof createSharedRendererExportFrameSource>[0] & {
      bitmapCaptureEnabled: false;
      renderNativeSharedFrame: unknown;
    });

    await expect(source.renderEncodeFrame?.({
      frameIndex: 7,
      timestampUs: 116_667,
      time: 7 / 60,
      width: 4,
      height: 4,
      objects: [video()],
      encodeSessionId: 'native-render-failure-session',
    })).rejects.toMatchObject({
      fallbackToLegacyCanvas: true,
      reason: 'nativeRenderFailed',
      frameIndex: 7,
    });

    expect(calls).toEqual([
      ['renderNativeSharedFrame', {
        renderId: 'native-render-failure-session-frame-7',
        memoryId: '/uxfd-native-render-native-render-failure-session-frame-7',
        slotCount: 1,
        ptsFrame: 7,
        width: 4,
        height: 4,
        snapshot,
        media,
        sources: [{
          mediaId: 'video-1',
          slotCount: 2,
          frame: decodedFrame,
        }],
      }],
      ['releaseAfterNativeRenderAbort'],
    ]);
  });

  it('releases export native render output when source complete release fails', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const decodedFrame = {
      descriptor: {
        memoryId: '/uxfd-decoded-video-export-complete-release-failure',
        slotIndex: 1,
        generation: 10,
        byteOffset: 256,
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
      ptsFrame: 11,
    } as const;
    const renderedFrame = {
      descriptor: {
        memoryId: '/uxfd-native-render-export-complete-release-failure-frame-11',
        slotIndex: 0,
        generation: 1,
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
      ptsFrame: 11,
    } as const;
    const snapshot = {
      frame_index: 11,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'video-clip-1',
        track_id: 'layer-1',
        media_id: 'video-1',
        source_frame: 11,
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
    } as const;
    const media = [{
      id: 'video-1',
      kind: 'Video',
      source: '/tmp/video-1.mp4',
      width: 4,
      height: 4,
      source_rate: {
        numerator: 60,
        denominator: 1,
      },
    }] as const;
    const calls: unknown[] = [];
    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: {
        ...settings,
        width: 4,
        height: 4,
      },
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      buildExportSession: () => ({
        plan: {
          mode: 'parallelCompare',
          primary: 'pixi',
          candidate: 'sharedRenderer',
          snapshot,
          media,
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
          snapshot,
          media,
        },
      }),
      prepareNativeRenderSources: async () => ({
        ok: true,
        activeJobs: [decodeJob('export-complete-release-failure-video')],
        sources: [{
          mediaId: 'video-1',
          slotCount: 2,
          frame: decodedFrame,
          releaseAfterNativeRenderComplete: async () => {
            calls.push(['releaseAfterNativeRenderComplete']);
            throw new Error('export source complete release failed');
          },
          releaseAfterNativeRenderAbort: async () => {
            calls.push(['releaseAfterNativeRenderAbort']);
          },
        }],
      }),
      renderNativeSharedFrame: (async () => {
        calls.push(['renderNativeSharedFrame']);
        return {
          success: true,
          result: {
            rendered: true,
            renderId: 'export-complete-release-failure-session-frame-11',
            memoryId: '/uxfd-native-render-export-complete-release-failure-frame-11',
            slotCount: 1,
            slotByteLen: 1024,
            frame: renderedFrame,
          },
        };
      }) satisfies SharedRendererExportNativeSharedFrameRenderer,
      releaseNativeSharedFrame: (async (payload) => {
        calls.push(['releaseNativeSharedFrame', payload]);
        return {
          success: true,
          result: {
            released: true,
            memoryId: payload.memoryId,
          },
        };
      }) satisfies SharedRendererExportNativeSharedFrameReleaser,
      startViewportPresenter: async () => {
        throw new Error('WebGPU presenter must not start when native render complete release fails.');
      },
    } as unknown as Parameters<typeof createSharedRendererExportFrameSource>[0] & {
      bitmapCaptureEnabled: false;
      renderNativeSharedFrame: unknown;
      releaseNativeSharedFrame: unknown;
    });

    const blocked = await source.renderEncodeFrame?.({
      frameIndex: 11,
      timestampUs: 183_333,
      time: 11 / 60,
      width: 4,
      height: 4,
      objects: [video()],
      encodeSessionId: 'export-complete-release-failure-session',
    }).catch((error) => error);

    expect(isSharedRendererExportFrameSourceBlockedError(blocked)).toBe(true);
    expect(blocked).toMatchObject({
      fallbackToLegacyCanvas: true,
      reason: 'nativeRenderSourceReleaseFailed',
      frameIndex: 11,
      message: 'export source complete release failed',
    });
    expect(calls).toEqual([
      ['renderNativeSharedFrame'],
      ['releaseAfterNativeRenderComplete'],
      ['releaseNativeSharedFrame', {
        memoryId: '/uxfd-native-render-export-complete-release-failure-frame-11',
      }],
    ]);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'blocked',
      uxfdRustExportFrameSourceFrameIndex: '11',
      uxfdRustExportFrameSourceFrameReason: 'nativeRenderSourceReleaseFailed',
      uxfdRustExportFrameSourceFramePath: undefined,
    });
  });

  it('blocks export with a release diagnostic when native render abort source release fails', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const decodedFrame = {
      descriptor: {
        memoryId: '/uxfd-decoded-video-native-render-release-failure',
        slotIndex: 1,
        generation: 8,
        byteOffset: 256,
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
      ptsFrame: 8,
    } as const;
    const snapshot = {
      frame_index: 8,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'video-clip-1',
        track_id: 'layer-1',
        media_id: 'video-1',
        source_frame: 8,
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
    } as const;
    const media = [{
      id: 'video-1',
      kind: 'Video',
      source: '/tmp/video-1.mp4',
      width: 4,
      height: 4,
      source_rate: {
        numerator: 60,
        denominator: 1,
      },
    }] as const;
    const calls: unknown[] = [];
    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: {
        ...settings,
        width: 4,
        height: 4,
      },
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      buildExportSession: () => ({
        plan: {
          mode: 'parallelCompare',
          primary: 'pixi',
          candidate: 'sharedRenderer',
          snapshot,
          media,
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
          snapshot,
          media,
        },
      }),
      prepareNativeRenderSources: async () => ({
        ok: true,
        activeJobs: [decodeJob('native-render-release-failure-video')],
        sources: [{
          mediaId: 'video-1',
          slotCount: 2,
          frame: decodedFrame,
          releaseAfterNativeRenderComplete: async () => {
            calls.push(['releaseAfterNativeRenderComplete', 'video-1']);
          },
          releaseAfterNativeRenderAbort: async () => {
            calls.push(['releaseAfterNativeRenderAbort', 'video-1']);
            throw new Error('export source abort release failed');
          },
        }, {
          mediaId: 'video-2',
          slotCount: 2,
          frame: {
            descriptor: {
              ...decodedFrame.descriptor,
              memoryId: '/uxfd-decoded-video-native-render-release-failure-2',
            },
            ptsFrame: 8,
          },
          releaseAfterNativeRenderComplete: async () => {
            calls.push(['releaseAfterNativeRenderComplete', 'video-2']);
          },
          releaseAfterNativeRenderAbort: async () => {
            calls.push(['releaseAfterNativeRenderAbort', 'video-2']);
          },
        }],
      }),
      renderNativeSharedFrame: (async () => {
        calls.push(['renderNativeSharedFrame']);
        return {
          success: false,
          error: 'native render failed',
        };
      }) satisfies SharedRendererExportNativeSharedFrameRenderer,
      startViewportPresenter: async () => {
        throw new Error('WebGPU presenter must not start when native render source release fails.');
      },
    } as unknown as Parameters<typeof createSharedRendererExportFrameSource>[0] & {
      bitmapCaptureEnabled: false;
      renderNativeSharedFrame: unknown;
    });

    const blocked = await source.renderEncodeFrame?.({
      frameIndex: 8,
      timestampUs: 133_333,
      time: 8 / 60,
      width: 4,
      height: 4,
      objects: [video()],
      encodeSessionId: 'native-render-release-failure-session',
    }).catch((error) => error);

    expect(isSharedRendererExportFrameSourceBlockedError(blocked)).toBe(true);
    expect(blocked).toMatchObject({
      fallbackToLegacyCanvas: true,
      reason: 'nativeRenderSourceReleaseFailed',
      frameIndex: 8,
      message: 'export source abort release failed',
    });
    expect(calls).toEqual([
      ['renderNativeSharedFrame'],
      ['releaseAfterNativeRenderAbort', 'video-1'],
      ['releaseAfterNativeRenderAbort', 'video-2'],
    ]);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'blocked',
      uxfdRustExportFrameSourceFrameIndex: '8',
      uxfdRustExportFrameSourceFrameReason: 'nativeRenderSourceReleaseFailed',
      uxfdRustExportFrameSourceFramePath: undefined,
    });
  });

  it('blocks native render before consuming decoded sources without release callbacks', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const decodedFrame = {
      descriptor: {
        memoryId: '/uxfd-decoded-video-missing-release',
        slotIndex: 1,
        generation: 9,
        byteOffset: 256,
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
      ptsFrame: 9,
    } as const;
    const snapshot = {
      frame_index: 9,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'video-clip-1',
        track_id: 'layer-1',
        media_id: 'video-1',
        source_frame: 9,
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
    } as const;
    const media = [{
      id: 'video-1',
      kind: 'Video',
      source: '/tmp/video-1.mp4',
      width: 4,
      height: 4,
      source_rate: {
        numerator: 60,
        denominator: 1,
      },
    }] as const;
    const calls: unknown[] = [];
    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: {
        ...settings,
        width: 4,
        height: 4,
      },
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      buildExportSession: () => ({
        plan: {
          mode: 'parallelCompare',
          primary: 'pixi',
          candidate: 'sharedRenderer',
          snapshot,
          media,
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
          snapshot,
          media,
        },
      }),
      prepareNativeRenderSources: async () => ({
        ok: true,
        activeJobs: [decodeJob('native-render-missing-release-video')],
        sources: [{
          mediaId: 'video-1',
          slotCount: 2,
          frame: decodedFrame,
        }],
      }),
      renderNativeSharedFrame: async () => {
        calls.push(['renderNativeSharedFrame']);
        throw new Error('Rust native render must not consume a decoded source without release ownership.');
      },
      startViewportPresenter: async () => {
        calls.push(['startViewportPresenter']);
        throw new Error('WebGPU presenter must not start when native source release ownership is missing.');
      },
    } as unknown as Parameters<typeof createSharedRendererExportFrameSource>[0] & {
      bitmapCaptureEnabled: false;
    });

    await expect(source.renderEncodeFrame?.({
      frameIndex: 9,
      timestampUs: 150_000,
      time: 9 / 60,
      width: 4,
      height: 4,
      objects: [video()],
      encodeSessionId: 'native-render-missing-release-session',
    })).rejects.toMatchObject({
      fallbackToLegacyCanvas: true,
      reason: 'nativeRenderSourceReleaseUnavailable',
      frameIndex: 9,
    });

    expect(calls).toEqual([]);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'blocked',
      uxfdRustExportFrameSourceFrameIndex: '9',
      uxfdRustExportFrameSourceFrameReason: 'nativeRenderSourceReleaseUnavailable',
      uxfdRustExportFrameSourceFramePath: undefined,
      uxfdRustExportFrameSourceNativeRenderSourceReleaseRequired: 'true',
    });
  });

  it('records native render diagnostics when video and PSD sources share the export render pass', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const decodedFrame = {
      descriptor: {
        memoryId: '/uxfd-decoded-video-psd',
        slotIndex: 0,
        generation: 9,
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
      ptsFrame: 8,
    } as const;
    const renderedFrame = {
      descriptor: {
        memoryId: '/uxfd-native-render-video-psd-session-frame-8',
        slotIndex: 0,
        generation: 1,
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
      ptsFrame: 8,
    } as const;
    const snapshot = {
      frame_index: 8,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'video-clip-1',
        track_id: 'layer-1',
        media_id: 'video-1',
        source_frame: 8,
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
      }, {
        clip_id: 'psd-clip-1',
        track_id: 'layer-2',
        media_id: 'psd-1',
        source_frame: 0,
        z_index: 1,
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
    } as const;
    const media = [{
      id: 'video-1',
      kind: 'Video',
      source: '/tmp/video-1.mp4',
      width: 4,
      height: 4,
      source_rate: {
        numerator: 60,
        denominator: 1,
      },
    }, {
      id: 'psd-1',
      kind: 'Psd',
      source: '/tmp/overlay.psd',
      width: 4,
      height: 4,
      active_layer_ids: ['psd-layer-1'],
    }] as const;
    const calls: unknown[] = [];
    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: {
        ...settings,
        width: 4,
        height: 4,
      },
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      buildExportSession: () => ({
        plan: {
          mode: 'parallelCompare',
          primary: 'pixi',
          candidate: 'sharedRenderer',
          snapshot,
          media,
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
          snapshot,
          media,
        },
      }),
      prepareNativeRenderSources: async () => ({
        ok: true,
        activeJobs: [decodeJob('video-psd')],
        sources: [{
          mediaId: 'video-1',
          slotCount: 2,
          frame: decodedFrame,
          releaseAfterNativeRenderComplete: async () => undefined,
          releaseAfterNativeRenderAbort: async () => undefined,
        }],
      }),
      renderNativeSharedFrame: (async (payload) => {
        calls.push(['renderNativeSharedFrame', payload]);
        return {
          success: true,
          result: {
            rendered: true,
            renderId: 'video-psd-session-frame-8',
            memoryId: '/uxfd-native-render-video-psd-session-frame-8',
            slotCount: 1,
            slotByteLen: 1024,
            frame: renderedFrame,
          },
        };
      }) satisfies SharedRendererExportNativeSharedFrameRenderer,
      startViewportPresenter: async () => {
        throw new Error('WebGPU presenter must not start for mixed video+PSD native render.');
      },
    } as unknown as Parameters<typeof createSharedRendererExportFrameSource>[0] & {
      bitmapCaptureEnabled: false;
      prepareNativeRenderSources: unknown;
      renderNativeSharedFrame: unknown;
    });

    await expect(source.renderEncodeFrame?.({
      frameIndex: 8,
      timestampUs: 133_333,
      time: 8 / 60,
      width: 4,
      height: 4,
      objects: [image({ id: 'video-placeholder' }), image({ id: 'psd-placeholder' })],
      encodeSessionId: 'video-psd-session',
    })).resolves.toEqual({
      timestamp: 133_333,
      sharedFramePayload: {
        sessionId: 'video-psd-session',
        frameIndex: 8,
        timestampUs: 133_333,
        slotCount: 1,
        frame: renderedFrame,
      },
      releaseAfterEncodeFailure: {
        kind: 'nativeRenderOutput',
        memoryId: '/uxfd-native-render-video-psd-session-frame-8',
      },
    });

    expect(calls).toEqual([
      ['renderNativeSharedFrame', {
        renderId: 'video-psd-session-frame-8',
        memoryId: '/uxfd-native-render-video-psd-session-frame-8',
        slotCount: 1,
        ptsFrame: 8,
        width: 4,
        height: 4,
        snapshot,
        media,
        sources: [{
          mediaId: 'video-1',
          slotCount: 2,
          frame: decodedFrame,
        }],
      }],
    ]);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'ready',
      uxfdRustExportFrameSourceFramePath: 'nativeRenderSharedFrame',
      uxfdRustExportFrameSourceNativeRenderMediaCount: '2',
      uxfdRustExportFrameSourceNativeRenderMediaKinds: 'Video,Psd',
      uxfdRustExportFrameSourceNativeRenderSourceCount: '1',
      uxfdRustExportFrameSourceNativeRenderSourceMediaIds: 'video-1',
    });
  });

  it('blocks mixed video export before native render when an overlay media source is unsupported', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const decodedFrame = {
      descriptor: {
        memoryId: '/uxfd-decoded-video-remote-psd',
        slotIndex: 0,
        generation: 1,
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
      ptsFrame: 10,
    } as const;
    const snapshot = {
      frame_index: 10,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'video-clip-1',
        track_id: 'layer-1',
        media_id: 'video-1',
        source_frame: 10,
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
      }, {
        clip_id: 'remote-psd-clip-1',
        track_id: 'layer-2',
        media_id: 'remote-psd-1',
        source_frame: 0,
        z_index: 1,
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
    } as const;
    const media = [{
      id: 'video-1',
      kind: 'Video',
      source: '/tmp/video-1.mp4',
      width: 4,
      height: 4,
      source_rate: {
        numerator: 60,
        denominator: 1,
      },
    }, {
      id: 'remote-psd-1',
      kind: 'Psd',
      source: 'https://example.invalid/overlay.psd',
      width: 4,
      height: 4,
      active_layer_ids: ['psd-layer-1'],
    }] as const;
    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: {
        ...settings,
        width: 4,
        height: 4,
      },
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      buildExportSession: () => ({
        plan: {
          mode: 'parallelCompare',
          primary: 'pixi',
          candidate: 'sharedRenderer',
          snapshot,
          media,
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
          snapshot,
          media,
        },
      }),
      prepareNativeRenderSources: async () => ({
        ok: true,
        activeJobs: [decodeJob('video-remote-psd')],
        sources: [{
          mediaId: 'video-1',
          slotCount: 2,
          frame: decodedFrame,
          releaseAfterNativeRenderComplete: async () => undefined,
          releaseAfterNativeRenderAbort: async () => undefined,
        }],
      }),
      renderNativeSharedFrame: async () => {
        throw new Error('Rust native render must not receive unsupported remote PSD media.');
      },
      startViewportPresenter: async () => {
        throw new Error('WebGPU presenter must not start for blocked mixed native render.');
      },
    } as unknown as Parameters<typeof createSharedRendererExportFrameSource>[0] & {
      bitmapCaptureEnabled: false;
      prepareNativeRenderSources: unknown;
      renderNativeSharedFrame: unknown;
    });

    await expect(source.renderEncodeFrame?.({
      frameIndex: 10,
      timestampUs: 166_667,
      time: 10 / 60,
      width: 4,
      height: 4,
      objects: [image({ id: 'video-placeholder' }), image({ id: 'remote-psd-placeholder' })],
      encodeSessionId: 'remote-psd-session',
    })).rejects.toMatchObject({
      fallbackToLegacyCanvas: true,
      reason: 'nativeRenderUnsupportedMedia',
      frameIndex: 10,
    });
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'blocked',
      uxfdRustExportFrameSourceFrameIndex: '10',
      uxfdRustExportFrameSourceFrameReason: 'nativeRenderUnsupportedMedia',
      uxfdRustExportFrameSourceFramePath: undefined,
    });
  });

  it('uses Rust backend native render for media-only PNG and SolidColour encode frames', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const renderedFrame = {
      descriptor: {
        memoryId: '/uxfd-native-render-media-only-session-frame-3',
        slotIndex: 0,
        generation: 1,
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
      ptsFrame: 3,
    } as const;
    const snapshot = {
      frame_index: 3,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'image-clip-1',
        track_id: 'layer-1',
        media_id: 'image-1',
        source_frame: 0,
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
      }, {
        clip_id: 'solid-clip-1',
        track_id: 'layer-2',
        media_id: 'solid-1',
        source_frame: 0,
        z_index: 1,
        transform: {
          translation_x: 1,
          translation_y: 1,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'nearest',
        },
        opacity: 1,
        effects: [],
      }],
    } as const;
    const media = [{
      id: 'image-1',
      kind: 'Image',
      source: '/tmp/image-1.png',
      width: 2,
      height: 2,
    }, {
      id: 'solid-1',
      kind: 'SolidColour',
      source: '#00ff00',
      width: 2,
      height: 2,
    }] as const;
    const calls: unknown[] = [];
    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: {
        ...settings,
        width: 4,
        height: 4,
      },
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      buildExportSession: () => ({
        plan: {
          mode: 'parallelCompare',
          primary: 'pixi',
          candidate: 'sharedRenderer',
          snapshot,
          media,
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
          snapshot,
          media,
        },
      }),
      prepareNativeRenderSources: (async (input) => {
        calls.push(['prepareNativeRenderSources', {
          requestId: input.requestId,
          activeJobs: input.activeJobs,
        }]);
        return {
          ok: false,
          reason: 'noVideoDecodeRequest',
          detail: 'No video source is needed for media-only native render.',
          activeJobs: [],
        };
      }) satisfies SharedRendererExportNativeRenderSourcesPreparer,
      renderNativeSharedFrame: (async (payload) => {
        calls.push(['renderNativeSharedFrame', payload]);
        return {
          success: true,
          result: {
            rendered: true,
            renderId: 'media-only-session-frame-3',
            memoryId: '/uxfd-native-render-media-only-session-frame-3',
            slotCount: 1,
            slotByteLen: 1024,
            frame: renderedFrame,
          },
        };
      }) satisfies SharedRendererExportNativeSharedFrameRenderer,
      startViewportPresenter: async () => {
        calls.push(['startViewportPresenter']);
        throw new Error('WebGPU presenter must not start for media-only native render.');
      },
    } as unknown as Parameters<typeof createSharedRendererExportFrameSource>[0] & {
      bitmapCaptureEnabled: false;
      prepareNativeRenderSources: unknown;
      renderNativeSharedFrame: unknown;
    });

    await expect(source.renderEncodeFrame?.({
      frameIndex: 3,
      timestampUs: 50_000,
      time: 3 / 60,
      width: 4,
      height: 4,
      objects: [image()],
      encodeSessionId: 'media-only-session',
    })).resolves.toEqual({
      timestamp: 50_000,
      sharedFramePayload: {
        sessionId: 'media-only-session',
        frameIndex: 3,
        timestampUs: 50_000,
        slotCount: 1,
        frame: renderedFrame,
      },
      releaseAfterEncodeFailure: {
        kind: 'nativeRenderOutput',
        memoryId: '/uxfd-native-render-media-only-session-frame-3',
      },
    });

    expect(calls).toEqual([
      ['prepareNativeRenderSources', {
        requestId: 1,
        activeJobs: [],
      }],
      ['renderNativeSharedFrame', {
        renderId: 'media-only-session-frame-3',
        memoryId: '/uxfd-native-render-media-only-session-frame-3',
        slotCount: 1,
        ptsFrame: 3,
        width: 4,
        height: 4,
        snapshot,
        media,
        sources: [],
      }],
    ]);
  });

  it('blocks encode-only media-only frames instead of falling back to JS readback when native media is unsupported', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const snapshot = {
      frame_index: 11,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'remote-image-clip-1',
        track_id: 'layer-1',
        media_id: 'remote-image-1',
        source_frame: 0,
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
    } as const;
    const media = [{
      id: 'remote-image-1',
      kind: 'Image',
      source: 'https://example.invalid/overlay.png',
      width: 2,
      height: 2,
    }] as const;
    const calls: unknown[] = [];
    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: {
        ...settings,
        width: 4,
        height: 4,
      },
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      nativeRenderRequired: true,
      buildExportSession: () => ({
        plan: {
          mode: 'parallelCompare',
          primary: 'pixi',
          candidate: 'sharedRenderer',
          snapshot,
          media,
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
          snapshot,
          media,
        },
      }),
      prepareNativeRenderSources: async () => ({
        ok: false,
        reason: 'noVideoDecodeRequest',
        detail: 'No video source is needed for remote image native render.',
        activeJobs: [],
      }),
      renderNativeSharedFrame: async () => {
        calls.push(['renderNativeSharedFrame']);
        throw new Error('Rust native render must not receive unsupported remote media.');
      },
      startViewportPresenter: async () => {
        calls.push(['startViewportPresenter']);
        throw new Error('presenter readback must not run when native render is required.');
      },
    } as unknown as Parameters<typeof createSharedRendererExportFrameSource>[0] & {
      bitmapCaptureEnabled: false;
      nativeRenderRequired: true;
    });

    await expect(source.renderEncodeFrame?.({
      frameIndex: 11,
      timestampUs: 183_333,
      time: 11 / 60,
      width: 4,
      height: 4,
      objects: [image({ id: 'remote-image-placeholder' })],
      encodeSessionId: 'remote-media-only-session',
    })).rejects.toMatchObject({
      fallbackToLegacyCanvas: true,
      reason: 'nativeRenderUnsupportedMedia',
      frameIndex: 11,
    });
    expect(calls).toEqual([]);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'blocked',
      uxfdRustExportFrameSourceFrameIndex: '11',
      uxfdRustExportFrameSourceFrameReason: 'nativeRenderUnsupportedMedia',
      uxfdRustExportFrameSourceFramePath: undefined,
    });
  });

  it('uses Rust backend native render diagnostics for PSD-only encode frames', async () => {
    const canvas = {
      width: 1,
      height: 1,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const renderedFrame = {
      descriptor: {
        memoryId: '/uxfd-native-render-psd-only-session-frame-4',
        slotIndex: 0,
        generation: 1,
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
      ptsFrame: 4,
    } as const;
    const snapshot = {
      frame_index: 4,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'psd-clip-1',
        track_id: 'layer-1',
        media_id: 'psd-1',
        source_frame: 0,
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
    } as const;
    const media = [{
      id: 'psd-1',
      kind: 'Psd',
      source: '/tmp/standing.psd',
      width: 4,
      height: 4,
      active_layer_ids: ['psd-layer-3'],
    }] as const;
    const calls: unknown[] = [];
    const source = createSharedRendererExportFrameSource({
      canvas,
      projectSettings: {
        ...settings,
        width: 4,
        height: 4,
      },
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      buildExportSession: () => ({
        plan: {
          mode: 'parallelCompare',
          primary: 'pixi',
          candidate: 'sharedRenderer',
          snapshot,
          media,
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
          snapshot,
          media,
        },
      }),
      prepareNativeRenderSources: async () => ({
        ok: false,
        reason: 'noVideoDecodeRequest',
        detail: 'No video source is needed for PSD-only native render.',
        activeJobs: [],
      }),
      renderNativeSharedFrame: (async (payload) => {
        calls.push(['renderNativeSharedFrame', payload]);
        return {
          success: true,
          result: {
            rendered: true,
            renderId: 'psd-only-session-frame-4',
            memoryId: '/uxfd-native-render-psd-only-session-frame-4',
            slotCount: 1,
            slotByteLen: 1024,
            frame: renderedFrame,
          },
        };
      }) satisfies SharedRendererExportNativeSharedFrameRenderer,
      startViewportPresenter: async () => {
        calls.push(['startViewportPresenter']);
        throw new Error('WebGPU presenter must not start for PSD-only native render.');
      },
    } as unknown as Parameters<typeof createSharedRendererExportFrameSource>[0] & {
      bitmapCaptureEnabled: false;
      renderNativeSharedFrame: unknown;
    });

    await expect(source.renderEncodeFrame?.({
      frameIndex: 4,
      timestampUs: 66_667,
      time: 4 / 60,
      width: 4,
      height: 4,
      objects: [image({ id: 'psd-placeholder' })],
      encodeSessionId: 'psd-only-session',
    })).resolves.toEqual({
      timestamp: 66_667,
      sharedFramePayload: {
        sessionId: 'psd-only-session',
        frameIndex: 4,
        timestampUs: 66_667,
        slotCount: 1,
        frame: renderedFrame,
      },
      releaseAfterEncodeFailure: {
        kind: 'nativeRenderOutput',
        memoryId: '/uxfd-native-render-psd-only-session-frame-4',
      },
    });

    expect(calls).toEqual([
      ['renderNativeSharedFrame', {
        renderId: 'psd-only-session-frame-4',
        memoryId: '/uxfd-native-render-psd-only-session-frame-4',
        slotCount: 1,
        ptsFrame: 4,
        width: 4,
        height: 4,
        snapshot,
        media,
        sources: [],
      }],
    ]);
    expect(canvas.dataset).toMatchObject({
      uxfdRustExportFrameSourceFrameStatus: 'ready',
      uxfdRustExportFrameSourceFrameIndex: '4',
      uxfdRustExportFrameSourceFramePath: 'nativeRenderSharedFrame',
      uxfdRustExportFrameSourceFrameReason: undefined,
    });
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
