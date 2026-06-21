import type { ShakingPolygonObject } from '../types';

export interface BuildAviUtlShakingPolygonObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlShakingPolygonObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlShakingPolygonObjectInput): ShakingPolygonObject => {
  const width = 360;
  const height = 360;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'shaking_polygon',
    name: '多角形_震える',
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
  };
};
