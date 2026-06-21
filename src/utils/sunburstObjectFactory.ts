import type { SunburstObject } from '../types';

export interface BuildAviUtlSunburstObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlSunburstObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlSunburstObjectInput): SunburstObject => {
  const width = 800;
  const height = 450;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'sunburst',
    name: '日の出',
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
    rayCount: 10,
    rayCoveragePercent: 50,
    rotationOffsetDegrees: 0,
    centreXPercent: 50,
    centreYPercent: 50,
    motifSize: 200,
    motifShape: 'circle',
    rayColour: '#ff0000',
    backgroundColour: '#ffff00',
  };
};
