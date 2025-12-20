import { EasingType } from './utils/easings';

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  sampleRate: number;
}

export type ObjectType = 'text' | 'shape' | 'image' | 'video' | 'audio' | 'psd';

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
  enableAnimation: boolean;
  endX: number;
  endY: number;
  easing: EasingType;
}

export interface TextObject extends BaseObject {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string; // フォント指定を追加
  fill: string;
}

export interface ShapeObject extends BaseObject {
  type: 'shape';
  shapeType: 'rect' | 'circle';
  width: number;
  height: number;
  fill: string;
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

// --- PSD連携用 ---

// PSDToolから取得したレイヤーノード情報
export interface PsdLayerStruct {
  seq: string; // data-seq
  name: string;
  checked: boolean;
  isRadio: boolean; // 名前が*で始まるか
  children: PsdLayerStruct[];
}

export interface PsdObject extends BaseObject {
  type: 'psd';
  file: File;
  src: string;
  width: number;
  height: number;
  scale: number;
  
  // レイヤー構造データ (これがUIの元になる)
  layerTree: PsdLayerStruct[];
}

export type TimelineObject = TextObject | ShapeObject | ImageObject | VideoObject | AudioObject | PsdObject;