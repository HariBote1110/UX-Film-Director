import type { ContourTraceObject } from '../../types';

export interface BuildAviUtlContourTraceObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlContourTraceObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlContourTraceObjectInput): ContourTraceObject => {
  const width = 800;
  const height = 450;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'contour_trace',
    name: '93 輪郭トレス',
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
    lineWidth: 3,
    contourCount: 5,
    jitterAmount: 1.5,
    traceColour: '#ffffff',
    backgroundOpacity: 0,
    seed: 93,
  };
};
