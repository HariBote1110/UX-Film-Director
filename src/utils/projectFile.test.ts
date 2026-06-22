import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AsanohaPatternObject, AudioSphereObject, BarcodeObject, CircularArrowObject, ColourWheelObject, ContourTraceObject, FocusLinesPlusObject, GearObject, GetColorDotFieldObject, GourdObject, HistogramObject, HologramObject, HoundstoothObject, HksyCheckerGridObject, PaperAirplaneObject, ParticleObject, PieChartObject, ProjectSettings, ProtractorObject, PsdObject, PuzzlePieceObject, RandomLineExObject, ShakingPolygonObject, ShapeObject, SphericalFieldObject, SunburstObject, TartanCheckObject, ToneCurveObject, TrackBarObject, TriangleBracketObject, YagasuriObject } from '../types';
import { MAX_LAYERS } from '../components/timelineConstants';
import { createDefaultCamera, createDefaultLayers, createDefaultStageCamera3D } from './sceneState';
import { buildProjectFileData, parseProjectPayloadV2, restoreProjectObjects } from './projectFile';
import { parsePsdWithWasm } from './psdWasm';

vi.mock('./psdWasm', () => ({
  parsePsdWithWasm: vi.fn(),
}));

const mockedParsePsdWithWasm = vi.mocked(parsePsdWithWasm);

const projectSettings = (): ProjectSettings => ({
  width: 1920,
  height: 1080,
  fps: 30,
  sampleRate: 48000
});

const defaultStage = () => createDefaultStageCamera3D();

const minimalPsdWithWorldPlacement = (): PsdObject => ({
  id: 'psd-1',
  type: 'psd',
  name: 'Stand',
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
  src: 'blob:mock',
  width: 256,
  height: 512,
  scale: 1,
  worldPlacement: {
    enabled: true,
    position: { x: -1, y: 0, z: 2 },
    rotationYDeg: 15,
    scale: 1.2,
    billboard: true
  }
});

const minimalShape = (): ShapeObject => ({
  id: 'obj-1',
  type: 'shape',
  name: 'Box',
  layer: 0,
  startTime: 0,
  duration: 5,
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
  shapeType: 'rect',
  width: 4,
  height: 4,
  fill: '#111111'
});

const minimalParticle = (): ParticleObject => ({
  id: 'particle-1',
  type: 'particle',
  name: '標準パーティクル',
  layer: 2,
  startTime: 1,
  duration: 5,
  x: 640,
  y: 360,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 640,
  endY: 360,
  easing: 'linear',
  width: 640,
  height: 360,
  particleCount: 96,
  seed: 93,
  spread: 160,
  speed: 90,
  size: 4,
  colour: '#ffffff',
  lifetimeSeconds: 2,
});

const minimalBarcode = (): BarcodeObject => ({
  id: 'barcode-1',
  type: 'barcode',
  name: 'バーコードT',
  layer: 3,
  startTime: 1,
  duration: 5,
  x: 700,
  y: 450,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 700,
  endY: 450,
  easing: 'linear',
  width: 520,
  height: 180,
  data: 'AviUtl',
  minimumBarWidth: 2,
  horizontalMargin: 30,
  verticalMargin: 20,
  foregroundColour: '#000000',
  backgroundColour: '#ffffff',
});

const minimalPuzzlePiece = (): PuzzlePieceObject => ({
  id: 'puzzle-1',
  type: 'puzzle_piece',
  name: 'パズルピース',
  layer: 4,
  startTime: 1,
  duration: 5,
  x: 840,
  y: 420,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
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
});

const minimalColourWheel = (): ColourWheelObject => ({
  id: 'colour-wheel-1',
  type: 'colour_wheel',
  name: '色相環',
  layer: 5,
  startTime: 1,
  duration: 5,
  x: 840,
  y: 420,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
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
});

const minimalGourd = (): GourdObject => ({
  id: 'gourd-1',
  type: 'gourd',
  name: 'ひょうたんTM',
  layer: 6,
  startTime: 1,
  duration: 5,
  x: 760,
  y: 340,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
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
});

const minimalGear = (): GearObject => ({
  id: 'gear-1',
  type: 'gear',
  name: '歯車',
  layer: 7,
  startTime: 1,
  duration: 5,
  x: 800,
  y: 380,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
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
});

const minimalTrackBar = (): TrackBarObject => ({
  id: 'track-bar-1',
  type: 'track_bar',
  name: 'カスタムトラックバー',
  layer: 8,
  startTime: 1,
  duration: 5,
  x: 780,
  y: 480,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
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
});

const minimalPieChart = (): PieChartObject => ({
  id: 'pie-chart-1',
  type: 'pie_chart',
  name: 'パイシートグラフ',
  layer: 9,
  startTime: 1,
  duration: 5,
  x: 760,
  y: 340,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
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
});

const minimalHistogram = (): HistogramObject => ({
  id: 'histogram-1',
  type: 'histogram',
  name: '簡易ヒストグラム',
  layer: 10,
  startTime: 1,
  duration: 5,
  x: 832,
  y: 440,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
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
});

const minimalSunburst = (): SunburstObject => ({
  id: 'sunburst-1',
  type: 'sunburst',
  name: '日の出',
  layer: 11,
  startTime: 1,
  duration: 5,
  x: 560,
  y: 315,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
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
});

const minimalCircularArrow = (): CircularArrowObject => ({
  id: 'circular-arrow-1',
  type: 'circular_arrow',
  name: '円矢印',
  layer: 12,
  startTime: 1,
  duration: 5,
  x: 860,
  y: 440,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 860,
  endY: 440,
  easing: 'linear',
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
});

const minimalTriangleBracket = (): TriangleBracketObject => ({
  id: 'triangle-bracket-1',
  type: 'triangle_bracket',
  name: '三角括弧',
  layer: 13,
  startTime: 1,
  duration: 5,
  x: 880,
  y: 490,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 880,
  endY: 490,
  easing: 'linear',
  width: 160,
  height: 100,
  bracketWidth: 100,
  angleDegrees: 120,
  armLength: 50,
  offsetDistance: 0,
  bracketColour: '#ffffff',
});

const minimalTartanCheck = (): TartanCheckObject => ({
  id: 'tartan-check-1',
  type: 'tartan_check',
  name: 'タータンチェック',
  layer: 14,
  startTime: 1,
  duration: 5,
  x: 560,
  y: 315,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 560,
  endY: 315,
  easing: 'linear',
  width: 800,
  height: 450,
  tileSize: 100,
  blurRadius: 1,
  baseColour: '#143e10',
  stripeColourA: '#a81616',
  stripeColourB: '#c9c526',
  lineColour: '#000000',
});

const minimalHoundstooth = (): HoundstoothObject => ({
  id: 'houndstooth-1',
  type: 'houndstooth',
  name: '千鳥格子',
  layer: 15,
  startTime: 1,
  duration: 5,
  x: 560,
  y: 315,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 560,
  endY: 315,
  easing: 'linear',
  width: 800,
  height: 450,
  patternSize: 50,
  foregroundColour: '#000000',
  backgroundColour: '#ffffff',
});

const minimalYagasuri = (): YagasuriObject => ({
  id: 'yagasuri-1',
  type: 'yagasuri',
  name: '矢がすり',
  layer: 16,
  startTime: 1,
  duration: 5,
  x: 560,
  y: 315,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 560,
  endY: 315,
  easing: 'linear',
  width: 800,
  height: 450,
  arrowWidth: 15,
  arrowHeight: 65,
  lineWidth: 2,
  staggered: true,
  foregroundColour: '#000000',
  backgroundColour: '#ffffff',
});

const minimalPaperAirplane = (): PaperAirplaneObject => ({
  id: 'paper-airplane-1',
  type: 'paper_airplane',
  name: '紙飛行機',
  layer: 17,
  startTime: 1,
  duration: 5,
  x: 800,
  y: 420,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 800,
  endY: 420,
  easing: 'linear',
  width: 320,
  height: 240,
  bodyLength: 200,
  wingWidth: 80,
  foldHeight: 50,
  gap: 50,
  followMotionDirection: false,
  axisMode: 0,
  fillColour: '#ffffff',
});

const minimalAsanohaPattern = (): AsanohaPatternObject => ({
  id: 'asanoha-pattern-1',
  type: 'asanoha_pattern',
  name: '麻の葉模様',
  layer: 18,
  startTime: 1,
  duration: 5,
  x: 560,
  y: 315,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 560,
  endY: 315,
  easing: 'linear',
  width: 800,
  height: 450,
  patternSize: 50,
  lineWidth: 2,
  foregroundColour: '#000000',
  backgroundColour: '#ffffff',
});

const minimalFocusLinesPlus = (): FocusLinesPlusObject => ({
  id: 'focus-lines-plus-1',
  type: 'focus_lines_plus',
  name: '集中線plus',
  layer: 19,
  startTime: 1,
  duration: 5,
  x: 560,
  y: 315,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 560,
  endY: 315,
  easing: 'linear',
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
});

const minimalRandomLineEx = (): RandomLineExObject => ({
  id: 'random-line-ex-1',
  type: 'random_line_ex',
  name: 'ランダムラインEX',
  layer: 20,
  startTime: 1,
  duration: 5,
  x: 560,
  y: 315,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 560,
  endY: 315,
  easing: 'linear',
  width: 800,
  height: 450,
  lineCount: 3,
  lineWidth: 6,
  threshold: 128,
  noiseCellSize: 12,
  widthVariance: 0,
  seed: 0,
  lineColour: '#ffffff',
});

const minimalContourTrace = (): ContourTraceObject => ({
  id: 'contour-trace-1',
  type: 'contour_trace',
  name: '93 輪郭トレス',
  layer: 21,
  startTime: 1,
  duration: 5,
  x: 560,
  y: 315,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 560,
  endY: 315,
  easing: 'linear',
  width: 800,
  height: 450,
  lineWidth: 3,
  contourCount: 5,
  jitterAmount: 1.5,
  traceColour: '#ffffff',
  backgroundOpacity: 0,
  seed: 93,
});

const minimalHologram = (): HologramObject => ({
  id: 'hologram-1',
  type: 'hologram',
  name: 'ホログラム',
  layer: 21,
  startTime: 1,
  duration: 5,
  x: 560,
  y: 315,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 560,
  endY: 315,
  easing: 'linear',
  width: 800,
  height: 450,
  tileSize: 80,
  rotationDegrees: 0,
  gradientAngleDegrees: -60,
  colourMode: 1,
  tintColour: '#ffffff',
});

const minimalProtractor = (): ProtractorObject => ({
  id: 'protractor-1',
  type: 'protractor',
  name: '分度器',
  layer: 22,
  startTime: 1,
  duration: 5,
  x: 750,
  y: 420,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 750,
  endY: 420,
  easing: 'linear',
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
});

const minimalShakingPolygon = (): ShakingPolygonObject => ({
  id: 'shaking-polygon-1',
  type: 'shaking_polygon',
  name: '多角形_震える',
  layer: 23,
  startTime: 1,
  duration: 5,
  x: 780,
  y: 360,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 780,
  endY: 360,
  easing: 'linear',
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
});

const minimalToneCurve = (): ToneCurveObject => ({
  id: 'tone-curve-1',
  type: 'tone_curve',
  name: '簡易トーンカーブ',
  layer: 24,
  startTime: 1,
  duration: 5,
  x: 780,
  y: 360,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 780,
  endY: 360,
  easing: 'linear',
  width: 360,
  height: 360,
  gridDivisions: 4,
  lineWidth: 3,
  curvePoints: [0, 0.16, 0.42, 0.7, 1],
  curveColour: '#ffffff',
  gridColour: '#333333',
  backgroundColour: '#000000',
});

const minimalHksyCheckerGrid = (): HksyCheckerGridObject => ({
  id: 'hksy-checker-grid-1',
  type: 'hksy_checker_grid',
  name: 'hksy チェッカー/グリッド',
  layer: 25,
  startTime: 1,
  duration: 5,
  x: 560,
  y: 315,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 560,
  endY: 315,
  easing: 'linear',
  width: 800,
  height: 450,
  cellSize: 50,
  lineWidth: 2,
  checkerEnabled: true,
  gridEnabled: true,
  foregroundColour: '#ffffff',
  secondaryColour: '#333333',
  backgroundColour: '#000000',
  paletteColours: ['#ff5c8a', '#36c2ff', '#ffd166', '#70e000'],
});

const minimalGetColorDotField = (): GetColorDotFieldObject => ({
  id: 'getcolor-dot-field-1',
  type: 'getcolor_dot_field',
  name: 'GetColor V2R ドットフィールド',
  layer: 26,
  startTime: 1,
  duration: 5,
  x: 560,
  y: 315,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 560,
  endY: 315,
  easing: 'linear',
  width: 800,
  height: 450,
  columns: 32,
  rows: 18,
  dotSize: 14,
  sizeInfluence: 0.65,
  luminanceInfluence: 0.7,
  hueShiftDegrees: 0,
  alternateRows: true,
  foregroundColour: '#ffffff',
  secondaryColour: '#36c2ff',
  backgroundColour: '#000000',
  seed: 93,
});

const minimalAudioSphere = (): AudioSphereObject => ({
  id: 'audio-sphere-1',
  type: 'audio_sphere',
  name: '93 音声玉',
  layer: 27,
  startTime: 1,
  duration: 5,
  x: 720,
  y: 300,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 720,
  endY: 300,
  easing: 'linear',
  width: 480,
  height: 480,
  columns: 16,
  rows: 12,
  baseRadius: 170,
  audioInfluence: 0.6,
  pointSize: 5,
  polygonSize: 0.35,
  randomAmount: 0.05,
  colour: '#36c2ff',
  targetAudioId: 'audio-1',
  targetLayer: 26,
  sampleWindowSeconds: 0.1,
  seed: 93,
});

const minimalSphericalField = (): SphericalFieldObject => ({
  id: 'spherical-field-1',
  type: 'spherical_field',
  name: '93 SphericalField',
  layer: 28,
  startTime: 1,
  duration: 5,
  x: 720,
  y: 300,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 720,
  endY: 300,
  easing: 'linear',
  width: 480,
  height: 480,
  radius: 160,
  strength: 100,
  colourAmount: 100,
  alphaAmount: 0,
  lineWidth: 3,
  ringCount: 4,
  vectorCount: 16,
  fieldColour: '#ff3b30',
  secondaryColour: '#36c2ff',
  backgroundOpacity: 0.08,
  container: false,
  seed: 93,
});

describe('buildProjectFileData', () => {
  it('flushes active editor state into the matching scene and stamps metadata', () => {
    const layers = createDefaultLayers();
    const camera = createDefaultCamera();
    const scenes = [
      {
        id: 'scene-a',
        name: 'A',
        duration: 12,
        layers,
        objects: [] as ShapeObject[],
        camera: { ...camera, zoom: 1.25 },
        stageCamera3D: defaultStage()
      },
      {
        id: 'scene-b',
        name: 'B',
        duration: 8,
        layers: createDefaultLayers(),
        objects: [],
        camera,
        stageCamera3D: defaultStage()
      }
    ];
    const liveLayers = createDefaultLayers();
    liveLayers[0] = { ...liveLayers[0], name: 'Live edit' };
    const shape = minimalShape();
    const file = buildProjectFileData({
      projectSettings: projectSettings(),
      scenes,
      activeSceneId: 'scene-a',
      objects: [shape],
      layers: liveLayers,
      duration: 99,
      camera: { ...camera, zoom: 2 },
      stageCamera3D: defaultStage()
    });

    expect(file.format).toBe('uxfd-project');
    expect(file.version).toBe(2);
    expect(file.activeSceneId).toBe('scene-a');
    expect(file.scenes).toHaveLength(2);

    const active = file.scenes.find((s) => s.id === 'scene-a');
    const inactive = file.scenes.find((s) => s.id === 'scene-b');
    expect(active?.duration).toBe(99);
    expect(active?.camera.zoom).toBe(2);
    expect(active?.layers[0].name).toBe('Live edit');
    expect(active?.objects).toHaveLength(1);
    expect(active?.objects[0].id).toBe('obj-1');

    expect(inactive?.duration).toBe(8);
    expect(inactive?.camera.zoom).toBe(1);
  });

  it('clones layer rows and camera so mutations do not alias', () => {
    const layers = createDefaultLayers();
    const camera = createDefaultCamera();
    const scenes = [
      {
        id: 'only',
        name: 'Only',
        duration: 10,
        layers,
        objects: [] as ShapeObject[],
        camera,
        stageCamera3D: defaultStage()
      }
    ];
    const file = buildProjectFileData({
      projectSettings: projectSettings(),
      scenes,
      activeSceneId: 'only',
      objects: [],
      layers,
      duration: 10,
      camera,
      stageCamera3D: defaultStage()
    });
    expect(file.scenes[0].layers).not.toBe(layers);
    expect(file.scenes[0].layers).toHaveLength(MAX_LAYERS);
    expect(file.scenes[0].camera).not.toBe(camera);
  });
});

describe('parseProjectPayloadV2', () => {
  beforeEach(() => {
    mockedParsePsdWithWasm.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips PSD worldPlacement through JSON payload', () => {
    const layers = createDefaultLayers();
    const camera = createDefaultCamera();
    const psd = minimalPsdWithWorldPlacement();
    const file = buildProjectFileData({
      projectSettings: { ...projectSettings(), editorMode: '3d_stage' },
      scenes: [
        {
          id: 's1',
          name: 'One',
          duration: 10,
          layers,
          objects: [psd],
          camera,
          stageCamera3D: {
            position: { x: 0, y: 3, z: 8 },
            target: { x: 0, y: 1, z: 0 }
          }
        }
      ],
      activeSceneId: 's1',
      objects: [psd],
      layers,
      duration: 10,
      camera,
      stageCamera3D: defaultStage()
    });

    const wire = JSON.parse(JSON.stringify(file)) as unknown;
    const parsed = parseProjectPayloadV2(wire);
    const obj = parsed.scenes[0].objects[0];
    expect(obj.type).toBe('psd');
    if (obj.type !== 'psd') throw new Error('expected psd');
    expect(obj.worldPlacement?.enabled).toBe(true);
    expect(obj.worldPlacement?.position).toEqual({ x: -1, y: 0, z: 2 });
    expect(obj.worldPlacement?.billboard).toBe(true);
    expect(parsed.projectSettings.editorMode).toBe('3d_stage');
  });

  it('round-trips standard particle objects through JSON payload', () => {
    const layers = createDefaultLayers();
    const camera = createDefaultCamera();
    const particle = minimalParticle();
    const barcode = minimalBarcode();
    const puzzle = minimalPuzzlePiece();
    const colourWheel = minimalColourWheel();
    const gourd = minimalGourd();
    const gear = minimalGear();
    const trackBar = minimalTrackBar();
    const pieChart = minimalPieChart();
    const histogram = minimalHistogram();
    const sunburst = minimalSunburst();
    const circularArrow = minimalCircularArrow();
    const triangleBracket = minimalTriangleBracket();
    const tartanCheck = minimalTartanCheck();
    const houndstooth = minimalHoundstooth();
    const yagasuri = minimalYagasuri();
    const paperAirplane = minimalPaperAirplane();
    const asanohaPattern = minimalAsanohaPattern();
    const focusLinesPlus = minimalFocusLinesPlus();
    const randomLineEx = minimalRandomLineEx();
    const contourTrace = minimalContourTrace();
    const hologram = minimalHologram();
    const protractor = minimalProtractor();
    const shakingPolygon = minimalShakingPolygon();
    const toneCurve = minimalToneCurve();
    const hksyCheckerGrid = minimalHksyCheckerGrid();
    const getColorDotField = minimalGetColorDotField();
    const audioSphere = minimalAudioSphere();
    const sphericalField = minimalSphericalField();
    const file = buildProjectFileData({
      projectSettings: projectSettings(),
      scenes: [
        {
          id: 's1',
          name: 'One',
          duration: 10,
          layers,
          objects: [particle, barcode, puzzle, colourWheel, gourd, gear, trackBar, pieChart, histogram, sunburst, circularArrow, triangleBracket, tartanCheck, houndstooth, yagasuri, paperAirplane, asanohaPattern, focusLinesPlus, randomLineEx, contourTrace, hologram, protractor, shakingPolygon, toneCurve, hksyCheckerGrid, getColorDotField, audioSphere, sphericalField],
          camera,
          stageCamera3D: defaultStage()
        }
      ],
      activeSceneId: 's1',
      objects: [particle, barcode, puzzle, colourWheel, gourd, gear, trackBar, pieChart, histogram, sunburst, circularArrow, triangleBracket, tartanCheck, houndstooth, yagasuri, paperAirplane, asanohaPattern, focusLinesPlus, randomLineEx, contourTrace, hologram, protractor, shakingPolygon, toneCurve, hksyCheckerGrid, getColorDotField, audioSphere, sphericalField],
      layers,
      duration: 10,
      camera,
      stageCamera3D: defaultStage()
    });

    const parsed = parseProjectPayloadV2(JSON.parse(JSON.stringify(file)));
    expect(parsed.scenes[0].objects).toEqual([particle, barcode, puzzle, colourWheel, gourd, gear, trackBar, pieChart, histogram, sunburst, circularArrow, triangleBracket, tartanCheck, houndstooth, yagasuri, paperAirplane, asanohaPattern, focusLinesPlus, randomLineEx, contourTrace, hologram, protractor, shakingPolygon, toneCurve, hksyCheckerGrid, getColorDotField, audioSphere, sphericalField]);
  });

  it('round-trips a GetColor V2R diamond dot field through JSON payload', () => {
    const layers = createDefaultLayers();
    const camera = createDefaultCamera();
    const getColorDiamondDots: GetColorDotFieldObject = {
      ...minimalGetColorDotField(),
      id: 'getcolor-diamond-dot-field-1',
      name: 'GetColor V2R 菱形ドットフィールド',
      dotSize: 18,
      dotShape: 'diamond',
      strokeWidth: 0,
    };
    const file = buildProjectFileData({
      projectSettings: projectSettings(),
      scenes: [
        {
          id: 's1',
          name: 'One',
          duration: 10,
          layers,
          objects: [getColorDiamondDots],
          camera,
          stageCamera3D: defaultStage()
        }
      ],
      activeSceneId: 's1',
      objects: [getColorDiamondDots],
      layers,
      duration: 10,
      camera,
      stageCamera3D: defaultStage()
    });

    const parsed = parseProjectPayloadV2(JSON.parse(JSON.stringify(file)));
    expect(parsed.scenes[0].objects).toEqual([getColorDiamondDots]);
  });

  it('round-trips a GetColor V2R sampled dot field through JSON payload', () => {
    const layers = createDefaultLayers();
    const camera = createDefaultCamera();
    const getColorSampledDots: GetColorDotFieldObject = {
      ...minimalGetColorDotField(),
      id: 'getcolor-sampled-dot-field-1',
      name: 'GetColor V2R 画像サンプリングドット',
      dotSize: 16,
      dotShape: 'circle',
      strokeWidth: 0,
      sampleSourcePath: 'file:///tmp/source-colours.png',
      sampleSourceLayer: 25,
      sampleSourceObjectId: 'image-source-1',
      sampleStrength: 1,
    };
    const file = buildProjectFileData({
      projectSettings: projectSettings(),
      scenes: [
        {
          id: 's1',
          name: 'One',
          duration: 10,
          layers,
          objects: [getColorSampledDots],
          camera,
          stageCamera3D: defaultStage()
        }
      ],
      activeSceneId: 's1',
      objects: [getColorSampledDots],
      layers,
      duration: 10,
      camera,
      stageCamera3D: defaultStage()
    });

    const parsed = parseProjectPayloadV2(JSON.parse(JSON.stringify(file)));
    expect(parsed.scenes[0].objects).toEqual([getColorSampledDots]);
  });

  it('round-trips an hksy diamond pattern object through JSON payload', () => {
    const layers = createDefaultLayers();
    const camera = createDefaultCamera();
    const hksyDiamond: HksyCheckerGridObject = {
      ...minimalHksyCheckerGrid(),
      id: 'hksy-diamond-1',
      name: 'hksy 菱形',
      width: 480,
      height: 360,
      pattern: 'diamond',
      cellSize: 64,
      lineWidth: 96,
      checkerEnabled: false,
      gridEnabled: false,
      foregroundColour: '#ffffff',
      secondaryColour: '#ffffff',
      backgroundColour: '#000000',
    };
    const file = buildProjectFileData({
      projectSettings: projectSettings(),
      scenes: [
        {
          id: 's1',
          name: 'One',
          duration: 10,
          layers,
          objects: [hksyDiamond],
          camera,
          stageCamera3D: defaultStage()
        }
      ],
      activeSceneId: 's1',
      objects: [hksyDiamond],
      layers,
      duration: 10,
      camera,
      stageCamera3D: defaultStage()
    });

    const parsed = parseProjectPayloadV2(JSON.parse(JSON.stringify(file)));
    expect(parsed.scenes[0].objects).toEqual([hksyDiamond]);
  });

  it('round-trips an hksy measured grid pattern object through JSON payload', () => {
    const layers = createDefaultLayers();
    const camera = createDefaultCamera();
    const hksyMeasuredGrid: HksyCheckerGridObject = {
      ...minimalHksyCheckerGrid(),
      id: 'hksy-measured-grid-1',
      name: 'hksy グリッド',
      width: 960,
      height: 540,
      pattern: 'measured-grid',
      cellSize: 32,
      lineWidth: 1,
      checkerEnabled: false,
      gridEnabled: true,
      foregroundColour: '#ffffff',
      secondaryColour: '#bbeeff',
      backgroundColour: '#10131a',
      separateInterval: 5,
      separateLineWidth: 3,
    };
    const file = buildProjectFileData({
      projectSettings: projectSettings(),
      scenes: [
        {
          id: 's1',
          name: 'One',
          duration: 10,
          layers,
          objects: [hksyMeasuredGrid],
          camera,
          stageCamera3D: defaultStage()
        }
      ],
      activeSceneId: 's1',
      objects: [hksyMeasuredGrid],
      layers,
      duration: 10,
      camera,
      stageCamera3D: defaultStage()
    });

    const parsed = parseProjectPayloadV2(JSON.parse(JSON.stringify(file)));
    expect(parsed.scenes[0].objects).toEqual([hksyMeasuredGrid]);
  });

  it('round-trips an hksy anchor line pattern object through JSON payload', () => {
    const layers = createDefaultLayers();
    const camera = createDefaultCamera();
    const hksyAnchorLine: HksyCheckerGridObject = {
      ...minimalHksyCheckerGrid(),
      id: 'hksy-anchor-line-1',
      name: 'hksy ライン（アンカー指定）',
      width: 480,
      height: 360,
      pattern: 'anchor-line',
      cellSize: 64,
      lineWidth: 20,
      checkerEnabled: false,
      gridEnabled: false,
      foregroundColour: '#ffffff',
      secondaryColour: '#ffffff',
      backgroundColour: '#000000',
      anchorPoints: [
        { x: -88, y: 50 },
        { x: 0, y: -100 },
        { x: 88, y: 50 },
      ],
      roundCaps: true,
      maxJoinDistance: 50,
    };
    const file = buildProjectFileData({
      projectSettings: projectSettings(),
      scenes: [
        {
          id: 's1',
          name: 'One',
          duration: 10,
          layers,
          objects: [hksyAnchorLine],
          camera,
          stageCamera3D: defaultStage()
        }
      ],
      activeSceneId: 's1',
      objects: [hksyAnchorLine],
      layers,
      duration: 10,
      camera,
      stageCamera3D: defaultStage()
    });

    const parsed = parseProjectPayloadV2(JSON.parse(JSON.stringify(file)));
    expect(parsed.scenes[0].objects).toEqual([hksyAnchorLine]);
  });

  it('rejects invalid worldPlacement on psd objects', () => {
    const bad = {
      format: 'uxfd-project',
      version: 2,
      savedAt: new Date().toISOString(),
      projectSettings: projectSettings(),
      activeSceneId: 's1',
      scenes: [
        {
          id: 's1',
          name: 'One',
          duration: 10,
          layers: createDefaultLayers(),
          camera: createDefaultCamera(),
          stageCamera3D: defaultStage(),
          objects: [
            {
              ...minimalPsdWithWorldPlacement(),
              worldPlacement: { enabled: 'yes' }
            }
          ]
        }
      ]
    };
    expect(() => parseProjectPayloadV2(bad)).toThrow();
  });

  it('maps saved PSD active layer state from legacy ids onto restored stable ids', async () => {
    mockedParsePsdWithWasm.mockResolvedValue({
      meta: {
        width: 64,
        height: 48,
        depth: 8,
        isPsb: false,
        layers: [{
          name: 'Character',
          top: 0,
          left: 0,
          width: 64,
          height: 48,
          visible: true,
          isGroup: true,
          ownGroupId: 42,
          parentGroupId: null,
          pixelByteLen: 0,
        }, {
          name: 'Face',
          top: 4,
          left: 8,
          width: 16,
          height: 16,
          visible: true,
          isGroup: false,
          ownGroupId: null,
          parentGroupId: 42,
          pixelByteLen: 0,
        }],
      },
      pixels: [new Uint8Array(0), new Uint8Array(0)],
    });
    const readFileBytes = vi.fn().mockResolvedValue({
      success: true,
      data: new ArrayBuffer(8),
    });
    vi.stubGlobal('window', {
      ipcRenderer: {
        invoke: readFileBytes,
      },
    });
    const psd: PsdObject = {
      ...minimalPsdWithWorldPlacement(),
      filePath: '/tmp/character.psd',
      rootLayer: {
        id: 'root',
        name: 'Root',
        isGroup: true,
        isRadio: false,
        children: [{
          id: 'legacy-character-id',
          name: 'Character',
          isGroup: true,
          isRadio: false,
          children: [{
            id: 'legacy-face-id',
            name: 'Face',
            isGroup: false,
            isRadio: false,
            children: [],
            width: 16,
            height: 16,
            left: 8,
            top: 4,
            defaultVisible: true,
          }],
          width: 64,
          height: 48,
          left: 0,
          top: 0,
          defaultVisible: true,
        }],
        width: 64,
        height: 48,
        left: 0,
        top: 0,
        defaultVisible: true,
      },
      activeLayerIds: {
        root: true,
        'legacy-character-id': true,
        'legacy-face-id': false,
      },
    };

    const [restored] = await restoreProjectObjects([psd], projectSettings());

    expect(readFileBytes).toHaveBeenCalledWith('read-file-bytes', {
      filePath: '/tmp/character.psd',
    });
    expect(restored.type).toBe('psd');
    if (restored.type !== 'psd') throw new Error('expected psd');
    expect(restored.rootLayer?.children[0].id).toBe('psd-group-42');
    expect(restored.rootLayer?.children[0].children[0].id).toBe('psd-layer-1');
    expect(restored.activeLayerIds).toMatchObject({
      root: true,
      'psd-group-42': true,
      'psd-layer-1': false,
    });
    expect(restored.layerTree?.[0].children[0].checked).toBe(false);
  });
});
