import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  AudioObject,
  BaseObject,
  ImageObject,
  LayerState,
  ProjectSettings,
  PsdObject,
  ShapeObject,
  TimelineObject,
  VideoObject,
} from '../types';
import {
  buildProjectExportFrameSourcePlan,
  hasProjectExportNativeRenderMediaObjects,
  resolveProjectExportFrameSourcePolicyForEncode,
  resolveProjectExportRustFrameSourceContext,
  type ProjectExportRustFrameSource,
} from '../utils/projectExportFrameCanvas';
import {
  buildRustSceneSnapshotForTimeline,
  validateRustSceneSnapshotBoundary,
} from '../utils/rustSceneSnapshot';
import { buildSharedRendererPreviewSession } from '../utils/sharedRendererPreviewSession';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

const projectSettings: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 60,
  sampleRate: 48000,
  editorMode: '2d',
};

const videoFixtures = [
  {
    id: 'video-20000kbps-60fps',
    filePath: join(projectRoot, 'perf/heavy-media/20000kbps_60fps.mp4'),
    width: 1920,
    height: 1080,
  },
  {
    id: 'video-gopro-proxy',
    filePath: join(projectRoot, 'perf/heavy-media/GX010052.proxy.mp4'),
    width: 1280,
    height: 720,
  },
  {
    id: 'video-10000kbps-60fps',
    filePath: join(projectRoot, 'perf/heavy-media/10000kbps_60fps.mp4'),
    width: 1920,
    height: 1080,
  },
  {
    id: 'video-gopro-original',
    filePath: join(projectRoot, 'perf/heavy-media/GX010052.MP4'),
    width: 3840,
    height: 2160,
  },
];

const imageFixture = join(projectRoot, 'public/icon.jpg');
const psdFixture = join(projectRoot, '葵ちゃん.psd');

const createLayers = (): LayerState[] =>
  Array.from({ length: 16 }, (_, index) => ({
    name: `Layer ${index + 1}`,
    visible: true,
    locked: false,
  }));

const baseObject = (
  id: string,
  type: TimelineObject['type'],
  layer: number,
  patch: Partial<BaseObject> = {}
): BaseObject => ({
  id,
  type,
  name: id,
  layer,
  startTime: 0,
  duration: 4,
  x: 64 + layer * 16,
  y: 48 + layer * 16,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 64 + layer * 16,
  endY: 48 + layer * 16,
  easing: 'linear',
  ...patch,
});

const writeTinyWaveFixture = (): string => {
  const audioPath = join(tmpdir(), `uxfd-all-readable-media-${process.pid}.wav`);
  const sampleRate = 48000;
  const frames = 480;
  const bytesPerSample = 2;
  const channels = 1;
  const dataBytes = frames * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  writeFileSync(audioPath, buffer);
  return audioPath;
};

const createAllReadableMediaObjects = (): TimelineObject[] => {
  const audioPath = writeTinyWaveFixture();
  const solidShape: ShapeObject = {
    ...baseObject('shape-solid-rect', 'shape', 0),
    type: 'shape',
    shapeType: 'rect',
    width: 320,
    height: 180,
    fill: '#2878d8',
  };
  const gradientShape: ShapeObject = {
    ...baseObject('shape-gradient-rect', 'shape', 1),
    type: 'shape',
    shapeType: 'rect',
    width: 320,
    height: 180,
    fill: '#ffffff',
    gradient: {
      enabled: true,
      type: 'linear',
      colours: ['#2878d8', '#f2c94c'],
      stops: [0, 1],
      direction: 90,
    },
  };
  const image: ImageObject = {
    ...baseObject('image-icon-jpg', 'image', 2),
    type: 'image',
    src: `file://${imageFixture}`,
    filePath: imageFixture,
    width: 512,
    height: 512,
  };
  const videos: VideoObject[] = videoFixtures.map((fixture, index) => ({
    ...baseObject(fixture.id, 'video', 3 + index),
    type: 'video',
    src: `file://${fixture.filePath}`,
    filePath: fixture.filePath,
    width: fixture.width,
    height: fixture.height,
    volume: 1,
    muted: false,
  }));
  const psd: PsdObject = {
    ...baseObject('psd-aoi-chan', 'psd', 7),
    type: 'psd',
    src: `file://${psdFixture}`,
    filePath: psdFixture,
    width: 800,
    height: 1200,
    scale: 1,
    activeLayerIds: {
      root: true,
    },
  };
  const audio: AudioObject = {
    ...baseObject('audio-generated-wave', 'audio', 8),
    type: 'audio',
    src: `file://${audioPath}`,
    filePath: audioPath,
    volume: 1,
    muted: false,
  };

  return [
    solidShape,
    gradientShape,
    image,
    ...videos,
    psd,
    audio,
  ];
};

const sharedFrameSource: ProjectExportRustFrameSource = {
  renderEncodeFrame: async (request) => ({
    timestamp: request.timestampUs,
    sharedFramePayload: {
      sessionId: request.encodeSessionId,
      frameIndex: request.frameIndex,
      timestampUs: request.timestampUs,
      slotCount: 2,
      frame: {
        descriptor: {
          memoryId: '/uxfd-all-readable-media-export',
          slotIndex: request.frameIndex % 2,
          generation: request.frameIndex + 1,
          byteOffset: 0,
          byteLen: request.width * request.height * 4,
          width: request.width,
          height: request.height,
          strideBytes: request.width * 4,
          format: 'rgba8Srgb',
          colour: {
            primaries: 'bt709',
            transfer: 'srgb',
            matrix: 'rgb',
            range: 'full',
          },
        },
        ptsFrame: request.frameIndex,
      },
    },
  }),
};

describe('全読込可能メディア E2E', () => {
  it('画像・PSD・全動画・音声・図形を同一タイムラインに載せてRust preview/export境界を通過できる', async () => {
    const objects = createAllReadableMediaObjects();
    const mediaFilePaths = objects
      .flatMap((object) => (
        'filePath' in object && object.filePath ? [object.filePath] : []
      ));

    expect(mediaFilePaths.every((filePath) => existsSync(filePath))).toBe(true);

    const snapshotResult = buildRustSceneSnapshotForTimeline({
      projectSettings,
      layers: createLayers(),
      objects,
      time: 1,
    });

    if (!snapshotResult.ok) {
      throw new Error(`Rust scene snapshot failed: ${JSON.stringify(snapshotResult.issues)}`);
    }

    expect(snapshotResult.snapshot.clips).toHaveLength(objects.length - 1);
    expect(snapshotResult.media.map((media) => media.kind)).toEqual([
      'SolidColour',
      'GeneratedGradient',
      'Image',
      'Video',
      'Video',
      'Video',
      'Video',
      'Psd',
    ]);
    expect(snapshotResult.media
      .filter((media) => media.kind === 'Video')
      .map((media) => media.source)).toEqual(videoFixtures.map((fixture) => fixture.filePath));
    expect(snapshotResult.media.some((media) => media.source.endsWith('.wav'))).toBe(false);
    expect(validateRustSceneSnapshotBoundary({
      snapshot: snapshotResult.snapshot,
      media: snapshotResult.media,
    })).toEqual({ ok: true });

    const previewSession = buildSharedRendererPreviewSession({
      enabled: true,
      projectSettings,
      layers: createLayers(),
      objects,
      time: 1,
      editorMode: '2d',
      isExporting: false,
      webGpuAvailable: true,
      fallbackAdapter: false,
    });
    expect(previewSession.plan.mode).toBe('parallelCompare');
    expect(previewSession.surfaceGate.ok).toBe(true);
    if (!previewSession.surfaceGate.ok) {
      throw new Error(`Shared renderer surface gate failed: ${previewSession.surfaceGate.detail}`);
    }

    const hasVideoObjects = objects.some((object) => object.type === 'video');
    const hasNativeRenderMediaObjects = hasProjectExportNativeRenderMediaObjects(objects);
    const policy = resolveProjectExportFrameSourcePolicyForEncode({
      rustExportOnly: false,
      hasVideoObjects,
      hasNativeRenderMediaObjects,
      encodeEngine: 'rustBackendVideoEncoder',
    });
    expect(policy).toEqual({
      rustFrameSourcePolicy: 'requireRustFrameSource',
      rustFrameSourceBlockedFallback: 'failExport',
    });

    const context = resolveProjectExportRustFrameSourceContext({
      objects,
      time: 1,
      encodeEngine: 'rustBackendVideoEncoder',
    });
    expect(context.hasVideoObjects).toBe(true);
    expect(context.hasNativeRenderMediaObjects).toBe(true);
    expect(context.preferEncodeOnly).toBe(true);

    const frameSourcePlan = buildProjectExportFrameSourcePlan({
      rustFrameSource: sharedFrameSource,
      hasVideoObjects,
      hasNativeRenderMediaObjects,
      ...policy,
    });
    expect(frameSourcePlan.ok).toBe(true);
    if (!frameSourcePlan.ok || frameSourcePlan.source !== 'sharedRendererRustFrameSource') {
      throw new Error('expected shared renderer Rust export frame source');
    }
    expect(frameSourcePlan.rustFrameSourceBlockedFallback).toBe('failExport');

    const encodedFrame = await frameSourcePlan.frameSource.renderEncodeFrame?.({
      encodeSessionId: 'session-all-readable-media',
      frameIndex: 60,
      timestampUs: 1_000_000,
      time: 1,
      width: projectSettings.width,
      height: projectSettings.height,
      objects,
    });

    if (!encodedFrame || !('sharedFramePayload' in encodedFrame)) {
      throw new Error('expected shared-frame encode payload');
    }
    expect(encodedFrame.sharedFramePayload.frame.descriptor).toMatchObject({
      memoryId: '/uxfd-all-readable-media-export',
      width: 1920,
      height: 1080,
      format: 'rgba8Srgb',
    });
  });
});
