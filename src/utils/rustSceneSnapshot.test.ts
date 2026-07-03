import { describe, expect, it } from 'vitest';
import { createDefaultLayers } from './sceneState';
import {
  buildRustSceneSnapshotForTimeline,
  type RustSceneSnapshotBuildIssue,
} from './rustSceneSnapshot';
import type { AsanohaPatternObject, AudioObject, AudioSphereObject, AudioVisualizationObject, BarcodeObject, CircularArrowObject, ColourWheelObject, ContourTraceObject, DisplacementPolyObject, FocusLinesPlusObject, GearObject, GetColorDotFieldObject, GourdObject, HistogramObject, HologramObject, HoundstoothObject, HksyCheckerGridObject, ImageObject, PaperAirplaneObject, ParticleObject, PieChartObject, PlainEffectorLineObject, ProjectSettings, ProtractorObject, PsdObject, PuzzlePieceObject, RandomLineExObject, RegionFrameObject, ShakingPolygonObject, ShapeObject, ShatteredSphereObject, SimpleTubeObject, SphereDotsObject, SphericalFieldObject, SunburstObject, TartanCheckObject, TextObject, TimelineObject, ToneCurveObject, TrackBarObject, TriangleBracketObject, VideoObject, YagasuriObject } from '../types';

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

const baseText = (patch: Partial<TextObject> = {}): TextObject => ({
  id: 'text-1',
  type: 'text',
  name: 'Text',
  layer: 0,
  startTime: 1,
  duration: 4,
  x: 50,
  y: 60,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 50,
  endY: 60,
  easing: 'linear',
  text: 'Hello',
  fontFamily: 'Arial',
  fontSize: 48,
  fill: '#ffffff',
  measuredWidth: 200,
  measuredHeight: 60,
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

const baseAudioSphere = (patch: Partial<AudioSphereObject> = {}): AudioSphereObject => ({
  id: 'audio-sphere-1',
  type: 'audio_sphere',
  name: '93 音声玉',
  layer: 30,
  startTime: 1,
  duration: 4,
  x: 720,
  y: 300,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
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
  targetLayer: 3,
  sampleWindowSeconds: 0.1,
  seed: 93,
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

const baseCircularArrow = (patch: Partial<CircularArrowObject> = {}): CircularArrowObject => ({
  id: 'circular-arrow-1',
  type: 'circular_arrow',
  name: '円矢印',
  layer: 15,
  startTime: 1,
  duration: 4,
  x: 860,
  y: 440,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
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
  ...patch,
});

const baseTriangleBracket = (patch: Partial<TriangleBracketObject> = {}): TriangleBracketObject => ({
  id: 'triangle-bracket-1',
  type: 'triangle_bracket',
  name: '三角括弧',
  layer: 16,
  startTime: 1,
  duration: 4,
  x: 880,
  y: 490,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
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
  ...patch,
});

const baseTartanCheck = (patch: Partial<TartanCheckObject> = {}): TartanCheckObject => ({
  id: 'tartan-check-1',
  type: 'tartan_check',
  name: 'タータンチェック',
  layer: 17,
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
  tileSize: 100,
  blurRadius: 1,
  baseColour: '#143e10',
  stripeColourA: '#a81616',
  stripeColourB: '#c9c526',
  lineColour: '#000000',
  ...patch,
});

const baseHoundstooth = (patch: Partial<HoundstoothObject> = {}): HoundstoothObject => ({
  id: 'houndstooth-1',
  type: 'houndstooth',
  name: '千鳥格子',
  layer: 18,
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
  patternSize: 50,
  foregroundColour: '#000000',
  backgroundColour: '#ffffff',
  ...patch,
});

const baseYagasuri = (patch: Partial<YagasuriObject> = {}): YagasuriObject => ({
  id: 'yagasuri-1',
  type: 'yagasuri',
  name: '矢がすり',
  layer: 19,
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
  arrowWidth: 15,
  arrowHeight: 65,
  lineWidth: 2,
  staggered: true,
  foregroundColour: '#000000',
  backgroundColour: '#ffffff',
  ...patch,
});

const basePaperAirplane = (patch: Partial<PaperAirplaneObject> = {}): PaperAirplaneObject => ({
  id: 'paper-airplane-1',
  type: 'paper_airplane',
  name: '紙飛行機',
  layer: 20,
  startTime: 1,
  duration: 4,
  x: 800,
  y: 420,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
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
  ...patch,
});

const baseAsanohaPattern = (patch: Partial<AsanohaPatternObject> = {}): AsanohaPatternObject => ({
  id: 'asanoha-pattern-1',
  type: 'asanoha_pattern',
  name: '麻の葉模様',
  layer: 21,
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
  patternSize: 50,
  lineWidth: 2,
  foregroundColour: '#000000',
  backgroundColour: '#ffffff',
  ...patch,
});

const baseFocusLinesPlus = (patch: Partial<FocusLinesPlusObject> = {}): FocusLinesPlusObject => ({
  id: 'focus-lines-plus-1',
  type: 'focus_lines_plus',
  name: '集中線plus',
  layer: 22,
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
  ...patch,
});

const baseRandomLineEx = (patch: Partial<RandomLineExObject> = {}): RandomLineExObject => ({
  id: 'random-line-ex-1',
  type: 'random_line_ex',
  name: 'ランダムラインEX',
  layer: 23,
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
  lineCount: 3,
  lineWidth: 6,
  threshold: 128,
  noiseCellSize: 12,
  widthVariance: 0,
  seed: 0,
  lineColour: '#ffffff',
  ...patch,
});

const baseContourTrace = (patch: Partial<ContourTraceObject> = {}): ContourTraceObject => ({
  id: 'contour-trace-1',
  type: 'contour_trace',
  name: '93 輪郭トレス',
  layer: 24,
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
  lineWidth: 3,
  contourCount: 5,
  jitterAmount: 1.5,
  traceColour: '#ffffff',
  backgroundOpacity: 0,
  seed: 93,
  ...patch,
});

const baseDisplacementPoly = (patch: Partial<DisplacementPolyObject> = {}): DisplacementPolyObject => ({
  id: 'displacement-poly-1',
  type: 'displacement_poly',
  name: '93 DisplacementPoly',
  layer: 25,
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
  columns: 14,
  rows: 8,
  displacementScale: 42,
  depthScale: 18,
  meshOpacity: 0.85,
  fillOpacity: 0.18,
  lineColour: '#36c2ff',
  fillColour: '#0b1020',
  seed: 93,
  ...patch,
});

const basePlainEffectorLine = (patch: Partial<PlainEffectorLineObject> = {}): PlainEffectorLineObject => ({
  id: 'plain-effector-line-1',
  type: 'plain_effector_line',
  name: '93 PlainEffector Line',
  layer: 26,
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
  ...patch,
});

const baseShatteredSphere = (patch: Partial<ShatteredSphereObject> = {}): ShatteredSphereObject => ({
  id: 'shattered-sphere-1',
  type: 'shattered_sphere',
  name: '93 砕け散る球',
  layer: 27,
  startTime: 1,
  duration: 4,
  x: 780,
  y: 360,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
  enableAnimation: false,
  endX: 780,
  endY: 360,
  easing: 'linear',
  width: 360,
  height: 360,
  fractureAmount: 100,
  delay: 100,
  radius: 160,
  limitDistance: 150,
  thickness: 20,
  fragmentSize: 40,
  randomShape: 100,
  speed: 100,
  impact: 100,
  gravityX: 0,
  gravityY: 100,
  gravityZ: 0,
  spin: 100,
  directionDiffusion: 100,
  colour: '#ffffff',
  seed: 93,
  ...patch,
});

const baseHologram = (patch: Partial<HologramObject> = {}): HologramObject => ({
  id: 'hologram-1',
  type: 'hologram',
  name: 'ホログラム',
  layer: 24,
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
  tileSize: 80,
  rotationDegrees: 0,
  gradientAngleDegrees: -60,
  colourMode: 1,
  tintColour: '#ffffff',
  ...patch,
});

const baseProtractor = (patch: Partial<ProtractorObject> = {}): ProtractorObject => ({
  id: 'protractor-1',
  type: 'protractor',
  name: '分度器',
  layer: 25,
  startTime: 1,
  duration: 4,
  x: 750,
  y: 420,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
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
  ...patch,
});

const baseShakingPolygon = (patch: Partial<ShakingPolygonObject> = {}): ShakingPolygonObject => ({
  id: 'shaking-polygon-1',
  type: 'shaking_polygon',
  name: '多角形_震える',
  layer: 26,
  startTime: 1,
  duration: 4,
  x: 780,
  y: 360,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
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
  ...patch,
});

const baseToneCurve = (patch: Partial<ToneCurveObject> = {}): ToneCurveObject => ({
  id: 'tone-curve-1',
  type: 'tone_curve',
  name: '簡易トーンカーブ',
  layer: 27,
  startTime: 1,
  duration: 4,
  x: 780,
  y: 360,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
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
  ...patch,
});

const baseHksyCheckerGrid = (patch: Partial<HksyCheckerGridObject> = {}): HksyCheckerGridObject => ({
  id: 'hksy-checker-grid-1',
  type: 'hksy_checker_grid',
  name: 'hksy チェッカー/グリッド',
  layer: 28,
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
  cellSize: 50,
  lineWidth: 2,
  checkerEnabled: true,
  gridEnabled: true,
  foregroundColour: '#ffffff',
  secondaryColour: '#333333',
  backgroundColour: '#000000',
  ...patch,
});

const baseGetColorDotField = (patch: Partial<GetColorDotFieldObject> = {}): GetColorDotFieldObject => ({
  id: 'getcolor-dot-field-1',
  type: 'getcolor_dot_field',
  name: 'GetColor V2R ドットフィールド',
  layer: 29,
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
  ...patch,
});

const baseRegionFrame = (patch: Partial<RegionFrameObject> = {}): RegionFrameObject => ({
  id: 'region-frame-1',
  type: 'region_frame',
  name: '93 領域枠',
  layer: 32,
  startTime: 3,
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
  lineWidth: 10,
  shape: 'rectangle',
  extraWidth: 0,
  extraHeight: 0,
  backgroundOpacity: 0.2,
  frameColour: '#ffffff',
  backgroundColour: '#ccccff',
  ...patch,
});

const baseSimpleTube = (patch: Partial<SimpleTubeObject> = {}): SimpleTubeObject => ({
  id: 'simple-tube-1',
  type: 'simple_tube',
  name: '93 SimpleTube',
  layer: 35,
  startTime: 6,
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
  radius: 150,
  depth: 280,
  segments: 16,
  rings: 10,
  twistDegrees: 0,
  randomAmount: 0,
  strokeWidth: 3,
  colour: '#0e769f',
  secondaryColour: '#ffffff',
  colourPattern: 'single',
  fogStrength: 0,
  fogColour: '#ffffff',
  seed: 93,
  torus: false,
  ...patch,
});

const baseSphereDots = (patch: Partial<SphereDotsObject> = {}): SphereDotsObject => ({
  id: 'sphere-dots-1',
  type: 'sphere_dots',
  name: '93 Sphere(DrawPixel)',
  layer: 37,
  startTime: 8,
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
  radius: 170,
  columns: 16,
  rows: 12,
  rotationDegrees: 10,
  offsetDegrees: 0,
  luminanceInfluence: 0,
  pointSize: 6,
  latitudeLineWidth: 2,
  colour: '#ffffff',
  secondaryColour: '#36c2ff',
  seed: 93,
  planeMode: false,
  ...patch,
});

const baseSphericalField = (patch: Partial<SphericalFieldObject> = {}): SphericalFieldObject => ({
  id: 'spherical-field-1',
  type: 'spherical_field',
  name: '93 SphericalField',
  layer: 38,
  startTime: 9,
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

  it('builds a generated 93 audio sphere media plane with target audio metadata', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseAudio(), baseAudioSphere()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated audio sphere snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'audio-sphere-1',
      track_id: 'layer-30',
      media_id: 'audio-sphere-1',
      source_frame: 60,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'audio-sphere-1',
        kind: 'GeneratedAudioSphere',
        source: JSON.stringify({
          generator: 'audio-sphere-93',
          target_audio_id: 'audio-1',
          target_source: '/tmp/music.wav',
          sample_window_seconds: 0.1,
          columns: 16,
          rows: 12,
          base_radius: 170,
          audio_influence: 0.6,
          point_size: 5,
          polygon_size: 0.35,
          random_amount: 0.05,
          colour: '#36c2ff',
          seed: 93,
        }),
        width: 480,
        height: 480,
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

  it('builds a generated circular arrow media plane from a circular arrow object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseCircularArrow()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated circular arrow snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'circular-arrow-1',
      track_id: 'layer-15',
      media_id: 'circular-arrow-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'circular-arrow-1',
        kind: 'GeneratedCircularArrow',
        source: JSON.stringify({
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
        }),
        width: 200,
        height: 200,
      },
    ]);
  });

  it('builds a generated triangle bracket media plane from a triangle bracket object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseTriangleBracket()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated triangle bracket snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'triangle-bracket-1',
      track_id: 'layer-16',
      media_id: 'triangle-bracket-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'triangle-bracket-1',
        kind: 'GeneratedTriangleBracket',
        source: JSON.stringify({
          generator: 'triangle-bracket',
          bracket_width: 100,
          angle_degrees: 120,
          arm_length: 50,
          offset_distance: 0,
          bracket_colour: '#ffffff',
        }),
        width: 160,
        height: 100,
      },
    ]);
  });

  it('builds a generated tartan check media plane from a tartan check object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseTartanCheck()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated tartan check snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'tartan-check-1',
      track_id: 'layer-17',
      media_id: 'tartan-check-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'tartan-check-1',
        kind: 'GeneratedTartanCheck',
        source: JSON.stringify({
          generator: 'tartan-check',
          tile_size: 100,
          blur_radius: 1,
          base_colour: '#143e10',
          stripe_colour_a: '#a81616',
          stripe_colour_b: '#c9c526',
          line_colour: '#000000',
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('builds a generated houndstooth media plane from a houndstooth object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseHoundstooth()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated houndstooth snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'houndstooth-1',
      track_id: 'layer-18',
      media_id: 'houndstooth-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'houndstooth-1',
        kind: 'GeneratedHoundstooth',
        source: JSON.stringify({
          generator: 'houndstooth',
          pattern_size: 50,
          foreground_colour: '#000000',
          background_colour: '#ffffff',
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('builds a generated yagasuri media plane from a yagasuri object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseYagasuri()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated yagasuri snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'yagasuri-1',
      track_id: 'layer-19',
      media_id: 'yagasuri-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'yagasuri-1',
        kind: 'GeneratedYagasuri',
        source: JSON.stringify({
          generator: 'yagasuri',
          arrow_width: 15,
          arrow_height: 65,
          line_width: 2,
          staggered: true,
          foreground_colour: '#000000',
          background_colour: '#ffffff',
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('builds a generated paper airplane media plane from a paper airplane object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [basePaperAirplane()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated paper airplane snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'paper-airplane-1',
      track_id: 'layer-20',
      media_id: 'paper-airplane-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'paper-airplane-1',
        kind: 'GeneratedPaperAirplane',
        source: JSON.stringify({
          generator: 'paper-airplane',
          body_length: 200,
          wing_width: 80,
          fold_height: 50,
          gap: 50,
          follow_motion_direction: false,
          axis_mode: 0,
          fill_colour: '#ffffff',
        }),
        width: 320,
        height: 240,
      },
    ]);
  });

  it('builds a generated asanoha pattern media plane from an asanoha pattern object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseAsanohaPattern()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated asanoha pattern snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'asanoha-pattern-1',
      track_id: 'layer-21',
      media_id: 'asanoha-pattern-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'asanoha-pattern-1',
        kind: 'GeneratedAsanohaPattern',
        source: JSON.stringify({
          generator: 'asanoha-pattern',
          pattern_size: 50,
          line_width: 2,
          foreground_colour: '#000000',
          background_colour: '#ffffff',
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('builds a generated focus lines plus media plane from a focus lines plus object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseFocusLinesPlus()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated focus lines plus snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'focus-lines-plus-1',
      track_id: 'layer-22',
      media_id: 'focus-lines-plus-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'focus-lines-plus-1',
        kind: 'GeneratedFocusLinesPlus',
        source: JSON.stringify({
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
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('builds a generated random line EX media plane from a random line EX object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseRandomLineEx()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated random line EX snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'random-line-ex-1',
      track_id: 'layer-23',
      media_id: 'random-line-ex-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'random-line-ex-1',
        kind: 'GeneratedRandomLineEx',
        source: JSON.stringify({
          generator: 'random-line-ex',
          line_count: 3,
          line_width: 6,
          threshold: 128,
          noise_cell_size: 12,
          width_variance: 0,
          seed: 0,
          line_colour: '#ffffff',
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('builds a generated 93 contour trace media plane from a contour trace object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseContourTrace()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated contour trace snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'contour-trace-1',
      track_id: 'layer-24',
      media_id: 'contour-trace-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'contour-trace-1',
        kind: 'GeneratedContourTrace',
        source: JSON.stringify({
          generator: 'contour-trace-93',
          line_width: 3,
          contour_count: 5,
          jitter_amount: 1.5,
          trace_colour: '#ffffff',
          background_opacity: 0,
          seed: 93,
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('builds a generated 93 displacement poly media plane from a displacement poly object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseDisplacementPoly()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated displacement poly snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'displacement-poly-1',
      track_id: 'layer-25',
      media_id: 'displacement-poly-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'displacement-poly-1',
        kind: 'GeneratedDisplacementPoly',
        source: JSON.stringify({
          generator: 'displacement-poly-93',
          columns: 14,
          rows: 8,
          displacement_scale: 42,
          depth_scale: 18,
          mesh_opacity: 0.85,
          fill_opacity: 0.18,
          line_colour: '#36c2ff',
          fill_colour: '#0b1020',
          seed: 93,
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('builds a generated 93 PlainEffector Line media plane from a plain effector line object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [basePlainEffectorLine()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated plain effector line snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'plain-effector-line-1',
      track_id: 'layer-26',
      media_id: 'plain-effector-line-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'plain-effector-line-1',
        kind: 'GeneratedPlainEffectorLine',
        source: JSON.stringify({
          generator: 'plain-effector-line-93',
          radius: 100,
          strength: 1,
          randomness: 0,
          zoom: 1,
          invert: false,
          line_count: 24,
          line_width: 2,
          colour: '#f74d52',
          colour_amount: 1,
          seed: 93,
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('builds an animated generated 93 shattered sphere media plane from a shattered sphere object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseShatteredSphere()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated shattered sphere snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'shattered-sphere-1',
      track_id: 'layer-27',
      media_id: 'shattered-sphere-1',
      source_frame: 60,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'shattered-sphere-1',
        kind: 'GeneratedShatteredSphere',
        source: JSON.stringify({
          generator: 'shattered-sphere-93',
          fracture_amount: 100,
          delay: 100,
          radius: 160,
          limit_distance: 150,
          thickness: 20,
          fragment_size: 40,
          random_shape: 100,
          speed: 100,
          impact: 100,
          gravity: [0, 100, 0],
          spin: 100,
          direction_diffusion: 100,
          colour: '#ffffff',
          seed: 93,
        }),
        width: 360,
        height: 360,
      },
    ]);
  });

  it('builds a generated hologram media plane from a hologram object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseHologram()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated hologram snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'hologram-1',
      track_id: 'layer-24',
      media_id: 'hologram-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'hologram-1',
        kind: 'GeneratedHologram',
        source: JSON.stringify({
          generator: 'hologram',
          tile_size: 80,
          rotation_degrees: 0,
          gradient_angle_degrees: -60,
          colour_mode: 1,
          tint_colour: '#ffffff',
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('builds a generated protractor media plane from a protractor object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseProtractor()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated protractor snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'protractor-1',
      track_id: 'layer-25',
      media_id: 'protractor-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'protractor-1',
        kind: 'GeneratedProtractor',
        source: JSON.stringify({
          generator: 'protractor',
          radius: 180,
          measured_angle_degrees: 90,
          tick_step_degrees: 10,
          major_tick_step_degrees: 30,
          decimal_places: 1,
          line_colour: '#ffffff',
          text_colour: '#ffffff',
          shadow_colour: '#000000',
        }),
        width: 420,
        height: 240,
      },
    ]);
  });

  it('builds a generated shaking polygon media plane from a shaking polygon object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseShakingPolygon()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated shaking polygon snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'shaking-polygon-1',
      track_id: 'layer-26',
      media_id: 'shaking-polygon-1',
      source_frame: 60,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'shaking-polygon-1',
        kind: 'GeneratedShakingPolygon',
        source: JSON.stringify({
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
        }),
        width: 360,
        height: 360,
      },
    ]);
  });

  it('builds a generated tone curve media plane from a tone curve object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseToneCurve()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated tone curve snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'tone-curve-1',
      track_id: 'layer-27',
      media_id: 'tone-curve-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'tone-curve-1',
        kind: 'GeneratedToneCurve',
        source: JSON.stringify({
          generator: 'simple-tone-curve',
          grid_divisions: 4,
          line_width: 3,
          curve_points: [0, 0.16, 0.42, 0.7, 1],
          curve_colour: '#ffffff',
          grid_colour: '#333333',
          background_colour: '#000000',
        }),
        width: 360,
        height: 360,
      },
    ]);
  });

  it('builds a generated hksy checker/grid media plane from a checker grid object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseHksyCheckerGrid()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated hksy checker/grid snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'hksy-checker-grid-1',
      track_id: 'layer-28',
      media_id: 'hksy-checker-grid-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'hksy-checker-grid-1',
        kind: 'GeneratedHksyCheckerGrid',
        source: JSON.stringify({
          generator: 'hksy-checker-grid',
          cell_size: 50,
          line_width: 2,
          checker_enabled: true,
          grid_enabled: true,
          foreground_colour: '#ffffff',
          secondary_colour: '#333333',
          background_colour: '#000000',
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('serialises hksy multi-colour checker palette into the Rust generator payload', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseHksyCheckerGrid({
        id: 'hksy-multi-colour-checker-1',
        name: 'hksy 複数色チェッカー',
        cellSize: 56,
        lineWidth: 0,
        gridEnabled: false,
        foregroundColour: '#ff5c8a',
        secondaryColour: '#36c2ff',
        backgroundColour: '#111111',
        paletteColours: ['#ff5c8a', '#36c2ff', '#ffd166', '#70e000'],
      })],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated hksy multi-colour checker snapshot to pass');

    expect(result.media).toEqual([
      {
        id: 'hksy-multi-colour-checker-1',
        kind: 'GeneratedHksyCheckerGrid',
        source: JSON.stringify({
          generator: 'hksy-checker-grid',
          cell_size: 56,
          line_width: 0,
          checker_enabled: true,
          grid_enabled: false,
          foreground_colour: '#ff5c8a',
          secondary_colour: '#36c2ff',
          background_colour: '#111111',
          palette_colours: ['#ff5c8a', '#36c2ff', '#ffd166', '#70e000'],
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('serialises an hksy diamond object into the Rust generator payload', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseHksyCheckerGrid({
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
      })],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated hksy diamond snapshot to pass');

    expect(result.media).toEqual([
      {
        id: 'hksy-diamond-1',
        kind: 'GeneratedHksyCheckerGrid',
        source: JSON.stringify({
          generator: 'hksy-checker-grid',
          pattern: 'diamond',
          cell_size: 64,
          line_width: 96,
          checker_enabled: false,
          grid_enabled: false,
          foreground_colour: '#ffffff',
          secondary_colour: '#ffffff',
          background_colour: '#000000',
        }),
        width: 480,
        height: 360,
      },
    ]);
  });

  it('serialises an hksy measured grid object into the Rust generator payload', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseHksyCheckerGrid({
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
      })],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated hksy measured grid snapshot to pass');

    expect(result.media).toEqual([
      {
        id: 'hksy-measured-grid-1',
        kind: 'GeneratedHksyCheckerGrid',
        source: JSON.stringify({
          generator: 'hksy-checker-grid',
          pattern: 'measured-grid',
          cell_size: 32,
          line_width: 1,
          checker_enabled: false,
          grid_enabled: true,
          foreground_colour: '#ffffff',
          secondary_colour: '#bbeeff',
          background_colour: '#10131a',
          separate_interval: 5,
          separate_line_width: 3,
        }),
        width: 960,
        height: 540,
      },
    ]);
  });

  it('serialises an hksy anchor line object into the Rust generator payload', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseHksyCheckerGrid({
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
      })],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated hksy anchor line snapshot to pass');

    expect(result.media).toEqual([
      {
        id: 'hksy-anchor-line-1',
        kind: 'GeneratedHksyCheckerGrid',
        source: JSON.stringify({
          generator: 'hksy-checker-grid',
          pattern: 'anchor-line',
          cell_size: 64,
          line_width: 20,
          checker_enabled: false,
          grid_enabled: false,
          foreground_colour: '#ffffff',
          secondary_colour: '#ffffff',
          background_colour: '#000000',
          anchor_points: [
            { x: -88, y: 50 },
            { x: 0, y: -100 },
            { x: 88, y: 50 },
          ],
          round_caps: true,
          max_join_distance: 50,
        }),
        width: 480,
        height: 360,
      },
    ]);
  });

  it('builds a generated GetColor V2R dot media plane from a dot field object', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseGetColorDotField()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated GetColor dot field snapshot to pass');

    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'getcolor-dot-field-1',
      track_id: 'layer-29',
      media_id: 'getcolor-dot-field-1',
      source_frame: 0,
      opacity: 0.9,
    });
    expect(result.media).toEqual([
      {
        id: 'getcolor-dot-field-1',
        kind: 'GeneratedGetColorDots',
        source: JSON.stringify({
          generator: 'getcolor-v2r-dot-field',
          columns: 32,
          rows: 18,
          dot_size: 14,
          size_influence: 0.65,
          luminance_influence: 0.7,
          hue_shift_degrees: 0,
          alternate_rows: true,
          foreground_colour: '#ffffff',
          secondary_colour: '#36c2ff',
          background_colour: '#000000',
          seed: 93,
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('serialises a GetColor V2R diamond dot field into the Rust generator payload', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseGetColorDotField({
        id: 'getcolor-diamond-dot-field-1',
        name: 'GetColor V2R 菱形ドットフィールド',
        dotSize: 18,
        dotShape: 'diamond',
        strokeWidth: 0,
      })],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated GetColor diamond dot snapshot to pass');

    expect(result.media).toEqual([
      {
        id: 'getcolor-diamond-dot-field-1',
        kind: 'GeneratedGetColorDots',
        source: JSON.stringify({
          generator: 'getcolor-v2r-dot-field',
          columns: 32,
          rows: 18,
          dot_size: 18,
          size_influence: 0.65,
          luminance_influence: 0.7,
          hue_shift_degrees: 0,
          alternate_rows: true,
          foreground_colour: '#ffffff',
          secondary_colour: '#36c2ff',
          background_colour: '#000000',
          seed: 93,
          dot_shape: 'diamond',
          stroke_width: 0,
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('serialises a GetColor V2R outlined square dot field into the Rust generator payload', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseGetColorDotField({
        id: 'getcolor-outlined-square-dot-field-1',
        name: 'GetColor V2R 枠線四角ドットフィールド',
        columns: 28,
        rows: 16,
        dotSize: 22,
        dotShape: 'square',
        strokeWidth: 5,
      })],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated GetColor outlined square dot snapshot to pass');

    expect(result.media).toEqual([
      {
        id: 'getcolor-outlined-square-dot-field-1',
        kind: 'GeneratedGetColorDots',
        source: JSON.stringify({
          generator: 'getcolor-v2r-dot-field',
          columns: 28,
          rows: 16,
          dot_size: 22,
          size_influence: 0.65,
          luminance_influence: 0.7,
          hue_shift_degrees: 0,
          alternate_rows: true,
          foreground_colour: '#ffffff',
          secondary_colour: '#36c2ff',
          background_colour: '#000000',
          seed: 93,
          dot_shape: 'square',
          stroke_width: 5,
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('serialises a GetColor V2R sampled dot field with source image pickup into the Rust generator payload', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseGetColorDotField({
        id: 'getcolor-sampled-dot-field-1',
        name: 'GetColor V2R 画像サンプリングドット',
        dotSize: 16,
        dotShape: 'circle',
        strokeWidth: 0,
        sampleSourcePath: 'file:///tmp/source-colours.png',
        sampleStrength: 1,
        sampleHueShiftDegrees: 120,
      })],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated GetColor sampled dot snapshot to pass');

    expect(result.media).toEqual([
      {
        id: 'getcolor-sampled-dot-field-1',
        kind: 'GeneratedGetColorDots',
        source: JSON.stringify({
          generator: 'getcolor-v2r-dot-field',
          columns: 32,
          rows: 18,
          dot_size: 16,
          size_influence: 0.65,
          luminance_influence: 0.7,
          hue_shift_degrees: 0,
          alternate_rows: true,
          foreground_colour: '#ffffff',
          secondary_colour: '#36c2ff',
          background_colour: '#000000',
          seed: 93,
          dot_shape: 'circle',
          stroke_width: 0,
          source_image: 'file:///tmp/source-colours.png',
          sample_strength: 1,
          sample_hue_shift_degrees: 120,
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('resolves a GetColor V2R sampled dot field source image from the referenced image layer', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [
        baseImage({
          id: 'sample-image-1',
          layer: 28,
          filePath: '/tmp/layer-source.png',
          src: 'blob:image',
        }),
        baseGetColorDotField({
          id: 'getcolor-layer-sampled-dot-field-1',
          name: 'GetColor V2R 画像サンプリングドット',
          layer: 29,
          sampleSourceLayer: 28,
          sampleStrength: 1,
        }),
      ],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated GetColor layer sampled dot snapshot to pass');

    const getColorMedia = result.media.find((reference) => reference.id === 'getcolor-layer-sampled-dot-field-1');
    expect(getColorMedia).toMatchObject({
      id: 'getcolor-layer-sampled-dot-field-1',
      kind: 'GeneratedGetColorDots',
      width: 800,
      height: 450,
    });
    expect(JSON.parse(getColorMedia?.source ?? '{}')).toMatchObject({
      generator: 'getcolor-v2r-dot-field',
      source_image: '/tmp/layer-source.png',
      sample_strength: 1,
    });
  });

  it('resolves a GetColor V2R sampled dot field source image from an explicit image object id', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [
        baseImage({
          id: 'sample-image-layer-1',
          layer: 28,
          filePath: '/tmp/layer-source.png',
          src: 'blob:image',
        }),
        baseImage({
          id: 'sample-image-explicit-1',
          layer: 20,
          filePath: '/tmp/object-source.jpg',
          src: 'blob:image',
        }),
        baseGetColorDotField({
          id: 'getcolor-object-sampled-dot-field-1',
          name: 'GetColor V2R 画像サンプリングドット',
          layer: 29,
          sampleSourceLayer: 28,
          sampleSourceObjectId: 'sample-image-explicit-1',
          sampleStrength: 0.8,
        }),
      ],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated GetColor object sampled dot snapshot to pass');

    const getColorMedia = result.media.find((reference) => reference.id === 'getcolor-object-sampled-dot-field-1');
    expect(JSON.parse(getColorMedia?.source ?? '{}')).toMatchObject({
      generator: 'getcolor-v2r-dot-field',
      source_image: '/tmp/object-source.jpg',
      sample_strength: 0.8,
    });
  });

  it('resolves a GetColor V2R sampled dot field source image from an explicit PSD object id with active layers', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [
        basePsd({
          id: 'sample-psd-explicit-1',
          layer: 20,
          filePath: '/tmp/standing-source.psd',
          src: 'blob:psd',
          activeLayerIds: {
            'mouth-open': true,
            'mouth-closed': false,
            root: true,
            'eye-open': true,
          },
        }),
        baseGetColorDotField({
          id: 'getcolor-psd-sampled-dot-field-1',
          name: 'GetColor V2R PSDサンプリングドット',
          layer: 29,
          sampleSourceObjectId: 'sample-psd-explicit-1',
          sampleStrength: 0.75,
        }),
      ],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated GetColor PSD sampled dot snapshot to pass');

    const getColorMedia = result.media.find((reference) => reference.id === 'getcolor-psd-sampled-dot-field-1');
    expect(JSON.parse(getColorMedia?.source ?? '{}')).toMatchObject({
      generator: 'getcolor-v2r-dot-field',
      source_image: '/tmp/standing-source.psd',
      source_active_layer_ids: ['eye-open', 'mouth-open', 'root'],
      sample_strength: 0.75,
    });
  });

  it('serialises a 93 region frame object into the Rust generator payload', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseRegionFrame()],
      time: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated region frame snapshot to pass');

    expect(result.media).toEqual([
      {
        id: 'region-frame-1',
        kind: 'GeneratedRegionFrame',
        source: JSON.stringify({
          generator: 'region-frame-93',
          line_width: 10,
          shape: 'rectangle',
          extra_width: 0,
          extra_height: 0,
          background_opacity: 0.2,
          frame_colour: '#ffffff',
          background_colour: '#ccccff',
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('serialises 93 ellipse and cut-corner region frame variants into the Rust generator payload', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [
        baseRegionFrame({
          id: 'ellipse-region-frame-1',
          shape: 'ellipse',
        }),
        baseRegionFrame({
          id: 'cut-region-frame-1',
          shape: 'cut_corner',
          cornerCut: 20,
        }),
      ],
      time: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated region frame variants to pass');

    expect(result.media.map((media) => JSON.parse(media.source))).toEqual([
      {
        generator: 'region-frame-93',
        line_width: 10,
        shape: 'ellipse',
        extra_width: 0,
        extra_height: 0,
        background_opacity: 0.2,
        frame_colour: '#ffffff',
        background_colour: '#ccccff',
      },
      {
        generator: 'region-frame-93',
        line_width: 10,
        shape: 'cut_corner',
        corner_cut: 20,
        extra_width: 0,
        extra_height: 0,
        background_opacity: 0.2,
        frame_colour: '#ffffff',
        background_colour: '#ccccff',
      },
    ]);
  });

  it('serialises a 93 SimpleTube object into the Rust generator payload', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseSimpleTube()],
      time: 6,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated SimpleTube snapshot to pass');

    expect(result.media).toEqual([
      {
        id: 'simple-tube-1',
        kind: 'GeneratedSimpleTube',
        source: JSON.stringify({
          generator: 'simple-tube-93',
          radius: 150,
          depth: 280,
          segments: 16,
          rings: 10,
          twist_degrees: 0,
          random_amount: 0,
          stroke_width: 3,
          colour: '#0e769f',
          secondary_colour: '#ffffff',
          colour_pattern: 'single',
          fog_strength: 0,
          fog_colour: '#ffffff',
          seed: 93,
          torus: false,
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('serialises a 93 SimpleTube torus object with colour pattern and fog into the Rust payload', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseSimpleTube({
        id: 'simple-tube-torus-1',
        name: '93 SimpleTube トーラス',
        torus: true,
        radius: 170,
        depth: 260,
        segments: 24,
        rings: 16,
        twistDegrees: 120,
        secondaryColour: '#f9f9f9',
        colourPattern: 'ring',
        fogStrength: 0.35,
        fogColour: '#ffffff',
      })],
      time: 7,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated SimpleTube torus snapshot to pass');

    expect(result.media).toEqual([
      {
        id: 'simple-tube-torus-1',
        kind: 'GeneratedSimpleTube',
        source: JSON.stringify({
          generator: 'simple-tube-93',
          radius: 170,
          depth: 260,
          segments: 24,
          rings: 16,
          twist_degrees: 120,
          random_amount: 0,
          stroke_width: 3,
          colour: '#0e769f',
          secondary_colour: '#f9f9f9',
          colour_pattern: 'ring',
          fog_strength: 0.35,
          fog_colour: '#ffffff',
          seed: 93,
          torus: true,
        }),
        width: 800,
        height: 450,
      },
    ]);
  });

  it('serialises a 93 Sphere(DrawPixel) object into the Rust generator payload', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseSphereDots()],
      time: 8,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated Sphere(DrawPixel) snapshot to pass');

    expect(result.media).toEqual([
      {
        id: 'sphere-dots-1',
        kind: 'GeneratedSphereDots',
        source: JSON.stringify({
          generator: 'sphere-drawpixel-93',
          radius: 170,
          columns: 16,
          rows: 12,
          rotation_degrees: 10,
          offset_degrees: 0,
          luminance_influence: 0,
          point_size: 6,
          latitude_line_width: 2,
          colour: '#ffffff',
          secondary_colour: '#36c2ff',
          seed: 93,
          plane_mode: false,
        }),
        width: 480,
        height: 480,
      },
    ]);
  });

  it('serialises a 93 SphericalField object into the Rust generator payload', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseSphericalField()],
      time: 9,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated SphericalField snapshot to pass');

    expect(result.media).toEqual([
      {
        id: 'spherical-field-1',
        kind: 'GeneratedSphericalField',
        source: JSON.stringify({
          generator: 'spherical-field-93',
          radius: 160,
          strength: 100,
          colour_amount: 100,
          alpha_amount: 0,
          line_width: 3,
          ring_count: 4,
          vector_count: 16,
          field_colour: '#ff3b30',
          secondary_colour: '#36c2ff',
          background_opacity: 0.08,
          container: false,
          seed: 93,
        }),
        width: 480,
        height: 480,
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

  it('builds a Text media plane for active text objects', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseText({
        id: 'text-1',
        text: 'こんにちは',
        fontFamily: 'Hiragino Sans',
        fontSize: 36,
        fill: '#00ff00',
        textAlignment: 'centre',
        letterSpacing: 2,
        measuredWidth: 240,
        measuredHeight: 72,
      })],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    expect(result.media).toEqual([
      {
        id: 'text-1',
        kind: 'Text',
        source: JSON.stringify({
          text: 'こんにちは',
          font_family: 'Hiragino Sans',
          font_size: 36,
          colour: '#00ff00',
          alignment: 'centre',
          letter_spacing: 2,
          stroke: null,
          shadow: null,
        }),
        width: 240,
        height: 72,
      },
    ]);
    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'text-1',
      media_id: 'text-1',
      transform: {
        sampling: 'bilinear',
      },
    });
  });

  it('builds a Text media plane with a stroke and shadow when the text object specifies them', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseText({
        id: 'text-stroke-shadow-1',
        text: 'Outlined',
        fontFamily: 'Arial',
        fontSize: 48,
        fill: '#ffffff',
        measuredWidth: 300,
        measuredHeight: 80,
        textStroke: { colour: '#000000', width: 3 },
        textShadow: { colour: '#333333', offsetX: 2, offsetY: 4, blur: 6 },
      })],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    expect(result.media).toEqual([
      {
        id: 'text-stroke-shadow-1',
        kind: 'Text',
        source: JSON.stringify({
          text: 'Outlined',
          font_family: 'Arial',
          font_size: 48,
          colour: '#ffffff',
          alignment: 'left',
          letter_spacing: 0,
          stroke: { colour: '#000000', width: 3 },
          shadow: { colour: '#333333', offset_x: 2, offset_y: 4, blur: 6 },
        }),
        width: 300,
        height: 80,
      },
    ]);
  });

  it('falls back to a heuristic box for text objects with no measured size yet', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseText({
        id: 'text-unmeasured',
        text: 'Hi',
        fontSize: 40,
        measuredWidth: undefined,
        measuredHeight: undefined,
      })],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    const media = result.media[0];
    expect(media.kind).toBe('Text');
    expect(media.width).toBeGreaterThan(0);
    expect(media.height).toBeGreaterThan(0);
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

  it('serialises 93 クリッピングS filters as computed Rust clipping effects', () => {
    const layers = createDefaultLayers();
    const smartClipped = baseImage({
      id: 'smart-clipped',
      filters: [
        {
          id: 'smart-clipping-1',
          type: 'smart_clipping',
          enabled: true,
          params: {
            top: 1,
            bottom: 2,
            left: 3,
            right: 4,
            linkAxes: false,
            mode: 0,
            amount: 0.5,
            seed: 1,
            reverse: true,
          },
        } as any,
      ],
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [smartClipped],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected smart clipping snapshot build to pass');
    expect(result.snapshot.clips[0].effects).toEqual([
      {
        Clipping: {
          top: 1,
          bottom: 0.5,
          left: 2,
          right: 1.5,
          angle_degrees: 0,
        },
      },
    ]);
  });

  it('serialises 93 SpotLight filters as Rust scene effects', () => {
    const layers = createDefaultLayers();
    const spotlight = baseImage({
      id: 'spotlight',
      filters: [
        {
          id: 'spot-1',
          type: 'spot_light',
          enabled: true,
          params: { centreX: 0.5, centreY: 0.25, radius: 0.6, intensity: 0.8, colour: '#fff4c2' },
        } as any,
      ],
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [spotlight],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected spotlight snapshot build to pass');
    expect(result.snapshot.clips[0].effects).toEqual([
      {
        SpotLight: {
          centre_x: 0.5,
          centre_y: 0.25,
          radius: 0.6,
          intensity: 0.8,
          colour: [1, 0xf4 / 255, 0xc2 / 255],
        },
      },
    ]);
  });

  it('serialises 93 Displacement Map B filters as Rust scene effects', () => {
    const layers = createDefaultLayers();
    const displaced = baseImage({
      id: 'displaced',
      filters: [
        {
          id: 'displace-1',
          type: 'displacement_map',
          enabled: true,
          params: { amountX: 24, amountY: 12, size: 128, strength: 0.75 },
        } as any,
      ],
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [displaced],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected displacement map snapshot build to pass');
    expect(result.snapshot.clips[0].effects).toEqual([
      {
        DisplacementMap: {
          amount_x: 24,
          amount_y: 12,
          size: 128,
          strength: 0.75,
        },
      },
    ]);
  });

  it('serialises 93 fake depth of field filters as Rust scene effects', () => {
    const layers = createDefaultLayers();
    const focused = baseImage({
      id: 'focused',
      filters: [
        {
          id: 'dof-1',
          type: 'fake_dof',
          enabled: true,
          params: { focusX: 0.5, focusY: 0.5, focusRadius: 0.25, blur: 8, strength: 0.75 },
        } as any,
      ],
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [focused],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected fake DOF snapshot build to pass');
    expect(result.snapshot.clips[0].effects).toEqual([
      {
        FakeDof: {
          focus_x: 0.5,
          focus_y: 0.5,
          focus_radius: 0.25,
          blur: 8,
          strength: 0.75,
        },
      },
    ]);
  });

  it('serialises 93 auto blur plus filters as velocity-derived Rust scene effects', () => {
    const layers = createDefaultLayers();
    const moving = baseImage({
      id: 'moving',
      x: 0,
      y: 100,
      endX: 600,
      endY: 100,
      duration: 1,
      enableAnimation: true,
      filters: [
        {
          id: 'auto-blur-1',
          type: 'auto_blur',
          enabled: true,
          params: { blur: 10, speed: 1, strength: 0.8, colourShift: 0.25 },
        } as any,
      ],
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [moving],
      time: 1.5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected auto blur snapshot build to pass');
    expect(result.snapshot.clips[0].effects).toEqual([
      {
        AutoBlur: {
          angle_degrees: 0,
          radius: 10,
          strength: 0.8,
          colour_shift: 0.25,
        },
      },
    ]);
  });

  it('serialises 93 Stretch filters as Rust scene effects', () => {
    const layers = createDefaultLayers();
    const stretched = baseImage({
      id: 'stretched',
      filters: [
        {
          id: 'stretch-1',
          type: 'stretch',
          enabled: true,
          params: { angle: 45, amount: 1.25, strength: 0.8 },
        } as any,
      ],
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [stretched],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected stretch snapshot build to pass');
    expect(result.snapshot.clips[0].effects).toEqual([
      {
        Stretch: {
          angle_degrees: 45,
          amount: 1.25,
          strength: 0.8,
        },
      },
    ]);
  });

  it('serialises 93 MultiSlicer filters as Rust scene effects', () => {
    const layers = createDefaultLayers();
    const sliced = baseImage({
      id: 'sliced',
      filters: [
        {
          id: 'multi-slicer-1',
          type: 'multi_slicer',
          enabled: true,
          params: { angle: 45, offset: 16, slices: 18, expansion: 0, strength: 0.75 },
        } as any,
      ],
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [sliced],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected multi slicer snapshot build to pass');
    expect(result.snapshot.clips[0].effects).toEqual([
      {
        MultiSlicer: {
          angle_degrees: 45,
          offset: 16,
          slices: 18,
          expansion: 0,
          strength: 0.75,
        },
      },
    ]);
  });

  it('serialises 93 簡易変形(oct) filters as Rust scene effects', () => {
    const layers = createDefaultLayers();
    const transformed = baseImage({
      id: 'oct-transformed',
      filters: [
        {
          id: 'oct-transform-1',
          type: 'oct_transform',
          enabled: true,
          params: { scale: 1.1, rotation: 30, vertexCount: 8, warp: 0.2, strength: 0.75 },
        } as any,
      ],
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [transformed],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected oct transform snapshot build to pass');
    expect(result.snapshot.clips[0].effects).toEqual([
      {
        OctTransform: {
          scale: 1.1,
          rotation_degrees: 30,
          vertex_count: 8,
          warp: 0.2,
          strength: 0.75,
        },
      },
    ]);
  });

  it('serialises 93 領域拡張S filters as Rust scene effects', () => {
    const layers = createDefaultLayers();
    const expanded = baseImage({
      id: 'area-expanded',
      filters: [
        {
          id: 'area-expand-1',
          type: 'area_expand',
          enabled: true,
          params: { top: 1, bottom: 2, left: 3, right: 4, fill: true },
        } as any,
      ],
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [expanded],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected area expand snapshot build to pass');
    expect(result.snapshot.clips[0].effects).toEqual([
      {
        AreaExpand: {
          top: 1,
          bottom: 2,
          left: 3,
          right: 4,
          fill: true,
        },
      },
    ]);
  });

  it('fails loud for visible Pixi features the shared renderer cannot represent yet', () => {
    const layers = createDefaultLayers();
    const unsupportedGroupControl: TimelineObject = {
      id: 'group-control-1',
      type: 'group_control',
      name: 'Group Control',
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
      targetLayerCount: 1,
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
      objects: [unsupportedGroupControl, blurred],
      time: 2,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected snapshot build to fail');

    expect(issueCodes(result.issues)).toEqual([
      'unsupportedObjectType',
      'unsupportedFilter',
    ]);
  });

  it('builds a generated shape plane for non-rectangle shapes', () => {
    const layers = createDefaultLayers();
    const circle = baseShape({
      id: 'circle',
      shapeType: 'circle',
      fill: '#00ff00',
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [circle],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    expect(result.media).toEqual([
      {
        id: 'circle',
        kind: 'GeneratedShape',
        source: JSON.stringify({
          generator: 'shape-93',
          shape_type: 'circle',
          fill_colour: '#00ff00',
          gradient: null,
          corner_radius: 0,
        }),
        width: 200,
        height: 100,
      },
    ]);
  });

  it('builds a generated shape plane with a gradient and corner radius for non-rectangle shapes', () => {
    const layers = createDefaultLayers();
    const roundedRect = baseShape({
      id: 'rounded-rect-1',
      shapeType: 'rounded_rect',
      fill: '#000000',
      cornerRadius: 24,
      gradient: {
        enabled: true,
        type: 'radial',
        colours: ['#ff0000', '#0000ff'],
        stops: [0, 1],
        direction: 90,
      },
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [roundedRect],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    expect(result.media).toEqual([
      {
        id: 'rounded-rect-1',
        kind: 'GeneratedShape',
        source: JSON.stringify({
          generator: 'shape-93',
          shape_type: 'rounded_rect',
          fill_colour: '#000000',
          gradient: {
            type: 'radial',
            colours: ['#ff0000', '#0000ff'],
            stops: [0, 1],
            direction: 90,
          },
          corner_radius: 24,
        }),
        width: 200,
        height: 100,
      },
    ]);
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
