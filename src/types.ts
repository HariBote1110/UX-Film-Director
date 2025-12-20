import { EasingType } from './utils/easings';

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
  colours: string[]; // colors -> colours
  stops: number[];
  direction: number;
}

export interface ShadowEffect {
  enabled: boolean;
  colour: string; // color -> colour
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

// --- オブジェクト定義 ---

export interface BaseObject {
  id: string;
  type: ObjectType;
  name: string;
  layer: number;
  startTime: number;
  duration: number;
  offset?: number; 
  
  // 基本座標
  x: number;
  y: number;
  
  // 共通変形プロパティ
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;

  // アニメーション
  enableAnimation: boolean;
  endX: number;
  endY: number;
  easing: EasingType;

  // 軌道アニメーション
  motionPath?: PathPoint[];

  // シャドウ
  shadow?: ShadowEffect;
}

export interface TextObject extends BaseObject {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  fill: string; // "Fill" is generic enough, but effectively represents colour
}

export interface ShapeObject extends BaseObject {
  type: 'shape';
  shapeType: 'rect' | 'circle' | 'triangle' | 'star' | 'pentagon';
  width: number;
  height: number;
  fill: string;
  gradient?: GradientFill;
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
}

export interface PsdObject extends BaseObject {
  type: 'psd';
  file: File;
  src: string;
  width: number;
  height: number;
  scale: number;
  layerTree: PsdLayerStruct[];
}

export type TimelineObject = TextObject | ShapeObject | ImageObject | VideoObject | AudioObject | PsdObject | GroupControlObject;