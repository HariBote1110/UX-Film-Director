import { describe, expect, it } from 'vitest';
import { createDefaultLayers } from './sceneState';
import {
  buildRustSceneSnapshotForTimeline,
  type RustSceneSnapshotBuildIssue,
} from './rustSceneSnapshot';
import type { AudioObject, AudioVisualizationObject, BarcodeObject, ColourWheelObject, GearObject, GourdObject, HistogramObject, ImageObject, ParticleObject, PieChartObject, ProjectSettings, PsdObject, PuzzlePieceObject, ShapeObject, SunburstObject, TimelineObject, TrackBarObject, VideoObject } from '../types';

const settings: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 60,
  sampleRate: 48000,
};

const baseImage = (patch: Partial<ImageObject> = {}): ImageObject => ({
  id: 'image-1',
  type: 'image',
  name: 'image.png',
  layer: 2,
  startTime: 1,
  duration: 4,
  x: 100,
  y: 200,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.75,
  enableAnimation: false,
  endX: 100,
  endY: 200,
  easing: 'linear',
  src: 'blob:image',
  filePath: '/tmp/image.png',
  width: 640,
  height: 360,
  ...patch,
});

const baseVideo = (patch: Partial<VideoObject> = {}): VideoObject => ({
  id: 'video-1',
  type: 'video',
  name: 'video.mp4',
  layer: 1,
  startTime: 2,
  duration: 5,
  offset: 3,
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
  filePath: '/tmp/video.mp4',
  width: 1280,
  height: 720,
  volume: 1,
  muted: false,
  ...patch,
});

const baseShape = (patch: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 'shape-1',
  type: 'shape',
  name: 'Rectangle',
  layer: 0,
  startTime: 1,
  duration: 4,
  x: 300,
  y: 120,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.5,
  enableAnimation: false,
  endX: 300,
  endY: 120,
  easing: 'linear',
  shapeType: 'rect',
  width: 200,
  height: 100,
  fill: '#ff0000',
  ...patch,
});

const basePsd = (patch: Partial<PsdObject> = {}): PsdObject => ({
  id: 'psd-1',
  type: 'psd',
  name: 'standing.psd',
  layer: 2,
  startTime: 1,
  duration: 4,
  x: 400,
  y: 120,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
  enableAnimation: false,
  endX: 400,
  endY: 120,
  easing: 'linear',
  src: 'blob:psd',
  filePath: '/tmp/standing.psd',
  width: 512,
  height: 768,
  scale: 1,
  activeLayerIds: {
    'face-open': true,
  },
  ...patch,
});

const baseAudio = (patch: Partial<AudioObject> = {}): AudioObject => ({
  id: 'audio-1',
  type: 'audio',
  name: 'music.wav',
  layer: 3,
  startTime: 1,
  duration: 4,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  src: 'blob:audio',
  filePath: '/tmp/music.wav',
  volume: 1,
  muted: false,
  ...patch,
});

const baseAudioVisualisation = (patch: Partial<AudioVisualizationObject> = {}): AudioVisualizationObject => ({
  id: 'waveform-1',
  type: 'audio_visualization',
  name: 'Audio waveform R',
  layer: 4,
  startTime: 1,
  duration: 4,
  x: 320,
  y: 240,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 320,
  endY: 240,
  easing: 'linear',
  targetAudioId: 'audio-1',
  visualizationType: 'waveform',
  color: '#00ff00',
  thickness: 2,
  width: 640,
  height: 120,
  amplitude: 1,
  ...patch,
});

const baseParticle = (patch: Partial<ParticleObject> = {}): ParticleObject => ({
  id: 'particle-1',
  type: 'particle',
  name: '標準パーティクル',
  layer: 5,
  startTime: 1,
  duration: 4,
  x: 960,
  y: 540,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.8,
  enableAnimation: false,
  endX: 960,
  endY: 540,
  easing: 'linear',
  width: 640,
  height: 360,
  particleCount: 32,
  seed: 93,
  spread: 180,
  speed: 120,
  size: 6,
  colour: '#ffffff',
  lifetimeSeconds: 1.5,
  ...patch,
});

const baseBarcode = (patch: Partial<BarcodeObject> = {}): BarcodeObject => ({
  id: 'barcode-1',
  type: 'barcode',
  name: 'バーコードT',
  layer: 6,
  startTime: 1,
  duration: 4,
  x: 640,
  y: 360,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
  enableAnimation: false,
  endX: 640,
  endY: 360,
  easing: 'linear',
  width: 420,
  height: 160,
  data: 'AviUtl',
  minimumBarWidth: 2,
  horizontalMargin: 30,
  verticalMargin: 20,
  foregroundColour: '#000000',
  backgroundColour: '#ffffff',
  ...patch,
});

const basePuzzlePiece = (patch: Partial<PuzzlePieceObject> = {}): PuzzlePieceObject => ({
  id: 'puzzle-1',
  type: 'puzzle_piece',
  name: 'パズルピース',
  layer: 7,
  startTime: 1,
  duration: 4,
  x: 840,
  y: 420,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.85,
  enableAnimation: false,
  endX: 840,
  endY: 420,
  easing: 'linear',
  width: 240,
  height: 240,
  size: 120,
  shapeVariant: 1,
  connectorMode: 'convex',
  fillColour: '#ffffff',
  ...patch,
});

const baseColourWheel = (patch: Partial<ColourWheelObject> = {}): ColourWheelObject => ({
  id: 'colour-wheel-1',
  type: 'colour_wheel',
  name: '色相環',
  layer: 8,
  startTime: 1,
  duration: 4,
  x: 840,
  y: 420,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
  enableAnimation: false,
  endX: 840,
  endY: 420,
  easing: 'linear',
  width: 240,
  height: 240,
  radius: 120,
  saturation: 100,
  brightness: 100,
  ringWidthPercent: 25,
  segmentCount: 24,
  ...patch,
});

const baseGourd = (patch: Partial<GourdObject> = {}): GourdObject => ({
  id: 'gourd-1',
  type: 'gourd',
  name: 'ひょうたんTM',
  layer: 9,
  startTime: 1,
  duration: 4,
  x: 760,
  y: 340,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
  enableAnimation: false,
  endX: 760,
  endY: 340,
  easing: 'linear',
  width: 400,
  height: 400,
  bodyRadius: 80,
  bodyWidth: 250,
  waistRadius: 10,
  squashPercent: 40,
  repeatCount: 1,
  fillColour: '#ffffff',
  ...patch,
});

const baseGear = (patch: Partial<GearObject> = {}): GearObject => ({
  id: 'gear-1',
  type: 'gear',
  name: '歯車',
  layer: 10,
  startTime: 1,
  duration: 4,
  x: 800,
  y: 380,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
  enableAnimation: false,
  endX: 800,
  endY: 380,
  easing: 'linear',
  width: 320,
  height: 320,
  outerRadius: 160,
  innerRadiusPercent: 45,
  toothCount: 20,
  toothDepthPercent: 18,
  toothSkewPercent: 0,
  fillColour: '#ffffff',
  ...patch,
});

const baseTrackBar = (patch: Partial<TrackBarObject> = {}): TrackBarObject => ({
  id: 'track-bar-1',
  type: 'track_bar',
  name: 'カスタムトラックバー',
  layer: 11,
  startTime: 1,
  duration: 4,
  x: 780,
  y: 480,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
  enableAnimation: false,
  endX: 780,
  endY: 480,
  easing: 'linear',
  width: 360,
  height: 120,
  trackValues: [0, 25, 50, -50],
  trackRanges: [[0, 100], [0, 100], [0, 100], [-100, 100]],
  labels: ['TrackA', 'TrackB', 'TrackC', 'TrackD'],
  barColour: '#ffffff',
  backgroundOpacity: 0.05,
  ...patch,
});

const basePieChart = (patch: Partial<PieChartObject> = {}): PieChartObject => ({
  id: 'pie-chart-1',
  type: 'pie_chart',
  name: 'パイシートグラフ',
  layer: 12,
  startTime: 1,
  duration: 4,
  x: 760,
  y: 340,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
  enableAnimation: false,
  endX: 760,
  endY: 340,
  easing: 'linear',
  width: 400,
  height: 400,
  values: [10, 20, 30, 40],
  sortMode: 'descending',
  normaliseToHundred: true,
  labelMode: 'percentage',
  progressPercent: 100,
  strokeWidth: 20,
  sliceColours: ['#389ba6', '#f2e2c4', '#f29422', '#f27830', '#f24b0f'],
  ...patch,
});

const baseHistogram = (patch: Partial<HistogramObject> = {}): HistogramObject => ({
  id: 'histogram-1',
  type: 'histogram',
  name: '簡易ヒストグラム',
  layer: 13,
  startTime: 1,
  duration: 4,
  x: 832,
  y: 440,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
  enableAnimation: false,
  endX: 832,
  endY: 440,
  easing: 'linear',
  width: 256,
  height: 200,
  binValues: [0.08, 0.18, 0.32, 0.55, 0.78, 0.92, 0.64, 0.36],
  heightScalePercent: 100,
  lineWidth: 1,
  showLuminance: true,
  showRed: true,
  showGreen: true,
  showBlue: true,
  channelColours: ['#ffffff', '#ff4b4b', '#4bff6a', '#4b8cff'],
  backgroundColour: '#000000',
  ...patch,
});

const baseSunburst = (patch: Partial<SunburstObject> = {}): SunburstObject => ({
  id: 'sunburst-1',
  type: 'sunburst',
  name: '日の出',
  layer: 14,
  startTime: 1,
  duration: 4,
  x: 560,
  y: 315,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
  enableAnimation: false,
  endX: 560,
  endY: 315,
  easing: 'linear',
  width: 800,
  height: 450,
  rayCount: 10,
  rayCoveragePercent: 50,
  rotationOffsetDegrees: 0,
  centreXPercent: 50,
  centreYPercent: 50,
  motifSize: 200,
  motifShape: 'circle',
  rayColour: '#ff0000',
  backgroundColour: '#ffff00',
  ...patch,
});

describe('buildRustSceneSnapshotForTimeline', () => {
  it('builds a solid colour plane for active rectangle shapes', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseShape()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    expect(result.snapshot.clips).toEqual([
      {
        clip_id: 'shape-1',
        track_id: 'layer-0',
        media_id: 'shape-1',
        source_frame: 0,
        z_index: 0,
        transform: {
          translation_x: 300,
          translation_y: 120,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'nearest',
        },
        opacity: 0.5,
        effects: [],
      },
    ]);
    expect(result.media).toEqual([
      {
        id: 'shape-1',
        kind: 'SolidColour',
        source: '#ff0000',
        width: 200,
        height: 100,
      },
    ]);
  });

  it('ignores active audio objects while building the visual Rust scene snapshot', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseShape(), baseAudio()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected audio-backed visual snapshot to pass');

    expect(result.snapshot.clips.map((clip) => clip.clip_id)).toEqual(['shape-1']);
    expect(result.media.map((reference) => reference.id)).toEqual(['shape-1']);
  });

  it('builds a generated Audio waveform R media plane from an audio visualisation object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseAudio(), baseAudioVisualisation()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated audio waveform snapshot to pass');

    expect(result.snapshot.clips).toEqual([
      {
        clip_id: 'waveform-1',
        track_id: 'layer-4',
        media_id: 'waveform-1',
        source_frame: 60,
        z_index: 0,
        transform: {
          translation_x: 320,
          translation_y: 240,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'bilinear',
        },
        opacity: 1,
        effects: [],
      },
    ]);
    expect(result.media).toEqual([
      {
        id: 'waveform-1',
        kind: 'GeneratedAudioWaveform',
        source: JSON.stringify({
          generator: 'audio-waveform-r',
          target_audio_id: 'audio-1',
          target_source: '/tmp/music.wav',
          sample_window_seconds: 0.05,
          colour: '#00ff00',
          thickness: 2,
          amplitude: 1,
        }),
        width: 640,
        height: 120,
      },
    ]);
  });

  it('builds a generated standard particle media plane from a particle object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseParticle()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated particle snapshot to pass');

    expect(result.snapshot.clips).toEqual([
      {
        clip_id: 'particle-1',
        track_id: 'layer-5',
        media_id: 'particle-1',
        source_frame: 60,
        z_index: 0,
        transform: {
          translation_x: 960,
          translation_y: 540,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'bilinear',
        },
        opacity: 0.8,
        effects: [],
      },
    ]);
    expect(result.media).toEqual([
      {
        id: 'particle-1',
        kind: 'GeneratedParticle',
        source: JSON.stringify({
          generator: 'standard-particle',
          seed: 93,
          particle_count: 32,
          spread: 180,
          speed: 120,
          size: 6,
          colour: '#ffffff',
          lifetime_seconds: 1.5,
        }),
        width: 640,
        height: 360,
      },
    ]);
  });

  it('builds a generated barcode media plane from a barcode object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseBarcode()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated barcode snapshot to pass');

    expect(result.snapshot.clips).toEqual([
      {
        clip_id: 'barcode-1',
        track_id: 'layer-6',
        media_id: 'barcode-1',
        source_frame: 0,
        z_index: 0,
        transform: {
          translation_x: 640,
          translation_y: 360,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'bilinear',
        },
        opacity: 0.9,
        effects: [],
      },
    ]);
    expect(result.media).toEqual([
      {
        id: 'barcode-1',
        kind: 'GeneratedBarcode',
        source: JSON.stringify({
          generator: 'barcode-t',
          data: 'AviUtl',
          minimum_bar_width: 2,
          horizontal_margin: 30,
          vertical_margin: 20,
          foreground_colour: '#000000',
          background_colour: '#ffffff',
        }),
        width: 420,
        height: 160,
      },
    ]);
  });

  it('builds a generated puzzle piece media plane from a puzzle piece object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [basePuzzlePiece()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated puzzle piece snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'puzzle-1',
      track_id: 'layer-7',
      media_id: 'puzzle-1',
      source_frame: 0,
      opacity: 0.85,
    });
    expect(result.media).toEqual([
      {
        id: 'puzzle-1',
        kind: 'GeneratedPuzzlePiece',
        source: JSON.stringify({
          generator: 'puzzle-piece',
          size: 120,
          shape_variant: 1,
          connector_mode: 'convex',
          fill_colour: '#ffffff',
        }),
        width: 240,
        height: 240,
      },
    ]);
  });

  it('builds a generated colour wheel media plane from a colour wheel object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseColourWheel()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated colour wheel snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'colour-wheel-1',
      track_id: 'layer-8',
      media_id: 'colour-wheel-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'colour-wheel-1',
        kind: 'GeneratedColourWheel',
        source: JSON.stringify({
          generator: 'colour-wheel',
          radius: 120,
          saturation: 100,
          brightness: 100,
          ring_width_percent: 25,
          segment_count: 24,
        }),
        width: 240,
        height: 240,
      },
    ]);
  });

  it('builds a generated gourd media plane from a gourd object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseGourd()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated gourd snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'gourd-1',
      track_id: 'layer-9',
      media_id: 'gourd-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'gourd-1',
        kind: 'GeneratedGourd',
        source: JSON.stringify({
          generator: 'gourd-tm',
          body_radius: 80,
          body_width: 250,
          waist_radius: 10,
          squash_percent: 40,
          repeat_count: 1,
          fill_colour: '#ffffff',
        }),
        width: 400,
        height: 400,
      },
    ]);
  });

  it('builds a generated gear media plane from a gear object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseGear()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated gear snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'gear-1',
      track_id: 'layer-10',
      media_id: 'gear-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'gear-1',
        kind: 'GeneratedGear',
        source: JSON.stringify({
          generator: 'gear-t',
          outer_radius: 160,
          inner_radius_percent: 45,
          tooth_count: 20,
          tooth_depth_percent: 18,
          tooth_skew_percent: 0,
          fill_colour: '#ffffff',
        }),
        width: 320,
        height: 320,
      },
    ]);
  });

  it('builds a generated track bar media plane from a track bar object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseTrackBar()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated track bar snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'track-bar-1',
      track_id: 'layer-11',
      media_id: 'track-bar-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'track-bar-1',
        kind: 'GeneratedTrackBar',
        source: JSON.stringify({
          generator: 'custom-track-bar',
          track_values: [0, 25, 50, -50],
          track_ranges: [[0, 100], [0, 100], [0, 100], [-100, 100]],
          labels: ['TrackA', 'TrackB', 'TrackC', 'TrackD'],
          bar_colour: '#ffffff',
          background_opacity: 0.05,
        }),
        width: 360,
        height: 120,
      },
    ]);
  });

  it('builds a generated pie chart media plane from a pie chart object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [basePieChart()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated pie chart snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'pie-chart-1',
      track_id: 'layer-12',
      media_id: 'pie-chart-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'pie-chart-1',
        kind: 'GeneratedPieChart',
        source: JSON.stringify({
          generator: 'pie-sheet-graph',
          values: [10, 20, 30, 40],
          sort_mode: 'descending',
          normalise_to_hundred: true,
          label_mode: 'percentage',
          progress_percent: 100,
          stroke_width: 20,
          slice_colours: ['#389ba6', '#f2e2c4', '#f29422', '#f27830', '#f24b0f'],
        }),
        width: 400,
        height: 400,
      },
    ]);
  });

  it('builds a generated histogram media plane from a histogram object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseHistogram()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated histogram snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'histogram-1',
      track_id: 'layer-13',
      media_id: 'histogram-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'histogram-1',
        kind: 'GeneratedHistogram',
        source: JSON.stringify({
          generator: 'simple-histogram',
          bin_values: [0.08, 0.18, 0.32, 0.55, 0.78, 0.92, 0.64, 0.36],
          height_scale_percent: 100,
          line_width: 1,
          show_luminance: true,
          show_red: true,
          show_green: true,
          show_blue: true,
          channel_colours: ['#ffffff', '#ff4b4b', '#4bff6a', '#4b8cff'],
          background_colour: '#000000',
        }),
        width: 256,
        height: 200,
      },
    ]);
  });

  it('builds a generated sunburst media plane from a sunrise object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseSunburst()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated sunburst snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'sunburst-1',
      track_id: 'layer-14',
      media_id: 'sunburst-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'sunburst-1',
        kind: 'GeneratedSunburst',
        source: JSON.stringify({
          generator: 'sunrise',
          ray_count: 10,
          ray_coverage_percent: 50,
          rotation_offset_degrees: 0,
          centre_x_percent: 50,
          centre_y_percent: 50,
          motif_size: 200,
          motif_shape: 'circle',
          ray_colour: '#ff0000',
          background_colour: '#ffff00',
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('builds a generated gradient plane for active rectangle shapes', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseShape({
        id: 'gradient-1',
        gradient: {
          enabled: true,
          type: 'linear',
          colours: ['#ff0000', '#0000ff'],
          stops: [0, 1],
          direction: 90,
        },
      })],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    expect(result.media).toEqual([
      {
        id: 'gradient-1',
        kind: 'GeneratedGradient',
        source: JSON.stringify({
          type: 'linear',
          colours: ['#ff0000', '#0000ff'],
          stops: [0, 1],
          direction: 90,
        }),
        width: 200,
        height: 100,
      },
    ]);
    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'gradient-1',
      media_id: 'gradient-1',
      transform: {
        sampling: 'bilinear',
      },
    });
  });

  it('builds a rust-core compatible scene snapshot for active image and video planes', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseImage(), baseVideo()],
      time: 2.5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    expect(result.snapshot).toEqual({
      frame_index: 150,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [
        {
          clip_id: 'video-1',
          track_id: 'layer-1',
          media_id: 'video-1',
          source_frame: 210,
          z_index: 0,
          transform: {
            translation_x: 10,
            translation_y: 20,
            scale_x: 1,
            scale_y: 1,
            rotation_degrees: 0,
            sampling: 'bilinear',
          },
          opacity: 1,
          effects: [],
        },
        {
          clip_id: 'image-1',
          track_id: 'layer-2',
          media_id: 'image-1',
          source_frame: 0,
          z_index: 1,
          transform: {
            translation_x: 100,
            translation_y: 200,
            scale_x: 1,
            scale_y: 1,
            rotation_degrees: 0,
            sampling: 'bilinear',
          },
          opacity: 0.75,
          effects: [],
        },
      ],
    });
    expect(result.media).toEqual([
      {
        id: 'video-1',
        kind: 'Video',
        source: '/tmp/video.mp4',
        width: 1280,
        height: 720,
        source_rate: {
          numerator: 60,
          denominator: 1,
        },
      },
      {
        id: 'image-1',
        kind: 'Image',
        source: '/tmp/image.png',
        width: 640,
        height: 360,
      },
    ]);
  });

  it('passes scaled canvas media transforms through to the Rust scene snapshot', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [
        baseShape({
          id: 'shape-scaled',
          scaleX: 2,
          scaleY: 3,
        }),
        baseImage({
          id: 'image-scaled',
          scaleX: 0.5,
          scaleY: 0.75,
        }),
        basePsd({
          id: 'psd-scaled',
          scaleX: 1.25,
          scaleY: 1.25,
        }),
      ],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected scaled canvas media snapshot to pass');

    expect(result.snapshot.clips.map((clip) => ({
      clipId: clip.clip_id,
      scaleX: clip.transform.scale_x,
      scaleY: clip.transform.scale_y,
    }))).toEqual([
      { clipId: 'shape-scaled', scaleX: 2, scaleY: 3 },
      { clipId: 'image-scaled', scaleX: 0.5, scaleY: 0.75 },
      { clipId: 'psd-scaled', scaleX: 1.25, scaleY: 1.25 },
    ]);
  });

  it('passes sub-pixel canvas media translations through to the Rust scene snapshot', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [
        baseShape({
          id: 'shape-subpixel',
          x: 300.5,
          y: 120.25,
        }),
        baseImage({
          id: 'image-subpixel',
          x: 100.5,
          y: 200.25,
        }),
        basePsd({
          id: 'psd-subpixel',
          x: 400.5,
          y: 120.25,
        }),
        baseVideo({
          id: 'video-subpixel',
          x: 10.5,
          y: 20.25,
        }),
      ],
      time: 2.5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected sub-pixel canvas media snapshot to pass');

    expect(result.snapshot.clips.map((clip) => ({
      clipId: clip.clip_id,
      x: clip.transform.translation_x,
      y: clip.transform.translation_y,
    }))).toEqual([
      { clipId: 'shape-subpixel', x: 300.5, y: 120.25 },
      { clipId: 'video-subpixel', x: 10.5, y: 20.25 },
      { clipId: 'image-subpixel', x: 100.5, y: 200.25 },
      { clipId: 'psd-subpixel', x: 400.5, y: 120.25 },
    ]);
  });

  it('keeps scaled video planes inside the Rust scene snapshot', () => {
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [baseVideo({
        scaleX: 0.5,
        scaleY: 0.25,
      })],
      time: 2.5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected scaled video snapshot build to pass');

    expect(result.snapshot.clips[0].transform).toMatchObject({
      scale_x: 0.5,
      scale_y: 0.25,
    });
  });

  it('uses an existing proxy file as the Rust video media source for preview decode', () => {
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [baseVideo({
        filePath: '/tmp/original-4k.mp4',
        proxyFilePath: '/tmp/original-4k.proxy.mp4',
        width: 1280,
        height: 720,
      })],
      time: 2.5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');
    expect(result.media).toEqual([expect.objectContaining({
      id: 'video-1',
      kind: 'Video',
      source: '/tmp/original-4k.proxy.mp4',
      width: 1280,
      height: 720,
    })]);
  });

  it('uses original video media at display dimensions for export', () => {
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [baseVideo({
        filePath: '/tmp/original-4k.mp4',
        proxyFilePath: '/tmp/original-4k.proxy.mp4',
        width: 640,
        height: 360,
      sourceWidth: 3840,
      sourceHeight: 2160,
      })],
      time: 2.5,
      videoSourceMode: 'exportOriginal',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected export snapshot build to pass');
    expect(result.media).toEqual([expect.objectContaining({
      id: 'video-1',
      kind: 'Video',
      source: '/tmp/original-4k.mp4',
      width: 640,
      height: 360,
    })]);
    expect(result.snapshot.clips[0].transform).toMatchObject({
      scale_x: 1,
      scale_y: 1,
    });
  });

  it('builds a rust-core compatible media reference for active PSD planes', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [basePsd()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    expect(result.snapshot.clips).toEqual([
      {
        clip_id: 'psd-1',
        track_id: 'layer-2',
        media_id: 'psd-1',
        source_frame: 0,
        z_index: 0,
        transform: {
          translation_x: 400,
          translation_y: 120,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'bilinear',
        },
        opacity: 0.9,
        effects: [],
      },
    ]);
    expect(result.media).toEqual([
      {
        id: 'psd-1',
        kind: 'Psd',
        source: '/tmp/standing.psd',
        width: 512,
        height: 768,
        active_layer_ids: ['face-open'],
      },
    ]);
  });

  it('serialises PSD active layer ids deterministically for Rust native composition', () => {
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [basePsd({
        activeLayerIds: {
          'mouth-open': true,
          'mouth-closed': false,
          root: true,
          'eye-open': true,
        },
      })],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    expect(result.media).toEqual([
      expect.objectContaining({
        id: 'psd-1',
        kind: 'Psd',
        active_layer_ids: ['eye-open', 'mouth-open', 'root'],
      }),
    ]);
  });

  it('uses evaluated position animation and fade opacity while ignoring inactive or hidden clips', () => {
    const layers = createDefaultLayers();
    layers[4] = { ...layers[4], visible: false };
    const active = baseImage({
      id: 'animated',
      layer: 3,
      x: 0,
      y: 10,
      endX: 100,
      endY: 210,
      enableAnimation: true,
      filters: [
        {
          id: 'fade-1',
          type: 'fade',
          enabled: true,
          params: { opacity: 0.5 },
        },
      ],
    });
    const hidden = baseImage({ id: 'hidden', layer: 4 });
    const inactive = baseImage({ id: 'inactive', startTime: 10, layer: 5 });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [hidden, active, inactive],
      time: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    expect(result.snapshot.clips).toHaveLength(1);
    expect(result.snapshot.clips[0].clip_id).toBe('animated');
    expect(result.snapshot.clips[0].transform.translation_x).toBe(50);
    expect(result.snapshot.clips[0].transform.translation_y).toBe(110);
    expect(result.snapshot.clips[0].opacity).toBe(0.375);
  });

  it('carries finite object rotation into the Rust scene transform', () => {
    const layers = createDefaultLayers();
    const rotated = baseImage({
      id: 'rotated',
      rotation: 90,
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [rotated],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected rotated snapshot build to pass');

    expect(result.snapshot.clips[0].transform.rotation_degrees).toBe(90);
  });

  it('serialises colour aberration filters as Rust scene effects', () => {
    const layers = createDefaultLayers();
    const aberrated = baseImage({
      id: 'aberrated',
      filters: [
        {
          id: 'ca-1',
          type: 'colour_aberration',
          enabled: true,
          params: { offsetX: 3, offsetY: 1 },
        },
      ],
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [aberrated],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected colour aberration snapshot build to pass');
    expect(result.snapshot.clips[0].effects).toEqual([
      { ColourAberration: { offset_x: 3, offset_y: 1 } },
    ]);
  });

  it('serialises outline filters as Rust scene effects', () => {
    const layers = createDefaultLayers();
    const outlined = baseImage({
      id: 'outlined',
      filters: [
        {
          id: 'outline-1',
          type: 'outline',
          enabled: true,
          params: { colour: '#112233', thickness: 4, opacity: 0.75 },
        },
      ],
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [outlined],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected outline snapshot build to pass');
    expect(result.snapshot.clips[0].effects).toEqual([
      {
        Outline: {
          colour: [0x11 / 255, 0x22 / 255, 0x33 / 255],
          thickness: 4,
          opacity: 0.75,
        },
      },
    ]);
  });

  it('serialises wipe filters as evaluated Rust scene effects', () => {
    const layers = createDefaultLayers();
    const wiped = baseImage({
      id: 'wiped',
      startTime: 1,
      duration: 4,
      filters: [
        {
          id: 'wipe-1',
          type: 'wipe',
          enabled: true,
          params: { edge: 'left', reverse: false },
        },
      ],
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [wiped],
      time: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected wipe snapshot build to pass');
    expect(result.snapshot.clips[0].effects).toEqual([
      {
        Wipe: {
          edge: 'left',
          progress: 0.5,
        },
      },
    ]);
  });

  it('serialises clipping filters as Rust scene effects', () => {
    const layers = createDefaultLayers();
    const clipped = baseImage({
      id: 'clipped',
      filters: [
        {
          id: 'clip-1',
          type: 'clipping',
          enabled: true,
          params: { top: 1, bottom: 2, left: 3, right: 4, angle: 45, radius: 0 },
        },
      ],
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [clipped],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected clipping snapshot build to pass');
    expect(result.snapshot.clips[0].effects).toEqual([
      {
        Clipping: {
          top: 1,
          bottom: 2,
          left: 3,
          right: 4,
          angle_degrees: 45,
        },
      },
    ]);
  });

  it('fails loud for visible Pixi features the shared renderer cannot represent yet', () => {
    const layers = createDefaultLayers();
    const unsupportedText: TimelineObject = {
      id: 'text-1',
      type: 'text',
      name: 'title',
      layer: 0,
      startTime: 0,
      duration: 5,
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      enableAnimation: false,
      endX: 0,
      endY: 0,
      easing: 'linear',
      text: 'hello',
      fontSize: 24,
      fontFamily: 'Arial',
      fill: '#ffffff',
    };
    const blurred = baseImage({
      id: 'blurred',
      filters: [
        {
          id: 'blur-1',
          type: 'blur',
          enabled: true,
          params: { strength: 4, quality: 2 },
        },
      ],
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [unsupportedText, blurred],
      time: 2,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected snapshot build to fail');

    expect(issueCodes(result.issues)).toEqual([
      'unsupportedObjectType',
      'unsupportedFilter',
    ]);
  });

  it('fails loud for shape geometry outside the first shared renderer rectangle envelope', () => {
    const layers = createDefaultLayers();
    const circle = baseShape({
      id: 'circle',
      shapeType: 'circle',
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [circle],
      time: 2,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected snapshot build to fail');

    expect(issueCodes(result.issues)).toEqual(['unsupportedShapeGeometry']);
  });

  it('fails loud for Pixi group composition and mask semantics', () => {
    const layers = createDefaultLayers();
    const grouped = baseImage({
      id: 'grouped',
      groupId: 'group-a',
    });
    const clippingMask = baseImage({
      id: 'clipping-mask',
      clipping: true,
    });
    const groupedGradient = baseImage({
      id: 'group-gradient',
      groupGradient: {
        enabled: true,
        type: 'linear',
        colours: ['#ffffff', '#000000'],
        stops: [0, 1],
        direction: 0,
      },
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [grouped, clippingMask, groupedGradient],
      time: 2,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected snapshot build to fail');

    expect(issueCodes(result.issues)).toEqual([
      'unsupportedGroupComposition',
      'unsupportedMask',
      'unsupportedGroupComposition',
    ]);
  });

  it('fails loud for non-finite transform sampling outside the proven migration envelope', () => {
    const layers = createDefaultLayers();
    const nonFinite = baseImage({
      id: 'non-finite',
      x: Number.NaN,
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [nonFinite],
      time: 2,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected snapshot build to fail');

    expect(issueCodes(result.issues)).toEqual(['unsupportedTransform']);
  });
});

const issueCodes = (issues: RustSceneSnapshotBuildIssue[]) =>
  issues.map((issue) => issue.code);
