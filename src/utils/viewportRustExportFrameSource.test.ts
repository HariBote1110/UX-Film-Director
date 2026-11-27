import { describe, expect, it, vi } from 'vitest';
import type { ProjectSettings } from '../types';
import { createDefaultLayers } from './sceneState';
import type { SharedRendererExportEvaluationProvider } from './sharedRendererExportEvaluationProvider';
import type { ProjectExportRustFrameSource } from './projectExportFrameCanvas';
import {
  buildViewportRustExportFrameSource,
  resolveViewportRustExportFrameSource,
} from './viewportRustExportFrameSource';

const settings: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 60,
  sampleRate: 48000,
};

const canvas = { width: 1920, height: 1080, dataset: {} } as unknown as HTMLCanvasElement;
const frameSource: ProjectExportRustFrameSource = {
  renderFrame: async () => ({ close: () => undefined }) as ImageBitmap,
};

const evaluationProvider: SharedRendererExportEvaluationProvider = async ({ frameIndex }) => ({
  sceneId: 'viewport-export',
  revision: 3,
  frameIndex,
  snapshot: {
    frame_index: frameIndex,
    colour: { profile: 'rec709-sdr', working_space: 'linear-light', alpha: 'premultiplied' },
    clips: [],
  },
  media: [],
});

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
  evaluateResidentScene: evaluationProvider,
};

describe('buildViewportRustExportFrameSource', () => {
  it('preserves the viewport surface and renderer gates before selecting a frame source', () => {
    const createFrameSource = vi.fn(() => frameSource);
    const closedGates = [
      { exportEnabled: false },
      { canvas: null },
      { editorMode: '3d_stage' as const },
      { webGpuAvailable: false },
      { fallbackAdapter: true },
      { videoCutoverEnabled: false },
    ];

    for (const gate of closedGates) {
      expect(buildViewportRustExportFrameSource({
        ...baseInput,
        ...gate,
        createFrameSource,
      })).toBeNull();
    }

    expect(createFrameSource).not.toHaveBeenCalled();
  });

  it('passes the Rust evaluation provider to the selected frame source', () => {
    const createFrameSource = vi.fn(() => frameSource);

    expect(buildViewportRustExportFrameSource({
      ...baseInput,
      createFrameSource,
    })).toBe(frameSource);
    expect(createFrameSource).toHaveBeenCalledWith(expect.objectContaining({
      evaluateResidentScene: evaluationProvider,
      videoCutoverEnabled: true,
    }));
  });

  it('blocks when the Rust resident evaluator is missing and records the reason', () => {
    const diagnosticsDataset: Record<string, string | undefined> = {};
    const createFrameSource = vi.fn(() => frameSource);
    const onFrameSourceUnavailable = vi.fn();

    expect(buildViewportRustExportFrameSource({
      ...baseInput,
      evaluateResidentScene: undefined,
      createFrameSource,
      onFrameSourceUnavailable,
      diagnosticsDataset,
    })).toBeNull();

    expect(createFrameSource).not.toHaveBeenCalled();
    expect(onFrameSourceUnavailable).toHaveBeenCalledWith(expect.objectContaining({
      ok: false,
      reason: 'residentEvaluationUnavailable',
      diagnosticStatus: 'blocked',
    }));
    expect(diagnosticsDataset).toMatchObject({
      uxfdRustExportFrameSourceStatus: 'blocked',
      uxfdRustExportFrameSourceReason: 'residentEvaluationUnavailable',
    });
  });

  it('forces encode-only native output for video even when the preview cutover is off', () => {
    const createFrameSource = vi.fn(() => frameSource);

    buildViewportRustExportFrameSource({
      ...baseInput,
      videoCutoverEnabled: false,
      hasVideoObjects: true,
      createFrameSource,
    });

    expect(createFrameSource).toHaveBeenCalledWith(expect.objectContaining({
      videoCutoverEnabled: true,
      bitmapCaptureEnabled: false,
      nativeRenderRequired: true,
      evaluateResidentScene: evaluationProvider,
    }));
  });
});

describe('resolveViewportRustExportFrameSource', () => {
  it('reports a blocked decision instead of selecting TS serialization when Rust evaluation is unavailable', () => {
    expect(resolveViewportRustExportFrameSource({
      ...baseInput,
      evaluateResidentScene: undefined,
    })).toEqual({
      ok: false,
      reason: 'residentEvaluationUnavailable',
      detail: 'Rust resident scene evaluation provider is unavailable.',
      diagnosticStatus: 'blocked',
    });
  });
});
