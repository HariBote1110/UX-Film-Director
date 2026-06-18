import { describe, expect, it } from 'vitest';
import type { ImageObject, ProjectSettings } from '../types';
import { createDefaultLayers } from './sceneState';
import { buildSharedRendererExportSession } from './sharedRendererExportSession';
import { buildSharedRendererPreviewSession } from './sharedRendererPreviewSession';

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

describe('buildSharedRendererExportSession', () => {
  it('keeps the export surface available even though the preview surface is blocked while exporting', () => {
    const input = {
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image()],
      time: 1,
      editorMode: '2d' as const,
      webGpuAvailable: true,
      fallbackAdapter: false,
    };

    const previewSession = buildSharedRendererPreviewSession({
      ...input,
      isExporting: true,
    });
    const exportSession = buildSharedRendererExportSession(input);

    expect(previewSession.surfaceGate).toEqual({
      ok: false,
      reason: 'exporting',
      detail: 'Shared renderer preview surface is disabled during export.',
    });
    expect(exportSession.plan.mode).toBe('parallelCompare');
    expect(exportSession.surfaceGate.ok).toBe(true);
    if (!exportSession.surfaceGate.ok) throw new Error('expected export surface gate to pass');
    expect(exportSession.surfaceGate.canvas).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it('still blocks unsupported export scenes instead of bypassing the Rust boundary gate', () => {
    const session = buildSharedRendererExportSession({
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image({ rotation: 45 })],
      time: 1,
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
    });

    expect(session.plan.mode).toBe('pixiFallback');
    expect(session.surfaceGate).toEqual({
      ok: false,
      reason: 'planNotComparable',
      detail: 'Shared renderer surface requires a parallelCompare plan.',
    });
  });
});
