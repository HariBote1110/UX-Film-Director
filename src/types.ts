import { EasingType } from './utils/easings';
import { LabPhoneme } from './utils/labParser';

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  sampleRate: number;
}

export type ObjectType = 'text' | 'shape' | 'image' | 'video' | 'audio' | 'psd' | 'group_control';

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
  
  // 変更: 音声ソースの指定方法
  sourceMode: 'layer' | 'object'; // 'layer'推奨
  targetLayer: number;            // 参照するタイムラインレイヤー番号 (0-based)
  audioId: string | null;         // 特定のオブジェクト指定用（後方互換）

  mapping: {
      a: string; // レイヤーのsequence ID (seq)
      i: string;
      u: string;
      e: string;
      o: string;
      n: string;
  };
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
  // 図形タイプを追加
  shapeType: 'rect' | 'rounded_rect' | 'circle' | 'ellipse' | 'triangle' | 'star' | 'pentagon' | 'diamond' | 'arrow' | 'heart' | 'cross';
  width: number;
  height: number;
  fill: string;
  gradient?: GradientFill;
  cornerRadius?: number; // 角丸四角形用
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

export type TimelineObject = TextObject | ShapeObject | ImageObject | VideoObject | AudioObject | PsdObject | GroupControlObject;