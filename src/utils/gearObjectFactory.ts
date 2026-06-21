import type { GearObject } from '../types';

export interface BuildAviUtlGearObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlGearObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlGearObjectInput): GearObject => {
  const size = Math.max(128, Math.round(Math.min(projectWidth, projectHeight) / 3.375));
  const x = Math.round((projectWidth - size) / 2);
  const y = Math.round((projectHeight - size) / 2);

  return {
    id,
    type: 'gear',
    name: '歯車',
    layer,
    startTime,
    duration: 5,
    x,
    y,
    width: size,
    height: size,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    enableAnimation: false,
    endX: x,
    endY: y,
    easing: 'linear',
    outerRadius: Math.round(size / 2),
    innerRadiusPercent: 45,
    toothCount: 20,
    toothDepthPercent: 18,
    toothSkewPercent: 0,
    fillColour: '#ffffff',
  };
};
