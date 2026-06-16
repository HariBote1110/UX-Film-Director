import { describe, expect, it } from 'vitest';
import { createDefaultLayers } from './sceneState';
import { buildSharedRendererPreviewSession } from './sharedRendererPreviewSession';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';
import type { ImageObject, ProjectSettings } from '../types';

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

describe('buildSharedRendererPreviewSession', () => {
  it('builds a comparable plan and an allowed surface gate for a supported 2D scene', () => {
    const session = buildSharedRendererPreviewSession({
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image()],
      time: 1,
      editorMode: '2d',
      isExporting: false,
      webGpuAvailable: true,
      fallbackAdapter: false,
    });

    expect(session.plan.mode).toBe('parallelCompare');
    expect(session.presentationContract).toEqual(buildSharedRendererPresentationContract());
    expect(session.surfaceGate.ok).toBe(true);
    if (!session.surfaceGate.ok) throw new Error('expected surface gate to pass');
    expect(session.surfaceGate.canvas).toEqual({ width: 1920, height: 1080 });
  });

  it('keeps a blocked surface reason when the plan is disabled or unsupported', () => {
    const disabled = buildSharedRendererPreviewSession({
      enabled: false,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image()],
      time: 1,
      editorMode: '2d',
      isExporting: false,
      webGpuAvailable: true,
      fallbackAdapter: false,
    });

    expect(disabled.plan).toEqual({ mode: 'pixiOnly', reason: 'disabled' });
    expect(disabled.surfaceGate).toEqual({
      ok: false,
      reason: 'planNotComparable',
      detail: 'Shared renderer surface requires a parallelCompare plan.',
    });

    const unsupported = buildSharedRendererPreviewSession({
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image({ rotation: 45 })],
      time: 1,
      editorMode: '2d',
      isExporting: false,
      webGpuAvailable: true,
      fallbackAdapter: false,
    });

    expect(unsupported.plan.mode).toBe('pixiFallback');
    expect(unsupported.surfaceGate).toEqual({
      ok: false,
      reason: 'planNotComparable',
      detail: 'Shared renderer surface requires a parallelCompare plan.',
    });
  });
});
