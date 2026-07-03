import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  AudioObject,
  AudioVisualizationObject,
  AsanohaPatternObject,
  BaseObject,
  BarcodeObject,
  CircularArrowObject,
  ColourWheelObject,
  FocusLinesPlusObject,
  GearObject,
  GourdObject,
  HistogramObject,
  HologramObject,
  ImageObject,
  LayerState,
  ParticleObject,
  PieChartObject,
  PlainEffectorLineObject,
  ProtractorObject,
  ProjectSettings,
  PsdObject,
  PuzzlePieceObject,
  RandomLineExObject,
  ShakingPolygonObject,
  ShapeObject,
  SunburstObject,
  TartanCheckObject,
  HoundstoothObject,
  PaperAirplaneObject,
  YagasuriObject,
  TimelineObject,
  TrackBarObject,
  TriangleBracketObject,
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
  const histogram: HistogramObject = {
    ...baseObject('simple-histogram', 'histogram', 18),
    type: 'histogram',
    name: '簡易ヒストグラム',
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
  };
  const sunburst: SunburstObject = {
    ...baseObject('ssd-sunburst', 'sunburst', 19),
    type: 'sunburst',
    name: '日の出',
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
  };
  const circularArrow: CircularArrowObject = {
    ...baseObject('ssd-circular-arrow', 'circular_arrow', 20),
    type: 'circular_arrow',
    name: '円矢印',
    width: 200,
    height: 200,
    radius: 100,
    lineWidth: 20,
    headSize: 50,
    angleDegrees: 260,
    centreAngleDegrees: 0,
    headShape: 'triangle',
    showTailHead: false,
    flipVertical: false,
    flipHorizontal: false,
    arrowColour: '#ffff00',
  };
  const triangleBracket: TriangleBracketObject = {
    ...baseObject('ssd-triangle-bracket', 'triangle_bracket', 21),
    type: 'triangle_bracket',
    name: '三角括弧',
    width: 160,
    height: 100,
    bracketWidth: 100,
    angleDegrees: 120,
    armLength: 50,
    offsetDistance: 0,
    bracketColour: '#ffffff',
  };
  const tartanCheck: TartanCheckObject = {
    ...baseObject('ssd-tartan-check', 'tartan_check', 22),
    type: 'tartan_check',
    name: 'タータンチェック',
    width: 800,
    height: 450,
    tileSize: 100,
    blurRadius: 1,
    baseColour: '#143e10',
    stripeColourA: '#a81616',
    stripeColourB: '#c9c526',
    lineColour: '#000000',
  };
  const houndstooth: HoundstoothObject = {
    ...baseObject('ssd-houndstooth', 'houndstooth', 23),
    type: 'houndstooth',
    name: '千鳥格子',
    width: 800,
    height: 450,
    patternSize: 50,
    foregroundColour: '#000000',
    backgroundColour: '#ffffff',
  };
  const yagasuri: YagasuriObject = {
    ...baseObject('ssd-yagasuri', 'yagasuri', 24),
    type: 'yagasuri',
    name: '矢がすり',
    width: 800,
    height: 450,
    arrowWidth: 15,
    arrowHeight: 65,
    lineWidth: 2,
    staggered: true,
    foregroundColour: '#000000',
    backgroundColour: '#ffffff',
  };
  const paperAirplane: PaperAirplaneObject = {
    ...baseObject('ssd-paper-airplane', 'paper_airplane', 25),
    type: 'paper_airplane',
    name: '紙飛行機',
    width: 320,
    height: 240,
    bodyLength: 200,
    wingWidth: 80,
    foldHeight: 50,
    gap: 50,
    followMotionDirection: false,
    axisMode: 0,
    fillColour: '#ffffff',
  };
  const asanohaPattern: AsanohaPatternObject = {
    ...baseObject('ssd-asanoha-pattern', 'asanoha_pattern', 26),
    type: 'asanoha_pattern',
    name: '麻の葉模様',
    width: 800,
    height: 450,
    patternSize: 50,
    lineWidth: 2,
    foregroundColour: '#000000',
    backgroundColour: '#ffffff',
  };
  const focusLinesPlus: FocusLinesPlusObject = {
    ...baseObject('ssd-focus-lines-plus', 'focus_lines_plus', 27),
    type: 'focus_lines_plus',
    name: '集中線plus',
    width: 800,
    height: 450,
    rayWidth: 1,
    gap: 5,
    centreRadius: 100,
    rotationDegrees: 0,
    centreX: 400,
    centreY: 225,
    centreJitterPercent: 20,
    seed: 0,
    keyframeInterval: 0,
    lineColour: '#ffffff',
  };
  const randomLineEx: RandomLineExObject = {
    ...baseObject('ssd-random-line-ex', 'random_line_ex', 28),
    type: 'random_line_ex',
    name: 'ランダムラインEX',
    width: 800,
    height: 450,
    lineCount: 3,
    lineWidth: 6,
    threshold: 128,
    noiseCellSize: 12,
    widthVariance: 0,
    seed: 0,
    lineColour: '#ffffff',
  };
  const plainEffectorLine: PlainEffectorLineObject = {
    ...baseObject('plain-effector-line-93', 'plain_effector_line', 29),
    type: 'plain_effector_line',
    name: '93 PlainEffector Line',
    width: 800,
    height: 450,
    radius: 100,
    strength: 1,
    randomness: 0,
    zoom: 1,
    invert: false,
    lineCount: 24,
    lineWidth: 2,
    colour: '#f74d52',
    colourAmount: 1,
    seed: 93,
  };
  const hologram: HologramObject = {
    ...baseObject('ssd-hologram', 'hologram', 30),
    type: 'hologram',
    name: 'ホログラム',
    width: 800,
    height: 450,
    tileSize: 80,
    rotationDegrees: 0,
    gradientAngleDegrees: -60,
    colourMode: 1,
    tintColour: '#ffffff',
  };
  const protractor: ProtractorObject = {
    ...baseObject('ssd-protractor', 'protractor', 31),
    type: 'protractor',
    name: '分度器',
    width: 420,
    height: 240,
    radius: 180,
    measuredAngleDegrees: 90,
    tickStepDegrees: 10,
    majorTickStepDegrees: 30,
    decimalPlaces: 1,
    lineColour: '#ffffff',
    textColour: '#ffffff',
    shadowColour: '#000000',
  };
  const shakingPolygon: ShakingPolygonObject = {
    ...baseObject('ssd-shaking-polygon', 'shaking_polygon', 32),
    type: 'shaking_polygon',
    name: '多角形_震える',
    width: 360,
    height: 360,
    lineWidth: 20,
    vertexCount: 3,
    fixedDiameter: 260,
    verticalDistortionPercent: 0,
    repeatCount: 1,
    repeatFrequency: 1,
    fill: false,
    jitterRange: 20,
    jitterInterval: 10,
    stepped: false,
    colour: '#ffffff',
    seed: 0,
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
    histogram,
    sunburst,
    circularArrow,
    triangleBracket,
    tartanCheck,
    houndstooth,
    yagasuri,
    paperAirplane,
    asanohaPattern,
    focusLinesPlus,
    randomLineEx,
    plainEffectorLine,
    hologram,
    protractor,
    shakingPolygon,
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
      'GeneratedHistogram',
      'GeneratedSunburst',
      'GeneratedCircularArrow',
      'GeneratedTriangleBracket',
      'GeneratedTartanCheck',
      'GeneratedHoundstooth',
      'GeneratedYagasuri',
      'GeneratedPaperAirplane',
      'GeneratedAsanohaPattern',
      'GeneratedFocusLinesPlus',
      'GeneratedRandomLineEx',
      'GeneratedPlainEffectorLine',
      'GeneratedHologram',
      'GeneratedProtractor',
      'GeneratedShakingPolygon',
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
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'simple-histogram')?.source ?? '{}')).toMatchObject({
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
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'ssd-sunburst')?.source ?? '{}')).toMatchObject({
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
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'ssd-circular-arrow')?.source ?? '{}')).toMatchObject({
      generator: 'circular-arrow',
      radius: 100,
      line_width: 20,
      head_size: 50,
      angle_degrees: 260,
      centre_angle_degrees: 0,
      head_shape: 'triangle',
      show_tail_head: false,
      flip_vertical: false,
      flip_horizontal: false,
      arrow_colour: '#ffff00',
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'ssd-triangle-bracket')?.source ?? '{}')).toMatchObject({
      generator: 'triangle-bracket',
      bracket_width: 100,
      angle_degrees: 120,
      arm_length: 50,
      offset_distance: 0,
      bracket_colour: '#ffffff',
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'ssd-tartan-check')?.source ?? '{}')).toMatchObject({
      generator: 'tartan-check',
      tile_size: 100,
      blur_radius: 1,
      base_colour: '#143e10',
      stripe_colour_a: '#a81616',
      stripe_colour_b: '#c9c526',
      line_colour: '#000000',
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'ssd-houndstooth')?.source ?? '{}')).toMatchObject({
      generator: 'houndstooth',
      pattern_size: 50,
      foreground_colour: '#000000',
      background_colour: '#ffffff',
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'ssd-yagasuri')?.source ?? '{}')).toMatchObject({
      generator: 'yagasuri',
      arrow_width: 15,
      arrow_height: 65,
      line_width: 2,
      staggered: true,
      foreground_colour: '#000000',
      background_colour: '#ffffff',
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'ssd-paper-airplane')?.source ?? '{}')).toMatchObject({
      generator: 'paper-airplane',
      body_length: 200,
      wing_width: 80,
      fold_height: 50,
      gap: 50,
      follow_motion_direction: false,
      axis_mode: 0,
      fill_colour: '#ffffff',
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'ssd-asanoha-pattern')?.source ?? '{}')).toMatchObject({
      generator: 'asanoha-pattern',
      pattern_size: 50,
      line_width: 2,
      foreground_colour: '#000000',
      background_colour: '#ffffff',
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'ssd-focus-lines-plus')?.source ?? '{}')).toMatchObject({
      generator: 'focus-lines-plus',
      ray_width: 1,
      gap: 5,
      centre_radius: 100,
      rotation_degrees: 0,
      centre_x: 400,
      centre_y: 225,
      centre_jitter_percent: 20,
      seed: 0,
      keyframe_interval: 0,
      line_colour: '#ffffff',
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'ssd-random-line-ex')?.source ?? '{}')).toMatchObject({
      generator: 'random-line-ex',
      line_count: 3,
      line_width: 6,
      threshold: 128,
      noise_cell_size: 12,
      width_variance: 0,
      seed: 0,
      line_colour: '#ffffff',
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'ssd-hologram')?.source ?? '{}')).toMatchObject({
      generator: 'hologram',
      tile_size: 80,
      rotation_degrees: 0,
      gradient_angle_degrees: -60,
      colour_mode: 1,
      tint_colour: '#ffffff',
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'ssd-protractor')?.source ?? '{}')).toMatchObject({
      generator: 'protractor',
      radius: 180,
      measured_angle_degrees: 90,
      tick_step_degrees: 10,
      major_tick_step_degrees: 30,
      decimal_places: 1,
      line_colour: '#ffffff',
      text_colour: '#ffffff',
      shadow_colour: '#000000',
    });
    expect(JSON.parse(snapshotResult.media.find((media) => media.id === 'ssd-shaking-polygon')?.source ?? '{}')).toMatchObject({
      generator: 'shaking-polygon',
      line_width: 20,
      vertex_count: 3,
      fixed_diameter: 260,
      vertical_distortion_percent: 0,
      repeat_count: 1,
      repeat_frequency: 1,
      fill: false,
      jitter_range: 20,
      jitter_interval: 10,
      stepped: false,
      colour: '#ffffff',
      seed: 0,
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
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'simple-histogram')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'ssd-sunburst')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'ssd-circular-arrow')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'ssd-triangle-bracket')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'ssd-tartan-check')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'ssd-houndstooth')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'ssd-yagasuri')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'ssd-paper-airplane')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'ssd-asanoha-pattern')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'ssd-focus-lines-plus')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'ssd-random-line-ex')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'ssd-hologram')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'ssd-protractor')?.source_frame).toBe(0);
    expect(snapshotResult.snapshot.clips.find((clip) => clip.clip_id === 'ssd-shaking-polygon')?.source_frame).toBe(60);
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
    expect(previewSession.plan.mode).toBe('sharedRenderer');
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
