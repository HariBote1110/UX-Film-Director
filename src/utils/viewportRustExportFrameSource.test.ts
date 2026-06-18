import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../types';
import { createDefaultLayers } from './sceneState';
import { buildViewportRustExportFrameSource } from './viewportRustExportFrameSource';
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
