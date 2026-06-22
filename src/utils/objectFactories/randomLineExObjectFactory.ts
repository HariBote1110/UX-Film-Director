import type { RandomLineExObject } from '../../types';

export interface BuildAviUtlRandomLineExObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlRandomLineExObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlRandomLineExObjectInput): RandomLineExObject => {
  const width = 800;
  const height = 450;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'random_line_ex',
    name: 'ランダムラインEX',
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
    lineCount: 3,
    lineWidth: 6,
    threshold: 128,
    noiseCellSize: 12,
    widthVariance: 0,
    seed: 0,
    lineColour: '#ffffff',
  };
};
