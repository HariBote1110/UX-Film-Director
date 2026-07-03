import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ImageObject, ProjectSettings, ShapeObject, TimelineObject, VideoObject } from '../types';
import { createDefaultLayers } from './sceneState';
import type {
  SharedRendererExportSession,
  SharedRendererExportSessionInput,
  SharedRendererNativeRenderEnvelope,
} from './sharedRendererExportSession';
import {
  buildViewportRustExportFrameSource,
  resolveViewportRustExportFrameSource,
  writeViewportRustExportFrameSourceDiagnostics,
} from './viewportRustExportFrameSource';
import type { ProjectExportRustFrameSource } from './projectExportFrameCanvas';

const settings: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 60,
  sampleRate: 48000,
};

const frameSource: ProjectExportRustFrameSource = {
  renderFrame: async () => ({ close: () => undefined }) as ImageBitmap,
};

const sourceCode = () =>
  readFileSync(new URL('./viewportRustExportFrameSource.ts', import.meta.url), 'utf8');

const exportObjects: TimelineObject[] = [];

const rectangle = (patch: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 'shape-1',
  type: 'shape',
  name: 'Rectangle',
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
  shapeType: 'rect',
  width: 640,
  height: 360,
  fill: '#3355ff',
  ...patch,
});

const video = (patch: Partial<VideoObject> = {}): VideoObject => ({
  id: 'video-1',
  type: 'video',
  name: 'video.mp4',
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
  src: 'file:///tmp/video.mp4',
  filePath: '/tmp/video.mp4',
  width: 1280,
  height: 720,
  volume: 1,
  muted: false,
  ...patch,
});

const image = (patch: Partial<ImageObject> = {}): ImageObject => ({
  id: 'image-1',
  type: 'image',
  name: 'overlay.png',
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
  src: 'file:///tmp/overlay.png',
  filePath: '/tmp/overlay.png',
  width: 1280,
  height: 720,
  ...patch,
});

const exportSessionWithSurfaceGate = (
  surfaceGate: SharedRendererExportSession['surfaceGate'],
  nativeRenderEnvelope: SharedRendererNativeRenderEnvelope = surfaceGate.ok
    ? {
      ok: true,
      mediaCount: 0,
      mediaKinds: [],
      sourceCount: 0,
      sourceMediaIds: [],
    }
    : {
      ok: false,
      reason: 'surfaceGateUnavailable',
      detail: surfaceGate.detail,
    }
): SharedRendererExportSession => ({
  plan: {} as SharedRendererExportSession['plan'],
  surfaceGate,
  presentationContract: {} as SharedRendererExportSession['presentationContract'],
  nativeRenderEnvelope,
});

describe('buildViewportRustExportFrameSource', () => {
  it('uses an explicit video-object sentinel instead of inferring from optional objects', () => {
    const code = sourceCode();

    expect(code).toContain('hasVideoObjects: boolean');
    expect(code).not.toContain('hasVideoObjects(objects)');
    expect(code).not.toContain('objects?.some');
  });

  it('creates a shared renderer export frame source only when the experimental Rust export gate is fully open', () => {
    const canvas = {
      width: 1920,
      height: 1080,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const calls: unknown[] = [];

    const source = buildViewportRustExportFrameSource({
      exportEnabled: true,
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      hasVideoObjects: false,
      createFrameSource: (input) => {
        calls.push(input);
        return frameSource;
      },
    });

    expect(source).toBe(frameSource);
    expect(calls).toEqual([{
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
    }]);
  });

  it('requests an encode-only frame source when Rust backend encoding owns export frames', () => {
    const canvas = {
      width: 1920,
      height: 1080,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const calls: unknown[] = [];

    const source = buildViewportRustExportFrameSource({
      exportEnabled: true,
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      hasVideoObjects: false,
      preferEncodeOnly: true,
      createFrameSource: (input) => {
        calls.push(input);
        return frameSource;
      },
    } as Parameters<typeof buildViewportRustExportFrameSource>[0] & {
      preferEncodeOnly: true;
    });

    expect(source).toBe(frameSource);
    expect(calls).toEqual([{
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      nativeRenderRequired: true,
    }]);
  });

  it('requests an encode-only frame source for video exports even when the caller omits the encode-only hint', () => {
    const canvas = {
      width: 1920,
      height: 1080,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const calls: unknown[] = [];
    const video = {
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
    } satisfies TimelineObject;

    const source = buildViewportRustExportFrameSource({
      exportEnabled: true,
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      hasVideoObjects: true,
      objects: [video],
      time: 0,
      buildExportSession: () => exportSessionWithSurfaceGate({
        ok: true,
        canvas: {
          width: 1920,
          height: 1080,
        },
        snapshot: {
          frame_index: 0,
          colour: {
            profile: 'rec709-sdr',
            working_space: 'linear-light',
            alpha: 'premultiplied',
          },
          clips: [],
        },
        media: [],
      }),
      createFrameSource: (input) => {
        calls.push(input);
        return frameSource;
      },
    });

    expect(source).toBe(frameSource);
    expect(calls).toEqual([{
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      nativeRenderRequired: true,
    }]);
  });

  it('enables the effective video cutover for video exports even when the preview cutover flag is off', () => {
    const canvas = {
      width: 1920,
      height: 1080,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const calls: unknown[] = [];
    const video = {
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
    } satisfies TimelineObject;

    const source = buildViewportRustExportFrameSource({
      exportEnabled: true,
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: false,
      hasVideoObjects: true,
      objects: [video],
      time: 0,
      buildExportSession: () => exportSessionWithSurfaceGate({
        ok: true,
        canvas: {
          width: 1920,
          height: 1080,
        },
        snapshot: {
          frame_index: 0,
          colour: {
            profile: 'rec709-sdr',
            working_space: 'linear-light',
            alpha: 'premultiplied',
          },
          clips: [],
        },
        media: [],
      }),
      createFrameSource: (input) => {
        calls.push(input);
        return frameSource;
      },
    });

    expect(source).toBe(frameSource);
    expect(calls).toEqual([{
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      nativeRenderRequired: true,
    }]);
  });

  it('passes native/Rust frame handoff into the shared renderer export source', () => {
    const canvas = {
      width: 1920,
      height: 1080,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const calls: unknown[] = [];
    const presentedFrameSharedFrameTaker = async () => null;

    const source = buildViewportRustExportFrameSource({
      exportEnabled: true,
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      hasVideoObjects: false,
      presentedFrameSharedFrameTaker,
      createFrameSource: (input) => {
        calls.push(input);
        return frameSource;
      },
    } as Parameters<typeof buildViewportRustExportFrameSource>[0] & {
      presentedFrameSharedFrameTaker: unknown;
    });

    expect(source).toBe(frameSource);
    expect(calls).toEqual([{
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      presentedFrameSharedFrameTaker,
    }]);
  });

  it('keeps legacy canvas export when any Rust export gate is closed', () => {
    const canvas = {
      width: 1920,
      height: 1080,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const baseInput = {
      exportEnabled: true,
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d' as const,
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      hasVideoObjects: false,
      createFrameSource: () => frameSource,
    };

    expect(buildViewportRustExportFrameSource({
      ...baseInput,
      exportEnabled: false,
    })).toBeNull();
    expect(buildViewportRustExportFrameSource({
      ...baseInput,
      canvas: null,
    })).toBeNull();
    expect(buildViewportRustExportFrameSource({
      ...baseInput,
      editorMode: '3d_stage',
    })).toBeNull();
    expect(buildViewportRustExportFrameSource({
      ...baseInput,
      webGpuAvailable: false,
    })).toBeNull();
    expect(buildViewportRustExportFrameSource({
      ...baseInput,
      fallbackAdapter: true,
    })).toBeNull();
    expect(buildViewportRustExportFrameSource({
      ...baseInput,
      videoCutoverEnabled: false,
    })).toBeNull();
  });

  it('keeps legacy canvas export when the preflight export session is not renderable', () => {
    const canvas = {
      width: 1920,
      height: 1080,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const dataset: Record<string, string | undefined> = {};
    const sourceCalls: unknown[] = [];
    const unavailableCalls: unknown[] = [];

    const source = buildViewportRustExportFrameSource({
      exportEnabled: true,
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      hasVideoObjects: false,
      objects: exportObjects,
      time: 0,
      buildExportSession: () => exportSessionWithSurfaceGate({
        ok: false,
        reason: 'planNotComparable',
        detail: 'Shared renderer surface requires a sharedRenderer plan.',
      }),
      createFrameSource: (input) => {
        sourceCalls.push(input);
        return frameSource;
      },
      onFrameSourceUnavailable: (decision) => {
        unavailableCalls.push(decision);
      },
      diagnosticsDataset: dataset,
    });

    expect(source).toBeNull();
    expect(sourceCalls).toEqual([]);
    expect(unavailableCalls).toEqual([{
      ok: false,
      reason: 'exportSessionBlocked',
      detail: 'Shared renderer surface requires a sharedRenderer plan.',
      nativeRenderEnvelope: {
        ok: false,
        reason: 'surfaceGateUnavailable',
        detail: 'Shared renderer surface requires a sharedRenderer plan.',
      },
    }]);
    expect(dataset).toEqual({
      uxfdRustExportFrameSourceStatus: 'fallback',
      uxfdRustExportFrameSourceReason: 'exportSessionBlocked',
      uxfdRustExportFrameSourceNativeRenderEnvelopeStatus: 'blocked',
      uxfdRustExportFrameSourceNativeRenderEnvelopeReason: 'surfaceGateUnavailable',
      uxfdRustExportFrameSourceNativeRenderEnvelopeDetail: 'Shared renderer surface requires a sharedRenderer plan.',
    });
  });

  it('marks video Rust export preflight failures as blocked diagnostics instead of legacy fallback', () => {
    const canvas = {
      width: 1920,
      height: 1080,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const dataset: Record<string, string | undefined> = {};
    const unavailableCalls: unknown[] = [];

    const source = buildViewportRustExportFrameSource({
      exportEnabled: true,
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      hasVideoObjects: true,
      objects: [video()],
      time: 0,
      buildExportSession: () => exportSessionWithSurfaceGate({
        ok: false,
        reason: 'planNotComparable',
        detail: 'Shared renderer surface requires a sharedRenderer plan.',
      }),
      createFrameSource: () => {
        throw new Error('frame source must not be created after blocked video preflight.');
      },
      onFrameSourceUnavailable: (decision) => {
        unavailableCalls.push(decision);
      },
      diagnosticsDataset: dataset,
    });

    expect(source).toBeNull();
    expect(unavailableCalls).toEqual([{
      ok: false,
      reason: 'exportSessionBlocked',
      detail: 'Shared renderer surface requires a sharedRenderer plan.',
      diagnosticStatus: 'blocked',
      nativeRenderEnvelope: {
        ok: false,
        reason: 'surfaceGateUnavailable',
        detail: 'Shared renderer surface requires a sharedRenderer plan.',
      },
    }]);
    expect(dataset).toMatchObject({
      uxfdRustExportFrameSourceStatus: 'blocked',
      uxfdRustExportFrameSourceReason: 'exportSessionBlocked',
      uxfdRustExportFrameSourceNativeRenderEnvelopeStatus: 'blocked',
      uxfdRustExportFrameSourceNativeRenderEnvelopeReason: 'surfaceGateUnavailable',
    });
  });

  it('marks native-render media export preflight failures as blocked diagnostics instead of legacy fallback', () => {
    const canvas = {
      width: 1920,
      height: 1080,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const dataset: Record<string, string | undefined> = {};
    const unavailableCalls: unknown[] = [];

    const source = buildViewportRustExportFrameSource({
      exportEnabled: true,
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      hasVideoObjects: false,
      hasNativeRenderMediaObjects: true,
      objects: [image()],
      time: 0,
      buildExportSession: () => exportSessionWithSurfaceGate({
        ok: false,
        reason: 'planNotComparable',
        detail: 'Shared renderer surface requires a sharedRenderer plan.',
      }),
      createFrameSource: () => {
        throw new Error('frame source must not be created after blocked native-render media preflight.');
      },
      onFrameSourceUnavailable: (decision) => {
        unavailableCalls.push(decision);
      },
      diagnosticsDataset: dataset,
    });

    expect(source).toBeNull();
    expect(unavailableCalls).toEqual([{
      ok: false,
      reason: 'exportSessionBlocked',
      detail: 'Shared renderer surface requires a sharedRenderer plan.',
      diagnosticStatus: 'blocked',
      nativeRenderEnvelope: {
        ok: false,
        reason: 'surfaceGateUnavailable',
        detail: 'Shared renderer surface requires a sharedRenderer plan.',
      },
    }]);
    expect(dataset).toMatchObject({
      uxfdRustExportFrameSourceStatus: 'blocked',
      uxfdRustExportFrameSourceReason: 'exportSessionBlocked',
      uxfdRustExportFrameSourceNativeRenderEnvelopeStatus: 'blocked',
      uxfdRustExportFrameSourceNativeRenderEnvelopeReason: 'surfaceGateUnavailable',
    });
  });

  it('writes native render envelope diagnostics when a Rust export source is selected', () => {
    const canvas = {
      width: 1920,
      height: 1080,
      dataset: {},
    } as unknown as HTMLCanvasElement;
    const dataset: Record<string, string | undefined> = {};

    const source = buildViewportRustExportFrameSource({
      exportEnabled: true,
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      hasVideoObjects: false,
      objects: exportObjects,
      time: 0,
      buildExportSession: () => exportSessionWithSurfaceGate({
        ok: true,
        canvas: {
          width: 1920,
          height: 1080,
        },
        snapshot: {} as never,
        media: [],
      }, {
        ok: true,
        mediaCount: 2,
        mediaKinds: ['Video', 'Psd'],
        sourceCount: 1,
        sourceMediaIds: ['video-1'],
      }),
      createFrameSource: () => frameSource,
      diagnosticsDataset: dataset,
    });

    expect(source).toBe(frameSource);
    expect(dataset).toEqual({
      uxfdRustExportFrameSourceStatus: 'ready',
      uxfdRustExportFrameSourceReason: undefined,
      uxfdRustExportFrameSourceNativeRenderEnvelopeStatus: 'ready',
      uxfdRustExportFrameSourceNativeRenderMediaCount: '2',
      uxfdRustExportFrameSourceNativeRenderMediaKinds: 'Video,Psd',
      uxfdRustExportFrameSourceNativeRenderSourceCount: '1',
      uxfdRustExportFrameSourceNativeRenderSourceMediaIds: 'video-1',
    });
  });
});

describe('resolveViewportRustExportFrameSource', () => {
  const canvas = {
    width: 1920,
    height: 1080,
    dataset: {},
  } as unknown as HTMLCanvasElement;
  const baseInput = {
    exportEnabled: true,
    canvas,
    projectSettings: settings,
    layers: createDefaultLayers(),
    editorMode: '2d' as const,
    webGpuAvailable: true,
    fallbackAdapter: false,
    videoCutoverEnabled: true,
    hasVideoObjects: false,
    createFrameSource: () => frameSource,
  };

  it('returns a ready decision with a source when every Rust export gate is open', () => {
    expect(resolveViewportRustExportFrameSource(baseInput)).toEqual({
      ok: true,
      source: frameSource,
    });
  });

  it('preflights the export session before creating a Rust export frame source', () => {
    const sessionCalls: SharedRendererExportSessionInput[] = [];
    const sourceCalls: unknown[] = [];

    const decision = resolveViewportRustExportFrameSource({
      ...baseInput,
      objects: exportObjects,
      time: 0,
      buildExportSession: (input) => {
        sessionCalls.push(input);
        return exportSessionWithSurfaceGate({
          ok: false,
          reason: 'planNotComparable',
          detail: 'Shared renderer surface requires a sharedRenderer plan.',
        });
      },
      createFrameSource: (input) => {
        sourceCalls.push(input);
        return frameSource;
      },
    });

    expect(decision).toEqual({
      ok: false,
      reason: 'exportSessionBlocked',
      detail: 'Shared renderer surface requires a sharedRenderer plan.',
      nativeRenderEnvelope: {
        ok: false,
        reason: 'surfaceGateUnavailable',
        detail: 'Shared renderer surface requires a sharedRenderer plan.',
      },
    });
    expect(sessionCalls).toEqual([{
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: exportObjects,
      time: 0,
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
    }]);
    expect(sourceCalls).toEqual([]);
  });

  it('creates the source after a successful export session preflight', () => {
    expect(resolveViewportRustExportFrameSource({
      ...baseInput,
      objects: exportObjects,
      time: 0,
      buildExportSession: () => exportSessionWithSurfaceGate({
        ok: true,
        canvas: {
          width: 1920,
          height: 1080,
        },
        snapshot: {} as never,
        media: [],
      }),
    })).toEqual({
      ok: true,
      source: frameSource,
      nativeRenderEnvelope: {
        ok: true,
        mediaCount: 0,
        mediaKinds: [],
        sourceCount: 0,
        sourceMediaIds: [],
      },
    });
  });

  it('preflights object start times before creating a Rust export frame source', () => {
    const sessionCalls: SharedRendererExportSessionInput[] = [];
    const sourceCalls: unknown[] = [];
    const timedObjects = [
      rectangle({ id: 'later-shape', startTime: 2, duration: 3 }),
      rectangle({ id: 'duplicate-start-shape', startTime: 2, duration: 1 }),
      rectangle({ id: 'final-shape', startTime: 4, duration: 1 }),
    ];

    const decision = resolveViewportRustExportFrameSource({
      ...baseInput,
      objects: timedObjects,
      time: 0,
      buildExportSession: (input) => {
        sessionCalls.push(input);
        return exportSessionWithSurfaceGate(input.time === 2
          ? {
            ok: false,
            reason: 'planNotComparable',
            detail: 'Shared renderer surface requires a sharedRenderer plan.',
          }
          : {
            ok: true,
            canvas: {
              width: 1920,
              height: 1080,
            },
            snapshot: {} as never,
            media: [],
          });
      },
      createFrameSource: (input) => {
        sourceCalls.push(input);
        return frameSource;
      },
    });

    expect(decision).toEqual({
      ok: false,
      reason: 'exportSessionBlocked',
      detail: 'Shared renderer surface requires a sharedRenderer plan.',
      nativeRenderEnvelope: {
        ok: false,
        reason: 'surfaceGateUnavailable',
        detail: 'Shared renderer surface requires a sharedRenderer plan.',
      },
    });
    expect(sessionCalls.map((input) => input.time)).toEqual([0, 2]);
    expect(sourceCalls).toEqual([]);
  });

  it('preflights object last visible frame times before creating a Rust export frame source', () => {
    const sessionCalls: SharedRendererExportSessionInput[] = [];
    const timedObjects = [
      rectangle({ id: 'later-shape', startTime: 2, duration: 3 }),
      rectangle({ id: 'short-shape', startTime: 4, duration: 1 / 120 }),
    ];

    const decision = resolveViewportRustExportFrameSource({
      ...baseInput,
      objects: timedObjects,
      time: 0,
      buildExportSession: (input) => {
        sessionCalls.push(input);
        return exportSessionWithSurfaceGate({
          ok: true,
          canvas: {
            width: 1920,
            height: 1080,
          },
          snapshot: {} as never,
          media: [],
        });
      },
    });

    expect(decision.ok).toBe(true);
    expect(sessionCalls.map((input) => input.time)).toEqual([
      0,
      2,
      4,
      5 - (1 / settings.fps),
    ]);
  });

  it('returns explicit fallback reasons for closed Rust export gates', () => {
    expect(resolveViewportRustExportFrameSource({
      ...baseInput,
      exportEnabled: false,
    })).toEqual({
      ok: false,
      reason: 'exportFlagDisabled',
      detail: 'Shared renderer Rust export is disabled.',
    });
    expect(resolveViewportRustExportFrameSource({
      ...baseInput,
      canvas: null,
    })).toEqual({
      ok: false,
      reason: 'surfaceCanvasUnavailable',
      detail: 'Shared renderer export surface canvas is not mounted.',
    });
    expect(resolveViewportRustExportFrameSource({
      ...baseInput,
      editorMode: '3d_stage',
    })).toEqual({
      ok: false,
      reason: 'unsupportedEditorMode',
      detail: 'Shared renderer Rust export currently supports only the 2D editor mode.',
    });
    expect(resolveViewportRustExportFrameSource({
      ...baseInput,
      webGpuAvailable: false,
    })).toEqual({
      ok: false,
      reason: 'webGpuUnavailable',
      detail: 'WebGPU is not available for shared renderer Rust export.',
    });
    expect(resolveViewportRustExportFrameSource({
      ...baseInput,
      fallbackAdapter: true,
    })).toEqual({
      ok: false,
      reason: 'fallbackAdapter',
      detail: 'Shared renderer Rust export requires a non-fallback WebGPU adapter.',
    });
    expect(resolveViewportRustExportFrameSource({
      ...baseInput,
      videoCutoverEnabled: false,
    })).toEqual({
      ok: false,
      reason: 'videoCutoverDisabled',
      detail: 'Shared renderer Rust export requires Rust video cutover to be enabled.',
    });
  });
});

describe('writeViewportRustExportFrameSourceDiagnostics', () => {
  it('writes ready and fallback diagnostics to a DOM dataset-like object', () => {
    const dataset: Record<string, string | undefined> = {
      uxfdRustExportFrameSourceReason: 'webGpuUnavailable',
    };

    writeViewportRustExportFrameSourceDiagnostics(dataset, {
      ok: true,
      source: frameSource,
    });
    expect(dataset).toEqual({
      uxfdRustExportFrameSourceStatus: 'ready',
      uxfdRustExportFrameSourceReason: undefined,
    });

    writeViewportRustExportFrameSourceDiagnostics(dataset, {
      ok: false,
      reason: 'videoCutoverDisabled',
      detail: 'Shared renderer Rust export requires Rust video cutover to be enabled.',
    });
    expect(dataset).toEqual({
      uxfdRustExportFrameSourceStatus: 'fallback',
      uxfdRustExportFrameSourceReason: 'videoCutoverDisabled',
    });

    writeViewportRustExportFrameSourceDiagnostics(dataset, {
      ok: false,
      reason: 'exportSessionBlocked',
      detail: 'Shared renderer surface requires a sharedRenderer plan.',
    });
    expect(dataset).toEqual({
      uxfdRustExportFrameSourceStatus: 'fallback',
      uxfdRustExportFrameSourceReason: 'exportSessionBlocked',
    });
  });
});
