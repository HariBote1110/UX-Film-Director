import type { TartanCheckObject } from '../types';

export interface BuildAviUtlTartanCheckObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlTartanCheckObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlTartanCheckObjectInput): TartanCheckObject => {
  const width = 800;
  const height = 450;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'tartan_check',
    name: 'タータンチェック',
    layer,
    startTime,
    duration: 5,
    x,
    y,
    width,
    height,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    enableAnimation: false,
    endX: x,
    endY: y,
    easing: 'linear',
    tileSize: 100,
    blurRadius: 1,
    baseColour: '#143e10',
    stripeColourA: '#a81616',
    stripeColourB: '#c9c526',
    lineColour: '#000000',
  };
};
