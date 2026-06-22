import type { GourdObject } from '../../types';

export interface BuildAviUtlGourdObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlGourdObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlGourdObjectInput): GourdObject => {
  const size = Math.max(160, Math.round(Math.min(projectWidth, projectHeight) / 2.7));
  const x = Math.round((projectWidth - size) / 2);
  const y = Math.round((projectHeight - size) / 2);

  return {
    id,
    type: 'gourd',
    name: 'ひょうたんTM',
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
    bodyRadius: 80,
    bodyWidth: 250,
    waistRadius: 10,
    squashPercent: 40,
    repeatCount: 1,
    fillColour: '#ffffff',
  };
};
