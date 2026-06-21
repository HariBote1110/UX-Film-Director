import type { FocusLinesPlusObject } from '../types';

export interface BuildAviUtlFocusLinesPlusObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlFocusLinesPlusObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlFocusLinesPlusObjectInput): FocusLinesPlusObject => {
  const width = 800;
  const height = 450;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'focus_lines_plus',
    name: '集中線plus',
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
    rayWidth: 1,
    gap: 5,
    centreRadius: 100,
    rotationDegrees: 0,
    centreX: width / 2,
    centreY: height / 2,
    centreJitterPercent: 20,
    seed: 0,
    keyframeInterval: 0,
    lineColour: '#ffffff',
  };
};
