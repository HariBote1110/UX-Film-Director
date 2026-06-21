import type { CircularArrowObject } from '../types';

export interface BuildAviUtlCircularArrowObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlCircularArrowObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlCircularArrowObjectInput): CircularArrowObject => {
  const width = 200;
  const height = 200;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'circular_arrow',
    name: '円矢印',
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
    radius: 100,
    lineWidth: 20,
    headSize: 50,
    angleDegrees: 260,
    centreAngleDegrees: 0,
    headShape: 'triangle',
    showTailHead: false,
    flipVertical: false,
    flipHorizontal: false,
    arrowColour: '#ffff00',
  };
};
