import type { ToneCurveObject } from '../../types';

export interface BuildAviUtlToneCurveObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlToneCurveObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlToneCurveObjectInput): ToneCurveObject => {
  const width = 360;
  const height = 360;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'tone_curve',
    name: '簡易トーンカーブ',
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
    gridDivisions: 4,
    lineWidth: 3,
    curvePoints: [0, 0.16, 0.42, 0.7, 1],
    curveColour: '#ffffff',
    gridColour: '#333333',
    backgroundColour: '#000000',
  };
};
