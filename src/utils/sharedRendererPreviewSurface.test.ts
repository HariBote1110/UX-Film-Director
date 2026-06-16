import { describe, expect, it } from 'vitest';
import { createDefaultLayers } from './sceneState';
import {
  buildSharedRendererPreviewPlan,
  type SharedRendererPreviewPlan,
} from './sharedRendererPreviewBridge';
import { buildSharedRendererPreviewSurfaceGate } from './sharedRendererPreviewSurface';
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

describe('buildSharedRendererPreviewSurfaceGate', () => {
  it('allows a read-only shared renderer surface only for 2D parallel compare plans', () => {
    const plan = buildSharedRendererPreviewPlan({
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image()],
      time: 1,
    });

    const gate = buildSharedRendererPreviewSurfaceGate({
      plan,
      projectSettings: settings,
      editorMode: '2d',
      isExporting: false,
      webGpuAvailable: true,
      fallbackAdapter: false,
    });

    expect(gate).toEqual({
      ok: true,
      canvas: {
        width: 1920,
        height: 1080,
      },
      snapshot: plan.mode === 'parallelCompare' ? plan.snapshot : undefined,
      media: plan.mode === 'parallelCompare' ? plan.media : undefined,
    });
  });

  it('blocks non-compare, exporting, 3D, invalid size, and unsupported WebGPU states with explicit reasons', () => {
    const plan = buildSharedRendererPreviewPlan({
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image({ rotation: 12 })],
      time: 1,
    });

    expect(
      buildSharedRendererPreviewSurfaceGate({
        plan,
        projectSettings: settings,
        editorMode: '2d',
        isExporting: false,
        webGpuAvailable: true,
        fallbackAdapter: false,
      })
    ).toEqual({
      ok: false,
      reason: 'planNotComparable',
      detail: 'Shared renderer surface requires a parallelCompare plan.',
    });

    const comparePlan = buildSharedRendererPreviewPlan({
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image()],
      time: 1,
    });

    expect(
      buildSharedRendererPreviewSurfaceGate({
        plan: comparePlan,
        projectSettings: settings,
        editorMode: '2d',
        isExporting: true,
        webGpuAvailable: true,
        fallbackAdapter: false,
      })
    ).toEqual({
      ok: false,
      reason: 'exporting',
      detail: 'Shared renderer preview surface is disabled during export.',
    });

    expect(
      buildSharedRendererPreviewSurfaceGate({
        plan: comparePlan,
        projectSettings: settings,
        editorMode: '3d_stage',
        isExporting: false,
        webGpuAvailable: true,
        fallbackAdapter: false,
      })
    ).toEqual({
      ok: false,
      reason: 'unsupportedEditorMode',
      detail: 'Shared renderer preview surface currently supports only the 2D editor mode.',
    });

    expect(
      buildSharedRendererPreviewSurfaceGate({
        plan: comparePlan,
        projectSettings: { ...settings, width: 0 },
        editorMode: '2d',
        isExporting: false,
        webGpuAvailable: true,
        fallbackAdapter: false,
      })
    ).toEqual({
      ok: false,
      reason: 'invalidProjectSize',
      detail: 'Project width and height must be positive safe integers.',
    });

    expect(
      buildSharedRendererPreviewSurfaceGate({
        plan: comparePlan,
        projectSettings: settings,
        editorMode: '2d',
        isExporting: false,
        webGpuAvailable: false,
        fallbackAdapter: false,
      })
    ).toEqual({
      ok: false,
      reason: 'webGpuUnavailable',
      detail: 'WebGPU is not available for the shared renderer preview surface.',
    });

    expect(
      buildSharedRendererPreviewSurfaceGate({
        plan: comparePlan,
        projectSettings: settings,
        editorMode: '2d',
        isExporting: false,
        webGpuAvailable: true,
        fallbackAdapter: true,
      })
    ).toEqual({
      ok: false,
      reason: 'fallbackAdapter',
      detail: 'Shared renderer preview requires a non-fallback WebGPU adapter.',
    });
  });

  it('blocks invalid Rust boundary payloads instead of mounting a misleading surface', () => {
    const brokenPlan: SharedRendererPreviewPlan = {
      mode: 'parallelCompare',
      primary: 'pixi',
      candidate: 'sharedRenderer',
      snapshot: {
        frame_index: 60,
        colour: {
          profile: 'rec709-sdr',
          working_space: 'linear-light',
          alpha: 'premultiplied',
        },
        clips: [
          {
            clip_id: 'image-1',
            track_id: 'layer-1',
            media_id: 'missing-media',
            source_frame: 0,
            z_index: 0,
            transform: {
              translation_x: 32,
              translation_y: 48,
              scale_x: 1,
              scale_y: 1,
              rotation_degrees: 0,
              sampling: 'bilinear',
            },
            opacity: 1,
            effects: [],
          },
        ],
      },
      media: [],
    };

    const gate = buildSharedRendererPreviewSurfaceGate({
      plan: brokenPlan,
      projectSettings: settings,
      editorMode: '2d',
      isExporting: false,
      webGpuAvailable: true,
      fallbackAdapter: false,
    });

    expect(gate.ok).toBe(false);
    if (gate.ok) throw new Error('expected surface gate to fail');
    expect(gate.reason).toBe('invalidBoundaryPayload');
    if (gate.reason !== 'invalidBoundaryPayload') throw new Error('expected boundary payload failure');
    expect(gate.issues.map((issue) => issue.code)).toEqual(['mediaMismatch']);
  });
});
