import { EasingType } from './utils/easings';

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  sampleRate: number;
}

export type ObjectType = 'text' | 'shape' | 'image' | 'video';

export interface BaseObject {
  id: string;
  type: ObjectType;
  name: string;
  layer: number;
  startTime: number;
  duration: number;
  
  // 再生開始位置のオフセット (動画・音声用)
  // 例: 10秒の動画を5秒地点で切った後半クリップは、offset=5.0 になる
  offset: number; 

  // Coordinates
  x: number;
  y: number;

  // Animation
  enableAnimation: boolean;
  endX: number;
  endY: number;
  easing: EasingType;
}

export interface TextObject extends BaseObject {
  type: 'text';
  text: string;
  fontSize: number;
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

export type TimelineObject = TextObject | ShapeObject | ImageObject | VideoObject;