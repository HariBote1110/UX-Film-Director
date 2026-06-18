import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../types';
import { createDefaultLayers } from './sceneState';
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
  });
});
