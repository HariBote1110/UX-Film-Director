import { describe, expect, it } from 'vitest';
import { createDefaultLayers } from './sceneState';
import { buildSharedRendererPreviewPlan } from './sharedRendererPreviewBridge';
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

describe('buildSharedRendererPreviewPlan', () => {
  it('keeps Pixi as the primary renderer when the shared renderer flag is disabled', () => {
    const plan = buildSharedRendererPreviewPlan({
      enabled: false,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image()],
      time: 1,
    });

    expect(plan).toEqual({
      mode: 'pixiOnly',
      reason: 'disabled',
    });
  });

  it('builds a parallel compare candidate without cutting over from Pixi', () => {
    const plan = buildSharedRendererPreviewPlan({
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image()],
      time: 1,
    });

    expect(plan.mode).toBe('parallelCompare');
    if (plan.mode !== 'parallelCompare') throw new Error('expected parallel compare plan');
    expect(plan.primary).toBe('pixi');
    expect(plan.candidate).toBe('sharedRenderer');
    expect(plan.snapshot.frame_index).toBe(60);
    expect(plan.snapshot.clips[0].clip_id).toBe('image-1');
    expect(plan.media[0].source).toBe('/tmp/image.png');
  });

  it('falls back to Pixi when the adapter reports unsupported features', () => {
    const plan = buildSharedRendererPreviewPlan({
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image({ rotation: 12 })],
      time: 1,
    });

    expect(plan.mode).toBe('pixiFallback');
    if (plan.mode !== 'pixiFallback') throw new Error('expected Pixi fallback plan');
    expect(plan.reason).toBe('unsupportedScene');
    expect(plan.issues.map((issue) => issue.code)).toEqual(['unsupportedRotation']);
  });
});
