import type { AsanohaPatternObject } from '../../types';

export interface BuildAviUtlAsanohaPatternObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlAsanohaPatternObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlAsanohaPatternObjectInput): AsanohaPatternObject => {
  const width = 800;
  const height = 450;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'asanoha_pattern',
    name: '麻の葉模様',
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
    patternSize: 50,
    lineWidth: 2,
    foregroundColour: '#000000',
    backgroundColour: '#ffffff',
  };
};
