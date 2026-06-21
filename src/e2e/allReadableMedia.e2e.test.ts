import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  AudioObject,
  AudioVisualizationObject,
  BaseObject,
  BarcodeObject,
  ColourWheelObject,
  GearObject,
  GourdObject,
  ImageObject,
  LayerState,
  ParticleObject,
  PieChartObject,
  ProjectSettings,
  PsdObject,
  PuzzlePieceObject,
  ShapeObject,
  TimelineObject,
  TrackBarObject,
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
  x: 64.5 + layer * 16,
  y: 48.25 + layer * 16,
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
    scaleX: 1.25,
    scaleY: 1.25,
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
    scaleX: 0.75,
    scaleY: 0.75,
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
    scaleX: 0.5,
    scaleY: 0.5,
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
  const audioVisualisation: AudioVisualizationObject = {
    ...baseObject('audio-waveform-r', 'audio_visualization', 9),
    type: 'audio_visualization',
    targetAudioId: audio.id,
    visualizationType: 'waveform',
    color: '#00ff88',
    thickness: 2,
    width: 960,
    height: 160,
    amplitude: 1.25,
  };
  const standardParticle: ParticleObject = {
    ...baseObject('particle-standard', 'particle', 10),
    type: 'particle',
    name: '標準パーティクル',
    width: 640,
    height: 360,
    particleCount: 48,
    seed: 93,
    spread: 180,
    speed: 120,
    size: 6,
    colour: '#ffffff',
    lifetimeSeconds: 1.5,
  };
  const barcode: BarcodeObject = {
    ...baseObject('barcode-t', 'barcode', 11),
    type: 'barcode',
    name: 'バーコードT',
    width: 520,
    height: 180,
    data: 'AviUtl',
    minimumBarWidth: 2,
    horizontalMargin: 30,
    verticalMargin: 20,
    foregroundColour: '#000000',
    backgroundColour: '#ffffff',
  };
  const puzzlePiece: PuzzlePieceObject = {
    ...baseObject('puzzle-piece', 'puzzle_piece', 12),
    type: 'puzzle_piece',
    name: 'パズルピース',
    width: 240,
    height: 240,
    size: 120,
    shapeVariant: 1,
    connectorMode: 'convex',
    fillColour: '#ffffff',
  };
  const colourWheel: ColourWheelObject = {
    ...baseObject('colour-wheel', 'colour_wheel', 13),
    type: 'colour_wheel',
    name: '色相環',
    width: 240,
    height: 240,
    radius: 120,
    saturation: 100,
    brightness: 100,
    ringWidthPercent: 25,
    segmentCount: 24,
  };
  const gourd: GourdObject = {
    ...baseObject('gourd-tm', 'gourd', 14),
    type: 'gourd',
    name: 'ひょうたんTM',
    width: 400,
    height: 400,
    bodyRadius: 80,
    bodyWidth: 250,
    waistRadius: 10,
    squashPercent: 40,
    repeatCount: 1,
    fillColour: '#ffffff',
  };
  const gear: GearObject = {
    ...baseObject('gear-t', 'gear', 15),
    type: 'gear',
    name: '歯車',
    width: 320,
    height: 320,
    outerRadius: 160,
    innerRadiusPercent: 45,
    toothCount: 20,
    toothDepthPercent: 18,
    toothSkewPercent: 0,
    fillColour: '#ffffff',
  };
  const trackBar: TrackBarObject = {
    ...baseObject('custom-track-bar', 'track_bar', 16),
    type: 'track_bar',
    name: 'カスタムトラックバー',
    width: 360,
    height: 120,
    trackValues: [0, 25, 50, -50],
    trackRanges: [[0, 100], [0, 100], [0, 100], [-100, 100]],
    labels: ['TrackA', 'TrackB', 'TrackC', 'TrackD'],
    barColour: '#ffffff',
    backgroundOpacity: 0.05,
  };
  const pieChart: PieChartObject = {
    ...baseObject('pie-sheet-graph', 'pie_chart', 17),
    type: 'pie_chart',
    name: 'パイシートグラフ',
    width: 400,
    height: 400,
    values: [10, 20, 30, 40],
    sortMode: 'descending',
    normaliseToHundred: true,
    labelMode: 'percentage',
    progressPercent: 100,
    strokeWidth: 20,
    sliceColours: ['#389ba6', '#f2e2c4', '#f29422', '#f27830', '#f24b0f'],
  };

  return [
    solidShape,
    gradientShape,
    image,
    ...videos,
    psd,
    audio,
    audioVisualisation,
    standardParticle,
    barcode,
    puzzlePiece,
    colourWheel,
    gourd,
    gear,
    trackBar,
    pieChart,
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
      'GeneratedAudioWaveform',
      'GeneratedParticle',
      'GeneratedBarcode',
      'GeneratedPuzzlePiece',
      'GeneratedColourWheel',
      'GeneratedGourd',
      'GeneratedGear',
      'GeneratedTrackBar',
      'GeneratedPieChart',
    ]);
    expect(snapshotResult.media
      .filter((media) => media.kind === 'Video')
      .map((media) => media.source)).toEqual(videoFixtures.map((fixture) => fixture.filePath));
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'audio-waveform-r')?.source ?? '{}')).toMatchObject({
      generator: 'audio-waveform-r',
      target_audio_id: 'audio-generated-wave',
      colour: '#00ff88',
      thickness: 2,
      amplitude: 1.25,
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'particle-standard')?.source ?? '{}')).toMatchObject({
      generator: 'standard-particle',
      seed: 93,
      particle_count: 48,
      spread: 180,
      speed: 120,
      size: 6,
      colour: '#ffffff',
      lifetime_seconds: 1.5,
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'barcode-t')?.source ?? '{}')).toMatchObject({
      generator: 'barcode-t',
      data: 'AviUtl',
      minimum_bar_width: 2,
      horizontal_margin: 30,
      vertical_margin: 20,
      foreground_colour: '#000000',
      background_colour: '#ffffff',
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'puzzle-piece')?.source ?? '{}')).toMatchObject({
      generator: 'puzzle-piece',
      size: 120,
      shape_variant: 1,
      connector_mode: 'convex',
      fill_colour: '#ffffff',
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'colour-wheel')?.source ?? '{}')).toMatchObject({
      generator: 'colour-wheel',
      radius: 120,
      saturation: 100,
      brightness: 100,
      ring_width_percent: 25,
      segment_count: 24,
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'gourd-tm')?.source ?? '{}')).toMatchObject({
      generator: 'gourd-tm',
      body_radius: 80,
      body_width: 250,
      waist_radius: 10,
      squash_percent: 40,
      repeat_count: 1,
      fill_colour: '#ffffff',
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'gear-t')?.source ?? '{}')).toMatchObject({
      generator: 'gear-t',
      outer_radius: 160,
      inner_radius_percent: 45,
      tooth_count: 20,
      tooth_depth_percent: 18,
      tooth_skew_percent: 0,
      fill_colour: '#ffffff',
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'custom-track-bar')?.source ?? '{}')).toMatchObject({
      generator: 'custom-track-bar',
      track_values: [0, 25, 50, -50],
      track_ranges: [[0, 100], [0, 100], [0, 100], [-100, 100]],
      labels: ['TrackA', 'TrackB', 'TrackC', 'TrackD'],
      bar_colour: '#ffffff',
      background_opacity: 0.05,
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'pie-sheet-graph')?.source ?? '{}')).toMatchObject({
      generator: 'pie-sheet-graph',
      values: [10, 20, 30, 40],
      sort_mode: 'descending',
      normalise_to_hundred: true,
      label_mode: 'percentage',
      progress_percent: 100,
      stroke_width: 20,
      slice_colours: ['#389ba6', '#f2e2c4', '#f29422', '#f27830', '#f24b0f'],
    });
    expect(snapshotResult.media.some((media) => media.source.endsWith('.wav'))).toBe(false);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'shape-solid-rect')?.transform).toMatchObject({
      translation_x: 64.5,
      translation_y: 48.25,
      scale_x: 1.25,
      scale_y: 1.25,
    });
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'image-icon-jpg')?.transform).toMatchObject({
      translation_x: 96.5,
      translation_y: 80.25,
      scale_x: 0.75,
      scale_y: 0.75,
    });
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'psd-aoi-chan')?.transform).toMatchObject({
      translation_x: 176.5,
      translation_y: 160.25,
      scale_x: 0.5,
      scale_y: 0.5,
    });
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'audio-waveform-r')?.source_frame).toBe(60);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'particle-standard')?.source_frame).toBe(60);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'barcode-t')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'puzzle-piece')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'colour-wheel')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'gourd-tm')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'gear-t')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'custom-track-bar')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'pie-sheet-graph')?.source_frame).toBe(0);
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
