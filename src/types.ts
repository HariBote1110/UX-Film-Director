import { EasingType } from './utils/easings';
import type { ImageObjectFields, ShapeObjectFields, TextObjectFields, TextStroke, TextShadow, TextAlignment, VideoObjectFields, SubjectCropNormKeyframe, AudioObjectFields, AudioVisualizationObjectFields, AudioSphereObjectFields, ParticleObjectFields, BarcodeObjectFields, PuzzlePieceObjectFields, ColourWheelObjectFields, GourdObjectFields, GearObjectFields, TrackBarObjectFields, PieChartObjectFields, HistogramObjectFields, ToneCurveObjectFields, HksyCheckerGridObjectFields, GetColorDotFieldObjectFields, RegionFrameObjectFields, SimpleTubeObjectFields, SphereDotsObjectFields, SphericalFieldObjectFields, SunburstObjectFields, CircularArrowObjectFields, TriangleBracketObjectFields, TartanCheckObjectFields, HoundstoothObjectFields, YagasuriObjectFields, PaperAirplaneObjectFields, AsanohaPatternObjectFields, FocusLinesPlusObjectFields, RandomLineExObjectFields, ContourTraceObjectFields, DisplacementPolyObjectFields, PlainEffectorLineObjectFields, HologramObjectFields, ProtractorObjectFields, ShakingPolygonObjectFields, ShatteredSphereObjectFields, GroupControlObjectFields } from './generated/rustCore';
import type { Vec3, StageCamera3D, PsdWorldPlacement, LipSyncSetting } from './generated/rustCore';
export type { Vec3, StageCamera3D, PsdWorldPlacement, LipSyncSetting };

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

/** Preview: fit to the panel vs one project pixel per CSS pixel (scroll when larger than the panel). */
export type PreviewDisplayMode = 'autoFit' | 'pixelPerfect';

export interface LayerState {
  name: string;
  visible: boolean;
  locked: boolean;
}

export type ObjectType = 'text' | 'shape' | 'image' | 'video' | 'audio' | 'psd' | 'group_control' | 'audio_visualization' | 'audio_sphere' | 'particle' | 'barcode' | 'puzzle_piece' | 'colour_wheel' | 'gourd' | 'gear' | 'track_bar' | 'pie_chart' | 'histogram' | 'tone_curve' | 'getcolor_dot_field' | 'hksy_checker_grid' | 'region_frame' | 'simple_tube' | 'sphere_dots' | 'spherical_field' | 'sunburst' | 'circular_arrow' | 'triangle_bracket' | 'tartan_check' | 'houndstooth' | 'yagasuri' | 'paper_airplane' | 'asanoha_pattern' | 'focus_lines_plus' | 'random_line_ex' | 'contour_trace' | 'displacement_poly' | 'plain_effector_line' | 'hologram' | 'protractor' | 'shaking_polygon' | 'shattered_sphere';

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
  | 'spot_light'
  | 'displacement_map'
  | 'fake_dof'
  | 'auto_blur'
  | 'stretch'
  | 'multi_slicer'
  | 'oct_transform'
  | 'area_expand'
  | 'smart_clipping';

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

export interface DisplacementMapFilterParams {
  amountX: number;
  amountY: number;
  size: number;
  strength: number;
}

export interface FakeDofFilterParams {
  focusX: number;
  focusY: number;
  focusRadius: number;
  blur: number;
  strength: number;
}

export interface AutoBlurFilterParams {
  blur: number;
  speed: number;
  strength: number;
  colourShift: number;
}

export interface StretchFilterParams {
  angle: number;
  amount: number;
  strength: number;
}

export interface MultiSlicerFilterParams {
  angle: number;
  offset: number;
  slices: number;
  expansion: number;
  strength: number;
}

export interface OctTransformFilterParams {
  scale: number;
  rotation: number;
  vertexCount: number;
  warp: number;
  strength: number;
}

export interface AreaExpandFilterParams {
  top: number;
  bottom: number;
  left: number;
  right: number;
  fill: boolean;
}

export interface SmartClippingFilterParams {
  top: number;
  bottom: number;
  left: number;
  right: number;
  linkAxes: boolean;
  mode: number;
  amount: number;
  seed: number;
  reverse: boolean;
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

export interface DisplacementMapObjectFilter extends BaseFilter {
  type: 'displacement_map';
  params: DisplacementMapFilterParams;
}

export interface FakeDofObjectFilter extends BaseFilter {
  type: 'fake_dof';
  params: FakeDofFilterParams;
}

export interface AutoBlurObjectFilter extends BaseFilter {
  type: 'auto_blur';
  params: AutoBlurFilterParams;
}

export interface StretchObjectFilter extends BaseFilter {
  type: 'stretch';
  params: StretchFilterParams;
}

export interface MultiSlicerObjectFilter extends BaseFilter {
  type: 'multi_slicer';
  params: MultiSlicerFilterParams;
}

export interface OctTransformObjectFilter extends BaseFilter {
  type: 'oct_transform';
  params: OctTransformFilterParams;
}

export interface AreaExpandObjectFilter extends BaseFilter {
  type: 'area_expand';
  params: AreaExpandFilterParams;
}

export interface SmartClippingObjectFilter extends BaseFilter {
  type: 'smart_clipping';
  params: SmartClippingFilterParams;
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
  | SpotLightObjectFilter
  | DisplacementMapObjectFilter
  | FakeDofObjectFilter
  | AutoBlurObjectFilter
  | StretchObjectFilter
  | MultiSlicerObjectFilter
  | OctTransformObjectFilter
  | AreaExpandObjectFilter
  | SmartClippingObjectFilter;

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

/**
 * text kind の正本は rust-core/src/schema.rs の `TextObjectFields`（R3）。
 * `type` と `BaseObject` 由来のフィールドだけここで足す。
 * `TextStroke` / `TextShadow` / `TextAlignment` も生成型を re-export する
 * （`./generated/rustCore` の同名型を参照。text 以外の kind は使わない
 * 専用型のためここでは共有化していない）。
 */
export type { TextStroke, TextShadow, TextAlignment } from './generated/rustCore';
export type TextObject = BaseObject & TextObjectFields & { type: 'text' };

/**
 * shape kind の正本は rust-core/src/schema.rs の `ShapeObjectFields`（R3）。
 * `type` と `BaseObject` 由来のフィールドだけここで足す。
 */
export type ShapeObject = BaseObject & ShapeObjectFields & { type: 'shape' };

/**
 * image kind の正本は rust-core/src/schema.rs の `ImageObjectFields`（R3）。
 * `type` と `BaseObject` 由来のフィールドだけここで足す。
 */
export type ImageObject = BaseObject & ImageObjectFields & { type: 'image' };

/** 動画フレーム内の矩形切り抜き（左上原点・0–1 正規化）。タイムライン秒 `time`。
 * 定義は `rust-core/src/schema.rs` の `SubjectCropNormKeyframe` が正本。 */
export type { SubjectCropNormKeyframe };

export type VideoObject = BaseObject & VideoObjectFields & { type: 'video' };

export type AudioObject = BaseObject & AudioObjectFields & { type: 'audio' };

export type GroupControlObject = BaseObject & GroupControlObjectFields & { type: 'group_control' };

// 音声波形表示オブジェクト
export type AudioVisualizationObject = BaseObject & AudioVisualizationObjectFields & { type: 'audio_visualization' };

// 93 音声玉互換の音声反応生成オブジェクト
export type AudioSphereObject = BaseObject & AudioSphereObjectFields & { type: 'audio_sphere' };

// AviUtlPackV4 標準パーティクル互換の生成オブジェクト
export type ParticleObject = BaseObject & ParticleObjectFields & { type: 'particle' };

// AviUtlPackV4 バーコードT互換の生成オブジェクト
export type BarcodeObject = BaseObject & BarcodeObjectFields & { type: 'barcode' };

// AviUtlPackV4 パズルピース互換の生成オブジェクト
export type PuzzlePieceObject = BaseObject & PuzzlePieceObjectFields & { type: 'puzzle_piece' };

// AviUtlPackV4 色相環互換の生成オブジェクト
export type ColourWheelObject = BaseObject & ColourWheelObjectFields & { type: 'colour_wheel' };

// AviUtlPackV4 ひょうたんTM互換の生成オブジェクト
export type GourdObject = BaseObject & GourdObjectFields & { type: 'gourd' };

// AviUtlPackV4 歯車互換の生成オブジェクト
export type GearObject = BaseObject & GearObjectFields & { type: 'gear' };

// AviUtlPackV4 カスタムトラックバー互換の生成オブジェクト
export type TrackBarObject = BaseObject & TrackBarObjectFields & { type: 'track_bar' };

// AviUtlPackV4 パイシートグラフ互換の生成オブジェクト
export type PieChartObject = BaseObject & PieChartObjectFields & { type: 'pie_chart' };

// AviUtlPackV4 簡易ヒストグラム互換の生成オブジェクト
export type HistogramObject = BaseObject & HistogramObjectFields & { type: 'histogram' };

// AviUtlPackV4 日の出互換の生成オブジェクト
export type SunburstObject = BaseObject & SunburstObjectFields & { type: 'sunburst' };

// AviUtlPackV4 円矢印互換の生成オブジェクト
export type CircularArrowObject = BaseObject & CircularArrowObjectFields & { type: 'circular_arrow' };

// AviUtlPackV4 三角括弧互換の生成オブジェクト
export type TriangleBracketObject = BaseObject & TriangleBracketObjectFields & { type: 'triangle_bracket' };

// AviUtlPackV4 タータンチェック互換の生成オブジェクト
export type TartanCheckObject = BaseObject & TartanCheckObjectFields & { type: 'tartan_check' };

// AviUtlPackV4 千鳥格子互換の生成オブジェクト
export type HoundstoothObject = BaseObject & HoundstoothObjectFields & { type: 'houndstooth' };

// AviUtlPackV4 矢がすり互換の生成オブジェクト
export type YagasuriObject = BaseObject & YagasuriObjectFields & { type: 'yagasuri' };

// AviUtlPackV4 紙飛行機互換の生成オブジェクト
export type PaperAirplaneObject = BaseObject & PaperAirplaneObjectFields & { type: 'paper_airplane' };

// AviUtlPackV4 麻の葉模様互換の生成オブジェクト
export type AsanohaPatternObject = BaseObject & AsanohaPatternObjectFields & { type: 'asanoha_pattern' };

// AviUtlPackV4 集中線plus互換の生成オブジェクト
export type FocusLinesPlusObject = BaseObject & FocusLinesPlusObjectFields & { type: 'focus_lines_plus' };

// AviUtlPackV4 ランダムラインEX互換の生成オブジェクト
export type RandomLineExObject = BaseObject & RandomLineExObjectFields & { type: 'random_line_ex' };

// 93 Contour / 輪郭トレス互換の生成オブジェクト
export type ContourTraceObject = BaseObject & ContourTraceObjectFields & { type: 'contour_trace' };

// 93 DisplacementPoly互換の生成オブジェクト
export type DisplacementPolyObject = BaseObject & DisplacementPolyObjectFields & { type: 'displacement_poly' };

// 93 PlainEffector(Line)互換の生成オブジェクト
export type PlainEffectorLineObject = BaseObject & PlainEffectorLineObjectFields & { type: 'plain_effector_line' };

// AviUtlPackV4 ホログラム互換の生成オブジェクト
export type HologramObject = BaseObject & HologramObjectFields & { type: 'hologram' };

// AviUtlPackV4 分度器互換の生成オブジェクト
export type ProtractorObject = BaseObject & ProtractorObjectFields & { type: 'protractor' };

// AviUtlPackV4 多角形_震える互換の生成オブジェクト
export type ShakingPolygonObject = BaseObject & ShakingPolygonObjectFields & { type: 'shaking_polygon' };

// AviUtlPackV4 砕け散る球互換の生成オブジェクト
export type ShatteredSphereObject = BaseObject & ShatteredSphereObjectFields & { type: 'shattered_sphere' };

// AviUtlPackV4 簡易トーンカーブ互換の生成オブジェクト
export type ToneCurveObject = BaseObject & ToneCurveObjectFields & { type: 'tone_curve' };

// hksy チェッカー/グリッド互換の生成オブジェクト
export type HksyCheckerGridObject = BaseObject & HksyCheckerGridObjectFields & { type: 'hksy_checker_grid' };

// GetColor V2R ドット化表現互換の生成オブジェクト
export type GetColorDotFieldObject = BaseObject & GetColorDotFieldObjectFields & { type: 'getcolor_dot_field' };

// 93 領域枠互換の生成オブジェクト
export type RegionFrameObject = BaseObject & RegionFrameObjectFields & { type: 'region_frame' };

// 93 SimpleTube互換の生成オブジェクト
export type SimpleTubeObject = BaseObject & SimpleTubeObjectFields & { type: 'simple_tube' };

// 93 Sphere(DrawPixel)互換の生成オブジェクト
export type SphereDotsObject = BaseObject & SphereDotsObjectFields & { type: 'sphere_dots' };

// 93 SphericalField互換の生成オブジェクト
export type SphericalFieldObject = BaseObject & SphericalFieldObjectFields & { type: 'spherical_field' };

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

export type TimelineObject = TextObject | ShapeObject | ImageObject | VideoObject | AudioObject | PsdObject | GroupControlObject | AudioVisualizationObject | AudioSphereObject | ParticleObject | BarcodeObject | PuzzlePieceObject | ColourWheelObject | GourdObject | GearObject | TrackBarObject | PieChartObject | HistogramObject | ToneCurveObject | GetColorDotFieldObject | HksyCheckerGridObject | RegionFrameObject | SimpleTubeObject | SphereDotsObject | SphericalFieldObject | SunburstObject | CircularArrowObject | TriangleBracketObject | TartanCheckObject | HoundstoothObject | YagasuriObject | PaperAirplaneObject | AsanohaPatternObject | FocusLinesPlusObject | RandomLineExObject | ContourTraceObject | DisplacementPolyObject | PlainEffectorLineObject | HologramObject | ProtractorObject | ShakingPolygonObject | ShatteredSphereObject;

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
