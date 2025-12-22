import { EasingType } from './utils/easings';
import { LabPhoneme } from './utils/labParser';

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  sampleRate: number;
}

export type ObjectType = 'text' | 'shape' | 'image' | 'video' | 'audio' | 'psd' | 'group_control' | 'audio_visualization';

// --- グラデーション・シャドウ・軌道 ---

export interface GradientFill {
  enabled: boolean;
  type: 'linear' | 'radial';
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

// --- オブジェクト定義 ---

export interface BaseObject {
  id: string;
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
  shadow?: ShadowEffect;
  
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
  width: number;
  height: number;
}

export interface VideoObject extends BaseObject {
  type: 'video';
  src: string;
  width: number;
  height: number;
  volume: number;
  muted: boolean;
}

export interface AudioObject extends BaseObject {
  type: 'audio';
  src: string;
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

// --- PSD連携用 ---

export interface PsdLayerStruct {
  seq: string; 
  name: string;
  checked: boolean;
  isRadio: boolean; 
  children: PsdLayerStruct[];
  blobUrl?: string; 
}

export interface PsdObject extends BaseObject {
  type: 'psd';
  file: File;
  src: string;
  width: number;
  height: number;
  scale: number;
  layerTree: PsdLayerStruct[];
  
  lipSync?: LipSyncSetting;
}

export type TimelineObject = TextObject | ShapeObject | ImageObject | VideoObject | AudioObject | PsdObject | GroupControlObject | AudioVisualizationObject;