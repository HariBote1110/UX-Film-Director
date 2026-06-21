import type { YagasuriObject } from '../types';

export interface BuildAviUtlYagasuriObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlYagasuriObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlYagasuriObjectInput): YagasuriObject => {
  const width = 800;
  const height = 450;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'yagasuri',
    name: '矢がすり',
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
    arrowWidth: 15,
    arrowHeight: 65,
    lineWidth: 2,
    staggered: true,
    foregroundColour: '#000000',
    backgroundColour: '#ffffff',
  };
};
