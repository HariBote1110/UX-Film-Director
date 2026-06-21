import type { ColourWheelObject } from '../types';

export interface BuildAviUtlColourWheelObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlColourWheelObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlColourWheelObjectInput): ColourWheelObject => {
  const radius = Math.max(80, Math.round(Math.min(projectWidth, projectHeight) / 9));
  const width = radius * 2;
  const height = radius * 2;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'colour_wheel',
    name: '色相環',
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
    radius,
    saturation: 100,
    brightness: 100,
    ringWidthPercent: 25,
    segmentCount: 24,
  };
};
