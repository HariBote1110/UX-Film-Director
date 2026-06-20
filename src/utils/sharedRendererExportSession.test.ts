import { describe, expect, it } from 'vitest';
import type { ImageObject, ProjectSettings, PsdObject, VideoObject } from '../types';
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

const video = (patch: Partial<VideoObject> = {}): VideoObject => ({
  id: 'video-1',
  type: 'video',
  name: 'clip.mp4',
  layer: 0,
  startTime: 0.5,
  duration: 5,
  offset: 2,
  x: 10,
  y: 20,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 10,
  endY: 20,
  easing: 'linear',
  src: 'blob:video',
  filePath: '/tmp/gopro.mp4',
  width: 1280,
  height: 720,
  volume: 1,
  muted: false,
  ...patch,
});

const psd = (patch: Partial<PsdObject> = {}): PsdObject => ({
  id: 'psd-1',
  type: 'psd',
  name: 'overlay.psd',
  layer: 1,
  startTime: 0,
  duration: 5,
  x: 100,
  y: 120,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
  enableAnimation: false,
  endX: 100,
  endY: 120,
  easing: 'linear',
  src: 'blob:psd',
  filePath: '/tmp/overlay.psd',
  width: 512,
  height: 768,
  scale: 1,
  activeLayerIds: {
    root: true,
    'psd-layer-1': true,
    'psd-layer-2': false,
  },
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

  it('keeps scaled image export scenes inside the Rust boundary gate', () => {
    const session = buildSharedRendererExportSession({
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image({ scaleX: 2 })],
      time: 1,
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
    });

    expect(session.plan.mode).toBe('parallelCompare');
    expect(session.surfaceGate.ok).toBe(true);
    if (!session.surfaceGate.ok) throw new Error('expected export surface gate to pass');
    expect(session.surfaceGate.snapshot.clips[0].transform.scale_x).toBe(2);
  });

  it('exposes a native render envelope for real video and PSD timeline objects', () => {
    const session = buildSharedRendererExportSession({
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [video(), psd()],
      time: 1,
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
    });

    expect(session.plan.mode).toBe('parallelCompare');
    expect(session.surfaceGate.ok).toBe(true);
    if (session.plan.mode !== 'parallelCompare' || !session.surfaceGate.ok) {
      throw new Error('expected video+PSD export session to pass');
    }

    expect(session.surfaceGate.snapshot.clips.map((clip) => ({
      clip_id: clip.clip_id,
      media_id: clip.media_id,
      source_frame: clip.source_frame,
      z_index: clip.z_index,
    }))).toEqual([
      {
        clip_id: 'video-1',
        media_id: 'video-1',
        source_frame: 150,
        z_index: 0,
      },
      {
        clip_id: 'psd-1',
        media_id: 'psd-1',
        source_frame: 0,
        z_index: 1,
      },
    ]);
    expect(session.surfaceGate.media).toEqual([
      {
        id: 'video-1',
        kind: 'Video',
        source: '/tmp/gopro.mp4',
        width: 1280,
        height: 720,
        source_rate: {
          numerator: 60,
          denominator: 1,
        },
      },
      {
        id: 'psd-1',
        kind: 'Psd',
        source: '/tmp/overlay.psd',
        width: 512,
        height: 768,
        active_layer_ids: ['psd-layer-1', 'root'],
      },
    ]);
    expect(session.nativeRenderEnvelope).toEqual({
      ok: true,
      mediaCount: 2,
      mediaKinds: ['Video', 'Psd'],
      sourceCount: 1,
      sourceMediaIds: ['video-1'],
    });
  });

  it('builds export video media from the original file instead of the preview proxy', () => {
    const session = buildSharedRendererExportSession({
      enabled: true,
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [video({
        filePath: '/tmp/original-4k.mp4',
        proxyFilePath: '/tmp/original-4k.proxy.mp4',
        width: 640,
        height: 360,
        sourceWidth: 3840,
        sourceHeight: 2160,
      })],
      time: 1,
      editorMode: '2d',
      webGpuAvailable: true,
      fallbackAdapter: false,
    });

    expect(session.plan.mode).toBe('parallelCompare');
    if (session.plan.mode !== 'parallelCompare') {
      throw new Error('expected export session to use shared renderer');
    }
    expect(session.plan.media).toEqual([expect.objectContaining({
      id: 'video-1',
      kind: 'Video',
      source: '/tmp/original-4k.mp4',
      width: 640,
      height: 360,
    })]);
    expect(session.plan.snapshot.clips[0].transform).toMatchObject({
      scale_x: 1,
      scale_y: 1,
    });
  });
});
