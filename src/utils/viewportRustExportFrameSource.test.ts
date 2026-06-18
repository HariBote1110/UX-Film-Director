import { describe, expect, it } from 'vitest';
import type { ProjectSettings, ShapeObject, TimelineObject } from '../types';
import { createDefaultLayers } from './sceneState';
import type {
  SharedRendererExportSession,
  SharedRendererExportSessionInput,
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

const exportSessionWithSurfaceGate = (
  surfaceGate: SharedRendererExportSession['surfaceGate']
): SharedRendererExportSession => ({
  plan: {} as SharedRendererExportSession['plan'],
  surfaceGate,
  presentationContract: {} as SharedRendererExportSession['presentationContract'],
});

describe('buildViewportRustExportFrameSource', () => {
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

    const source = buildViewportRustExportFrameSource({
      exportEnabled: true,
      canvas,
      projectSettings: settings,
      layers: createDefaultLayers(),
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
      videoCutoverEnabled: true,
      objects: exportObjects,
      time: 0,
      buildExportSession: () => exportSessionWithSurfaceGate({
        ok: false,
        reason: 'planNotComparable',
        detail: 'Shared renderer surface requires a parallelCompare plan.',
      }),
      createFrameSource: (input) => {
        sourceCalls.push(input);
        return frameSource;
      },
      diagnosticsDataset: dataset,
    });

    expect(source).toBeNull();
    expect(sourceCalls).toEqual([]);
    expect(dataset).toEqual({
      uxfdRustExportFrameSourceStatus: 'fallback',
      uxfdRustExportFrameSourceReason: 'exportSessionBlocked',
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
          detail: 'Shared renderer surface requires a parallelCompare plan.',
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
      detail: 'Shared renderer surface requires a parallelCompare plan.',
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
            detail: 'Shared renderer surface requires a parallelCompare plan.',
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
      detail: 'Shared renderer surface requires a parallelCompare plan.',
    });
    expect(sessionCalls.map((input) => input.time)).toEqual([0, 2]);
    expect(sourceCalls).toEqual([]);
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
      detail: 'Shared renderer surface requires a parallelCompare plan.',
    });
    expect(dataset).toEqual({
      uxfdRustExportFrameSourceStatus: 'fallback',
      uxfdRustExportFrameSourceReason: 'exportSessionBlocked',
    });
  });
});
