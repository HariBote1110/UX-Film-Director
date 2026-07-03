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
  it('flag が無効なときは disabled プランを返す', () => {
    const plan = buildSharedRendererPreviewPlan({
      enabled: false,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image()],
      time: 1,
    });

    expect(plan).toEqual({
      mode: 'disabled',
      reason: 'disabled',
    });
  });

  it('表現可能なシーンでは sharedRenderer を唯一の presenter とするプランを返す（Pixi 併走モードは存在しない）', () => {
    const plan = buildSharedRendererPreviewPlan({
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image()],
      time: 1,
    });

    expect(plan.mode).toBe('sharedRenderer');
    if (plan.mode !== 'sharedRenderer') throw new Error('expected shared renderer plan');
    expect(plan.snapshot.frame_index).toBe(60);
    expect(plan.snapshot.clips[0].clip_id).toBe('image-1');
    expect(plan.media[0].source).toBe('/tmp/image.png');
    expect('primary' in plan).toBe(false);
    expect('candidate' in plan).toBe(false);
  });

  it('表現不能なシーンでは blocked（unsupportedScene）を返し、issues を保持する', () => {
    const plan = buildSharedRendererPreviewPlan({
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image({ groupId: 'group-1' })],
      time: 1,
    });

    expect(plan.mode).toBe('blocked');
    if (plan.mode !== 'blocked') throw new Error('expected blocked plan');
    expect(plan.reason).toBe('unsupportedScene');
    expect(plan.issues.length).toBeGreaterThan(0);
    expect(plan.issues[0].objectId).toBe('image-1');
  });

  it('スケール付き画像の transform を sharedRenderer プランに保持する', () => {
    const plan = buildSharedRendererPreviewPlan({
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image({ scaleX: 2 })],
      time: 1,
    });

    expect(plan.mode).toBe('sharedRenderer');
    if (plan.mode !== 'sharedRenderer') throw new Error('expected shared renderer plan');
    expect(plan.snapshot.clips[0].transform.scale_x).toBe(2);
  });

  it('サブピクセルの translation を sharedRenderer プランに保持する', () => {
    const plan = buildSharedRendererPreviewPlan({
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image({ x: 32.5, y: 48.25 })],
      time: 1,
    });

    expect(plan.mode).toBe('sharedRenderer');
    if (plan.mode !== 'sharedRenderer') throw new Error('expected shared renderer plan');
    expect(plan.snapshot.clips[0].transform.translation_x).toBe(32.5);
    expect(plan.snapshot.clips[0].transform.translation_y).toBe(48.25);
  });
});
