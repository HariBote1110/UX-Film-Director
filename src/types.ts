import { EasingType } from './utils/easings';
import { LabPhoneme } from './utils/labParser';

/** ワークスペース：2D Pixi プレビュー vs 3D ステージ（Three.js） */
export type EditorMode = '2d' | '3d_stage';

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  sampleRate: number;
  /** 既定は 2d（後方互換） */
  editorMode?: EditorMode;
}

/** 3D ステージ用ワールド座標 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 透視カメラ（lookAt target） */
export interface StageCamera3D {
  position: Vec3;
  target: Vec3;
}

/** PSD を 3D 空間に配置するときのパラメータ */
export interface PsdWorldPlacement {
  enabled: boolean;
  position: Vec3;
  rotationYDeg: number;
  scale: number;
  /** true のときカメラ方向へ Y 回転を合わせる（立ち絵向け） */
  billboard: boolean;
}

/** Preview: fit to the panel vs one project pixel per CSS pixel (scroll when larger than the panel). */
export type PreviewDisplayMode = 'autoFit' | 'pixelPerfect';

export interface LayerState {
  name: string;
  visible: boolean;
  locked: boolean;
}

export type ObjectType = 'text' | 'shape' | 'image' | 'video' | 'audio' | 'psd' | 'group_control' | 'audio_visualization' | 'audio_sphere' | 'particle' | 'barcode' | 'puzzle_piece' | 'colour_wheel' | 'gourd' | 'gear' | 'track_bar' | 'pie_chart' | 'histogram' | 'tone_curve' | 'getcolor_dot_field' | 'hksy_checker_grid' | 'region_frame' | 'simple_tube' | 'sphere_dots' | 'spherical_field' | 'sunburst' | 'circular_arrow' | 'triangle_bracket' | 'tartan_check' | 'houndstooth' | 'yagasuri' | 'paper_airplane' | 'asanoha_pattern' | 'focus_lines_plus' | 'random_line_ex' | 'contour_trace' | 'displacement_poly' | 'hologram' | 'protractor' | 'shaking_polygon';

// --- グラデーション・シャドウ・軌道 ---

export interface GradientFill {
  enabled: boolean;
  type: 'linear' | 'radial';
  scope?: 'group' | 'connected';
  colours: string[];
  stops: number[];
  direction: number;
}

export interface ShadowEffect {
  enabled: boolean;
  colour: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

export interface PathPoint {
  time: number;
  x: number;
  y: number;
}

export interface PositionKeyframe {
  id: string;
  time: number;
  x: number;
  y: number;
  easing?: EasingType;
}

// リップシンク設定
export interface LipSyncSetting {
  enabled: boolean;
  sourceMode: 'layer' | 'object';
  targetLayer: number;
  audioId: string | null;

  mapping: {
      a: string;
      i: string;
      u: string;
      e: string;
      o: string;
      n: string;
  };
}

// --- エフェクト定義 ---

export interface ColorCorrection {
  enabled: boolean;
  brightness: number; 
  contrast: number;   
  saturation: number; 
  hue: number;        
}

export interface Vibration {
  enabled: boolean;
  strength: number; 
  speed: number;    
}

// AviUtl互換クリッピング (斜めクリッピング対応)
export interface ClippingParams {
  enabled: boolean;
  top: number;    // 上からの切り取り量 (px)
  bottom: number; // 下からの切り取り量 (px)
  left: number;   // 左からの切り取り量 (px)
  right: number;  // 右からの切り取り量 (px)
  angle: number;  // クリッピングの回転角度 (度)
  radius: number; // ぼかし等の用途（今回はコーナー半径や簡易ぼかしとして予約、現状未使用でも可）
}

export type FilterType =
  | 'color_correction'
  | 'colour_aberration'
  | 'outline'
  | 'clipping'
  | 'vibration'
  | 'shadow'
  | 'gradient'
  | 'blur'
  | 'fade'
  | 'wipe'
  | 'spot_light';

/** プレビュー／書き出し共通の仮想カメラ（シーン単位） */
export interface CameraState {
  centreOffsetX: number;
  centreOffsetY: number;
  /** 1 = 100% */
  zoom: number;
  rotationDeg: number;
}

export interface BlurFilterParams {
  strength: number;
  /** 1–4（Pixi BlurFilter 品質） */
  quality: number;
}

export interface FadeFilterParams {
  /** 表示不透明度に掛ける係数（0–1） */
  opacity: number;
}

export type WipeEdge = 'left' | 'right' | 'top' | 'bottom';

export interface WipeFilterParams {
  edge: WipeEdge;
  /** true のときクリップ進行を反転（退場ワイプ） */
  reverse: boolean;
}

export interface ColourAberrationFilterParams {
  offsetX: number;
  offsetY: number;
}

export interface OutlineFilterParams {
  colour: string;
  thickness: number;
  opacity: number;
}

export interface SpotLightFilterParams {
  centreX: number;
  centreY: number;
  radius: number;
  intensity: number;
  colour: string;
}

interface BaseFilter {
  id: string;
  type: FilterType;
  enabled: boolean;
}

export interface ColorCorrectionFilter extends BaseFilter {
  type: 'color_correction';
  params: Omit<ColorCorrection, 'enabled'>;
}

export interface ColourAberrationFilter extends BaseFilter {
  type: 'colour_aberration';
  params: ColourAberrationFilterParams;
}

export interface OutlineFilter extends BaseFilter {
  type: 'outline';
  params: OutlineFilterParams;
}

export interface ClippingFilter extends BaseFilter {
  type: 'clipping';
  params: Omit<ClippingParams, 'enabled'>;
}

export interface VibrationFilter extends BaseFilter {
  type: 'vibration';
  params: Omit<Vibration, 'enabled'>;
}

export interface ShadowFilter extends BaseFilter {
  type: 'shadow';
  params: Omit<ShadowEffect, 'enabled'>;
}

export interface GradientFilter extends BaseFilter {
  type: 'gradient';
  params: Omit<GradientFill, 'enabled'>;
}

export interface BlurObjectFilter extends BaseFilter {
  type: 'blur';
  params: BlurFilterParams;
}

export interface FadeObjectFilter extends BaseFilter {
  type: 'fade';
  params: FadeFilterParams;
}

export interface WipeObjectFilter extends BaseFilter {
  type: 'wipe';
  params: WipeFilterParams;
}

export interface SpotLightObjectFilter extends BaseFilter {
  type: 'spot_light';
  params: SpotLightFilterParams;
}

export type ObjectFilter =
  | ColorCorrectionFilter
  | ColourAberrationFilter
  | OutlineFilter
  | ClippingFilter
  | VibrationFilter
  | ShadowFilter
  | GradientFilter
  | BlurObjectFilter
  | FadeObjectFilter
  | WipeObjectFilter
  | SpotLightObjectFilter;

// --- オブジェクト定義 ---

export interface BaseObject {
  id: string;
  groupId?: string;
  type: ObjectType;
  name: string;
  layer: number;
  startTime: number;
  duration: number;
  offset?: number; 
  
  x: number;
  y: number;
  
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;

  enableAnimation: boolean;
  endX: number;
  endY: number;
  easing: EasingType;

  motionPath?: PathPoint[];
  keyframes?: PositionKeyframe[];
  shadow?: ShadowEffect;
  filters?: ObjectFilter[];
  groupGradient?: GradientFill;
  
  // 新機能用プロパティ
  clipping?: boolean;          // 上のオブジェクトでクリッピング (マスク)
  customClipping?: ClippingParams; // クリッピングエフェクト (フィルタ)
  colorCorrection?: ColorCorrection; 
  vibration?: Vibration;       
}

export interface TextObject extends BaseObject {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  fill: string;
}

export interface ShapeObject extends BaseObject {
  type: 'shape';
  shapeType: 'rect' | 'rounded_rect' | 'circle' | 'ellipse' | 'triangle' | 'star' | 'pentagon' | 'diamond' | 'arrow' | 'heart' | 'cross';
  width: number;
  height: number;
  fill: string;
  gradient?: GradientFill;
  cornerRadius?: number;
}

export interface ImageObject extends BaseObject {
  type: 'image';
  src: string;
  filePath?: string;
  width: number;
  height: number;
}

/** 動画フレーム内の矩形切り抜き（左上原点・0–1 正規化）。タイムライン秒 `time`。 */
export interface SubjectCropNormKeyframe {
  id: string;
  time: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VideoObject extends BaseObject {
  type: 'video';
  src: string;
  filePath?: string;
  /** プロキシファイルの絶対パス（例: /path/to/clip.proxy.mp4）。存在する場合は再生に使用する */
  proxyFilePath?: string;
  /** 原本動画の幅。プロキシを使うプレビューと原本を使う書き出しを分離するために保持する */
  sourceWidth?: number;
  /** 原本動画の高さ。プロキシを使うプレビューと原本を使う書き出しを分離するために保持する */
  sourceHeight?: number;
  width: number;
  height: number;
  volume: number;
  muted: boolean;
  /** true のとき `subjectCropKeyframes` でスプライトを矩形マスク */
  subjectCropEnabled?: boolean;
  subjectCropKeyframes?: SubjectCropNormKeyframe[];
  /** true のとき逆再生（エクスポート時はシーク方式フォールバック） */
  reversed?: boolean;
}

export interface AudioObject extends BaseObject {
  type: 'audio';
  src: string;
  filePath?: string;
  volume: number;
  muted: boolean;
  labData?: LabPhoneme[];
}

export interface GroupControlObject extends BaseObject {
  type: 'group_control';
  targetLayerCount: number;
}

// 音声波形表示オブジェクト
export interface AudioVisualizationObject extends BaseObject {
    type: 'audio_visualization';
    targetAudioId: string | null; 
    targetLayer?: number;         
    visualizationType: 'waveform'; 
    color: string;
    thickness: number;
    width: number;
    height: number;
    amplitude: number; 
}

// 93 音声玉互換の音声反応生成オブジェクト
export interface AudioSphereObject extends BaseObject {
  type: 'audio_sphere';
  width: number;
  height: number;
  columns: number;
  rows: number;
  baseRadius: number;
  audioInfluence: number;
  pointSize: number;
  polygonSize: number;
  randomAmount: number;
  colour: string;
  targetAudioId: string | null;
  targetLayer?: number;
  sampleWindowSeconds: number;
  seed: number;
}

// AviUtlPackV4 標準パーティクル互換の生成オブジェクト
export interface ParticleObject extends BaseObject {
  type: 'particle';
  width: number;
  height: number;
  particleCount: number;
  seed: number;
  spread: number;
  speed: number;
  size: number;
  colour: string;
  lifetimeSeconds: number;
}

// AviUtlPackV4 バーコードT互換の生成オブジェクト
export interface BarcodeObject extends BaseObject {
  type: 'barcode';
  width: number;
  height: number;
  data: string;
  minimumBarWidth: number;
  horizontalMargin: number;
  verticalMargin: number;
  foregroundColour: string;
  backgroundColour: string;
}

// AviUtlPackV4 パズルピース互換の生成オブジェクト
export interface PuzzlePieceObject extends BaseObject {
  type: 'puzzle_piece';
  width: number;
  height: number;
  size: number;
  shapeVariant: number;
  connectorMode: 'convex' | 'concave';
  fillColour: string;
}

// AviUtlPackV4 色相環互換の生成オブジェクト
export interface ColourWheelObject extends BaseObject {
  type: 'colour_wheel';
  width: number;
  height: number;
  radius: number;
  saturation: number;
  brightness: number;
  ringWidthPercent: number;
  segmentCount: number;
}

// AviUtlPackV4 ひょうたんTM互換の生成オブジェクト
export interface GourdObject extends BaseObject {
  type: 'gourd';
  width: number;
  height: number;
  bodyRadius: number;
  bodyWidth: number;
  waistRadius: number;
  squashPercent: number;
  repeatCount: number;
  fillColour: string;
}

// AviUtlPackV4 歯車互換の生成オブジェクト
export interface GearObject extends BaseObject {
  type: 'gear';
  width: number;
  height: number;
  outerRadius: number;
  innerRadiusPercent: number;
  toothCount: number;
  toothDepthPercent: number;
  toothSkewPercent: number;
  fillColour: string;
}

// AviUtlPackV4 カスタムトラックバー互換の生成オブジェクト
export interface TrackBarObject extends BaseObject {
  type: 'track_bar';
  width: number;
  height: number;
  trackValues: number[];
  trackRanges: [number, number][];
  labels: string[];
  barColour: string;
  backgroundOpacity: number;
}

// AviUtlPackV4 パイシートグラフ互換の生成オブジェクト
export interface PieChartObject extends BaseObject {
  type: 'pie_chart';
  width: number;
  height: number;
  values: number[];
  sortMode: 'none' | 'descending' | 'ascending';
  normaliseToHundred: boolean;
  labelMode: 'none' | 'percentage' | 'input';
  progressPercent: number;
  strokeWidth: number;
  sliceColours: string[];
}

// AviUtlPackV4 簡易ヒストグラム互換の生成オブジェクト
export interface HistogramObject extends BaseObject {
  type: 'histogram';
  width: number;
  height: number;
  binValues: number[];
  heightScalePercent: number;
  lineWidth: number;
  showLuminance: boolean;
  showRed: boolean;
  showGreen: boolean;
  showBlue: boolean;
  channelColours: string[];
  backgroundColour: string;
}

// AviUtlPackV4 日の出互換の生成オブジェクト
export interface SunburstObject extends BaseObject {
  type: 'sunburst';
  width: number;
  height: number;
  rayCount: number;
  rayCoveragePercent: number;
  rotationOffsetDegrees: number;
  centreXPercent: number;
  centreYPercent: number;
  motifSize: number;
  motifShape: 'circle' | 'rect';
  rayColour: string;
  backgroundColour: string;
}

// AviUtlPackV4 円矢印互換の生成オブジェクト
export interface CircularArrowObject extends BaseObject {
  type: 'circular_arrow';
  width: number;
  height: number;
  radius: number;
  lineWidth: number;
  headSize: number;
  angleDegrees: number;
  centreAngleDegrees: number;
  headShape: 'triangle' | 'circle';
  showTailHead: boolean;
  flipVertical: boolean;
  flipHorizontal: boolean;
  arrowColour: string;
}

// AviUtlPackV4 三角括弧互換の生成オブジェクト
export interface TriangleBracketObject extends BaseObject {
  type: 'triangle_bracket';
  width: number;
  height: number;
  bracketWidth: number;
  angleDegrees: number;
  armLength: number;
  offsetDistance: number;
  bracketColour: string;
}

// AviUtlPackV4 タータンチェック互換の生成オブジェクト
export interface TartanCheckObject extends BaseObject {
  type: 'tartan_check';
  width: number;
  height: number;
  tileSize: number;
  blurRadius: number;
  baseColour: string;
  stripeColourA: string;
  stripeColourB: string;
  lineColour: string;
}

// AviUtlPackV4 千鳥格子互換の生成オブジェクト
export interface HoundstoothObject extends BaseObject {
  type: 'houndstooth';
  width: number;
  height: number;
  patternSize: number;
  foregroundColour: string;
  backgroundColour: string;
}

// AviUtlPackV4 矢がすり互換の生成オブジェクト
export interface YagasuriObject extends BaseObject {
  type: 'yagasuri';
  width: number;
  height: number;
  arrowWidth: number;
  arrowHeight: number;
  lineWidth: number;
  staggered: boolean;
  foregroundColour: string;
  backgroundColour: string;
}

// AviUtlPackV4 紙飛行機互換の生成オブジェクト
export interface PaperAirplaneObject extends BaseObject {
  type: 'paper_airplane';
  width: number;
  height: number;
  bodyLength: number;
  wingWidth: number;
  foldHeight: number;
  gap: number;
  followMotionDirection: boolean;
  axisMode: number;
  fillColour: string;
}

// AviUtlPackV4 麻の葉模様互換の生成オブジェクト
export interface AsanohaPatternObject extends BaseObject {
  type: 'asanoha_pattern';
  width: number;
  height: number;
  patternSize: number;
  lineWidth: number;
  foregroundColour: string;
  backgroundColour: string;
}

// AviUtlPackV4 集中線plus互換の生成オブジェクト
export interface FocusLinesPlusObject extends BaseObject {
  type: 'focus_lines_plus';
  width: number;
  height: number;
  rayWidth: number;
  gap: number;
  centreRadius: number;
  rotationDegrees: number;
  centreX: number;
  centreY: number;
  centreJitterPercent: number;
  seed: number;
  keyframeInterval: number;
  lineColour: string;
}

// AviUtlPackV4 ランダムラインEX互換の生成オブジェクト
export interface RandomLineExObject extends BaseObject {
  type: 'random_line_ex';
  width: number;
  height: number;
  lineCount: number;
  lineWidth: number;
  threshold: number;
  noiseCellSize: number;
  widthVariance: number;
  seed: number;
  lineColour: string;
}

// 93 Contour / 輪郭トレス互換の生成オブジェクト
export interface ContourTraceObject extends BaseObject {
  type: 'contour_trace';
  width: number;
  height: number;
  lineWidth: number;
  contourCount: number;
  jitterAmount: number;
  traceColour: string;
  backgroundOpacity: number;
  seed: number;
}

// 93 DisplacementPoly互換の生成オブジェクト
export interface DisplacementPolyObject extends BaseObject {
  type: 'displacement_poly';
  width: number;
  height: number;
  columns: number;
  rows: number;
  displacementScale: number;
  depthScale: number;
  meshOpacity: number;
  fillOpacity: number;
  lineColour: string;
  fillColour: string;
  seed: number;
}

// AviUtlPackV4 ホログラム互換の生成オブジェクト
export interface HologramObject extends BaseObject {
  type: 'hologram';
  width: number;
  height: number;
  tileSize: number;
  rotationDegrees: number;
  gradientAngleDegrees: number;
  colourMode: number;
  tintColour: string;
}

// AviUtlPackV4 分度器互換の生成オブジェクト
export interface ProtractorObject extends BaseObject {
  type: 'protractor';
  width: number;
  height: number;
  radius: number;
  measuredAngleDegrees: number;
  tickStepDegrees: number;
  majorTickStepDegrees: number;
  decimalPlaces: number;
  lineColour: string;
  textColour: string;
  shadowColour: string;
}

// AviUtlPackV4 多角形_震える互換の生成オブジェクト
export interface ShakingPolygonObject extends BaseObject {
  type: 'shaking_polygon';
  width: number;
  height: number;
  lineWidth: number;
  vertexCount: number;
  fixedDiameter: number;
  verticalDistortionPercent: number;
  repeatCount: number;
  repeatFrequency: number;
  fill: boolean;
  jitterRange: number;
  jitterInterval: number;
  stepped: boolean;
  colour: string;
  seed: number;
}

// AviUtlPackV4 簡易トーンカーブ互換の生成オブジェクト
export interface ToneCurveObject extends BaseObject {
  type: 'tone_curve';
  width: number;
  height: number;
  gridDivisions: number;
  lineWidth: number;
  curvePoints: number[];
  curveColour: string;
  gridColour: string;
  backgroundColour: string;
}

// hksy チェッカー/グリッド互換の生成オブジェクト
export interface HksyCheckerGridObject extends BaseObject {
  type: 'hksy_checker_grid';
  width: number;
  height: number;
  pattern?: 'checker-grid' | 'diamond' | 'measured-grid' | 'anchor-line';
  cellSize: number;
  lineWidth: number;
  checkerEnabled: boolean;
  gridEnabled: boolean;
  foregroundColour: string;
  secondaryColour: string;
  backgroundColour: string;
  paletteColours?: string[];
  separateInterval?: number;
  separateLineWidth?: number;
  anchorPoints?: Array<{ x: number; y: number }>;
  roundCaps?: boolean;
  maxJoinDistance?: number;
}

// GetColor V2R ドット化表現互換の生成オブジェクト
export interface GetColorDotFieldObject extends BaseObject {
  type: 'getcolor_dot_field';
  width: number;
  height: number;
  columns: number;
  rows: number;
  dotSize: number;
  dotShape?: 'circle' | 'square' | 'diamond';
  strokeWidth?: number;
  sizeInfluence: number;
  luminanceInfluence: number;
  hueShiftDegrees: number;
  alternateRows: boolean;
  foregroundColour: string;
  secondaryColour: string;
  backgroundColour: string;
  sampleSourcePath?: string;
  sampleSourceObjectId?: string;
  sampleSourceLayer?: number;
  sampleStrength?: number;
  sampleHueShiftDegrees?: number;
  seed: number;
}

// 93 領域枠互換の生成オブジェクト
export interface RegionFrameObject extends BaseObject {
  type: 'region_frame';
  width: number;
  height: number;
  lineWidth: number;
  shape?: 'rectangle' | 'ellipse' | 'cut_corner';
  cornerCut?: number;
  extraWidth: number;
  extraHeight: number;
  backgroundOpacity: number;
  frameColour: string;
  backgroundColour: string;
}

// 93 SimpleTube互換の生成オブジェクト
export interface SimpleTubeObject extends BaseObject {
  type: 'simple_tube';
  width: number;
  height: number;
  radius: number;
  depth: number;
  segments: number;
  rings: number;
  twistDegrees: number;
  randomAmount: number;
  strokeWidth: number;
  colour: string;
  secondaryColour: string;
  colourPattern?: 'single' | 'ring' | 'depth';
  fogStrength?: number;
  fogColour?: string;
  seed: number;
  torus: boolean;
}

// 93 Sphere(DrawPixel)互換の生成オブジェクト
export interface SphereDotsObject extends BaseObject {
  type: 'sphere_dots';
  width: number;
  height: number;
  radius: number;
  columns: number;
  rows: number;
  rotationDegrees: number;
  offsetDegrees: number;
  luminanceInfluence: number;
  pointSize: number;
  latitudeLineWidth: number;
  colour: string;
  secondaryColour: string;
  seed: number;
  planeMode: boolean;
}

// 93 SphericalField互換の生成オブジェクト
export interface SphericalFieldObject extends BaseObject {
  type: 'spherical_field';
  width: number;
  height: number;
  radius: number;
  strength: number;
  colourAmount: number;
  alphaAmount: number;
  lineWidth: number;
  ringCount: number;
  vectorCount: number;
  fieldColour: string;
  secondaryColour: string;
  backgroundOpacity: number;
  container: boolean;
  seed: number;
}

// --- PSD連携用 ---

export interface PsdLayerStruct {
  seq: string | null;
  name: string;
  checked: boolean;
  isRadio: boolean; 
  children: PsdLayerStruct[];
  blobUrl?: string; 
}

export interface PsdLayerNode {
  id: string;
  name: string;
  isGroup: boolean;
  isRadio: boolean;
  children: PsdLayerNode[];
  width: number;
  height: number;
  left: number;
  top: number;
  defaultVisible: boolean;
  src?: string;
  /** In-memory raster for Pixi (not JSON-serialisable; strip before project save). */
  textureSource?: ImageBitmap;
}

export interface PsdObject extends BaseObject {
  type: 'psd';
  file?: File;
  filePath?: string;
  src: string;
  width: number;
  height: number;
  scale: number;
  layerTree?: PsdLayerStruct[];
  rootLayer?: PsdLayerNode;
  activeLayerIds?: Record<string, boolean>;
  
  lipSync?: LipSyncSetting;
  /** 3D ステージでの板ポリ配置（未設定時はワールドに出さない） */
  worldPlacement?: PsdWorldPlacement;
}

export type TimelineObject = TextObject | ShapeObject | ImageObject | VideoObject | AudioObject | PsdObject | GroupControlObject | AudioVisualizationObject | AudioSphereObject | ParticleObject | BarcodeObject | PuzzlePieceObject | ColourWheelObject | GourdObject | GearObject | TrackBarObject | PieChartObject | HistogramObject | ToneCurveObject | GetColorDotFieldObject | HksyCheckerGridObject | RegionFrameObject | SimpleTubeObject | SphereDotsObject | SphericalFieldObject | SunburstObject | CircularArrowObject | TriangleBracketObject | TartanCheckObject | HoundstoothObject | YagasuriObject | PaperAirplaneObject | AsanohaPatternObject | FocusLinesPlusObject | RandomLineExObject | ContourTraceObject | DisplacementPolyObject | HologramObject | ProtractorObject | ShakingPolygonObject;

/** タイムライン1本分（シーン） */
export interface SceneData {
  id: string;
  name: string;
  duration: number;
  layers: LayerState[];
  objects: TimelineObject[];
  camera: CameraState;
  /** 3D ステージ用カメラ（シーン単位） */
  stageCamera3D: StageCamera3D;
}
