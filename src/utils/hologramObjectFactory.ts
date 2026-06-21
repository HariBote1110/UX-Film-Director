import type { HologramObject } from '../types';

export interface BuildAviUtlHologramObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlHologramObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlHologramObjectInput): HologramObject => {
  const width = 800;
  const height = 450;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'hologram',
    name: 'ホログラム',
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
    tileSize: 80,
    rotationDegrees: 0,
    gradientAngleDegrees: -60,
    colourMode: 1,
    tintColour: '#ffffff',
  };
};
